import enum

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum as PgEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


class GameVersion(str, enum.Enum):
    AFTERBIRTH = "afterbirth"
    AFTERBIRTH_PLUS = "afterbirth_plus"
    REPENTANCE = "repentance"
    REPENTANCE_PLUS_SOLO = "repentance_plus_solo"
    REPENTANCE_PLUS_COOP = "repentance_plus_coop"


GAME_VERSION_LABELS = {
    GameVersion.AFTERBIRTH: "Afterbirth",
    GameVersion.AFTERBIRTH_PLUS: "Afterbirth+",
    GameVersion.REPENTANCE: "Repentance",
    GameVersion.REPENTANCE_PLUS_SOLO: "Repentance+ Solo",
    GameVersion.REPENTANCE_PLUS_COOP: "Repentance+ Coop",
}

VERSION_ORDER = [
    GameVersion.REPENTANCE_PLUS_SOLO,
    GameVersion.REPENTANCE_PLUS_COOP,
    GameVersion.REPENTANCE,
    GameVersion.AFTERBIRTH_PLUS,
    GameVersion.AFTERBIRTH,
]


class SortType(str, enum.Enum):
    SCORE = "score"
    TIME = "time"


class DailyRun(Base):
    __tablename__ = "daily_runs"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, index=True)
    version = Column(PgEnum(GameVersion, name="gameversion", values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    sort_type = Column(PgEnum(SortType, name="sorttype", values_callable=lambda x: [e.value for e in x]), nullable=False)
    steam_leaderboard_id = Column(BigInteger, nullable=False, unique=True)
    steam_leaderboard_name = Column(String(255), nullable=False)
    total_entries = Column(Integer, nullable=True)
    scraped_at = Column(DateTime(timezone=True), nullable=True)

    entries = relationship(
        "LeaderboardEntry",
        back_populates="daily_run",
        cascade="all, delete-orphan",
        order_by="LeaderboardEntry.rank",
    )

    __table_args__ = (
        UniqueConstraint("date", "version", "sort_type", name="uq_daily_run"),
        Index("ix_dr_version_sort", "version", "sort_type"),
    )


class LeaderboardEntry(Base):
    __tablename__ = "leaderboard_entries"

    id = Column(Integer, primary_key=True)
    daily_run_id = Column(
        Integer, ForeignKey("daily_runs.id", ondelete="CASCADE"), nullable=False
    )
    rank = Column(Integer, nullable=False)
    steam_id = Column(BigInteger, nullable=False)
    # For score leaderboards: in-game score points.
    # For time leaderboards: time in centiseconds (divide by 100 for seconds).
    value = Column(Integer, nullable=True)

    details = Column(String(256), nullable=True)

    # Parsed score components — all unsigned 32-bit values, nullable when details absent
    stage_bonus       = Column(BigInteger, nullable=True)
    schwag_bonus      = Column(BigInteger, nullable=True)
    bluebaby_bonus    = Column(BigInteger, nullable=True)
    lamb_bonus        = Column(BigInteger, nullable=True)
    megasatan_bonus   = Column(BigInteger, nullable=True)
    rush_bonus        = Column(BigInteger, nullable=True)
    exploration_bonus = Column(BigInteger, nullable=True)
    damage_penalty    = Column(BigInteger, nullable=True)
    time_penalty      = Column(BigInteger, nullable=True)
    item_penalty      = Column(BigInteger, nullable=True)
    level             = Column(BigInteger, nullable=True)
    time_taken        = Column(BigInteger, nullable=True)
    goal              = Column(BigInteger, nullable=True)

    hidden        = Column(Boolean, server_default="false", nullable=False)
    hidden_by     = Column(BigInteger, nullable=True)
    hidden_at     = Column(DateTime(timezone=True), nullable=True)
    hidden_source = Column(String(20), nullable=True)  # "direct" | "report"

    daily_run = relationship("DailyRun", back_populates="entries")

    __table_args__ = (
        UniqueConstraint("daily_run_id", "steam_id", name="uq_entry_run_player"),
        Index("ix_leaderboard_entries_daily_run_rank", "daily_run_id", "rank"),
        Index("ix_le_steam_id", "steam_id"),
        Index("ix_le_hidden_steam_id", "hidden", "steam_id"),
    )


class SteamPlayerCache(Base):
    __tablename__ = "steam_player_cache"

    steam_id = Column(BigInteger, primary_key=True)
    player_name = Column(String(255), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    fetched_at = Column(DateTime(timezone=True), nullable=False)


class User(Base):
    __tablename__ = "users"

    steam_id = Column(BigInteger, primary_key=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    role = Column(String(20), nullable=True)  # 'admin' or 'moderator'


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entry_id = Column(Integer, ForeignKey("leaderboard_entries.id", ondelete="CASCADE"), nullable=False)
    reporter_id = Column(BigInteger, ForeignKey("users.steam_id", ondelete="CASCADE"), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, server_default="pending")  # pending/resolved/dismissed
    reviewed_by = Column(BigInteger, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("entry_id", "reporter_id", name="uq_report_entry_reporter"),
        Index("ix_reports_entry_id", "entry_id"),
        Index("ix_reports_status", "status"),
    )


class Follow(Base):
    """Records that follower_id is following following_id (any Steam player)."""
    __tablename__ = "follows"

    follower_id = Column(BigInteger, ForeignKey("users.steam_id", ondelete="CASCADE"), primary_key=True)
    following_id = Column(BigInteger, primary_key=True)
    created_at = Column(DateTime(timezone=True), nullable=False)


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    author_id = Column(BigInteger, ForeignKey("users.steam_id", ondelete="CASCADE"), nullable=False)
    subject = Column(String(200), nullable=True)
    body = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, server_default="open")
    created_at = Column(DateTime(timezone=True), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    closed_by = Column(BigInteger, nullable=True)

    __table_args__ = (
        Index("ix_feedback_author_id", "author_id"),
        Index("ix_feedback_status", "status"),
        Index("ix_feedback_created_at", "created_at"),
    )


class PlayerOverallStats(Base):
    """Pre-computed per-player aggregate stats for the overall leaderboard.

    Populated/refreshed by refresh_overall_stats() after each scrape.
    Reading from this table is O(log n) on ix_pos_lookup; writing is O(n) but
    happens in the background, not on the request path.
    """
    __tablename__ = "player_overall_stats"

    steam_id    = Column(BigInteger, primary_key=True)
    version     = Column(String(50), primary_key=True)
    sort_type   = Column(String(10), primary_key=True)
    runs_played = Column(Integer,     nullable=False)
    avg_rank    = Column(Float,       nullable=False)
    best_rank   = Column(Integer,     nullable=False)
    wins        = Column(Integer,     nullable=False)
    updated_at  = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_pos_lookup", "version", "sort_type", "avg_rank", "runs_played"),
    )


class SiteSetting(Base):
    __tablename__ = "site_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)


class FeedbackMessage(Base):
    __tablename__ = "feedback_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    feedback_id = Column(Integer, ForeignKey("feedback.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(BigInteger, ForeignKey("users.steam_id", ondelete="CASCADE"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_feedback_messages_feedback_id", "feedback_id"),
    )
