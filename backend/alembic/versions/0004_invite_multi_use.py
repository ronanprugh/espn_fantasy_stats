"""replace used_at with max_uses/use_count on invite_codes

Revision ID: 0004_invite_multi_use
Revises: 0003_invite_codes
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_invite_multi_use"
down_revision = "0003_invite_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("invite_codes", "used_at")
    op.add_column(
        "invite_codes",
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "invite_codes",
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("invite_codes", "use_count")
    op.drop_column("invite_codes", "max_uses")
    op.add_column(
        "invite_codes",
        sa.Column("used_at", sa.DateTime(), nullable=True),
    )
