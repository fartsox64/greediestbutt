"""add feedback tables

Revision ID: 009
Revises: 008
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("author_id", sa.BigInteger, sa.ForeignKey("users.steam_id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject", sa.String(200), nullable=True),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by", sa.BigInteger, nullable=True),
    )
    op.create_index("ix_feedback_author_id", "feedback", ["author_id"])
    op.create_index("ix_feedback_status", "feedback", ["status"])
    op.create_index("ix_feedback_created_at", "feedback", ["created_at"])

    op.create_table(
        "feedback_messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("feedback_id", sa.Integer, sa.ForeignKey("feedback.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.BigInteger, sa.ForeignKey("users.steam_id", ondelete="CASCADE"), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_feedback_messages_feedback_id", "feedback_messages", ["feedback_id"])


def downgrade() -> None:
    op.drop_table("feedback_messages")
    op.drop_table("feedback")
