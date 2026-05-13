"""add index to speed up overall-leaderboard count query

Revision ID: 016
Revises: 015
Create Date: 2026-05-12
"""

from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    # The overall-leaderboard read now issues a separate COUNT(*) query filtered
    # by (version, sort_type, runs_played >= N).  The existing ix_pos_lookup
    # index orders by avg_rank first, so counting with a runs_played range filter
    # requires scanning all rows for that (version, sort_type).  This index puts
    # runs_played immediately after the equality columns so PostgreSQL can seek
    # directly to runs_played >= N and count without touching avg_rank at all.
    op.create_index(
        "ix_pos_count",
        "player_overall_stats",
        ["version", "sort_type", "runs_played"],
    )


def downgrade():
    op.drop_index("ix_pos_count", "player_overall_stats")
