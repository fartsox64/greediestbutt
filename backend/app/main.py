import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.about_routes import router as about_router
from .api.admin_key_routes import router as admin_key_router
from .api.auth_routes import router as auth_router
from .api.feedback_routes import router as feedback_router
from .api.mod_routes import router as mod_router
from .api.report_routes import router as report_router
from .api.routes import router
from .config import settings
from .database import AsyncSessionLocal
from .scraper.steam import backfill_player_names, refresh_overall_stats, scrape_recent
from .models import GameVersion, SortType

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Job state tracking
# ---------------------------------------------------------------------------

_job_state: dict[str, dict] = {}


def _job_start(job_id: str) -> float:
    _job_state[job_id] = {
        **_job_state.get(job_id, {}),
        "running": True,
        "last_run_at": datetime.now(timezone.utc).isoformat(),
    }
    return time.monotonic()


def _job_end(job_id: str, t0: float, *, ok: bool) -> None:
    _job_state[job_id] = {
        **_job_state.get(job_id, {}),
        "running": False,
        "last_status": "ok" if ok else "error",
        "last_duration_s": round(time.monotonic() - t0, 1),
    }


# ---------------------------------------------------------------------------
# Scheduled jobs
# ---------------------------------------------------------------------------

async def _scrape_job() -> None:
    t0 = _job_start("scrape_recent")
    log.info("Scheduled scrape: today + yesterday")
    try:
        async with AsyncSessionLocal() as db:
            stats = await scrape_recent(db)
        log.info(
            "Scheduled scrape complete — created=%d updated=%d entries=%d",
            stats["runs_created"],
            stats["runs_updated"],
            stats["entries_upserted"],
        )
        _job_end("scrape_recent", t0, ok=True)
    except Exception:
        log.exception("Scheduled scrape failed")
        _job_end("scrape_recent", t0, ok=False)


async def _backfill_names_job() -> None:
    t0 = _job_start("backfill_names")
    log.info("Scheduled name backfill: up to 70,312 players")
    try:
        async with AsyncSessionLocal() as db:
            resolved = await backfill_player_names(db, limit=70_312)
        log.info("Scheduled name backfill complete — %d players resolved", resolved)
        _job_end("backfill_names", t0, ok=True)
    except Exception:
        log.exception("Scheduled name backfill failed")
        _job_end("backfill_names", t0, ok=False)


async def _full_stats_refresh_job() -> None:
    t0 = _job_start("full_stats_refresh")
    log.info("Scheduled full stats refresh: all version/sort combos")
    try:
        async with AsyncSessionLocal() as db:
            total = 0
            for v in GameVersion:
                for st in SortType:
                    total += await refresh_overall_stats(db, v, st)
        log.info("Full stats refresh complete — %d rows upserted", total)
        _job_end("full_stats_refresh", t0, ok=True)
    except Exception:
        log.exception("Full stats refresh failed")
        _job_end("full_stats_refresh", t0, ok=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _scrape_job,
        trigger="interval",
        minutes=10,
        id="scrape_recent",
        max_instances=1,       # never overlap if a run is still in progress
        coalesce=True,         # skip missed firings if the server was down
    )
    scheduler.add_job(
        _backfill_names_job,
        trigger="interval",
        minutes=15,
        id="backfill_names",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        _full_stats_refresh_job,
        trigger="cron",
        hour=2,
        minute=0,
        id="full_stats_refresh",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    app.state.scheduler = scheduler
    app.state.job_state = _job_state
    log.info("Scheduler started — scraping every 10 minutes, name backfill every 15 minutes, full stats refresh daily at 02:00")
    yield
    scheduler.shutdown(wait=False)
    log.info("Scheduler stopped")


app = FastAPI(
    title="GreediestButt",
    description="The Binding of Isaac daily run leaderboards",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(auth_router)
app.include_router(admin_key_router)
app.include_router(mod_router)
app.include_router(report_router)
app.include_router(feedback_router)
app.include_router(about_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
