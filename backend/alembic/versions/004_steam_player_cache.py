"""Add steam_player_cache table for avatar URL caching

Revision ID: 004
Revises: 003
Create Date: 2026-05-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "steam_player_cache",
        sa.Column("steam_id", sa.BigInteger, primary_key=True),
        sa.Column("avatar_url", sa.String(512), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("steam_player_cache")
