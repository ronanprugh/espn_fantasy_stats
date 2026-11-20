"""trade records: calculated trade results

Revision ID: 0007_trade_records
Revises: 0006_api_tokens
Create Date: 2026-11-20
"""
from alembic import op
import sqlalchemy as sa


revision = "0007_trade_records"
down_revision = "0006_api_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trade_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("espn_league_id", sa.BigInteger(), nullable=False),
        sa.Column("season", sa.Integer(), nullable=False),
        sa.Column("uid", sa.String(96), nullable=False),
        sa.Column("occurred_at", sa.BigInteger(), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("winner_team_id", sa.Integer(), nullable=True),
        sa.Column("margin", sa.Float(), server_default="0", nullable=False),
        sa.UniqueConstraint("espn_league_id", "season", "uid", name="uq_trade_record"),
    )
    op.create_table(
        "trade_record_players",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "trade_id",
            sa.Integer(),
            sa.ForeignKey("trade_records.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("team_name", sa.String(255), nullable=False),
        sa.Column("owner_id", sa.String(64), nullable=False),
        sa.Column("owner_name", sa.String(255), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("player_id", sa.BigInteger(), nullable=False),
        sa.Column("player_name", sa.String(255), nullable=False),
        sa.Column("position", sa.String(16), server_default="", nullable=False),
        sa.Column("started_points", sa.Float(), nullable=True),
        sa.Column("bench_points", sa.Float(), nullable=True),
        sa.Column("weeks_started", sa.Integer(), nullable=True),
    )
    op.create_index("ix_trade_record_players_trade_id", "trade_record_players", ["trade_id"])
    op.create_table(
        "trade_syncs",
        sa.Column("espn_league_id", sa.BigInteger(), nullable=False),
        sa.Column("season", sa.Integer(), nullable=False),
        sa.Column("computed_at", sa.DateTime(), nullable=False),
        sa.Column("final", sa.Boolean(), server_default="false", nullable=False),
        sa.PrimaryKeyConstraint("espn_league_id", "season"),
    )


def downgrade() -> None:
    op.drop_table("trade_syncs")
    op.drop_index("ix_trade_record_players_trade_id", table_name="trade_record_players")
    op.drop_table("trade_record_players")
    op.drop_table("trade_records")
