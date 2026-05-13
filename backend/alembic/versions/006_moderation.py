"""Add role to users and moderation fields to leaderboard_entries

Revision ID: 006
Revises: 005
Create Date: 2026-05-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(20), nullable=True))

    op.add_column(
        "leaderboard_entries",
        sa.Column("hidden", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "leaderboard_entries",
        sa.Column("hidden_by", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "leaderboard_entries",
        sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_leaderboard_entries_steam_hidden",
        "leaderboard_entries",
        ["steam_id", "hidden"],
    )


def downgrade() -> None:
    op.drop_index("ix_leaderboard_entries_steam_hidden", "leaderboard_entries")
    op.drop_column("leaderboard_entries", "hidden_at")
    op.drop_column("leaderboard_entries", "hidden_by")
    op.drop_column("leaderboard_entries", "hidden")
    op.drop_column("users", "role")
