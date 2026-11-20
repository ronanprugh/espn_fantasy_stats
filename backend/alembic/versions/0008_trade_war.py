"""trade WAR: per-player WAR and per-side WAR and points per game

Revision ID: 0008_trade_war
Revises: 0007_trade_records
Create Date: 2026-11-20
"""
from alembic import op
import sqlalchemy as sa


revision = "0008_trade_war"
down_revision = "0007_trade_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trade_record_players", sa.Column("war", sa.Float(), nullable=True))
    op.create_table(
        "trade_record_sides",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "trade_id",
            sa.Integer(),
            sa.ForeignKey("trade_records.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("war", sa.Float(), server_default="0", nullable=False),
        sa.Column("ppg", sa.Float(), nullable=True),
        sa.Column("ppg_if_kept", sa.Float(), nullable=True),
        sa.Column("games", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("ix_trade_record_sides_trade_id", "trade_record_sides", ["trade_id"])
    # Results stored so far were decided by points: recalculate them all.
    op.execute("DELETE FROM trade_syncs")


def downgrade() -> None:
    op.drop_index("ix_trade_record_sides_trade_id", table_name="trade_record_sides")
    op.drop_table("trade_record_sides")
    op.drop_column("trade_record_players", "war")
