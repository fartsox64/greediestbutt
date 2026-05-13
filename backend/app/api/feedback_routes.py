"""User feedback and discussion thread endpoints."""

import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Feedback, FeedbackMessage, SteamPlayerCache, User
from ..schemas import (
    FeedbackCreate,
    FeedbackListResponse,
    FeedbackMessageCreate,
    FeedbackMessageOut,
    FeedbackOut,
    FeedbackThreadOut,
)

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

PAGE_SIZE = 20


def _require_auth(current_user=Depends(get_current_user)) -> User:
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return current_user


def _require_admin(current_user=Depends(get_current_user)) -> User:
    if current_user is None or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def _get_accessible_feedback(feedback_id: int, user: User, db: AsyncSession) -> Feedback:
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if fb is None:
        raise HTTPException(status_code=404, detail="Feedback not found")
    if user.role != "admin" and fb.author_id != user.steam_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return fb


def _make_out(fb: Feedback, author_name: str | None, message_count: int, awaiting_user: bool = False) -> FeedbackOut:
    return FeedbackOut(
        id=fb.id,
        author_steam_id=str(fb.author_id),
        author_name=author_name,
        subject=fb.subject,
        body=fb.body,
        status=fb.status,
        created_at=fb.created_at,
        closed_at=fb.closed_at,
        message_count=message_count,
        awaiting_user=awaiting_user,
    )


@router.post("", response_model=FeedbackOut, status_code=201)
async def submit_feedback(
    payload: FeedbackCreate,
    user: User = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    if not payload.body.strip():
        raise HTTPException(status_code=422, detail="Body cannot be empty")
    fb = Feedback(
        author_id=user.steam_id,
        subject=payload.subject.strip() if payload.subject else None,
        body=payload.body.strip(),
        status="open",
        created_at=datetime.now(timezone.utc),
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return _make_out(fb, user.player_name, 0)


@router.get("/mine", response_model=FeedbackListResponse)
async def get_my_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(PAGE_SIZE, ge=1, le=100),
    user: User = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    total_result = await db.execute(
        select(func.count()).where(Feedback.author_id == user.steam_id)
    )
    total = total_result.scalar_one()
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size

    result = await db.execute(
        select(
            Feedback,
            func.count(FeedbackMessage.id).label("message_count"),
        )
        .outerjoin(FeedbackMessage, FeedbackMessage.feedback_id == Feedback.id)
        .where(Feedback.author_id == user.steam_id)
        .group_by(Feedback.id)
        .order_by(Feedback.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = result.all()

    # For items on this page, determine if the latest reply is from an admin/mod
    feedback_ids = [row.Feedback.id for row in rows]
    latest_roles: dict[int, str | None] = {}
    if feedback_ids:
        LatestAuthor = aliased(User)
        latest_msg_sq = (
            select(
                FeedbackMessage.feedback_id,
                func.max(FeedbackMessage.id).label("max_id"),
            )
            .where(FeedbackMessage.feedback_id.in_(feedback_ids))
            .group_by(FeedbackMessage.feedback_id)
            .subquery()
        )
        latest_result = await db.execute(
            select(latest_msg_sq.c.feedback_id, LatestAuthor.role)
            .join(FeedbackMessage, FeedbackMessage.id == latest_msg_sq.c.max_id)
            .join(LatestAuthor, LatestAuthor.steam_id == FeedbackMessage.author_id)
        )
        latest_roles = {r.feedback_id: r.role for r in latest_result.all()}

    # Count all open threads (across all pages) where latest reply is from admin/mod
    AwaitingAuthor = aliased(User)
    open_latest_sq = (
        select(
            FeedbackMessage.feedback_id,
            func.max(FeedbackMessage.id).label("max_id"),
        )
        .join(Feedback, Feedback.id == FeedbackMessage.feedback_id)
        .where(Feedback.author_id == user.steam_id, Feedback.status == "open")
        .group_by(FeedbackMessage.feedback_id)
        .subquery()
    )
    awaiting_result = await db.execute(
        select(func.count())
        .select_from(open_latest_sq)
        .join(FeedbackMessage, FeedbackMessage.id == open_latest_sq.c.max_id)
        .join(AwaitingAuthor, AwaitingAuthor.steam_id == FeedbackMessage.author_id)
        .where(AwaitingAuthor.role.in_(["admin", "moderator"]))
    )
    awaiting_count = awaiting_result.scalar_one()

    items = []
    for row in rows:
        fb = row.Feedback
        latest_role = latest_roles.get(fb.id)
        awaiting_user = fb.status == "open" and latest_role in ("admin", "moderator")
        items.append(_make_out(fb, user.player_name, row.message_count, awaiting_user))

    return FeedbackListResponse(
        items=items,
        total=total,
        awaiting_count=awaiting_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("", response_model=FeedbackListResponse)
async def list_all_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(PAGE_SIZE, ge=1, le=100),
    status: str | None = Query(None),
    user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    Author = aliased(SteamPlayerCache)
    filters = []
    if status:
        filters.append(Feedback.status == status)

    total_result = await db.execute(
        select(func.count()).select_from(Feedback).where(*filters)
    )
    total = total_result.scalar_one()
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size

    result = await db.execute(
        select(
            Feedback,
            Author.player_name.label("author_name"),
            func.count(FeedbackMessage.id).label("message_count"),
        )
        .outerjoin(Author, Author.steam_id == Feedback.author_id)
        .outerjoin(FeedbackMessage, FeedbackMessage.feedback_id == Feedback.id)
        .where(*filters)
        .group_by(Feedback.id, Author.player_name)
        .order_by(Feedback.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = result.all()

    return FeedbackListResponse(
        items=[_make_out(row.Feedback, row.author_name, row.message_count) for row in rows],
        total=total,
        awaiting_count=0,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{feedback_id}", response_model=FeedbackThreadOut)
async def get_feedback_thread(
    feedback_id: int,
    user: User = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    fb = await _get_accessible_feedback(feedback_id, user, db)

    author_result = await db.execute(
        select(SteamPlayerCache.player_name).where(SteamPlayerCache.steam_id == fb.author_id)
    )
    author_name = author_result.scalar_one_or_none()

    MsgAuthorUser = aliased(User)
    MsgAuthorCache = aliased(SteamPlayerCache)
    msgs_result = await db.execute(
        select(
            FeedbackMessage,
            MsgAuthorCache.player_name.label("author_name"),
            MsgAuthorUser.role.label("author_role"),
        )
        .outerjoin(MsgAuthorUser, MsgAuthorUser.steam_id == FeedbackMessage.author_id)
        .outerjoin(MsgAuthorCache, MsgAuthorCache.steam_id == FeedbackMessage.author_id)
        .where(FeedbackMessage.feedback_id == feedback_id)
        .order_by(FeedbackMessage.created_at)
    )
    msg_rows = msgs_result.all()

    is_admin = user.role == "admin"
    messages = [
        FeedbackMessageOut(
            id=row.FeedbackMessage.id,
            author_steam_id=str(row.FeedbackMessage.author_id) if (is_admin or row.author_role not in ("admin", "moderator")) else "0",
            author_name=row.author_name if (is_admin or row.author_role not in ("admin", "moderator")) else None,
            author_role=row.author_role,
            body=row.FeedbackMessage.body,
            created_at=row.FeedbackMessage.created_at,
        )
        for row in msg_rows
    ]

    return FeedbackThreadOut(
        id=fb.id,
        author_steam_id=str(fb.author_id),
        author_name=author_name,
        subject=fb.subject,
        body=fb.body,
        status=fb.status,
        created_at=fb.created_at,
        closed_at=fb.closed_at,
        messages=messages,
    )


@router.post("/{feedback_id}/messages", response_model=FeedbackMessageOut, status_code=201)
async def add_message(
    feedback_id: int,
    payload: FeedbackMessageCreate,
    user: User = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    fb = await _get_accessible_feedback(feedback_id, user, db)
    if fb.status == "closed":
        raise HTTPException(status_code=409, detail="Cannot reply to a closed thread")
    if not payload.body.strip():
        raise HTTPException(status_code=422, detail="Message body cannot be empty")

    msg = FeedbackMessage(
        feedback_id=feedback_id,
        author_id=user.steam_id,
        body=payload.body.strip(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    return FeedbackMessageOut(
        id=msg.id,
        author_steam_id=str(msg.author_id),
        author_name=user.player_name,
        author_role=user.role,
        body=msg.body,
        created_at=msg.created_at,
    )


@router.post("/{feedback_id}/close", status_code=204)
async def close_feedback(
    feedback_id: int,
    user: User = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    fb = await _get_accessible_feedback(feedback_id, user, db)
    if fb.status == "closed":
        raise HTTPException(status_code=409, detail="Already closed")
    now = datetime.now(timezone.utc)
    fb.status = "closed"
    fb.closed_at = now
    fb.closed_by = user.steam_id
    await db.commit()


@router.post("/{feedback_id}/reopen", status_code=204)
async def reopen_feedback(
    feedback_id: int,
    user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if fb is None:
        raise HTTPException(status_code=404, detail="Feedback not found")
    if fb.status == "open":
        raise HTTPException(status_code=409, detail="Already open")
    fb.status = "open"
    fb.closed_at = None
    fb.closed_by = None
    await db.commit()
