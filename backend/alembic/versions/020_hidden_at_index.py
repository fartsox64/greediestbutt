"""Partial index on leaderboard_entries for paginating hidden entries by hidden_at.

Without this index, ORDER BY hidden_at DESC LIMIT 50 WHERE hidden=TRUE requires
sorting all hidden rows. The partial index lets PostgreSQL do a 50-row index
scan with early termination instead.

Revision ID: 020
Revises: 019

PRODUCTION NOTE
---------------
Run this concurrently first to avoid a table lock on a large table:

    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_le_hidden_at
        ON leaderboard_entries (hidden_at DESC, id DESC)
        WHERE hidden = TRUE;

Then apply the migration (the IF NOT EXISTS makes it a no-op):

    alembic upgrade head
"""

import sqlalchemy as sa
from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_le_hidden_at"
        " ON leaderboard_entries (hidden_at DESC, id DESC)"
        " WHERE hidden = TRUE"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_le_hidden_at"))
