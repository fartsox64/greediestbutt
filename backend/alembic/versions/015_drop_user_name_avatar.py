"""Remove player_name and avatar_url from users (sourced from steam_player_cache)

Revision ID: 015
Revises: 014
Create Date: 2026-05-12
"""
import sqlalchemy as sa
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("users", "player_name")
    op.drop_column("users", "avatar_url")


def downgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("player_name", sa.String(255), nullable=True))
    op.execute("""
        UPDATE users u
        SET player_name = spc.player_name,
            avatar_url  = spc.avatar_url
        FROM steam_player_cache spc
        WHERE u.steam_id = spc.steam_id
    """)
