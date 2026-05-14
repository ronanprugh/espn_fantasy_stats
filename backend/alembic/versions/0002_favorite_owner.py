"""add favorite_owner_id to leagues

Revision ID: 0002_favorite_owner
Revises: 0001_initial
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_favorite_owner"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leagues",
        sa.Column("favorite_owner_id", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("leagues", "favorite_owner_id")
