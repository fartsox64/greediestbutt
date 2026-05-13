"""Move player_name from leaderboard_entries to steam_player_cache

Revision ID: 014
Revises: 013
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "steam_player_cache",
        sa.Column("player_name", sa.String(255), nullable=True),
    )

    # Populate cache from leaderboard_entries.  For players already in the
    # cache, preserve any existing name; fill NULLs from the entries table.
    # New rows (players never avatar-fetched) get epoch fetched_at so their
    # avatars are treated as stale and refreshed on the next scrape.
    op.execute("""
        INSERT INTO steam_player_cache (steam_id, player_name, avatar_url, fetched_at)
        SELECT
            steam_id,
            MAX(player_name),
            NULL,
            TIMESTAMPTZ '1970-01-01'
        FROM leaderboard_entries
        WHERE player_name IS NOT NULL
        GROUP BY steam_id
        ON CONFLICT (steam_id) DO UPDATE
            SET player_name = COALESCE(steam_player_cache.player_name, EXCLUDED.player_name)
    """)

    op.drop_column("leaderboard_entries", "player_name")


def downgrade() -> None:
    op.add_column(
        "leaderboard_entries",
        sa.Column("player_name", sa.String(255), nullable=True),
    )

    op.execute("""
        UPDATE leaderboard_entries le
        SET player_name = spc.player_name
        FROM steam_player_cache spc
        WHERE le.steam_id = spc.steam_id
          AND spc.player_name IS NOT NULL
    """)

    op.drop_column("steam_player_cache", "player_name")
