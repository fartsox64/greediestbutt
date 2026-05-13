"""denormalize version/sort_type onto leaderboard_entries

Revision ID: 019
Revises: 018
Create Date: 2026-05-13

Adds version and sort_type columns to leaderboard_entries so that
refresh_overall_stats can filter directly on those columns instead of
joining to daily_runs.  With 66 M rows the join was the dominant cost
of the full-rebuild path.  The new covering index enables a pure
index-only scan for the hash aggregation.

PRODUCTION NOTES
----------------
1. The backfill UPDATE touches every row — run during a low-traffic window.
   It will not lock reads but can take several minutes for 66 M rows.

2. Create the covering index CONCURRENTLY before applying the migration to
   avoid a long lock on the table:

       CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_le_vs_steam_rank
           ON leaderboard_entries (version, sort_type, steam_id, rank)
           WHERE hidden = false;

   Then apply the migration normally:

       alembic upgrade head

   The IF NOT EXISTS guard makes the CREATE in the migration a no-op.
"""

import sqlalchemy as sa
from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("leaderboard_entries", sa.Column("version", sa.String(50), nullable=True))
    op.add_column("leaderboard_entries", sa.Column("sort_type", sa.String(10), nullable=True))

    op.execute(sa.text("""
        UPDATE leaderboard_entries le
        SET version   = dr.version,
            sort_type = dr.sort_type
        FROM daily_runs dr
        WHERE le.daily_run_id = dr.id
    """))

    op.alter_column("leaderboard_entries", "version", nullable=False)
    op.alter_column("leaderboard_entries", "sort_type", nullable=False)

    # Covering index: (version, sort_type, steam_id, rank) WHERE hidden = false.
    # Lets refresh_overall_stats aggregate with a pure index-only scan —
    # no heap lookups needed for steam_id or rank.
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_le_vs_steam_rank"
        " ON leaderboard_entries (version, sort_type, steam_id, rank)"
        " WHERE hidden = false"
    ))


def downgrade():
    op.execute(sa.text("DROP INDEX IF EXISTS ix_le_vs_steam_rank"))
    op.drop_column("leaderboard_entries", "sort_type")
    op.drop_column("leaderboard_entries", "version")
