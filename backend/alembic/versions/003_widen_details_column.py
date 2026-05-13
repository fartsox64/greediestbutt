"""Widen leaderboard_entries.details from VARCHAR(112) to VARCHAR(256)

Revision ID: 003
Revises: 002
Create Date: 2026-05-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "leaderboard_entries", "details",
        type_=sa.String(256),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "leaderboard_entries", "details",
        type_=sa.String(112),
        existing_nullable=True,
    )
