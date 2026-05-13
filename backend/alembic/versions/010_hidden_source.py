"""add hidden_source to leaderboard_entries

Revision ID: 010
Revises: 009
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "leaderboard_entries",
        sa.Column("hidden_source", sa.String(20), nullable=True),
    )


def downgrade():
    op.drop_column("leaderboard_entries", "hidden_source")
