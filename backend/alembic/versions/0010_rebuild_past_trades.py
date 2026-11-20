"""rebuild past trades: forget stored trade results again

For past seasons ESPN's transactions view lists a trade's players only to a
member who was in it. Results calculated by 0009's code took those as the
season's trades when there were any, so a member saw only their own past
trades, stored as final. Past trades are now always rebuilt from rosters;
this clears the stored results so every season is calculated again. The
cached activity is kept: it was right.

Revision ID: 0010_rebuild_past_trades
Revises: 0009_refetch_transactions
Create Date: 2026-11-20
"""
from alembic import op


revision = "0010_rebuild_past_trades"
down_revision = "0009_refetch_transactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM trade_syncs")
    op.execute("DELETE FROM trade_records")


def downgrade() -> None:
    # Nothing to restore: the rows are recalculated on demand.
    pass
