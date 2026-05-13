"""Auth, follow, and friends-leaderboard endpoints."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

import httpx

from ..auth import create_token, get_current_user, steam_login_url, verify_steam_callback
from ..config import settings
from ..database import get_db
from ..models import DailyRun, Follow, LeaderboardEntry, SteamPlayerCache, User
from ..scraper.steam import resolve_player_info, upsert_player_cache
from ..schemas import (
    FriendsLeaderboardResponse,
    FollowsResponse,
    GameVersion,
    LeaderboardEntryOut,
    SortType,
    UserOut,
)

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Steam OpenID login
# ---------------------------------------------------------------------------

@router.get("/auth/steam")
async def steam_login():
    """Redirect the browser to Steam's OpenID login page."""
    url = steam_login_url(
        return_to=f"{settings.app_url}/api/auth/steam/callback",
        realm=settings.app_url,
    )
    return RedirectResponse(url)


@router.get("/auth/steam/callback")
async def steam_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Steam's OpenID callback, issue a JWT, and redirect to the frontend."""
    params = dict(request.query_params)
    steam_id = await verify_steam_callback(params)
    if steam_id is None:
        return RedirectResponse(f"{settings.app_url}/?auth_error=1")

    # Resolve fresh name and avatar from Steam, store in steam_player_cache.
    async with httpx.AsyncClient() as client:
        names, avatars = await resolve_player_info(client, [steam_id])
    await upsert_player_cache(db, names=names, avatars=avatars)

    result = await db.execute(select(User).where(User.steam_id == steam_id))
    user = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if user is None:
        user = User(steam_id=steam_id, created_at=now)
        db.add(user)

    await db.commit()

    token = create_token(steam_id)
    return RedirectResponse(f"{settings.app_url}/#token={token}")


# ---------------------------------------------------------------------------
# Current user
# ---------------------------------------------------------------------------

@router.get("/auth/me", response_model=UserOut)
async def get_me(current_user=Depends(get_current_user)):
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return current_user


# ---------------------------------------------------------------------------
# Follows
# ---------------------------------------------------------------------------

@router.get("/follows", response_model=FollowsResponse)
async def list_follows(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user is None:
        return FollowsResponse(following=[])
    rows = await db.execute(
        select(Follow.following_id).where(Follow.follower_id == current_user.steam_id)
    )
    return FollowsResponse(following=[str(r[0]) for r in rows])


@router.post("/follows/{steam_id}", status_code=204)
async def follow(
    steam_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user is None:
        raise HTTPException(status_code=401)
    if current_user.steam_id == steam_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    existing = await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.steam_id,
            Follow.following_id == steam_id,
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(Follow(
            follower_id=current_user.steam_id,
            following_id=steam_id,
            created_at=datetime.now(timezone.utc),
        ))
        await db.commit()


@router.delete("/follows/{steam_id}", status_code=204)
async def unfollow(
    steam_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user is None:
        raise HTTPException(status_code=401)
    row = await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.steam_id,
            Follow.following_id == steam_id,
        )
    )
    follow_row = row.scalar_one_or_none()
    if follow_row:
        await db.delete(follow_row)
        await db.commit()


# ---------------------------------------------------------------------------
# Friends leaderboard
# ---------------------------------------------------------------------------

@router.get("/friends-leaderboard", response_model=FriendsLeaderboardResponse)
async def get_friends_leaderboard(
    version: GameVersion = Query(GameVersion.REPENTANCE_PLUS_SOLO),
    sort_type: SortType = Query(SortType.SCORE),
    run_date: date | None = Query(None, alias="date"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user is None:
        return FriendsLeaderboardResponse(entries=[])

    following_count = await db.scalar(
        select(func.count()).where(Follow.follower_id == current_user.steam_id)
    )

    if following_count:
        following_sq = (
            select(Follow.following_id)
            .where(Follow.follower_id == current_user.steam_id)
            .scalar_subquery()
        )
        steam_id_filter = or_(
            LeaderboardEntry.steam_id == current_user.steam_id,
            LeaderboardEntry.steam_id.in_(following_sq),
        )
    else:
        steam_id_filter = LeaderboardEntry.steam_id == current_user.steam_id

    # Resolve date to the latest with entries if not provided.
    if run_date is None:
        latest = await db.execute(
            select(func.max(DailyRun.date))
            .join(LeaderboardEntry, LeaderboardEntry.daily_run_id == DailyRun.id)
            .where(DailyRun.version == version, DailyRun.sort_type == sort_type)
        )
        run_date = latest.scalar_one_or_none()
        if run_date is None:
            return FriendsLeaderboardResponse(entries=[])

    run_row = await db.execute(
        select(DailyRun).where(
            DailyRun.date == run_date,
            DailyRun.version == version,
            DailyRun.sort_type == sort_type,
        )
    )
    run = run_row.scalar_one_or_none()
    if run is None:
        return FriendsLeaderboardResponse(entries=[])

    le_inner = aliased(LeaderboardEntry)
    adj_rank_sq = (
        select(func.count() + 1)
        .where(
            le_inner.daily_run_id == LeaderboardEntry.daily_run_id,
            le_inner.rank < LeaderboardEntry.rank,
            le_inner.hidden == False,
        )
        .scalar_subquery()
    )
    entry_rows = await db.execute(
        select(LeaderboardEntry, SteamPlayerCache.player_name.label("cache_name"), adj_rank_sq.label("adjusted_rank"))
        .outerjoin(SteamPlayerCache, SteamPlayerCache.steam_id == LeaderboardEntry.steam_id)
        .where(
            LeaderboardEntry.daily_run_id == run.id,
            steam_id_filter,
            LeaderboardEntry.hidden == False,
        )
        .order_by(adj_rank_sq)
    )
    rows = entry_rows.all()
    return FriendsLeaderboardResponse(
        entries=[
            LeaderboardEntryOut.model_validate(e).model_copy(update={"rank": adj_rank, "player_name": cache_name})
            for e, cache_name, adj_rank in rows
        ]
    )
