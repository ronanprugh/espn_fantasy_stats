"""league access verified: when ESPN confirmed a league row's cookies can read it

ESPN data is cached and shared by league id, so a league row is what grants
a user access to that data. Rows are now only used once ESPN has confirmed
the row's cookies (or none, for a public league) can read the league; rows
added before this are checked on first use.

Revision ID: 0012_league_access_verified
Revises: 0011_follow_trade_owners
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op


revision = "0012_league_access_verified"
down_revision = "0011_follow_trade_owners"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leagues", sa.Column("access_verified_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("leagues", "access_verified_at")
