"""add site_settings table for about page content

Revision ID: 011
Revises: 010
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "site_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.Text, nullable=False),
    )


def downgrade():
    op.drop_table("site_settings")
