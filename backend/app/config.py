import os

from dotenv import load_dotenv

load_dotenv()

# Database — Postgres connection string. Format:
#   postgresql+psycopg://user:password@host:port/dbname
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://fantasy:dev@localhost:5432/fantasy",
)

# Used to sign session cookies. Rotate to invalidate all sessions.
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY env var is required")

# Fernet key for encrypting ESPN credentials at rest. Generate with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    raise RuntimeError("ENCRYPTION_KEY env var is required")

# Legacy single-league env vars — only used by the admin seed command.
SEED_LEAGUE_ID = os.environ.get("LEAGUE_ID")
SEED_ESPN_S2 = os.environ.get("ESPN_S2") or None
SEED_SWID = os.environ.get("SWID") or None

# Comma-separated list of CORS origins that may carry credentials. In dev
# Vite is on 5173; in production behind Vercel rewrites the browser sees the
# Vercel origin, so include it here once you've deployed.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

# Cookie hardening. In dev these defaults work; in production set
# COOKIE_SECURE=true (and, if you ever serve frontend on a different domain
# than the backend, COOKIE_SAME_SITE=none).
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAME_SITE = os.environ.get("COOKIE_SAME_SITE", "lax")
