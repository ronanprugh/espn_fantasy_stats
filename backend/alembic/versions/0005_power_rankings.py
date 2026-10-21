"""power rankings posts and entries

Revision ID: 0005_power_rankings
Revises: 0004_invite_multi_use
Create Date: 2026-10-18
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_power_rankings"
down_revision = "0004_invite_multi_use"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "power_ranking_posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("espn_league_id", sa.BigInteger(), nullable=False),
        sa.Column("season", sa.Integer(), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("posted_at", sa.DateTime(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("author", sa.String(128), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("format", sa.String(16), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("image", sa.LargeBinary(), nullable=True),
        sa.Column("image_mime", sa.String(64), nullable=True),
        sa.Column("imported_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_power_ranking_posts_espn_league_id", "power_ranking_posts", ["espn_league_id"]
    )
    op.create_table(
        "power_ranking_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "post_id",
            sa.Integer(),
            sa.ForeignKey("power_ranking_posts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("espn_team_id", sa.Integer(), nullable=False),
        sa.Column("written_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("record", sa.String(16), nullable=True),
        sa.Column("change", sa.String(16), nullable=True),
        sa.Column("blurb", sa.Text(), nullable=False, server_default=""),
    )
    op.create_index("ix_power_ranking_entries_post_id", "power_ranking_entries", ["post_id"])


def downgrade() -> None:
    op.drop_index("ix_power_ranking_entries_post_id", table_name="power_ranking_entries")
    op.drop_table("power_ranking_entries")
    op.drop_index("ix_power_ranking_posts_espn_league_id", table_name="power_ranking_posts")
    op.drop_table("power_ranking_posts")
