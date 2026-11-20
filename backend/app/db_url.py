"""The database URL, normalised to the driver the app ships with.

Kept free of other imports so Alembic's env.py can use it without the app's
required secrets.
"""

import re

_PLAIN = re.compile(r"^postgres(?:ql)?://")


def normalize_database_url(url: str) -> str:
    """`postgres://…` and `postgresql://…` (as Neon and most hosts hand them
    out) become `postgresql+psycopg://…`: SQLAlchemy would otherwise pick
    psycopg2, which isn't installed. Anything else is returned unchanged."""
    return _PLAIN.sub("postgresql+psycopg://", url, count=1)
