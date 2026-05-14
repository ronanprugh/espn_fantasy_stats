# espn_fantasy_stats

Multi-user web app for analyzing ESPN Fantasy Football leagues across seasons.

- **Backend**: FastAPI + SQLAlchemy + Postgres, wrapping the `espn_api` library.
- **Frontend**: React + Vite + TypeScript with Recharts for visualization.
- **Auth**: invite-only, bcrypt-hashed passwords, cookie sessions.
- **Storage**: Postgres (local via Docker). ESPN credentials encrypted at rest with Fernet.

What's in it:

- **Season Stats** — all-time aggregate + per-season standings tables, sortable columns
- **Playoff History** — SVG bracket reconstruction with championship + consolation paths, click any match for box scores
- **Scoreboard** — per-week matchup grid; click into the box score for any 2019+ game
- **Team Hub** — per-team summary card, current roster, and last matchup (with tabs for Summary/Roster)
- **Team Comparison** — year-over-year line chart for any selected stat across multiple owners
- **Head to Head** — full record between any two owners across every season, plus the matchup list

---

## Prerequisites

- **Docker Desktop** (runs Postgres locally) — https://docker.com/products/docker-desktop
- **Python 3.11+** (3.12 also fine)
- **Node.js 18+** (`brew install node`)

---

## First-time setup

### 1. Clone and start Postgres

```bash
git clone https://github.com/ronanprugh/espn_fantasy_stats.git
cd espn_fantasy_stats
docker compose up -d                   # starts Postgres on localhost:5432
```

Data lives in `./.pgdata` (gitignored) and survives container restarts.

### 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                   # then fill in the two keys below
```

Generate the two required secrets and append them to `.env`:

```bash
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(32))" >> .env
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env
```

(Optional) if you want the `seed-from-env` shortcut below, also add your first
league's ESPN values to `.env`:

```
LEAGUE_ID=1375368
ESPN_S2=AEAC...
SWID={...}
```

Apply the migrations:

```bash
.venv/bin/alembic upgrade head
```

### 3. Create your first user

The app has no signup page — accounts are created via the admin CLI.

**Option A — from scratch:**

```bash
.venv/bin/python -m app.admin create-user --username ronan
# prompted for password
.venv/bin/python -m app.admin add-league \
  --username ronan \
  --league-id 1375368 \
  --name "Walter Payton Bertoni Bowl" \
  --espn-s2 "AEAC..." \
  --swid "{...}"
```

**Option B — one-shot seed from `.env`** (requires LEAGUE_ID/ESPN_S2/SWID set):

```bash
.venv/bin/python -m app.admin seed-from-env --username ronan --name "My League"
```

### 4. Start the backend

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000
```

### 5. Frontend setup (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with the credentials you set in step 3.

---

## Daily use

Once everything is installed, three commands get you running:

```bash
# Terminal 1 — Postgres (skip if already up: `docker ps` to check)
docker compose up -d

# Terminal 2 — backend
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

# Terminal 3 — frontend
cd frontend && npm run dev
```

Stop everything:

```bash
docker compose down                    # Postgres
# Ctrl+C in the uvicorn and vite terminals
```

---

## Managing users and leagues

Add another user (invite-only):

```bash
cd backend
.venv/bin/python -m app.admin create-user --username <name>
```

Then they log in and add their own leagues via the **Manage Leagues** page in the UI
(or you can pre-attach a league for them with `add-league`).

List all users and how many leagues each has:

```bash
.venv/bin/python -m app.admin list-users
```

---

## Getting your ESPN cookies (for private leagues)

1. Log into [fantasy.espn.com](https://fantasy.espn.com) in a browser.
2. Open DevTools → Application → Cookies → `https://fantasy.espn.com`.
3. Copy the `espn_s2` and `SWID` values.
4. Paste them in the "Add a league" form in the UI, or pass via the admin CLI.

The cookies are encrypted with Fernet before being written to Postgres. Public
leagues don't need cookies — leave the fields blank.

---

## Database migrations

Schema lives in `backend/alembic/versions/`. When you change a model:

```bash
cd backend
.venv/bin/alembic revision --autogenerate -m "describe change"
.venv/bin/alembic upgrade head
```

To reset the local DB completely (nuke all users, leagues, and cached ESPN data):

```bash
docker compose down -v                 # -v removes the volume too
rm -rf .pgdata
docker compose up -d
cd backend && .venv/bin/alembic upgrade head
# then re-seed your user
```

---

## Troubleshooting

- **`SECRET_KEY env var is required`** — you skipped step 2's secret generation, or `.env` isn't being loaded. Check that `backend/.env` exists.
- **`Could not connect to localhost:5432`** — Postgres isn't running. `docker compose up -d` to start it.
- **Backend crashes on first request** — Alembic migrations weren't applied. Run `.venv/bin/alembic upgrade head` from the backend dir.
- **Login returns 401 for the right password** — the bcrypt hash uses a per-install pepper indirectly via the password itself. Make sure you created the user under the same `SECRET_KEY` you're using now (rotating the key doesn't invalidate passwords, but does invalidate sessions).
- **Box score links don't work for old seasons** — `espn_api` only supports box scores from 2019 forward. Pre-2019 matchup rows are non-clickable by design.
