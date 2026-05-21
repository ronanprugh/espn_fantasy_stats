"""add is_admin to users and invite_codes table

Revision ID: 0003_invite_codes
Revises: 0002_favorite_owner
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0003_invite_codes"
down_revision = "0002_favorite_owner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False),
    )
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("invite_codes")
    op.drop_column("users", "is_admin")
