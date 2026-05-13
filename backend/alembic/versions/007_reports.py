"""Add reports table

Revision ID: 007
Revises: 006
Create Date: 2026-05-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("entry_id", sa.Integer(), sa.ForeignKey("leaderboard_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reporter_id", sa.BigInteger(), sa.ForeignKey("users.steam_id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by", sa.BigInteger(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_reports_entry_id", "reports", ["entry_id"])
    op.create_index("ix_reports_status", "reports", ["status"])
    op.create_unique_constraint("uq_report_entry_reporter", "reports", ["entry_id", "reporter_id"])


def downgrade() -> None:
    op.drop_table("reports")
