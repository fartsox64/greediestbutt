import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.about_routes import router as about_router
from .api.auth_routes import router as auth_router
from .api.feedback_routes import router as feedback_router
from .api.mod_routes import router as mod_router
from .api.report_routes import router as report_router
from .api.routes import router
from .config import settings
from .database import AsyncSessionLocal
from .scraper.steam import refresh_overall_stats, scrape_recent
from .models import GameVersion, SortType

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


async def _scrape_job() -> None:
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
    except Exception:
        log.exception("Scheduled scrape failed")


async def _full_stats_refresh_job() -> None:
    log.info("Scheduled full stats refresh: all version/sort combos")
    try:
        async with AsyncSessionLocal() as db:
            total = 0
            for v in GameVersion:
                for st in SortType:
                    total += await refresh_overall_stats(db, v, st)
        log.info("Full stats refresh complete — %d rows upserted", total)
    except Exception:
        log.exception("Full stats refresh failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
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
        _full_stats_refresh_job,
        trigger="cron",
        hour=2,
        minute=0,
        id="full_stats_refresh",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    log.info("Scheduler started — scraping every 10 minutes, full stats refresh daily at 02:00")
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
app.include_router(mod_router)
app.include_router(report_router)
app.include_router(feedback_router)
app.include_router(about_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
