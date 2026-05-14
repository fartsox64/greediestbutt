"""
Steam community leaderboard scraper for The Binding of Isaac daily runs.

Steam XML endpoints (no API key required):
  List all leaderboards:
    GET https://steamcommunity.com/stats/{appid}/leaderboards/?xml=1
  Get leaderboard entries:
    GET https://steamcommunity.com/stats/{appid}/leaderboards/{id}/?xml=1&start=1&end=5000

  leaderboardSortMethod: 1 = descending (higher score = better)
                         2 = ascending  (lower time  = better)

Steam Web API (API key required) for player names:
  GET https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/
      ?key={key}&steamids={comma_separated_ids}
"""

import asyncio
import contextvars
import logging
import re
import xml.etree.ElementTree as ET
import defusedxml.ElementTree as defused_ET
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import DailyRun, GameVersion, LeaderboardEntry, PlayerOverallStats, SiteSetting, SortType, SteamPlayerCache

_BoardSignature = tuple[GameVersion, SortType]

# Context variable set by the caller to tag all log lines within a run.
run_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("scrape_run_id", default=None)


class _RunIdAdapter(logging.LoggerAdapter):
    def process(self, msg: str, kwargs: dict) -> tuple[str, dict]:
        run_id = run_id_var.get()
        return (f"[{run_id[:8]}] {msg}" if run_id else msg), kwargs


log = _RunIdAdapter(logging.getLogger(__name__), {})

STEAM_COMMUNITY_BASE = "https://steamcommunity.com/stats"
STEAM_API_BASE = "https://api.steampowered.com"

# Matches 8-digit dates in leaderboard names: YYYYMMDD or YYYY-MM-DD or YYYY_MM_DD.
# Digit boundaries ((?<!\d) / (?!\d)) prevent a false anchor on adjacent numbers
# such as the Steam app ID (250900) that may appear earlier in the name.
_DATE_RE = re.compile(r"(?<!\d)(\d{4})[\-_]?(\d{2})[\-_]?(\d{2})(?!\d)")

# Entries fetched per Steam request (Steam allows up to 5000)
ENTRIES_PER_REQUEST = 5000

# Polite delay between Steam requests (seconds)
REQUEST_DELAY = 0.5

# How long a steam_player_cache entry stays fresh (days)
AVATAR_CACHE_FRESHNESS_DAYS = 7

# Daily runs didn't exist before this date
SCRAPE_MIN_DATE = date(2015, 10, 30)

# Official release dates — entries scraped before these are not from live dailies
VERSION_RELEASE_DATES: dict[GameVersion, date] = {
    GameVersion.AFTERBIRTH: date(2015, 10, 30),
    GameVersion.AFTERBIRTH_PLUS: date(2017, 1, 3),
    GameVersion.REPENTANCE: date(2021, 3, 31),
    GameVersion.REPENTANCE_PLUS_SOLO: date(2024, 11, 19),
    GameVersion.REPENTANCE_PLUS_COOP: date(2024, 11, 19),
}


def is_before_release(run_date: date, version: GameVersion) -> bool:
    """Return True if run_date precedes the official launch of version."""
    release = VERSION_RELEASE_DATES.get(version)
    return release is not None and run_date < release

# asyncpg caps query parameters at 32767.
# IN clauses use one parameter per ID; inserts use one per column per row.
# These batch sizes keep both well under the limit.
_IN_BATCH = 10_000          # safe for IN clauses (one param per element)
_CACHE_INSERT_BATCH = 5_000  # 4 cols × 5000 = 20000 params, well under limit


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RawLeaderboard:
    steam_id: int
    name: str
    entry_count: int
    sort_method: int  # 1 = desc (score), 2 = asc (time)


@dataclass
class RawEntry:
    rank: int
    steam_id: int
    value: int  # raw score/time value from Steam
    details: str | None  # raw hex string from <details> element


@dataclass
class ParsedDetails:
    stage_bonus: int
    schwag_bonus: int
    bluebaby_bonus: int
    lamb_bonus: int
    megasatan_bonus: int
    rush_bonus: int
    exploration_bonus: int
    damage_penalty: int
    time_penalty: int
    item_penalty: int
    level: int
    time_taken: int | None
    goal: int


def _le32(h: str) -> int:
    """Interpret an 8-char hex string as a little-endian unsigned 32-bit int."""
    b = bytearray.fromhex(h)
    b.reverse()
    return int(b.hex(), 16)


# Repentance+ details strings are 144 hex chars (18 × 4-byte words). For
# "packed-format" entries (competitive runs where the player reached Mega Satan),
# fields 5-9 contain opaque game-internal values rather than score components,
# and field 12 (time_taken) holds an unrelated large counter. We detect this by
# checking whether field 8 (time_penalty offset) exceeds any plausible run time:
# a 30-fps frame count for a 9-hour run is ~972 000, so >1 000 000 is a clear
# signal that the field is not a real timer.
_PACKED_FORMAT_THRESHOLD = 1_000_000

# Repentance+ time-sort leaderboards encode time_taken in the low 3 bytes of the
# steam value: time_in_frames = value & 0x00FFFFFF. The high byte varies per run
# (0x72–0x79 observed) and is opaque; only the low 3 bytes carry the frame count.
# Calibrated against three independent data points across different high-byte runs.
_RP_TIME_MAX_FRAMES = 216_000   # 2 hours at 30 fps — sanity ceiling

_RP_VERSIONS = frozenset({GameVersion.REPENTANCE_PLUS_SOLO, GameVersion.REPENTANCE_PLUS_COOP})


def parse_details(details: str | None) -> ParsedDetails | None:
    """Parse a Steam leaderboard details hex string into score components.

    The string is 112 hex chars (14 × 4-byte little-endian words) for older
    versions.  Repentance+ uses 144 chars (18 words).

    For packed-format entries (competitive R+ runs) word[8] (time_penalty
    offset) exceeds _PACKED_FORMAT_THRESHOLD, meaning words 4–9 contain opaque
    game-internal values rather than score components — those fields are
    returned as None.  Calibration confirmed only words 0–1 (stage_bonus,
    schwag_bonus) are recoverable from packed R+ details.
    """
    if not details:
        return None
    try:
        s = details.ljust(112, "0")
        time_penalty_raw = _le32(s[64:72])
        packed = time_penalty_raw > _PACKED_FORMAT_THRESHOLD
        return ParsedDetails(
            stage_bonus=_le32(s[0:8]),
            schwag_bonus=_le32(s[8:16]),
            bluebaby_bonus=_le32(s[16:24]),
            lamb_bonus=_le32(s[24:32]),
            megasatan_bonus=None if packed else _le32(s[32:40]),
            rush_bonus=None if packed else _le32(s[40:48]),
            exploration_bonus=None if packed else _le32(s[48:56]),
            damage_penalty=None if packed else _le32(s[56:64]),
            time_penalty=None if packed else time_penalty_raw,
            item_penalty=None if packed else _le32(s[72:80]),
            level=_le32(s[80:88]),
            # s[88:96] is unused in the upstream reference
            time_taken=None if packed else _le32(s[96:104]),
            goal=_le32(s[104:112]),
        )
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Board detection
# ---------------------------------------------------------------------------

def _board_patterns() -> list[tuple[GameVersion, SortType, re.Pattern]]:
    # Order matters: more specific patterns (coop before solo, score before time
    # within each version) must come first.
    return [
        (GameVersion.REPENTANCE_PLUS_COOP, SortType.SCORE, re.compile(settings.repentance_plus_coop_score_pattern)),
        (GameVersion.REPENTANCE_PLUS_COOP, SortType.TIME,  re.compile(settings.repentance_plus_coop_time_pattern)),
        (GameVersion.REPENTANCE_PLUS_SOLO, SortType.SCORE, re.compile(settings.repentance_plus_solo_score_pattern)),
        (GameVersion.REPENTANCE_PLUS_SOLO, SortType.TIME,  re.compile(settings.repentance_plus_solo_time_pattern)),
        (GameVersion.REPENTANCE,           SortType.SCORE, re.compile(settings.repentance_score_pattern)),
        (GameVersion.REPENTANCE,           SortType.TIME,  re.compile(settings.repentance_time_pattern)),
        (GameVersion.AFTERBIRTH_PLUS,      SortType.SCORE, re.compile(settings.afterbirth_plus_score_pattern)),
        (GameVersion.AFTERBIRTH_PLUS,      SortType.TIME,  re.compile(settings.afterbirth_plus_time_pattern)),
        (GameVersion.AFTERBIRTH,           SortType.SCORE, re.compile(settings.afterbirth_score_pattern)),
        (GameVersion.AFTERBIRTH,           SortType.TIME,  re.compile(settings.afterbirth_time_pattern)),
    ]


def detect_date(name: str) -> date | None:
    m = _DATE_RE.search(name)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def detect_board(name: str) -> _BoardSignature | None:
    """Return (GameVersion, SortType) for the first matching pattern, or None."""
    for version, sort_type, pattern in _board_patterns():
        if pattern.search(name):
            return version, sort_type
    return None


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

MAX_RETRIES = 5  # attempts after the initial one


async def _get_with_retry(
    client: httpx.AsyncClient, url: str, timeout: float = 30
) -> httpx.Response:
    """GET a URL with up to MAX_RETRIES retries and exponential backoff."""
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = await client.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp
        except httpx.HTTPError as exc:
            if attempt == MAX_RETRIES:
                raise
            wait = 2 ** attempt
            log.warning(
                "HTTP request failed (attempt %d/%d, %s), retrying in %ss: %s",
                attempt + 1, MAX_RETRIES + 1, type(exc).__name__, wait, url,
            )
            await asyncio.sleep(wait)
    raise RuntimeError("unreachable")


async def _fetch_xml(client: httpx.AsyncClient, url: str) -> ET.Element:
    """Fetch and parse an XML response, retrying on HTTP or parse errors."""
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = await _get_with_retry(client, url)
            return defused_ET.fromstring(resp.text)
        except ET.ParseError as exc:
            if attempt == MAX_RETRIES:
                raise
            wait = 2 ** attempt
            log.warning(
                "XML parse failed (attempt %d/%d), retrying in %ss: %s",
                attempt + 1, MAX_RETRIES + 1, wait, url,
            )
            await asyncio.sleep(wait)
    raise RuntimeError("unreachable")


# ---------------------------------------------------------------------------
# Steam leaderboard listing
# ---------------------------------------------------------------------------

async def fetch_all_leaderboards(client: httpx.AsyncClient) -> list[RawLeaderboard]:
    """Fetch the complete list of leaderboards for the Isaac app."""
    url = f"{STEAM_COMMUNITY_BASE}/{settings.isaac_app_id}/leaderboards/?xml=1"
    log.info("Fetching leaderboard list from Steam…")
    root = await _fetch_xml(client, url)

    boards: list[RawLeaderboard] = []
    for lb in root.findall(".//leaderboard"):
        try:
            boards.append(RawLeaderboard(
                steam_id=int(lb.findtext("lbid", "0")),
                name=lb.findtext("name", ""),
                entry_count=int(lb.findtext("entries", "0")),
                sort_method=int(lb.findtext("sortmethod", "1")),
            ))
        except (ValueError, TypeError):
            continue

    log.info("Found %d total leaderboards", len(boards))
    return boards


def filter_daily_runs(boards: list[RawLeaderboard]) -> list[RawLeaderboard]:
    """Keep only boards whose name contains a recognisable date."""
    return [b for b in boards if detect_date(b.name) is not None]


# ---------------------------------------------------------------------------
# Leaderboard entry fetching
# ---------------------------------------------------------------------------

async def fetch_entries(
    client: httpx.AsyncClient, leaderboard_id: int
) -> list[RawEntry]:
    """Fetch all entries for a single leaderboard (handles pagination)."""
    entries: list[RawEntry] = []
    start = 1

    while True:
        end = start + ENTRIES_PER_REQUEST - 1
        url = (
            f"{STEAM_COMMUNITY_BASE}/{settings.isaac_app_id}/leaderboards/{leaderboard_id}/"
            f"?xml=1&start={start}&end={end}"
        )
        root = await _fetch_xml(client, url)

        batch: list[RawEntry] = []
        for entry in root.findall(".//entry"):
            try:
                batch.append(RawEntry(
                    rank=int(entry.findtext("rank", "0")),
                    steam_id=int(entry.findtext("steamid", "0")),
                    value=int(entry.findtext("score", "0")),
                    details=entry.findtext("details"),
                ))
            except (ValueError, TypeError):
                continue

        entries.extend(batch)

        # Stop if we got fewer entries than requested (last page)
        if len(batch) < ENTRIES_PER_REQUEST:
            break

        start = end + 1
        await asyncio.sleep(REQUEST_DELAY)

    return entries


# ---------------------------------------------------------------------------
# Player name resolution
# ---------------------------------------------------------------------------

async def resolve_player_info(
    client: httpx.AsyncClient, steam_ids: list[int]
) -> tuple[dict[int, str], dict[int, str]]:
    """Batch-resolve Steam IDs → (display names, avatar URLs) via the Steam Web API.

    Returns empty dicts if no API key is configured.
    """
    if not settings.steam_api_key:
        return {}, {}

    names: dict[int, str] = {}
    avatars: dict[int, str] = {}
    chunk_size = 100  # Steam API limit per request

    for i in range(0, len(steam_ids), chunk_size):
        chunk = steam_ids[i : i + chunk_size]
        ids_str = ",".join(str(sid) for sid in chunk)
        url = (
            f"{STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/"
            f"?key={settings.steam_api_key}&steamids={ids_str}"
        )
        try:
            resp = await _get_with_retry(client, url, timeout=15)
            data = resp.json()
            for player in data.get("response", {}).get("players", []):
                sid = int(player["steamid"])
                names[sid] = player.get("personaname", "")
                if avatar := player.get("avatar"):
                    avatars[sid] = avatar
        except Exception as exc:
            log.warning("Failed to resolve player info after retries: %s", exc)

        await asyncio.sleep(REQUEST_DELAY)

    return names, avatars


async def upsert_player_cache(
    db: AsyncSession,
    names: dict[int, str] | None = None,
    avatars: dict[int, str] | None = None,
) -> None:
    """Upsert player info into steam_player_cache in a single INSERT … ON CONFLICT.

    Pass whichever dicts you have; both are optional. When a player appears in
    both, they're written in one row. On conflict:
    - player_name  updates only when the new value is non-null (COALESCE).
    - avatar_url   updates only when the new value is non-null (COALESCE).
    - fetched_at   advances to GREATEST(existing, new) — rows with a fresh
                   avatar carry now(), name-only rows carry epoch, so GREATEST
                   preserves the existing timestamp for name-only upserts and
                   refreshes it when an avatar is included.
    """
    names   = names   or {}
    avatars = avatars or {}
    all_ids = set(names) | set(avatars)
    if not all_ids:
        return

    now   = datetime.now(timezone.utc)
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)

    rows = [
        {
            "steam_id":   sid,
            "player_name": names.get(sid),
            "avatar_url":  avatars.get(sid),
            "fetched_at":  now if sid in avatars else epoch,
        }
        for sid in all_ids
    ]

    for i in range(0, len(rows), _CACHE_INSERT_BATCH):
        batch = rows[i : i + _CACHE_INSERT_BATCH]
        stmt = pg_insert(SteamPlayerCache).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=["steam_id"],
            set_={
                "player_name": func.coalesce(stmt.excluded.player_name, SteamPlayerCache.player_name),
                "avatar_url":  func.coalesce(stmt.excluded.avatar_url,  SteamPlayerCache.avatar_url),
                "fetched_at":  func.greatest(stmt.excluded.fetched_at,  SteamPlayerCache.fetched_at),
            },
        )
        await db.execute(stmt)


# ---------------------------------------------------------------------------
# Database upsert helpers
# ---------------------------------------------------------------------------

async def upsert_daily_run(
    db: AsyncSession, raw: RawLeaderboard, run_date: date, version: GameVersion, sort_type: SortType
) -> DailyRun:
    """Insert or update a DailyRun record and return it."""
    # Try to find existing by Steam leaderboard ID (most stable identifier)
    result = await db.execute(
        select(DailyRun).where(DailyRun.steam_leaderboard_id == raw.steam_id)
    )
    run = result.scalar_one_or_none()

    # Fallback: Steam sometimes reassigns leaderboard IDs for existing dates
    if run is None:
        result = await db.execute(
            select(DailyRun).where(
                DailyRun.date == run_date,
                DailyRun.version == version,
                DailyRun.sort_type == sort_type,
            )
        )
        run = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if run is None:
        run = DailyRun(
            date=run_date,
            version=version,
            sort_type=sort_type,
            steam_leaderboard_id=raw.steam_id,
            steam_leaderboard_name=raw.name,
            total_entries=raw.entry_count,
            scraped_at=now,
        )
        db.add(run)
        await db.flush()
    else:
        run.steam_leaderboard_id = raw.steam_id  # type: ignore[assignment]
        run.total_entries = raw.entry_count
        run.steam_leaderboard_name = raw.name
        run.scraped_at = now

    return run


async def upsert_entries(
    db: AsyncSession,
    run: DailyRun,
    raw_entries: list[RawEntry],
) -> int:
    """Bulk-upsert leaderboard entries. Returns the number of rows affected."""
    if not raw_entries:
        return 0

    # Steam occasionally returns the same steam_id twice on one leaderboard.
    # Deduplicate by keeping the entry with the lower rank before upsert,
    # since ON CONFLICT DO UPDATE cannot touch the same row twice per statement.
    deduped: dict[int, RawEntry] = {}
    for e in raw_entries:
        if e.steam_id not in deduped or e.rank < deduped[e.steam_id].rank:
            deduped[e.steam_id] = e
    raw_entries = list(deduped.values())

    is_rp_time: bool = run.version in _RP_VERSIONS and run.sort_type is SortType.TIME

    def _row(e: RawEntry) -> dict:
        parsed = parse_details(e.details)
        if parsed and parsed.time_taken is None and is_rp_time:
            frames = e.value & 0x00FFFFFF
            time_taken = frames if 0 < frames < _RP_TIME_MAX_FRAMES else None
        else:
            time_taken = parsed.time_taken if parsed else None
        return {
            "daily_run_id": run.id,
            "rank": e.rank,
            "steam_id": e.steam_id,
            "value": e.value,
            "details": e.details,
            "stage_bonus":      parsed.stage_bonus      if parsed else None,
            "schwag_bonus":     parsed.schwag_bonus     if parsed else None,
            "bluebaby_bonus":   parsed.bluebaby_bonus   if parsed else None,
            "lamb_bonus":       parsed.lamb_bonus       if parsed else None,
            "megasatan_bonus":  parsed.megasatan_bonus  if parsed else None,
            "rush_bonus":       parsed.rush_bonus       if parsed else None,
            "exploration_bonus":parsed.exploration_bonus if parsed else None,
            "damage_penalty":   parsed.damage_penalty   if parsed else None,
            "time_penalty":     parsed.time_penalty     if parsed else None,
            "item_penalty":     parsed.item_penalty     if parsed else None,
            "level":            parsed.level            if parsed else None,
            "time_taken":       time_taken,
            "goal":             parsed.goal             if parsed else None,
        }

    rows = [_row(e) for e in raw_entries]

    # asyncpg caps query parameters at 32767; each row has 18 columns → max 1820 rows/batch
    BATCH_SIZE = 1800
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        stmt = pg_insert(LeaderboardEntry).values(batch)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_entry_run_player",
            set_={
                "rank":             stmt.excluded.rank,
                "value":            stmt.excluded.value,
                "details":          stmt.excluded.details,
                "stage_bonus":      stmt.excluded.stage_bonus,
                "schwag_bonus":     stmt.excluded.schwag_bonus,
                "bluebaby_bonus":   stmt.excluded.bluebaby_bonus,
                "lamb_bonus":       stmt.excluded.lamb_bonus,
                "megasatan_bonus":  stmt.excluded.megasatan_bonus,
                "rush_bonus":       stmt.excluded.rush_bonus,
                "exploration_bonus":stmt.excluded.exploration_bonus,
                "damage_penalty":   stmt.excluded.damage_penalty,
                "time_penalty":     stmt.excluded.time_penalty,
                "item_penalty":     stmt.excluded.item_penalty,
                "level":            stmt.excluded.level,
                "time_taken":       stmt.excluded.time_taken,
                "goal":             stmt.excluded.goal,
            },
        )
        await db.execute(stmt)
    return len(rows)


# ---------------------------------------------------------------------------
# High-level scrape operations
# ---------------------------------------------------------------------------

_SEED_PHASE_KEY = "seed_phase"
_SEED_START_KEY = "seed_start_date"
_SEED_END_KEY   = "seed_end_date"


async def _set_setting(db: AsyncSession, key: str, value: str) -> None:
    stmt = pg_insert(SiteSetting).values(key=key, value=value)
    stmt = stmt.on_conflict_do_update(index_elements=["key"], set_={"value": stmt.excluded.value})
    await db.execute(stmt)
    await db.commit()


async def _clear_seed_progress(db: AsyncSession) -> None:
    await db.execute(delete(SiteSetting).where(
        SiteSetting.key.in_([_SEED_PHASE_KEY, _SEED_START_KEY, _SEED_END_KEY])
    ))
    await db.commit()


async def scrape_date_range(
    db: AsyncSession,
    start_date: date | None = None,
    end_date: date | None = None,
    skip_player_info: bool = False,
    skip_existing: bool = False,
) -> dict:
    """
    Scrape daily run leaderboards within an optional date range.

    - If start_date is None, scrapes only today.
    - If start_date is provided and end_date is None, scrapes from start_date to today.
    - Dates are clamped to [SCRAPE_MIN_DATE, tomorrow] regardless of what is passed.
    """
    today = date.today()
    tomorrow = today + timedelta(days=1)
    if start_date is None:
        start_date = today
    if end_date is None:
        end_date = today
    start_date = max(start_date, SCRAPE_MIN_DATE)
    end_date = min(end_date, tomorrow)

    stats = {"runs_created": 0, "runs_updated": 0, "entries_upserted": 0}
    scraped_combos: set[tuple[GameVersion, SortType]] = set()
    scraped_steam_ids: dict[tuple[GameVersion, SortType], set[int]] = {}

    async with httpx.AsyncClient() as client:
        all_boards = await fetch_all_leaderboards(client)
        daily_boards = filter_daily_runs(all_boards)
        daily_boards.sort(key=lambda b: detect_date(b.name) or date.min, reverse=True)
        log.info("Found %d daily-run leaderboards", len(daily_boards))

        for board in daily_boards:
            run_date = detect_date(board.name)
            if run_date is None:
                continue
            if not (start_date <= run_date <= end_date):
                continue

            detected = detect_board(board.name)
            if detected is None:
                log.debug("Could not detect board type for '%s', skipping", board.name)
                continue
            version, sort_type = detected

            if is_before_release(run_date, version):
                log.debug("Skipping %s %s: before release date", run_date, version.value)
                continue

            # Check if this run already exists in the DB
            existing = await db.execute(
                select(DailyRun).where(DailyRun.steam_leaderboard_id == board.steam_id)
            )
            existing_run = existing.scalar_one_or_none()
            is_new = existing_run is None

            if skip_existing and existing_run is not None:
                has_entries = await db.scalar(
                    select(func.count()).select_from(LeaderboardEntry).where(
                        LeaderboardEntry.daily_run_id == existing_run.id
                    )
                )
                if has_entries:
                    log.debug("Skipping %s %s %s (already scraped)", run_date, version.value, sort_type.value)
                    continue

            run = await upsert_daily_run(db, board, run_date, version, sort_type)

            if is_new:
                stats["runs_created"] += 1
            else:
                stats["runs_updated"] += 1

            await asyncio.sleep(REQUEST_DELAY)

            raw_entries = await fetch_entries(client, board.steam_id)

            steam_ids = [e.steam_id for e in raw_entries]

            if skip_player_info:
                player_names: dict[int, str] = {}
            else:
                # Single pass over the cache: get name, avatar_url, and freshness
                # for all steam_ids on this board at once.
                stale_cutoff = datetime.now(timezone.utc) - timedelta(days=AVATAR_CACHE_FRESHNESS_DAYS)
                cache_data: dict[int, tuple[str | None, str | None, datetime]] = {}
                for i in range(0, len(steam_ids), _IN_BATCH):
                    chunk = steam_ids[i : i + _IN_BATCH]
                    cache_result = await db.execute(
                        select(
                            SteamPlayerCache.steam_id,
                            SteamPlayerCache.player_name,
                            SteamPlayerCache.avatar_url,
                            SteamPlayerCache.fetched_at,
                        ).where(SteamPlayerCache.steam_id.in_(chunk))
                    )
                    for row in cache_result:
                        cache_data[row.steam_id] = (row.player_name, row.avatar_url, row.fetched_at)

                cached_avatars = {
                    sid: data[1]
                    for sid, data in cache_data.items()
                    if data[1] and data[2] > stale_cutoff
                }
                names_from_db: dict[int, str] = {
                    sid: data[0]
                    for sid, data in cache_data.items()
                    if data[0]
                }

                # Call Steam API for players absent from cache or with stale avatars.
                uncached_ids = [
                    sid for sid in steam_ids
                    if sid not in cache_data or cache_data[sid][2] <= stale_cutoff
                ]
                fresh_names, new_avatars = await resolve_player_info(client, uncached_ids)

                # Fresh API names take precedence over cached DB names.
                player_names = {**names_from_db, **fresh_names}

            count = await upsert_entries(db, run, raw_entries)
            if not skip_player_info:
                await upsert_player_cache(db, names=player_names, avatars=new_avatars)
            stats["entries_upserted"] += count
            combo = (version, sort_type)
            scraped_combos.add(combo)
            scraped_steam_ids.setdefault(combo, set()).update(e.steam_id for e in raw_entries)

            await db.commit()
            log.info(
                "Scraped %s %s %s: %d entries",
                run_date, version.value, sort_type.value, count,
            )

            await asyncio.sleep(REQUEST_DELAY)

    # Refresh pre-computed stats for all scraped version/sort combinations.
    # Skipped during seeding (skip_player_info=True) because seed_all handles it
    # after the name backfill pass is complete.
    if not skip_player_info:
        for v, st in scraped_combos:
            affected = list(scraped_steam_ids.get((v, st), set()))
            await refresh_overall_stats(db, v, st, steam_ids=affected or None)

    return stats


async def backfill_player_names(db: AsyncSession, limit: int | None = None) -> int:
    """Fill in player_name in steam_player_cache for all players missing it.

    Players are ordered by their most recent run date so newly active players
    are resolved first. Pass ``limit`` to cap the number of players resolved
    (useful for scheduled incremental runs).

    Calls the Steam API in chunks of 100 (the API limit). Flushes collected
    data to the DB whenever the buffer reaches DB_BATCH entries, and also
    flushes during any retry backoff so the wait time is used productively.
    Returns the number of players whose names were resolved.
    """
    q = (
        select(
            LeaderboardEntry.steam_id,
            func.max(DailyRun.date).label("latest_date"),
        )
        .join(DailyRun, DailyRun.id == LeaderboardEntry.daily_run_id)
        .outerjoin(SteamPlayerCache, SteamPlayerCache.steam_id == LeaderboardEntry.steam_id)
        .where(
            (SteamPlayerCache.steam_id.is_(None)) | (SteamPlayerCache.player_name.is_(None))
        )
        .group_by(LeaderboardEntry.steam_id)
        .order_by(func.max(DailyRun.date).desc())
    )
    if limit is not None:
        q = q.limit(limit)
    result = await db.execute(q)
    missing_ids = [row[0] for row in result]

    if not missing_ids:
        log.info("backfill_player_names: nothing to do")
        return 0

    log.info("backfill_player_names: %d players with missing names", len(missing_ids))

    if not settings.steam_api_key:
        log.warning("backfill_player_names: no STEAM_API_KEY configured, cannot resolve names")
        return 0

    API_CHUNK = 100   # Steam API limit per request
    DB_BATCH  = 2000  # flush to DB when buffer reaches this size

    pending_names:   dict[int, str] = {}
    pending_avatars: dict[int, str] = {}
    total_resolved = 0

    async def _flush() -> None:
        nonlocal total_resolved
        if not pending_names and not pending_avatars:
            return
        await upsert_player_cache(db, names=pending_names, avatars=pending_avatars)
        await db.commit()
        total_resolved += len(pending_names)
        log.info(
            "backfill_player_names: committed %d names (%d total so far)",
            len(pending_names), total_resolved,
        )
        pending_names.clear()
        pending_avatars.clear()

    async with httpx.AsyncClient() as client:
        for i in range(0, len(missing_ids), API_CHUNK):
            chunk = missing_ids[i : i + API_CHUNK]
            ids_str = ",".join(str(sid) for sid in chunk)
            url = (
                f"{STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/"
                f"?key={settings.steam_api_key}&steamids={ids_str}"
            )

            _RETRIES = 2
            for attempt in range(_RETRIES + 1):
                try:
                    resp = await client.get(url, timeout=15)
                    resp.raise_for_status()
                    for player in resp.json().get("response", {}).get("players", []):
                        sid = int(player["steamid"])
                        if name := player.get("personaname"):
                            pending_names[sid] = name
                        if avatar := player.get("avatar"):
                            pending_avatars[sid] = avatar
                    break
                except httpx.HTTPError as exc:
                    if attempt == _RETRIES:
                        log.warning(
                            "backfill_player_names: giving up on chunk after %d attempts: %s",
                            _RETRIES + 1, exc,
                        )
                        break
                    wait = 2 ** attempt
                    log.warning(
                        "backfill_player_names: API error (attempt %d/%d), flushing and retrying in %ss",
                        attempt + 1, _RETRIES + 1, wait,
                    )
                    await _flush()
                    await asyncio.sleep(wait)

            if len(pending_names) >= DB_BATCH:
                await _flush()

            await asyncio.sleep(REQUEST_DELAY)

    await _flush()
    log.info("backfill_player_names: done — %d players resolved", total_resolved)
    return total_resolved


async def scrape_today(db: AsyncSession) -> dict:
    """Convenience wrapper: scrape only today's daily run leaderboards."""
    return await scrape_date_range(db, start_date=None, end_date=None)


async def scrape_recent(db: AsyncSession) -> dict:
    """Scrape today and yesterday to catch late submissions from the previous day."""
    yesterday = date.today() - timedelta(days=1)
    return await scrape_date_range(db, start_date=yesterday, end_date=date.today())


async def seed_all(db: AsyncSession, from_date: date | None = None, to_date: date | None = None) -> dict:
    """Seed the database with all historical daily run data.

    Resumable: if interrupted, calling again resumes from where it left off.
    Progress is stored in site_settings under seed_phase/seed_start_date/seed_end_date.
    Pass from_date/to_date on the first call to limit the range; they are ignored on resume.
    """
    phase_row  = await db.scalar(select(SiteSetting).where(SiteSetting.key == _SEED_PHASE_KEY))
    start_row  = await db.scalar(select(SiteSetting).where(SiteSetting.key == _SEED_START_KEY))
    end_row    = await db.scalar(select(SiteSetting).where(SiteSetting.key == _SEED_END_KEY))

    if phase_row is not None:
        phase = phase_row.value
        start = date.fromisoformat(start_row.value) if start_row else (from_date or SCRAPE_MIN_DATE)
        end   = date.fromisoformat(end_row.value)   if end_row   else (to_date   or date.today())
        log.info("Resuming seed at phase '%s', range %s to %s", phase, start, end)
    else:
        phase = "entries"
        start = from_date or SCRAPE_MIN_DATE
        end   = to_date   or date.today()
        await _set_setting(db, _SEED_PHASE_KEY, phase)
        await _set_setting(db, _SEED_START_KEY, str(start))
        await _set_setting(db, _SEED_END_KEY,   str(end))
        log.info("Seeding data from %s to %s", start, end)

    stats: dict = {"runs_created": 0, "runs_updated": 0, "entries_upserted": 0, "players_named": 0}

    if phase == "entries":
        s = await scrape_date_range(db, start_date=start, end_date=end, skip_player_info=True, skip_existing=True)
        stats.update(s)
        phase = "names"
        await _set_setting(db, _SEED_PHASE_KEY, phase)

    if phase == "names":
        log.info("Backfilling player names…")
        stats["players_named"] = await backfill_player_names(db)
        phase = "stats"
        await _set_setting(db, _SEED_PHASE_KEY, phase)

    if phase == "stats":
        log.info("Refreshing overall stats cache for all version/sort combinations…")
        for v in GameVersion:
            for st in SortType:
                await refresh_overall_stats(db, v, st)
        await _clear_seed_progress(db)

    return stats


async def backfill_packed_nulls(db: AsyncSession) -> int:
    """Null out opaque fields stored in packed-format leaderboard entries.

    Packed-format entries (time_penalty > _PACKED_FORMAT_THRESHOLD) have garbage
    values in megasatan_bonus, rush_bonus, exploration_bonus, damage_penalty,
    time_penalty, and item_penalty.  This backfill sets those six columns to NULL
    so they stop appearing as nonsensical numbers in the UI.

    Safe to re-run.  Returns the number of rows updated.
    """
    result = await db.execute(
        text("""
            UPDATE leaderboard_entries
            SET megasatan_bonus  = NULL,
                rush_bonus       = NULL,
                exploration_bonus= NULL,
                damage_penalty   = NULL,
                time_penalty     = NULL,
                item_penalty     = NULL
            WHERE time_penalty > :threshold
        """),
        {"threshold": _PACKED_FORMAT_THRESHOLD},
    )
    await db.commit()
    updated: int = result.rowcount  # type: ignore[union-attr]
    log.info("backfill_packed_nulls: cleared opaque fields on %d entries", updated)
    return updated


async def backfill_rp_time_taken(db: AsyncSession) -> int:
    """Set time_taken for R+ time-sort packed-format entries that currently have NULL.

    Uses the formula: time_in_frames = steam_value - 0x74000000.
    Only updates rows where the computed value is in a plausible range
    (1 frame … 2 hours).  Returns the number of rows updated.
    """
    result = await db.execute(
        text("""
            UPDATE leaderboard_entries le
            SET time_taken = le.value & 16777215
            FROM daily_runs dr
            WHERE le.daily_run_id = dr.id
              AND dr.version IN ('repentance_plus_solo', 'repentance_plus_coop')
              AND dr.sort_type = 'time'
              AND le.time_taken IS NULL
              AND le.time_penalty > :threshold
              AND (le.value & 16777215) > 0
              AND (le.value & 16777215) < :max_frames
        """),
        {"threshold": _PACKED_FORMAT_THRESHOLD, "max_frames": _RP_TIME_MAX_FRAMES},
    )
    await db.commit()
    updated = result.rowcount
    log.info("backfill_rp_time_taken: updated %d entries", updated)
    return updated


# ---------------------------------------------------------------------------
# Overall stats cache
# ---------------------------------------------------------------------------

_AUTO_BAN_THRESHOLD = 5  # must match filters.AUTO_BAN_THRESHOLD


async def refresh_overall_stats(
    db: AsyncSession,
    version: GameVersion,
    sort_type: SortType,
    steam_ids: list[int] | None = None,
) -> int:
    """Rebuild player_overall_stats for one version/sort_type combination.

    When steam_ids is provided, only recomputes stats for those players.
    Pass None for a complete rebuild (seeding, manual refresh-stats endpoint).
    Returns the number of rows upserted.
    """
    player_filter = "AND le.steam_id = ANY(:steam_ids)" if steam_ids is not None else ""
    banned_filter = "AND steam_id = ANY(:steam_ids)" if steam_ids is not None else ""
    params: dict = {
        "ban_threshold": _AUTO_BAN_THRESHOLD,
        "version": version.value,
        "sort_type": sort_type.value,
    }
    if steam_ids is not None:
        params["steam_ids"] = steam_ids

    # dr_ids is MATERIALIZED so the planner executes it once up front and uses
    # the resulting run-id list to drive targeted index seeks on ix_le_visible_run_steam,
    # rather than doing a full hash join across all 66 M entries.
    # auto_banned is MATERIALIZED so PostgreSQL doesn't inline it into the main
    # scan (which would create a catastrophic self-join on 66 M rows).
    cursor = await db.execute(text(f"""
        WITH dr_ids AS MATERIALIZED (
            SELECT id FROM daily_runs
            WHERE version = :version AND sort_type = :sort_type
        ),
        auto_banned AS MATERIALIZED (
            SELECT steam_id
            FROM leaderboard_entries
            WHERE hidden = true
            {banned_filter}
            GROUP BY steam_id
            HAVING COUNT(*) >= :ban_threshold
        )
        INSERT INTO player_overall_stats
            (steam_id, version, sort_type, runs_played, avg_rank, best_rank, wins, updated_at)
        SELECT
            le.steam_id,
            :version,
            :sort_type,
            COUNT(*),
            AVG(le.rank),
            MIN(le.rank),
            SUM(CASE WHEN le.rank = 1 THEN 1 ELSE 0 END),
            NOW()
        FROM leaderboard_entries le
        WHERE le.hidden = false
          AND le.daily_run_id IN (SELECT id FROM dr_ids)
          AND le.steam_id NOT IN (SELECT steam_id FROM auto_banned)
          {player_filter}
        GROUP BY le.steam_id
        ON CONFLICT (steam_id, version, sort_type) DO UPDATE SET
            runs_played = EXCLUDED.runs_played,
            avg_rank    = EXCLUDED.avg_rank,
            best_rank   = EXCLUDED.best_rank,
            wins        = EXCLUDED.wins,
            updated_at  = EXCLUDED.updated_at
    """), params)

    upserted: int = cursor.rowcount  # type: ignore[union-attr]

    # Remove stats rows for players who are now auto-banned.
    await db.execute(text(f"""
        DELETE FROM player_overall_stats
        WHERE version = :version
          AND sort_type = :sort_type
          {banned_filter}
          AND steam_id IN (
              SELECT steam_id
              FROM leaderboard_entries
              WHERE hidden = true
              {banned_filter}
              GROUP BY steam_id
              HAVING COUNT(*) >= :ban_threshold
          )
    """), params)

    await db.commit()
    log.info("refresh_overall_stats %s/%s: %d rows upserted", version.value, sort_type.value, upserted)
    return upserted


# ---------------------------------------------------------------------------
# Discovery helper (for /api/admin/leaderboard-discovery)
# ---------------------------------------------------------------------------

async def discover_leaderboards(sample_size: int = 100) -> list[dict]:
    """
    Return a sample of detected daily-run leaderboards with their inferred
    metadata, to help the operator configure version detection patterns.
    """
    async with httpx.AsyncClient() as client:
        all_boards = await fetch_all_leaderboards(client)
        daily_boards = filter_daily_runs(all_boards)

    results = []
    for board in daily_boards[:sample_size]:
        detected = detect_board(board.name)
        results.append({
            "steam_leaderboard_id": board.steam_id,
            "name": board.name,
            "entry_count": board.entry_count,
            "sort_method": board.sort_method,
            "detected_date": detect_date(board.name),
            "detected_version": detected[0] if detected else None,
            "detected_sort_type": detected[1] if detected else None,
        })

    return results
