"""session version: a password change ends the user's other sessions

Each session cookie carries the user's session_version when it was started;
a session whose version no longer matches is signed out. Changing a password
(or an admin reset) bumps it. Existing sessions carry no version, which reads
as 0, the default, so nobody is signed out by this migration.

Revision ID: 0013_session_version
Revises: 0012_league_access_verified
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op


revision = "0013_session_version"
down_revision = "0012_league_access_verified"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "session_version")
