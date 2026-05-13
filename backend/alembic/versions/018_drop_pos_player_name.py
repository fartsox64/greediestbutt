"""drop player_name from player_overall_stats

Revision ID: 018
Revises: 017
Create Date: 2026-05-13

player_name is now joined from steam_player_cache at read time, keeping
steam_player_cache as the single source of truth and removing the need
to sync names into player_overall_stats after every stats refresh.
"""

import sqlalchemy as sa
from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("player_overall_stats", "player_name")


def downgrade():
    op.add_column(
        "player_overall_stats",
        sa.Column("player_name", sa.String(255), nullable=True),
    )
    op.execute(sa.text("""
        UPDATE player_overall_stats pos
        SET player_name = spc.player_name
        FROM steam_player_cache spc
        WHERE pos.steam_id = spc.steam_id
    """))
