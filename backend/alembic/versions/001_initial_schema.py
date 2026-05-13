"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_GAMEVERSION = sa.Enum(
    "afterbirth", "afterbirth_plus", "repentance",
    "repentance_plus_solo", "repentance_plus_coop",
    name="gameversion",
)
_SORTTYPE = sa.Enum("score", "time", name="sorttype")


def upgrade() -> None:
    op.create_table(
        "daily_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("version", _GAMEVERSION, nullable=False),
        sa.Column("sort_type", _SORTTYPE, nullable=False),
        sa.Column("steam_leaderboard_id", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("steam_leaderboard_name", sa.String(255), nullable=False),
        sa.Column("total_entries", sa.Integer(), nullable=True),
        sa.UniqueConstraint("date", "version", "sort_type", name="uq_daily_run"),
    )
    op.create_index("ix_daily_runs_date", "daily_runs", ["date"])
    op.create_index("ix_daily_runs_version", "daily_runs", ["version"])

    op.create_table(
        "leaderboard_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("daily_run_id", sa.Integer(), sa.ForeignKey("daily_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("steam_id", sa.BigInteger(), nullable=False),
        sa.Column("player_name", sa.String(255), nullable=True),
        sa.Column("value", sa.Integer(), nullable=True),
        sa.UniqueConstraint("daily_run_id", "steam_id", name="uq_entry_run_player"),
    )
    op.create_index("ix_leaderboard_entries_daily_run_rank", "leaderboard_entries", ["daily_run_id", "rank"])


def downgrade() -> None:
    op.drop_index("ix_leaderboard_entries_daily_run_rank", table_name="leaderboard_entries")
    op.drop_table("leaderboard_entries")
    op.drop_index("ix_daily_runs_version", table_name="daily_runs")
    op.drop_index("ix_daily_runs_date", table_name="daily_runs")
    op.drop_table("daily_runs")
    _SORTTYPE.drop(op.get_bind())
    _GAMEVERSION.drop(op.get_bind())
