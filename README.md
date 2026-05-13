# espn_fantasy_stats

Flexible viewer for an ESPN Fantasy Football league across seasons.

- **Backend**: FastAPI wrapping the `espn_api` library, with a SQLite cache.
- **Frontend**: React + Vite + TypeScript.

## Setup

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in LEAGUE_ID / ESPN_S2 / SWID
uvicorn app.main:app --reload --port 8000
```

The first request for a given season pulls from ESPN and caches it in `espn_cache.sqlite`.
Pass `?refresh=true` to force a re-fetch.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api/*` to the backend on :8000.

## Getting your ESPN cookies

1. Log into [fantasy.espn.com](https://fantasy.espn.com) in a browser.
2. Open DevTools → Application → Cookies → `https://fantasy.espn.com`.
3. Copy the `espn_s2` and `SWID` values into `backend/.env`.

These cookies only need to be set for private leagues. Public leagues work without them.
