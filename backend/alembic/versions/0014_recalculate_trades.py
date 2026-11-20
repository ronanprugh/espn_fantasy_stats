"""recalculate stored trade results from re-fetched box scores

Some box scores were cached with the wrong games: one saved mid-game, or
under a week ESPN hadn't reached (ESPN answers with the current week's
games), was kept for good once the week left the refresh window. Box scores
are now kept for good only if the week was over when fetched, and the cache
key's version bump (box_scores_v2) fetches every week again once.

Trade results calculated from the old box scores are stored, some as final.
This marks every season's results as needing recalculation: each is
recalculated, from the re-fetched box scores, the next time it's viewed.
Data only; nothing to undo on downgrade.

Revision ID: 0014_recalculate_trades
Revises: 0013_session_version
Create Date: 2026-11-20
"""
from alembic import op


revision = "0014_recalculate_trades"
down_revision = "0013_session_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE trade_syncs SET final = false, computed_at = '2000-01-01 00:00:00'")


def downgrade() -> None:
    pass
