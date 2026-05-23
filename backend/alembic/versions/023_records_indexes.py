"""Partial indexes on value and time_taken to speed up the records endpoint.

The records query finds the best score/time per game version in a single
DISTINCT ON scan.  Without an index the planner must sort the full
leaderboard_entries table; with these partial indexes it can walk entries
in value/time order and stop once each version is covered.

PRODUCTION NOTE
---------------
Build concurrently first to avoid locking the table:

    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_le_hidden_value
        ON leaderboard_entries (value DESC NULLS LAST)
        WHERE hidden = false;

    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_le_hidden_time_taken
        ON leaderboard_entries (time_taken ASC NULLS LAST)
        WHERE hidden = false;

Then apply the migration (IF NOT EXISTS makes each a no-op if pre-created):

    alembic upgrade head

Revision ID: 023
Revises: 022
"""

import sqlalchemy as sa
from alembic import op

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_le_hidden_value"
        " ON leaderboard_entries (value DESC NULLS LAST)"
        " WHERE hidden = false"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_le_hidden_time_taken"
        " ON leaderboard_entries (time_taken ASC NULLS LAST)"
        " WHERE hidden = false"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_le_hidden_value"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_le_hidden_time_taken"))
