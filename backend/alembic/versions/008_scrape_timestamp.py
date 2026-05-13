"""add scraped_at to daily_runs

Revision ID: 008
Revises: 007
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_runs",
        sa.Column("scraped_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("daily_runs", "scraped_at")
