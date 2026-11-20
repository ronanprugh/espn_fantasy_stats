"""refetch transactions: forget stored trade results and cached activity

Past seasons whose activity ESPN didn't serve were stored as having no
trades, and marked final, so they would never be looked at again. The app
now falls back to ESPN's transactions view for those seasons and never
stores a missing season as final; this clears what was stored before, so
every season is calculated again on its next visit.

Revision ID: 0009_refetch_transactions
Revises: 0008_trade_war
Create Date: 2026-11-20
"""
from alembic import op


revision = "0009_refetch_transactions"
down_revision = "0008_trade_war"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM trade_syncs")
    op.execute("DELETE FROM trade_records")
    op.execute("DELETE FROM cache WHERE key LIKE 'activity_v%'")


def downgrade() -> None:
    # Nothing to restore: the rows are recalculated on demand.
    pass
