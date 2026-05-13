"""Add users and follows tables for Steam login and social features

Revision ID: 005
Revises: 004
Create Date: 2026-05-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("steam_id", sa.BigInteger, primary_key=True),
        sa.Column("player_name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "follows",
        sa.Column("follower_id", sa.BigInteger, sa.ForeignKey("users.steam_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("following_id", sa.BigInteger, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_follows_follower_id", "follows", ["follower_id"])


def downgrade() -> None:
    op.drop_table("follows")
    op.drop_table("users")
