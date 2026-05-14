# espn_fantasy_stats

Multi-user web app for analyzing ESPN Fantasy Football leagues across seasons.

- **Backend**: FastAPI + SQLAlchemy + Postgres. Wraps the `espn_api` library.
- **Frontend**: React + Vite + TypeScript.
- **Auth**: session cookies + bcrypt, invite-only.
- **Storage**: Postgres (local via Docker, production via Neon free tier).

## Local development

### 1. Start Postgres

```bash
docker compose up -d              # starts Postgres on localhost:5432
docker compose logs -f db         # follow logs (optional)
docker compose down               # stop when done (data persists in ./.pgdata)
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # fill in SECRET_KEY and ENCRYPTION_KEY
.venv/bin/alembic upgrade head    # apply schema migrations
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Generate the secrets in `.env`:

```bash
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(32))"
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"
```

### 3. Seed an admin user

The app is invite-only — there's no signup page. Create users with the admin CLI:

```bash
# Create a user (you'll be prompted for password)
.venv/bin/python -m app.admin create-user --username ronan

# Attach a league to that user
.venv/bin/python -m app.admin add-league \
  --username ronan \
  --league-id 1375368 \
  --name "Walter Payton Bertoni Bowl" \
  --espn-s2 "AEAC..." \
  --swid "{...}"

# One-shot: create user + attach the league from LEAGUE_ID/ESPN_S2/SWID in .env
.venv/bin/python -m app.admin seed-from-env --username ronan --name "My League"

# List users
.venv/bin/python -m app.admin list-users
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. You'll land on the login page.

## Getting your ESPN cookies

1. Log into [fantasy.espn.com](https://fantasy.espn.com) in a browser.
2. Open DevTools → Application → Cookies → `https://fantasy.espn.com`.
3. Copy the `espn_s2` and `SWID` values.
4. Paste them when adding a league (UI or CLI). They're stored encrypted at rest.

Public leagues don't need cookies — leave the fields blank.

## Database migrations

Schema changes live in `backend/alembic/versions/`. After editing models:

```bash
.venv/bin/alembic revision --autogenerate -m "describe change"
.venv/bin/alembic upgrade head
```
