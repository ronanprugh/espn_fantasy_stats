"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_table(
        "leagues",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("espn_league_id", sa.BigInteger, nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("espn_s2_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("swid_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "espn_league_id", name="uq_user_league"),
    )
    op.create_index("ix_leagues_user_id", "leagues", ["user_id"])
    op.create_index("ix_leagues_espn_league_id", "leagues", ["espn_league_id"])
    op.create_table(
        "cache",
        sa.Column("league_id", sa.BigInteger, primary_key=True),
        sa.Column("year", sa.Integer, primary_key=True),
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("cache")
    op.drop_index("ix_leagues_espn_league_id", table_name="leagues")
    op.drop_index("ix_leagues_user_id", table_name="leagues")
    op.drop_table("leagues")
    op.drop_table("users")
