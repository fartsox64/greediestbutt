"""User-facing report submission endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import LeaderboardEntry, Report
from ..schemas import ReportCreate

router = APIRouter(prefix="/api")


async def get_authenticated_user(current_user=Depends(get_current_user)):
    if current_user is None:
        raise HTTPException(status_code=401, detail="Login required")
    return current_user


@router.post("/reports/{entry_id}", status_code=204)
async def submit_report(
    entry_id: int,
    body: ReportCreate,
    current_user=Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    reason = body.reason.strip()
    if len(reason) < 20:
        raise HTTPException(status_code=422, detail="Reason must be at least 20 characters")

    entry_result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id)
    )
    if entry_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Upsert: one report per user per entry; update reason if they re-submit
    stmt = pg_insert(Report).values(
        entry_id=entry_id,
        reporter_id=current_user.steam_id,
        reason=reason,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_report_entry_reporter",
        set_={"reason": stmt.excluded.reason, "status": "pending"},
    )
    await db.execute(stmt)
    await db.commit()
