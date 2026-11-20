"""Show what ESPN returns for a league's transactions, season by season.

The Transactions page reads ESPN's activity feed ("communication") and, for
seasons the feed doesn't serve (it answers 404), the transactions view
(`mTransactions2`), rebuilding those seasons' trades from weekly rosters.
This prints, for every season from 2019 on, what each source answers, so a
season showing no trades can be told apart from one ESPN has no data for.
In the transactions view, TRADE_ACCEPT / TRADE_UPHOLD rows are trades that
went through.

Run from backend/ with LEAGUE_ID, ESPN_S2 and SWID in backend/.env (the same
values the admin `seed-from-env` command reads):

    .venv/bin/python scripts/diagnose_transactions.py

It only reads from ESPN and prints counts: no cookies, names or ids.
"""

from __future__ import annotations

import json
import os
from collections import Counter

import requests
from dotenv import load_dotenv
from espn_api.football import League

BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"
ACTIVITY_TYPES = [178, 180, 179, 239, 181, 244]


def communication(league_id: int, year: int, cookies: dict) -> tuple[int, Counter]:
    """HTTP status and message-type counts from the first 25 activity topics."""
    filters = {"topics": {
        "filterType": {"value": ["ACTIVITY_TRANSACTIONS"]},
        "limit": 25,
        "limitPerMessageSet": {"value": 25},
        "offset": 0,
        "sortMessageDate": {"sortPriority": 1, "sortAsc": False},
        "sortFor": {"sortPriority": 2, "sortAsc": False},
        "filterIncludeMessageTypeIds": {"value": ACTIVITY_TYPES},
    }}
    r = requests.get(
        f"{BASE}/seasons/{year}/segments/0/leagues/{league_id}/communication/",
        params={"view": "kona_league_communication"},
        headers={"x-fantasy-filter": json.dumps(filters)},
        cookies=cookies,
        timeout=30,
    )
    types: Counter = Counter()
    if r.status_code == 200:
        for topic in r.json().get("topics") or []:
            types.update(m.get("messageTypeId") for m in topic.get("messages", []))
    return r.status_code, types


def transactions(league: League) -> Counter:
    """(type, status) counts from the transactions view, every scoring period."""
    seen: dict[str, dict] = {}
    for period in range(1, (getattr(league, "finalScoringPeriod", None) or 18) + 1):
        data = league.espn_request.league_get(params={"view": "mTransactions2", "scoringPeriodId": period})
        for tx in (data or {}).get("transactions") or []:
            seen.setdefault(str(tx.get("id")), tx)
    return Counter((t.get("type"), t.get("status")) for t in seen.values())


def main() -> None:
    load_dotenv()
    league_id = int(os.environ["LEAGUE_ID"])
    cookies = {"espn_s2": os.environ.get("ESPN_S2") or "", "SWID": os.environ.get("SWID") or ""}
    latest = League(league_id=league_id, year=2026, espn_s2=cookies["espn_s2"] or None, swid=cookies["SWID"] or None)
    years = sorted({*latest.previousSeasons, latest.year})
    for year in [y for y in years if y >= 2019]:
        league = League(league_id=league_id, year=year, espn_s2=cookies["espn_s2"] or None, swid=cookies["SWID"] or None)
        endpoint = "leagueHistory" if "/leagueHistory/" in league.espn_request.LEAGUE_ENDPOINT else "seasons"
        status, types = communication(league_id, year, cookies)
        print(f"{year}  league read from: {endpoint}")
        print(f"      activity feed: HTTP {status}, first page message types {dict(types) or '{}'} (244 = trade)")
        tx = transactions(league)
        executed = {k: v for k, v in tx.items() if k[1] == "EXECUTED"}
        print(f"      transactions view: {sum(tx.values())} total, executed by type {executed or '{}'}")


if __name__ == "__main__":
    main()
