"""follow trade owners: forget stored trade results and cached activity

Past seasons' trades are now rebuilt by following each player's owner
through the draft, pickups, drops and weekly rosters (0010's rebuild used
the rosters alone, which put the wrong team on a trade when a player was
picked up and traded in the same week). The activity cache key moved to
activity_v4, so the old activity rows are deleted too.

Revision ID: 0011_follow_trade_owners
Revises: 0010_rebuild_past_trades
Create Date: 2026-11-20
"""
from alembic import op


revision = "0011_follow_trade_owners"
down_revision = "0010_rebuild_past_trades"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM trade_syncs")
    op.execute("DELETE FROM trade_records")
    op.execute("DELETE FROM cache WHERE key LIKE 'activity_v%'")


def downgrade() -> None:
    # Nothing to restore: the rows are recalculated on demand.
    pass
