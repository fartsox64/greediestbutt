"""add performance indexes for profile and overall leaderboard queries

Revision ID: 012
Revises: 011
Create Date: 2026-05-10
"""
from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    # Speeds up all queries that filter/join by a player's steam_id
    # (profile stats, player runs, streak query, follow lookups)
    op.create_index("ix_le_steam_id", "leaderboard_entries", ["steam_id"])

    # Speeds up the auto-ban subquery in visible_entries_filter()
    # which does: WHERE hidden=true GROUP BY steam_id HAVING count >= 5
    op.create_index("ix_le_hidden_steam_id", "leaderboard_entries", ["hidden", "steam_id"])

    # Speeds up daily_runs lookups that filter by version+sort_type together
    # (overall leaderboard join, available-dates, etc.)
    op.create_index("ix_dr_version_sort", "daily_runs", ["version", "sort_type"])


def downgrade():
    op.drop_index("ix_le_steam_id", "leaderboard_entries")
    op.drop_index("ix_le_hidden_steam_id", "leaderboard_entries")
    op.drop_index("ix_dr_version_sort", "daily_runs")
