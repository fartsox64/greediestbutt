import asyncio
import logging
import math
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from ..auth import get_current_user
from ..database import AsyncSessionLocal, get_db
from ..models import DailyRun, Follow, GameVersion, LeaderboardEntry, PlayerOverallStats, SortType, SteamPlayerCache, User, VERSION_ORDER
from .filters import visible_entries_filter
from ..schemas import (
    AvailableDatesResponse,
    AvatarsResponse,
    LeaderboardEntryOut,
    LeaderboardResponse,
    OverallEntry,
    OverallLeaderboardResponse,
    PlayerResponse,
    PlayerRunEntry,
    ProfileResponse,
    ProfileRunTypeStats,
    ScrapeResult,
    SearchResponse,
    SearchResult,
    DailyCountsResponse,
    StatsResponse,
)
from ..scraper.steam import (
    backfill_packed_nulls,
    backfill_player_names,
    backfill_rp_time_taken,
    discover_leaderboards,
    refresh_overall_stats,
    resolve_player_info,
    run_id_var,
    scrape_today,
    seed_all,
    upsert_player_cache,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

PAGE_SIZE_MIN = 1
PAGE_SIZE_MAX = 200
PAGE_SIZE_DEFAULT = 20

# ---------------------------------------------------------------------------
# Simple in-process TTL cache for expensive aggregate queries
# ---------------------------------------------------------------------------

_CACHE_TTL = 300  # seconds
_cache: dict[str, tuple[datetime, Any]] = {}


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and (datetime.now(timezone.utc) - entry[0]).total_seconds() < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = (datetime.now(timezone.utc), value)


def _cache_invalidate_prefix(prefix: str) -> None:
    for key in [k for k in _cache if k.startswith(prefix)]:
        del _cache[key]


# ---------------------------------------------------------------------------
# Leaderboard query
# ---------------------------------------------------------------------------

@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    version: GameVersion = Query(GameVersion.REPENTANCE_PLUS_SOLO),
    sort_type: SortType = Query(SortType.SCORE),
    run_date: date | None = Query(None, alias="date"),
    page: int = Query(1, ge=1),
    page_size: int = Query(PAGE_SIZE_DEFAULT, ge=PAGE_SIZE_MIN, le=PAGE_SIZE_MAX),
    db: AsyncSession = Depends(get_db),
):
    # Resolve the target date: use provided or fall back to the latest available.
    # Done before the cache check so the key is always fully specified.
    if run_date is None:
        latest_result = await db.execute(
            select(func.max(DailyRun.date)).where(
                DailyRun.version == version,
                DailyRun.sort_type == sort_type,
            )
        )
        run_date = latest_result.scalar_one_or_none()
        if run_date is None:
            raise HTTPException(
                status_code=404,
                detail="No leaderboard data found for this version/sort combination.",
            )

    cache_key = f"leaderboard:{version}:{sort_type}:{run_date}:{page}:{page_size}"
    if (cached := _cache_get(cache_key)) is not None:
        return cached

    # Fetch the DailyRun record
    run_result = await db.execute(
        select(DailyRun).where(
            DailyRun.date == run_date,
            DailyRun.version == version,
            DailyRun.sort_type == sort_type,
        )
    )
    run = run_result.scalar_one_or_none()
    if run is None:
        raise HTTPException(
            status_code=404,
            detail=f"No leaderboard found for {version} / {sort_type} on {run_date}.",
        )

    # Single query: page rows + player name from cache + total count via window function.
    offset = (page - 1) * page_size
    entries_result = await db.execute(
        select(LeaderboardEntry, SteamPlayerCache.player_name.label("cache_name"), func.count().over().label("total_count"))
        .outerjoin(SteamPlayerCache, SteamPlayerCache.steam_id == LeaderboardEntry.steam_id)
        .where(
            LeaderboardEntry.daily_run_id == run.id,
            visible_entries_filter(),
        )
        .order_by(LeaderboardEntry.rank)
        .offset(offset)
        .limit(page_size)
    )
    rows = entries_result.all()

    total_entries = rows[0][2] if rows else 0
    total_pages = max(1, math.ceil(total_entries / page_size))

    result = LeaderboardResponse(
        date=run_date,
        version=version,
        sort_type=sort_type,
        total_entries=total_entries,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        entries=[
            LeaderboardEntryOut.model_validate(row[0]).model_copy(update={"rank": offset + idx + 1, "player_name": row[1]})
            for idx, row in enumerate(rows)
        ],
    )
    _cache_set(cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Overall leaderboard
# ---------------------------------------------------------------------------

@router.get("/overall-leaderboard", response_model=OverallLeaderboardResponse)
async def get_overall_leaderboard(
    version: GameVersion = Query(GameVersion.REPENTANCE_PLUS_SOLO),
    sort_type: SortType = Query(SortType.SCORE),
    min_runs: int = Query(90, ge=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(PAGE_SIZE_DEFAULT, ge=PAGE_SIZE_MIN, le=PAGE_SIZE_MAX),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"overall:{version}:{sort_type}:{min_runs}:{page}:{page_size}"
    if (cached := _cache_get(cache_key)) is not None:
        return cached

    offset = (page - 1) * page_size
    _where = (
        PlayerOverallStats.version == version,
        PlayerOverallStats.sort_type == sort_type,
        PlayerOverallStats.runs_played >= min_runs,
    )
    total_players = await db.scalar(select(func.count()).where(*_where)) or 0
    total_pages = max(1, math.ceil(total_players / page_size))

    rows_result = await db.execute(
        select(PlayerOverallStats, SteamPlayerCache.player_name.label("player_name"))
        .outerjoin(SteamPlayerCache, SteamPlayerCache.steam_id == PlayerOverallStats.steam_id)
        .where(*_where)
        .order_by(PlayerOverallStats.avg_rank, PlayerOverallStats.runs_played.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = rows_result.all()

    entries = [
        OverallEntry(
            rank=offset + idx + 1,
            steam_id=row[0].steam_id,
            player_name=row[1],
            runs_played=row[0].runs_played,
            avg_rank=float(row[0].avg_rank),
            best_rank=row[0].best_rank,
            wins=row[0].wins,
        )
        for idx, row in enumerate(rows)
    ]

    result = OverallLeaderboardResponse(
        version=version,
        sort_type=sort_type,
        total_players=total_players,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        entries=entries,
    )
    _cache_set(cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Player run history
# ---------------------------------------------------------------------------

@router.get("/player/{steam_id}", response_model=PlayerResponse)
async def get_player(
    steam_id: int,
    version: GameVersion = Query(...),
    sort_type: SortType = Query(...),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"player:{steam_id}:{version}:{sort_type}"
    if (cached := _cache_get(cache_key)) is not None:
        return cached

    # Correlated subquery for adjusted rank: uses ix_le_visible_run_rank
    # (daily_run_id, rank WHERE hidden=false) for a tight index range scan per
    # run instead of a full window function sort over all entries in all runs.
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
    result = await db.execute(
        select(LeaderboardEntry, DailyRun.date, adj_rank_sq.label("adjusted_rank"))
        .join(DailyRun, LeaderboardEntry.daily_run_id == DailyRun.id)
        .where(
            LeaderboardEntry.steam_id == steam_id,
            DailyRun.version == version,
            DailyRun.sort_type == sort_type,
            LeaderboardEntry.hidden == False,
        )
        .order_by(DailyRun.date.desc())
    )
    rows = result.all()

    if not rows:
        raise HTTPException(status_code=404, detail="No runs found for this player.")

    name_result = await db.execute(
        select(SteamPlayerCache.player_name).where(SteamPlayerCache.steam_id == steam_id)
    )
    player_name = name_result.scalar_one_or_none()
    entries = [
        PlayerRunEntry(
            date=run_date,
            **LeaderboardEntryOut.model_validate(entry).model_copy(update={"rank": adj_rank, "player_name": player_name}).model_dump(),
        )
        for entry, run_date, adj_rank in rows
    ]

    response = PlayerResponse(
        steam_id=steam_id,
        player_name=player_name,
        version=version,
        sort_type=sort_type,
        entries=entries,
    )
    _cache_set(cache_key, response)
    return response


# ---------------------------------------------------------------------------
# Player profile (aggregate stats across all versions/sort types)
# ---------------------------------------------------------------------------

def _compute_streaks(runs: list[int | None]) -> dict:
    """Given an ordered list of goal values, return streak stats."""
    if not runs:
        return {"current_streak": 0, "current_streak_type": None,
                "longest_win_streak": 0, "longest_loss_streak": 0}

    def outcome(g: int | None) -> str:
        return "win" if (g is not None and g > 1) else "loss"

    outcomes = [outcome(g) for g in runs]

    longest_win = longest_loss = 0
    run_len = 1
    run_type = outcomes[0]
    for o in outcomes[1:]:
        if o == run_type:
            run_len += 1
        else:
            if run_type == "win":
                longest_win = max(longest_win, run_len)
            else:
                longest_loss = max(longest_loss, run_len)
            run_type = o
            run_len = 1
    if run_type == "win":
        longest_win = max(longest_win, run_len)
    else:
        longest_loss = max(longest_loss, run_len)

    current_type = outcomes[-1]
    current = 0
    for o in reversed(outcomes):
        if o == current_type:
            current += 1
        else:
            break

    return {"current_streak": current, "current_streak_type": current_type,
            "longest_win_streak": longest_win, "longest_loss_streak": longest_loss}


@router.get("/profile/{steam_id}", response_model=ProfileResponse)
async def get_profile(steam_id: int, db: AsyncSession = Depends(get_db)):
    cache_key = f"profile:{steam_id}"
    if (cached := _cache_get(cache_key)) is not None:
        return cached

    # Read pre-computed stats from the cache table — O(1) PK lookup per player
    # instead of a window function over all of the player's daily runs.
    stats_result = await db.execute(
        select(PlayerOverallStats).where(PlayerOverallStats.steam_id == steam_id)
    )
    stats_rows = stats_result.scalars().all()

    name_result = await db.execute(
        select(SteamPlayerCache.player_name).where(SteamPlayerCache.steam_id == steam_id)
    )
    player_name = name_result.scalar_one_or_none()

    follower_result = await db.execute(
        select(func.count()).where(Follow.following_id == steam_id)
    )
    follower_count = follower_result.scalar_one()

    following_result = await db.execute(
        select(func.count()).where(Follow.follower_id == steam_id)
    )
    following_count = following_result.scalar_one()

    avatar_result = await db.execute(
        select(SteamPlayerCache.avatar_url).where(SteamPlayerCache.steam_id == steam_id)
    )
    avatar_url = avatar_result.scalar_one_or_none()

    role_result = await db.execute(
        select(User.role).where(User.steam_id == steam_id)
    )
    role = role_result.scalar_one_or_none()

    # Fetch goals ordered by date per version/sort_type for streak computation
    streak_result = await db.execute(
        select(DailyRun.version, DailyRun.sort_type, LeaderboardEntry.goal)
        .join(DailyRun, LeaderboardEntry.daily_run_id == DailyRun.id)
        .where(LeaderboardEntry.steam_id == steam_id)
        .order_by(DailyRun.version, DailyRun.sort_type, DailyRun.date)
    )
    from collections import defaultdict
    goals_by_key: dict[tuple, list] = defaultdict(list)
    for sr in streak_result.all():
        goals_by_key[(sr.version, sr.sort_type)].append(sr.goal)

    version_rank = {v: i for i, v in enumerate(VERSION_ORDER)}
    stats = sorted(
        [
            ProfileRunTypeStats(
                version=GameVersion(row.version),      # type: ignore[arg-type]
                sort_type=SortType(row.sort_type),     # type: ignore[arg-type]
                runs_played=int(row.runs_played),      # type: ignore[arg-type]
                avg_rank=float(row.avg_rank),          # type: ignore[arg-type]
                best_rank=int(row.best_rank),          # type: ignore[arg-type]
                wins=int(row.wins),                    # type: ignore[arg-type]
                **_compute_streaks(goals_by_key[(row.version, row.sort_type)]),
            )
            for row in stats_rows
        ],
        key=lambda s: (version_rank.get(s.version, 99), s.sort_type),
    )

    result = ProfileResponse(
        steam_id=steam_id,
        player_name=player_name,
        avatar_url=avatar_url,
        follower_count=follower_count,
        following_count=following_count,
        role=role,
        stats=stats,
    )
    _cache_set(cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Avatar cache
# ---------------------------------------------------------------------------

AVATAR_CACHE_TTL_DAYS = 7

@router.get("/avatars", response_model=AvatarsResponse)
async def get_avatars(
    steam_ids: str = Query(..., description="Comma-separated Steam IDs"),
    db: AsyncSession = Depends(get_db),
):
    """Return cached avatar URLs for the given Steam IDs, fetching from Steam for any misses."""
    id_list: list[int] = []
    for part in steam_ids.split(","):
        part = part.strip()
        if part:
            try:
                id_list.append(int(part))
            except ValueError:
                pass

    if not id_list:
        return AvatarsResponse(avatars={})

    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=AVATAR_CACHE_TTL_DAYS)
    cached: dict[int, str] = {}
    # asyncpg caps query parameters at 32767; batch IN clauses to stay safe.
    _BATCH = 10_000
    for i in range(0, len(id_list), _BATCH):
        chunk = id_list[i : i + _BATCH]
        result = await db.execute(
            select(SteamPlayerCache).where(
                SteamPlayerCache.steam_id.in_(chunk),
                SteamPlayerCache.fetched_at > stale_cutoff,
            )
        )
        cached.update({
            row.steam_id: row.avatar_url
            for row in result.scalars()
            if row.avatar_url
        })

    misses = [sid for sid in id_list if sid not in cached]
    if misses:
        async with httpx.AsyncClient() as client:
            _, new_avatars = await resolve_player_info(client, misses)
        if new_avatars:
            await upsert_player_cache(db, avatars=new_avatars)
            await db.commit()
            cached.update(new_avatars)

    return AvatarsResponse(avatars={str(k): v for k, v in cached.items()})


# ---------------------------------------------------------------------------
# Player search
# ---------------------------------------------------------------------------

@router.get("/search", response_model=SearchResponse)
async def search_players(
    q: str = Query(..., min_length=1, max_length=100),
    version: GameVersion = Query(...),
    sort_type: SortType = Query(...),
    db: AsyncSession = Depends(get_db),
):
    q = q.strip()
    if not q:
        return SearchResponse(results=[])

    name_filter = SteamPlayerCache.player_name.ilike(f"%{q}%")
    try:
        sid = int(q)
        match_filter = or_(LeaderboardEntry.steam_id == sid, name_filter)
    except ValueError:
        match_filter = name_filter

    result = await db.execute(
        select(
            LeaderboardEntry.steam_id,
            SteamPlayerCache.player_name,
            func.count().label("runs_played"),
            func.min(LeaderboardEntry.rank).label("best_rank"),
        )
        .join(DailyRun, LeaderboardEntry.daily_run_id == DailyRun.id)
        .outerjoin(SteamPlayerCache, SteamPlayerCache.steam_id == LeaderboardEntry.steam_id)
        .where(
            DailyRun.version == version,
            DailyRun.sort_type == sort_type,
            visible_entries_filter(),
            match_filter,
        )
        .group_by(LeaderboardEntry.steam_id, SteamPlayerCache.player_name)
        .order_by(func.min(LeaderboardEntry.rank))
        .limit(20)
    )
    rows = result.all()

    return SearchResponse(
        results=[
            SearchResult(
                steam_id=row.steam_id,
                player_name=row.player_name,
                runs_played=row.runs_played,
                best_rank=row.best_rank,
            )
            for row in rows
        ]
    )


# ---------------------------------------------------------------------------
# Available dates
# ---------------------------------------------------------------------------

@router.get("/available-dates", response_model=AvailableDatesResponse)
async def get_available_dates(
    version: GameVersion = Query(GameVersion.REPENTANCE_PLUS_SOLO),
    sort_type: SortType = Query(SortType.SCORE),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"dates:{version}:{sort_type}"
    if (cached := _cache_get(cache_key)) is not None:
        return cached

    result = await db.execute(
        select(DailyRun.date)
        .where(
            DailyRun.version == version,
            DailyRun.sort_type == sort_type,
            DailyRun.total_entries > 0,
        )
        .order_by(DailyRun.date.desc())
    )
    dates = [row[0] for row in result.all()]
    response = AvailableDatesResponse(version=version, sort_type=sort_type, dates=dates)
    _cache_set(cache_key, response)
    return response


# ---------------------------------------------------------------------------
# Site stats
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    cache_key = "stats:summary"
    if (cached := _cache_get(cache_key)) is not None:
        return cached

    total_result = await db.execute(
        select(func.count())
        .select_from(LeaderboardEntry)
        .where(LeaderboardEntry.hidden == False)  # noqa: E712
    )
    players_result = await db.execute(
        select(func.count(func.distinct(LeaderboardEntry.steam_id)))
        .where(LeaderboardEntry.hidden == False)  # noqa: E712
    )
    last_scraped_result = await db.execute(
        select(func.max(DailyRun.scraped_at))
    )
    response = StatsResponse(
        total_entries=total_result.scalar_one(),
        total_players=players_result.scalar_one(),
        last_scraped_at=last_scraped_result.scalar_one_or_none(),
    )
    _cache_set(cache_key, response)
    return response


@router.get("/stats/daily-counts", response_model=DailyCountsResponse)
async def get_daily_counts(db: AsyncSession = Depends(get_db)):
    cache_key = "stats:daily-counts"
    if (cached := _cache_get(cache_key)) is not None:
        return cached

    result = await db.execute(
        select(DailyRun.version, DailyRun.date, DailyRun.total_entries)
        .where(DailyRun.sort_type == SortType.SCORE, DailyRun.total_entries > 0)
        .order_by(DailyRun.version, DailyRun.date)
    )

    versions: dict[str, list[dict]] = {}
    for version, date_, count in result.all():
        key = version.value if isinstance(version, GameVersion) else str(version)
        versions.setdefault(key, []).append({"date": str(date_), "count": count})

    response = DailyCountsResponse(versions=versions)
    _cache_set(cache_key, response)
    return response


# ---------------------------------------------------------------------------
# Scrape operations
# ---------------------------------------------------------------------------

async def _require_admin(current_user=Depends(get_current_user)):
    if current_user is None or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


@router.post("/scrape/today", response_model=ScrapeResult)
async def scrape_today_endpoint(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(_require_admin),
):
    """Fetch and store today's daily run leaderboards for all versions."""
    stats = await scrape_today(db)
    _cache_invalidate_prefix("dates:")
    _cache_invalidate_prefix("leaderboard:")
    _cache_invalidate_prefix("overall:")
    _cache_invalidate_prefix("profile:")
    _cache_invalidate_prefix("player:")
    _cache_invalidate_prefix("stats:")
    return ScrapeResult(
        runs_created=stats["runs_created"],
        runs_updated=stats["runs_updated"],
        entries_upserted=stats["entries_upserted"],
        message=(
            f"Scraped {stats['runs_created']} new runs, "
            f"updated {stats['runs_updated']}, "
            f"upserted {stats['entries_upserted']} entries."
        ),
    )


@router.post("/scrape/seed", status_code=202)
async def seed_endpoint(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    _admin=Depends(_require_admin),
):
    """Start a background seed of all historical daily run data.

    Returns immediately with a run_id. Track progress in server logs by
    filtering for that ID. The seed is resumable — call again to continue
    from where it left off if interrupted.
    """
    run_id = str(uuid.uuid4())

    async def _run() -> None:
        run_id_var.set(run_id)
        log.info("Seed started (run_id=%s)", run_id)
        try:
            async with AsyncSessionLocal() as db:
                await seed_all(db, from_date=from_date, to_date=to_date)
            for prefix in ("dates:", "leaderboard:", "overall:", "profile:", "player:", "stats:"):
                _cache_invalidate_prefix(prefix)
            log.info("Seed complete (run_id=%s)", run_id)
        except Exception:
            log.exception("Seed failed (run_id=%s)", run_id)

    asyncio.create_task(_run())
    return {"run_id": run_id, "message": f"Seed started. Filter logs for run_id={run_id[:8]} to follow progress."}


@router.post("/scrape/backfill-names", status_code=202)
async def backfill_names_endpoint(
    limit: int | None = None,
    _admin=Depends(_require_admin),
):
    """Start a background pass to resolve player names for all entries missing them.

    Returns immediately with a run_id. Track progress in server logs by
    filtering for that ID. Pass ?limit=N to cap the number of names resolved.
    """
    run_id = str(uuid.uuid4())

    async def _run() -> None:
        run_id_var.set(run_id)
        log.info("Backfill-names started (run_id=%s, limit=%s)", run_id, limit)
        try:
            async with AsyncSessionLocal() as db:
                await backfill_player_names(db, limit=limit)
            log.info("Backfill-names complete (run_id=%s)", run_id)
        except Exception:
            log.exception("Backfill-names failed (run_id=%s)", run_id)

    asyncio.create_task(_run())
    return {"run_id": run_id, "message": f"Backfill started. Filter logs for run_id={run_id[:8]} to follow progress."}


@router.post("/scrape/backfill-packed-nulls")
async def backfill_packed_nulls_endpoint(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(_require_admin),
):
    """Null out opaque bonus/penalty fields stored in packed-format entries.

    Packed-format entries have garbage values for megasatan_bonus, rush_bonus,
    exploration_bonus, damage_penalty, time_penalty, and item_penalty.  Safe to
    re-run; only touches rows where time_penalty is still the opaque sentinel.
    """
    updated = await backfill_packed_nulls(db)
    return {"entries_updated": updated}


@router.post("/scrape/backfill-rp-time")
async def backfill_rp_time_endpoint(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(_require_admin),
):
    """Populate time_taken for R+ time-sort packed-format entries that have NULL.

    Uses steam_value - 0x74000000 to recover in-game frame counts.
    Safe to re-run; only touches rows where time_taken IS NULL.
    """
    updated = await backfill_rp_time_taken(db)
    return {"entries_updated": updated}


@router.post("/scrape/refresh-stats")
async def refresh_stats_endpoint(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(_require_admin),
):
    """Rebuild the overall leaderboard stats cache for all version/sort combinations.

    Runs automatically after each scrape. Call manually after bulk data changes
    (seeding, mass hide/unhide) to ensure the overall leaderboard is up to date.
    """
    total = 0
    for v in GameVersion:
        for st in SortType:
            total += await refresh_overall_stats(db, v, st)
    _cache_invalidate_prefix("overall:")
    return {"rows_upserted": total}


# ---------------------------------------------------------------------------
# Admin: leaderboard discovery
# ---------------------------------------------------------------------------

@router.get("/admin/scheduler")
async def get_scheduler_status(
    request: Request,
    _admin=Depends(_require_admin),
):
    """Return the status of all scheduled jobs."""
    scheduler = request.app.state.scheduler
    job_state: dict = request.app.state.job_state

    jobs = []
    for job in scheduler.get_jobs():
        state = job_state.get(job.id, {})
        jobs.append({
            "id": job.id,
            "next_run_at": job.next_run_time.isoformat() if job.next_run_time else None,
            "running": state.get("running", False),
            "last_run_at": state.get("last_run_at"),
            "last_status": state.get("last_status"),
            "last_duration_s": state.get("last_duration_s"),
        })
    return {"jobs": jobs}


@router.get("/admin/leaderboard-discovery")
async def leaderboard_discovery(
    sample_size: int = Query(50, ge=1, le=500),
    _admin=Depends(_require_admin),
):
    """
    Fetch a sample of daily-run leaderboards from Steam and show their
    detected date, version, and sort type.

    Use this to verify that the version detection patterns in .env are correct
    before running a full scrape or seed.
    """
    results = await discover_leaderboards(sample_size=sample_size)
    return {"count": len(results), "leaderboards": results}
