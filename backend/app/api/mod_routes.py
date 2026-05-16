"""Moderation endpoints — hide/unhide entries, reports queue, role management."""

import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import DailyRun, GameVersion, LeaderboardEntry, Report, SortType, SteamPlayerCache, User
from .routes import _cache_invalidate_prefix
from ..schemas import (
    AdminPlayerResult,
    AdminPlayerSearchResponse,
    HiddenEntriesResponse,
    HiddenEntryOut,
    ModeratorEntry,
    ModeratorsResponse,
    PlayerHiddenRunEntry,
    PlayerHiddenRunsResponse,
    ReportOut,
    ReportSummary,
    ReportsResponse,
)
from .filters import AUTO_BAN_THRESHOLD

router = APIRouter(prefix="/api/mod")


async def get_mod_user(current_user=Depends(get_current_user)):
    if current_user is None or current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


async def get_admin_user(current_user=Depends(get_current_user)):
    if current_user is None or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EntryCache = aliased(SteamPlayerCache)
_ReporterCache = aliased(SteamPlayerCache)
_ReviewerCache = aliased(SteamPlayerCache)

_REPORT_COLS = (
    Report.id,
    Report.entry_id,
    Report.reason,
    Report.status,
    Report.created_at,
    Report.reviewed_at,
    Report.reporter_id,
    Report.reviewed_by,
    _EntryCache.player_name.label("entry_player_name"),
    LeaderboardEntry.steam_id.label("entry_steam_id"),
    LeaderboardEntry.rank.label("entry_rank"),
    DailyRun.version.label("entry_version"),
    DailyRun.sort_type.label("entry_sort_type"),
    DailyRun.date.label("entry_date"),
    _ReporterCache.player_name.label("reporter_name"),
    _ReviewerCache.player_name.label("reviewer_name"),
)

def _report_base_query(with_total: bool = False):
    cols = (*_REPORT_COLS, func.count().over().label("total_count")) if with_total else _REPORT_COLS
    return (
        select(*cols)
        .join(LeaderboardEntry, Report.entry_id == LeaderboardEntry.id)
        .join(DailyRun, LeaderboardEntry.daily_run_id == DailyRun.id)
        .outerjoin(_EntryCache, _EntryCache.steam_id == LeaderboardEntry.steam_id)
        .outerjoin(_ReporterCache, _ReporterCache.steam_id == Report.reporter_id)
        .outerjoin(_ReviewerCache, _ReviewerCache.steam_id == Report.reviewed_by)
    )

def _row_to_report_out(row) -> ReportOut:
    return ReportOut(
        id=row.id,
        entry_id=row.entry_id,
        reason=row.reason,
        status=row.status,
        created_at=row.created_at,
        reviewed_at=row.reviewed_at,
        entry_player_name=row.entry_player_name,
        entry_steam_id=row.entry_steam_id,
        entry_rank=row.entry_rank,
        entry_version=row.entry_version,
        entry_sort_type=row.entry_sort_type,
        entry_date=row.entry_date,
        reporter_steam_id=row.reporter_id,
        reporter_name=row.reporter_name,
        reviewed_by_steam_id=row.reviewed_by,
        reviewed_by_name=row.reviewer_name,
    )


# ---------------------------------------------------------------------------
# Hidden entries
# ---------------------------------------------------------------------------

@router.get("/hidden-entries", response_model=HiddenEntriesResponse)
async def list_hidden_entries(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    mod=Depends(get_mod_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size

    HiderCache = aliased(SteamPlayerCache)
    EntryPlayerCache = aliased(SteamPlayerCache)

    # Window function counts all hidden entries per player across the full
    # result set (evaluated before LIMIT), replacing a separate GROUP BY query.
    player_hidden_count = func.count().over(
        partition_by=LeaderboardEntry.steam_id
    ).label("player_hidden_count")
    total_count = func.count().over().label("total_count")

    rows_result = await db.execute(
        select(
            LeaderboardEntry, DailyRun.date, DailyRun.version, DailyRun.sort_type,
            HiderCache.player_name.label("hidden_by_name"),
            EntryPlayerCache.player_name.label("entry_player_name"),
            player_hidden_count,
            total_count,
        )
        .join(DailyRun, LeaderboardEntry.daily_run_id == DailyRun.id)
        .outerjoin(HiderCache, HiderCache.steam_id == LeaderboardEntry.hidden_by)
        .outerjoin(EntryPlayerCache, EntryPlayerCache.steam_id == LeaderboardEntry.steam_id)
        .where(LeaderboardEntry.hidden == True)  # noqa: E712
        .order_by(LeaderboardEntry.hidden_at.desc(), LeaderboardEntry.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = rows_result.all()

    total = rows[0].total_count if rows else 0
    total_pages = max(1, math.ceil(total / page_size))

    # Fetch resolved reports for entries hidden via report on this page
    report_entry_ids = [row.LeaderboardEntry.id for row in rows if row.LeaderboardEntry.hidden_source == "report"]
    reports_by_entry: dict[int, list[ReportSummary]] = {}
    if report_entry_ids:
        ReportReporterCache = aliased(SteamPlayerCache)
        rep_result = await db.execute(
            select(Report.entry_id, ReportReporterCache.player_name.label("reporter_name"), Report.reason, Report.created_at)
            .outerjoin(ReportReporterCache, ReportReporterCache.steam_id == Report.reporter_id)
            .where(Report.entry_id.in_(report_entry_ids), Report.status == "resolved")
            .order_by(Report.created_at.asc())
        )
        for rep_row in rep_result.all():
            reports_by_entry.setdefault(rep_row.entry_id, []).append(
                ReportSummary(reporter_name=rep_row.reporter_name, reason=rep_row.reason, created_at=rep_row.created_at)
            )

    entries = [
        HiddenEntryOut(
            id=row.LeaderboardEntry.id,
            steam_id=row.LeaderboardEntry.steam_id,
            player_name=row.entry_player_name,
            rank=row.LeaderboardEntry.rank,
            value=row.LeaderboardEntry.value,
            time_taken=row.LeaderboardEntry.time_taken,
            date=row.date,
            version=row.version,
            sort_type=row.sort_type,
            hidden_by=row.LeaderboardEntry.hidden_by,
            hidden_by_name=row.hidden_by_name,
            hidden_at=row.LeaderboardEntry.hidden_at,
            hidden_source=row.LeaderboardEntry.hidden_source,
            reports=reports_by_entry.get(row.LeaderboardEntry.id, []),
            auto_banned=row.player_hidden_count >= AUTO_BAN_THRESHOLD,
            level=row.LeaderboardEntry.level,
            stage_bonus=row.LeaderboardEntry.stage_bonus,
            schwag_bonus=row.LeaderboardEntry.schwag_bonus,
            bluebaby_bonus=row.LeaderboardEntry.bluebaby_bonus,
            lamb_bonus=row.LeaderboardEntry.lamb_bonus,
            megasatan_bonus=row.LeaderboardEntry.megasatan_bonus,
            rush_bonus=row.LeaderboardEntry.rush_bonus,
            exploration_bonus=row.LeaderboardEntry.exploration_bonus,
            damage_penalty=row.LeaderboardEntry.damage_penalty,
            time_penalty=row.LeaderboardEntry.time_penalty,
            item_penalty=row.LeaderboardEntry.item_penalty,
        )
        for row in rows
    ]

    return HiddenEntriesResponse(
        entries=entries,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/entries/{entry_id}/hide", status_code=204)
async def hide_entry(
    entry_id: int,
    source: str = Query("direct", pattern="^(direct|report)$"),
    mod=Depends(get_mod_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404)
    now = datetime.now(timezone.utc)
    entry.hidden = True
    entry.hidden_by = mod.steam_id
    entry.hidden_at = now
    entry.hidden_source = source
    # Resolve all pending reports for this entry
    await db.execute(
        update(Report)
        .where(Report.entry_id == entry_id, Report.status == "pending")
        .values(status="resolved", reviewed_by=mod.steam_id, reviewed_at=now)
    )
    await db.commit()
    _cache_invalidate_prefix("leaderboard:")
    _cache_invalidate_prefix("player:")
    _cache_invalidate_prefix("overall:")
    _cache_invalidate_prefix("profile:")


@router.delete("/entries/{entry_id}/hide", status_code=204)
async def unhide_entry(
    entry_id: int,
    mod=Depends(get_mod_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404)
    entry.hidden = False
    entry.hidden_by = None
    entry.hidden_at = None
    await db.commit()
    _cache_invalidate_prefix("leaderboard:")
    _cache_invalidate_prefix("player:")
    _cache_invalidate_prefix("overall:")
    _cache_invalidate_prefix("profile:")


# ---------------------------------------------------------------------------
# Player unban
# ---------------------------------------------------------------------------

@router.post("/players/{steam_id}/unban", status_code=204)
async def unban_player(
    steam_id: int,
    admin=Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(LeaderboardEntry)
        .where(LeaderboardEntry.steam_id == steam_id, LeaderboardEntry.hidden == True)  # noqa: E712
        .values(hidden=False, hidden_by=None, hidden_at=None, hidden_source=None)
    )
    await db.commit()
    _cache_invalidate_prefix("leaderboard:")
    _cache_invalidate_prefix("player:")
    _cache_invalidate_prefix("overall:")
    _cache_invalidate_prefix("profile:")


@router.get("/players/{steam_id}/hidden-runs", response_model=PlayerHiddenRunsResponse)
async def get_player_hidden_runs(
    steam_id: int,
    version: GameVersion = Query(...),
    sort_type: SortType = Query(...),
    mod=Depends(get_mod_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeaderboardEntry, DailyRun.date)
        .join(DailyRun, LeaderboardEntry.daily_run_id == DailyRun.id)
        .where(
            LeaderboardEntry.steam_id == steam_id,
            LeaderboardEntry.hidden == True,  # noqa: E712
            DailyRun.version == version,
            DailyRun.sort_type == sort_type,
        )
        .order_by(DailyRun.date.desc())
    )
    rows = result.all()
    entries = [
        PlayerHiddenRunEntry(
            date=run_date,
            hidden_source=entry.hidden_source,
            **{c: getattr(entry, c) for c in (
                "id", "rank", "steam_id", "value", "hidden",
                "stage_bonus", "schwag_bonus", "bluebaby_bonus", "lamb_bonus",
                "megasatan_bonus", "rush_bonus", "exploration_bonus",
                "damage_penalty", "time_penalty", "item_penalty",
                "level", "time_taken", "goal",
            )},
        )
        for entry, run_date in rows
    ]
    return PlayerHiddenRunsResponse(entries=entries)


# ---------------------------------------------------------------------------
# Reports — mod queue (pending only)
# ---------------------------------------------------------------------------

@router.get("/reports", response_model=ReportsResponse)
async def list_pending_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    mod=Depends(get_mod_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size
    rows_result = await db.execute(
        _report_base_query(with_total=True)
        .where(Report.status == "pending")
        .order_by(Report.created_at.asc())
        .offset(offset)
        .limit(page_size)
    )
    rows = rows_result.all()
    total = rows[0].total_count if rows else 0
    total_pages = max(1, math.ceil(total / page_size))
    return ReportsResponse(
        reports=[_row_to_report_out(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/reports/{report_id}/dismiss", status_code=204)
async def dismiss_report(
    report_id: int,
    mod=Depends(get_mod_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404)
    report.status = "dismissed"
    report.reviewed_by = mod.steam_id
    report.reviewed_at = datetime.now(timezone.utc)
    await db.commit()


# ---------------------------------------------------------------------------
# Reports — admin view (all statuses)
# ---------------------------------------------------------------------------

@router.get("/all-reports", response_model=ReportsResponse)
async def list_all_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(None),
    admin=Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    where_clause = Report.status == status if status else True  # type: ignore[arg-type]
    offset = (page - 1) * page_size
    rows_result = await db.execute(
        _report_base_query(with_total=True)
        .where(where_clause)
        .order_by(Report.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = rows_result.all()
    total = rows[0].total_count if rows else 0
    total_pages = max(1, math.ceil(total / page_size))
    return ReportsResponse(
        reports=[_row_to_report_out(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ---------------------------------------------------------------------------
# Role management
# ---------------------------------------------------------------------------

@router.post("/users/{steam_id}/moderator", status_code=204)
async def grant_moderator(
    steam_id: int,
    admin=Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.steam_id == steam_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(steam_id=steam_id, created_at=datetime.now(timezone.utc))
        db.add(user)
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot change role of an admin")
    user.role = "moderator"
    await db.commit()


@router.delete("/users/{steam_id}/moderator", status_code=204)
async def revoke_moderator(
    steam_id: int,
    admin=Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.steam_id == steam_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot change role of an admin")
    user.role = None
    await db.commit()


@router.get("/moderators", response_model=ModeratorsResponse)
async def list_moderators(
    admin=Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    ModCache = aliased(SteamPlayerCache)
    result = await db.execute(
        select(User.steam_id, ModCache.player_name)
        .outerjoin(ModCache, ModCache.steam_id == User.steam_id)
        .where(User.role == "moderator")
        .order_by(ModCache.player_name)
    )
    rows = result.all()
    return ModeratorsResponse(
        moderators=[ModeratorEntry(steam_id=row.steam_id, player_name=row.player_name) for row in rows]
    )


@router.get("/players/search", response_model=AdminPlayerSearchResponse)
async def admin_search_players(
    q: str = Query(..., min_length=1, max_length=100),
    admin=Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    q = q.strip()
    name_filter = SteamPlayerCache.player_name.ilike(f"%{q}%")
    try:
        sid = int(q)
        match_filter = or_(SteamPlayerCache.steam_id == sid, name_filter)
    except ValueError:
        match_filter = name_filter

    result = await db.execute(
        select(SteamPlayerCache.steam_id, SteamPlayerCache.player_name, User.role)
        .outerjoin(User, User.steam_id == SteamPlayerCache.steam_id)
        .where(match_filter)
        .order_by(SteamPlayerCache.player_name)
        .limit(20)
    )
    rows = result.all()
    return AdminPlayerSearchResponse(
        results=[
            AdminPlayerResult(steam_id=row.steam_id, player_name=row.player_name, role=row.role)
            for row in rows
        ]
    )
