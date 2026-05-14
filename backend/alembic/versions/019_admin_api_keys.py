"""admin_api_keys table

Revision ID: 019
Revises: 018
Create Date: 2026-05-13

One row per admin, storing a short-lived API key (1-hour TTL) that allows
curl access to the scrape/admin endpoints without a browser session.
"""

import sqlalchemy as sa
from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "admin_api_keys",
        sa.Column("steam_id", sa.BigInteger, sa.ForeignKey("users.steam_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("api_key", sa.String(68), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("admin_api_keys")
