"""Add details columns to leaderboard_entries

Revision ID: 002
Revises: 001
Create Date: 2026-05-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_COLS = [
    ("details",          sa.String(112)),
    ("stage_bonus",      sa.BigInteger()),
    ("schwag_bonus",     sa.BigInteger()),
    ("bluebaby_bonus",   sa.BigInteger()),
    ("lamb_bonus",       sa.BigInteger()),
    ("megasatan_bonus",  sa.BigInteger()),
    ("rush_bonus",       sa.BigInteger()),
    ("exploration_bonus",sa.BigInteger()),
    ("damage_penalty",   sa.BigInteger()),
    ("time_penalty",     sa.BigInteger()),
    ("item_penalty",     sa.BigInteger()),
    ("level",            sa.BigInteger()),
    ("time_taken",       sa.BigInteger()),
    ("goal",             sa.BigInteger()),
]


def upgrade() -> None:
    for col_name, col_type in _NEW_COLS:
        op.add_column("leaderboard_entries", sa.Column(col_name, col_type, nullable=True))


def downgrade() -> None:
    for col_name, _ in reversed(_NEW_COLS):
        op.drop_column("leaderboard_entries", col_name)
