"""replace ix_le_visible_run_rank with a covering index that includes steam_id

Revision ID: 017
Revises: 016
Create Date: 2026-05-13

PRODUCTION NOTE
---------------
The new index covers 66 M rows — create it concurrently first to avoid a
prolonged table lock, then run the migration (the IF NOT EXISTS guard makes
the CREATE a no-op):

    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_le_visible_run_steam
        ON leaderboard_entries(daily_run_id, rank, steam_id)
        WHERE hidden = false;

Then apply the migration normally:

    alembic upgrade head

The old index (ix_le_visible_run_rank) is dropped here; it is a strict prefix
of the new one so the planner will use ix_le_visible_run_steam for every query
that previously used it.
"""

import sqlalchemy as sa
from alembic import op

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    # Covering index: (daily_run_id, rank, steam_id) WHERE hidden = false.
    # Lets the refresh_overall_stats visible CTE run as a pure index scan —
    # no heap lookups needed for steam_id.
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_le_visible_run_steam"
        " ON leaderboard_entries(daily_run_id, rank, steam_id)"
        " WHERE hidden = false"
    ))
    # The old index is a prefix subset of the new one; drop it to save space.
    op.execute(sa.text("DROP INDEX IF EXISTS ix_le_visible_run_rank"))


def downgrade():
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_le_visible_run_rank"
        " ON leaderboard_entries(daily_run_id, rank)"
        " WHERE hidden = false"
    ))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_le_visible_run_steam"))
