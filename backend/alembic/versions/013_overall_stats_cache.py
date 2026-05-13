"""pre-computed overall leaderboard stats and visible-entries partial index

Revision ID: 013
Revises: 012
Create Date: 2026-05-11

PRODUCTION NOTE
---------------
The partial index creation below takes an exclusive lock for the duration of
the build on a 34 M-row table.  To avoid downtime, create it manually first
(CONCURRENTLY requires no lock), then apply this migration — the IF NOT EXISTS
guard makes it a no-op:

    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_le_visible_run_rank
        ON leaderboard_entries(daily_run_id, rank)
        WHERE hidden = false;

After running the migration, seed the stats table:

    curl -X POST http://localhost:8000/api/scrape/refresh-stats
"""

import sqlalchemy as sa
from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    # Partial index: visible entries only, ordered for window functions.
    # Using raw execute so we can use IF NOT EXISTS (op.create_index doesn't
    # support it).  No CONCURRENTLY here — see the production note above.
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_le_visible_run_rank"
        " ON leaderboard_entries(daily_run_id, rank)"
        " WHERE hidden = false"
    ))

    op.create_table(
        "player_overall_stats",
        sa.Column("steam_id",     sa.BigInteger,                    nullable=False),
        sa.Column("version",      sa.String(50),                    nullable=False),
        sa.Column("sort_type",    sa.String(10),                    nullable=False),
        sa.Column("player_name",  sa.String(255),                   nullable=True),
        sa.Column("runs_played",  sa.Integer,                       nullable=False),
        sa.Column("avg_rank",     sa.Float,                         nullable=False),
        sa.Column("best_rank",    sa.Integer,                       nullable=False),
        sa.Column("wins",         sa.Integer,                       nullable=False),
        sa.Column("updated_at",   sa.DateTime(timezone=True),       nullable=False),
        sa.PrimaryKeyConstraint("steam_id", "version", "sort_type"),
    )
    # Covers the overall leaderboard read: filter by version/sort_type, order
    # by avg_rank, secondary sort by runs_played desc.
    op.create_index(
        "ix_pos_lookup",
        "player_overall_stats",
        ["version", "sort_type", "avg_rank", "runs_played"],
    )


def downgrade():
    op.drop_index("ix_pos_lookup", "player_overall_stats")
    op.drop_table("player_overall_stats")
    op.execute(sa.text("DROP INDEX IF EXISTS ix_le_visible_run_rank"))