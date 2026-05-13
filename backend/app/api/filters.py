"""Shared SQLAlchemy filter helpers."""

from sqlalchemy import and_, func, select

from ..models import LeaderboardEntry

AUTO_BAN_THRESHOLD = 5


def visible_entries_filter():
    """Exclude individually hidden entries and entries from auto-banned players."""
    auto_banned = (
        select(LeaderboardEntry.steam_id)
        .where(LeaderboardEntry.hidden == True)  # noqa: E712
        .group_by(LeaderboardEntry.steam_id)
        .having(func.count() >= AUTO_BAN_THRESHOLD)
        .scalar_subquery()
    )
    return and_(
        LeaderboardEntry.hidden == False,  # noqa: E712
        LeaderboardEntry.steam_id.notin_(auto_banned),
    )
