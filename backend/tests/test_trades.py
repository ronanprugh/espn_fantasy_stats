import json
from datetime import datetime
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, TradeRecord, TradeRecordPlayer, TradeSync
from app.trades import (
    EASTERN,
    activity_from_topic,
    kickoff,
    moves_from_activity,
    player_position,
    trade_outcomes,
    trades_from_activity,
    week_of,
)


def ms(y, mo, d, h=12):
    return int(datetime(y, mo, d, h, tzinfo=EASTERN).timestamp() * 1000)


def test_kickoff_is_the_thursday_after_labor_day():
    assert kickoff(2025).isoformat() == "2025-09-04"
    assert kickoff(2026).isoformat() == "2026-09-10"
    assert kickoff(2019).isoformat() == "2019-09-05"


def test_week_of_runs_tuesday_to_monday():
    # 2026: week 1 is Tue 8 Sep – Mon 14 Sep.
    assert week_of(ms(2026, 8, 20), 2026) == 1     # preseason counts as week 1
    assert week_of(ms(2026, 9, 8), 2026) == 1
    assert week_of(ms(2026, 9, 14), 2026) == 1
    assert week_of(ms(2026, 9, 15), 2026) == 2
    assert week_of(ms(2026, 11, 18), 2026) == 11


# Raw ESPN data, as the activity feed and teams arrive.
TEAMS = {
    1: {"team_id": 1, "team_name": "Alpha", "owner_id": "o1", "owner_name": "O o1"},
    2: {"team_id": 2, "team_name": "Bravo", "owner_id": "o2", "owner_name": "O o2"},
}
PLAYERS = {
    10: {"name": "Jaxon Smith-Njigba", "position": "WR"},
    11: {"name": "Kyren Williams", "position": "RB"},
    20: {"name": "Dak Prescott", "position": "QB"},
    30: {"name": "Rico Dowdle", "position": "RB"},
    31: {"name": "Roschon Johnson", "position": "RB"},
    32: {"name": "Jake Ferguson", "position": "TE"},
    33: {"name": "Kimani Vidal", "position": "RB"},
}
TRADE = {"id": "trade-1", "date": ms(2026, 10, 7), "messages": [
    {"messageTypeId": 244, "from": 1, "to": 2, "targetId": 10},
    {"messageTypeId": 244, "from": 1, "to": 2, "targetId": 11},
    {"messageTypeId": 244, "from": 2, "to": 1, "targetId": 20},
]}
PICKUP = {"id": "move-1", "date": ms(2026, 10, 14, 3), "messages": [
    {"messageTypeId": 180, "to": 1, "from": 17, "targetId": 30},
    {"messageTypeId": 179, "to": 1, "targetId": 31},
]}
FA = {"id": "move-2", "date": ms(2026, 10, 16), "messages": [{"messageTypeId": 178, "to": 2, "targetId": 32}]}
DROP = {"id": "move-3", "date": ms(2026, 10, 17), "messages": [{"messageTypeId": 239, "for": 2, "targetId": 33}]}


def acts(*topics):
    return [activity_from_topic(t, TEAMS.get, PLAYERS) for t in topics]


def test_trade_topics_become_one_record_per_trade():
    [t] = trades_from_activity(acts(TRADE), 2026)
    assert t["uid"] == "trade-1" and t["week"] == 5
    by_team = {s["team_id"]: s for s in t["sides"]}
    assert [p["name"] for p in by_team[1]["received"]] == ["Dak Prescott"]
    assert [p["name"] for p in by_team[2]["received"]] == ["Jaxon Smith-Njigba", "Kyren Williams"]
    assert [p["name"] for p in by_team[1]["sent"]] == ["Jaxon Smith-Njigba", "Kyren Williams"]
    assert by_team[2]["owner_id"] == "o2" and by_team[1]["received"][0]["position"] == "QB"


def test_unknown_players_and_one_sided_topics():
    odd = {"id": "x", "date": ms(2026, 10, 2), "messages": [
        {"messageTypeId": 244, "from": 1, "to": 2, "targetId": 999},
        {"messageTypeId": 244, "from": 2, "to": 1, "targetId": 20},
    ]}
    lone = {"id": "y", "date": ms(2026, 10, 1), "messages": [{"messageTypeId": 244, "from": 1, "to": 77, "targetId": 10}]}
    trades = trades_from_activity(acts(odd, lone), 2026)
    assert len(trades) == 1
    bravo = [s for s in trades[0]["sides"] if s["team_id"] == 2][0]
    assert bravo["received"] == [{"player_id": 999, "name": "Player 999", "position": ""}]


def test_moves_keep_kinds_separate_and_leave_out_trades():
    moves = moves_from_activity(acts(TRADE, PICKUP, FA, DROP), 2026)
    assert [m["kind"] for m in moves] == ["waiver", "free_agent", "drop"]
    waiver = moves[0]
    assert waiver["team_name"] == "Alpha" and waiver["bid"] == 17 and waiver["week"] == 6
    assert [p["name"] for p in waiver["added"]] == ["Rico Dowdle"]
    assert [p["name"] for p in waiver["dropped"]] == ["Roschon Johnson"]
    assert moves[2]["added"] == [] and moves[2]["dropped"][0]["name"] == "Kimani Vidal"


def test_player_position_follows_espn_rules():
    assert player_position({"fullName": "Dak Prescott", "eligibleSlots": [0, 7, 20, 21]}) == "QB"
    # RB/WR (3) and flex combinations are skipped for the main position.
    assert player_position({"fullName": "Some Back", "eligibleSlots": [3, 2, 23]}) == "RB"
    assert player_position({"fullName": "49ers D/ST", "eligibleSlots": [16]}) == "D/ST"
    assert player_position({"fullName": "Kicker", "defaultPositionId": 5}) == "K"
    assert player_position({}) == ""


def box(team_lineups):
    """{team_id: [(player_id, slot, points)]} -> one week's box score payload."""
    sides = [{"team_id": tid, "lineup": [{"player_id": p, "slot_position": s, "points": pts} for p, s, pts in lu]}
             for tid, lu in team_lineups.items()]
    return {"matchups": [{"home": sides[0], "away": sides[1] if len(sides) > 1 else None}]}


WEEKS = {
    4: box({1: [(10, "WR", 30.0), (11, "RB", 20.0)], 2: [(20, "QB", 25.0)]}),  # before: ignored
    5: box({1: [(20, "QB", 24.0)], 2: [(10, "WR", 18.0), (11, "BE", 12.0)]}),
    6: box({1: [(20, "QB", 21.0)], 2: [(10, "WR", 22.0), (11, "RB", 9.0)]}),
}


def test_outcomes_count_starts_after_the_trade_for_the_new_team():
    [t] = trade_outcomes(trades_from_activity(acts(TRADE), 2026), WEEKS)
    by_team = {s["team_id"]: s for s in t["sides"]}
    assert by_team[1]["started_points"] == 45.0
    bravo = {p["name"]: p for p in by_team[2]["received"]}
    assert bravo["Jaxon Smith-Njigba"]["started_points"] == 40.0
    assert bravo["Kyren Williams"] == {**bravo["Kyren Williams"], "started_points": 9.0, "bench_points": 12.0, "weeks_started": 1}
    assert by_team[2]["started_points"] == 49.0
    assert t["winner_team_id"] == 2 and t["margin"] == 4.0


def test_no_winner_before_anyone_plays():
    [t] = trade_outcomes(trades_from_activity(acts(TRADE), 2026), {})
    assert t["winner_team_id"] is None and t["margin"] == 0


def test_players_who_leave_the_new_team_stop_counting():
    weeks = {
        5: box({1: [(20, "QB", 24.0)], 2: [(10, "WR", 18.0)]}),
        6: box({1: [], 2: [(10, "WR", 22.0)]}),  # Dak gone from Alpha
    }
    [t] = trade_outcomes(trades_from_activity(acts(TRADE), 2026), weeks)
    alpha = [s for s in t["sides"] if s["team_id"] == 1][0]
    assert alpha["started_points"] == 24.0


# --- Fetching from ESPN ------------------------------------------------------


class FakeRequests:
    """espn_api's request object: the activity feed paged by the offset in the
    filter header, and batched player cards."""

    def __init__(self, topics, page=25, ignore_offset=False, cards=None):
        self.topics, self.page, self.ignore_offset = topics, page, ignore_offset
        self.cards = cards if cards is not None else {}
        self.calls, self.card_calls = [], []

    def league_get(self, extend="", params=None, headers=None):
        offset = json.loads(headers["x-fantasy-filter"])["topics"]["offset"]
        self.calls.append(offset)
        start = 0 if self.ignore_offset else offset
        return {"topics": self.topics[start:start + self.page]}

    def get_player_card(self, ids, max_scoring_period):
        self.card_calls.append(list(ids))
        return {"players": [{"id": i, "player": self.cards[i]} for i in ids if i in self.cards]}


def fake_league(topics, **kw):
    return NS(
        espn_request=FakeRequests(topics, **kw),
        player_map={33: "Kimani Vidal"},
        finalScoringPeriod=18,
        teams=[NS(team_id=i, team_name=t["team_name"], owners=[{"id": t["owner_id"], "firstName": "O", "lastName": t["owner_id"]}])
               for i, t in TEAMS.items()],
    )


CARDS = {pid: {"id": pid, "fullName": p["name"], "defaultPositionId": {"QB": 1, "RB": 2, "WR": 3, "TE": 4}[p["position"]]}
         for pid, p in PLAYERS.items() if pid != 33}


def test_activity_pages_until_nothing_new(monkeypatch):
    from app import main

    many = [{"id": f"t{i}", "date": ms(2026, 10, 1), "messages": []} for i in range(30)]
    league = fake_league(many, page=10)
    assert len(main._fetch_activity_topics(league)) == 30
    assert league.espn_request.calls == [0, 10, 20, 30]

    # ESPN ignoring the offset: the repeated page stops the loop.
    stuck = fake_league(many[:5], ignore_offset=True)
    assert len(main._fetch_activity_topics(stuck)) == 5
    assert stuck.espn_request.calls == [0, 5]


def test_player_directory_batches_and_falls_back_to_names(monkeypatch):
    from app import main

    league = fake_league([], cards=CARDS)
    monkeypatch.setattr(main, "PLAYER_CARD_CHUNK", 4)
    found = main._player_directory(league, set(PLAYERS))
    assert len(league.espn_request.card_calls) == 2       # 7 players, 4 per request
    assert found[20] == {"name": "Dak Prescott", "position": "QB"}
    assert found[33] == {"name": "Kimani Vidal", "position": ""}  # not in the cards: name map


def test_season_activity_reads_espn_in_a_few_requests(monkeypatch):
    from app import main

    league = fake_league([TRADE, PICKUP, FA, DROP], cards=CARDS)
    monkeypatch.setattr(main.cache, "get", lambda *a, **k: None)
    monkeypatch.setattr(main.cache, "put", lambda *a, **k: None)
    monkeypatch.setattr(main, "get_league", lambda *a, **k: league)
    activities = main._get_season_activity(1, 2026, None, None)
    assert [a["uid"] for a in activities] == ["trade-1", "move-1", "move-2", "move-3"]
    assert len(league.espn_request.calls) == 2 and len(league.espn_request.card_calls) == 1


# --- Stored results and the endpoints ------------------------------------------


@pytest.fixture
def db():
    from app import main
    from app.database import get_db

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[TradeRecord.__table__, TradeRecordPlayer.__table__, TradeSync.__table__])
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    main.app.dependency_overrides[get_db] = override
    s = Session()
    try:
        yield s
    finally:
        s.close()
        main.app.dependency_overrides.clear()


def test_store_round_trip_and_currency(db):
    from datetime import timezone

    from app import trade_store

    results = trade_outcomes(trades_from_activity(acts(TRADE), 2026), WEEKS)
    assert not trade_store.is_current(db, 1, 2026)
    trade_store.save(db, 1, 2026, results, final=False)
    [loaded] = trade_store.load(db, 1, [2026])
    assert loaded["year"] == 2026 and loaded["winner_team_id"] == 2 and loaded["margin"] == 4.0
    by_team = {s["team_id"]: s for s in loaded["sides"]}
    assert by_team[2]["started_points"] == 49.0
    assert [p["name"] for p in by_team[1]["sent"]] == ["Jaxon Smith-Njigba", "Kyren Williams"]
    assert trade_store.is_current(db, 1, 2026)
    # A season in progress goes stale at the next refresh point...
    assert not trade_store.is_current(db, 1, 2026, now=datetime(2030, 1, 1, tzinfo=timezone.utc))
    # ...a finished one never does.
    trade_store.save(db, 1, 2026, results, final=True)
    assert trade_store.is_current(db, 1, 2026, now=datetime(2030, 1, 1, tzinfo=timezone.utc))
    assert len(trade_store.load(db, 1, [2026])) == 1  # replaced, not duplicated


def wire(monkeypatch, league, over=True):
    from app import main

    calls = {"box": 0}

    def box_scores(lid, year, week, *a, **k):
        calls["box"] += 1
        if week > 6:
            raise main.WeekNotPlayedError("not yet")
        return WEEKS.get(week, {"matchups": []})

    monkeypatch.setattr(main.cache, "get", lambda *a, **k: None)
    monkeypatch.setattr(main.cache, "put", lambda *a, **k: None)
    monkeypatch.setattr(main, "get_league", lambda *a, **k: league)
    monkeypatch.setattr(main, "discover_years", lambda *a, **k: [2018, 2026])
    monkeypatch.setattr(main, "_get_season_scoreboard", lambda *a, **k: {"weeks": list(range(1, 18))})
    monkeypatch.setattr(main, "_get_season_box_scores", box_scores)
    monkeypatch.setattr(main, "_get_season_teams", lambda *a, **k: {"teams": [{"final_standing": 1 if over else 0}]})
    ctx = main.LeagueContext(espn_league_id=1, espn_s2=None, swid=None, display_name="Test League")
    main.app.dependency_overrides[main.get_user_league] = lambda: ctx
    return calls


def test_trades_endpoint_calculates_once_then_reads_stored_results(db, monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    league = fake_league([TRADE, PICKUP], cards=CARDS)
    calls = wire(monkeypatch, league)
    client = TestClient(main.app)

    body = client.get("/api/leagues/1/seasons/2026/trades").json()
    [t] = body["trades"]
    assert t["week"] == 5 and t["winner_team_id"] == 2 and t["margin"] == 4.0 and t["year"] == 2026
    espn_calls, box_calls = len(league.espn_request.calls), calls["box"]

    again = client.get("/api/leagues/1/seasons/2026/trades").json()
    assert again["trades"] == body["trades"]
    assert len(league.espn_request.calls) == espn_calls and calls["box"] == box_calls  # nothing refetched

    old = client.get("/api/leagues/1/seasons/2018/trades").json()
    assert old == {"league_id": 1, "year": 2018, "supported": False, "trades": []}


def test_all_seasons_endpoints(db, monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    wire(monkeypatch, fake_league([TRADE, PICKUP, FA, DROP], cards=CARDS))
    client = TestClient(main.app)

    trades = client.get("/api/leagues/1/trades").json()
    assert trades["years"] == [2026] and len(trades["trades"]) == 1

    moves = client.get("/api/leagues/1/transactions").json()
    assert [m["kind"] for m in moves["moves"]] == ["waiver", "free_agent", "drop"]
    assert all(m["year"] == 2026 for m in moves["moves"])

    season = client.get("/api/leagues/1/seasons/2026/transactions").json()
    assert season["supported"] is True and len(season["moves"]) == 3
