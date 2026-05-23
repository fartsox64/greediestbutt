"""Covering indexes to speed up the rivals endpoint self-join.

The rivals query joins leaderboard_entries to itself (PlayerRun × OpponentRun).
Without covering indexes both sides require heap fetches on every joined row.

  PlayerRun: WHERE steam_id=X AND hidden=false → needs daily_run_id
    → (steam_id, hidden, daily_run_id) lets PostgreSQL return daily_run_id
      from the index without touching the heap.

  OpponentRun: WHERE daily_run_id=X AND hidden=false → needs steam_id, rank
    → (daily_run_id, hidden, steam_id, rank) covers the join and the
      GROUP BY / CASE expressions without heap fetches.

PRODUCTION NOTE
---------------
Build concurrently first to avoid locking the table:

    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_le_steam_hidden_run
        ON leaderboard_entries (steam_id, hidden, daily_run_id);

    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_le_run_hidden_steam_rank
        ON leaderboard_entries (daily_run_id, hidden, steam_id, rank);

Then apply the migration (IF NOT EXISTS makes each a no-op if pre-created):

    alembic upgrade head

Revision ID: 022
Revises: 021
"""

import sqlalchemy as sa
from alembic import op

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_le_steam_hidden_run"
        " ON leaderboard_entries (steam_id, hidden, daily_run_id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_le_run_hidden_steam_rank"
        " ON leaderboard_entries (daily_run_id, hidden, steam_id, rank)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_le_run_hidden_steam_rank"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_le_steam_hidden_run"))
