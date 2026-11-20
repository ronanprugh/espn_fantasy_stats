import json
from datetime import datetime
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, TradeRecord, TradeRecordPlayer, TradeRecordSide, TradeSync
from app.trades import (
    EASTERN,
    _score_if_kept,
    activity_from_topic,
    activity_from_transaction,
    trade_events,
    trades_from_rosters,
    fits_slot,
    kickoff,
    moves_from_activity,
    player_position,
    start_war,
    trade_outcomes,
    trades_from_activity,
    war_baselines,
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


def entry(pid, pos, slot, pts, projected=10.0):
    return {"player_id": pid, "position": pos, "slot_position": slot, "points": pts, "projected_points": projected}


def box(team_lineups):
    """{team_id: [(player_id, position, slot, points[, projected])]} -> one
    week's box score payload; a team's score is its starters' points."""
    sides = []
    for tid, lu in team_lineups.items():
        lineup = [entry(*row) for row in lu]
        total = sum(p["points"] for p in lineup if p["slot_position"] not in ("BE", "IR"))
        sides.append({"team_id": tid, "total_points": total, "lineup": lineup})
    return {"matchups": [{"home": sides[i], "away": sides[i + 1] if i + 1 < len(sides) else None}
                         for i in range(0, len(sides), 2)]}


# Alpha (1) sends JSN (10) and Kyren (11) to Bravo (2) for Dak (20) in week 5.
# 41 is Bravo's bench WR, 42 Alpha's backup QB.
WEEKS = {
    4: box({1: [(10, "WR", "WR", 30.0), (11, "RB", "RB", 20.0)], 2: [(20, "QB", "QB", 25.0)]}),  # before: not credited
    5: box({1: [(20, "QB", "QB", 24.0), (42, "QB", "BE", 10.0)],
            2: [(10, "WR", "WR", 18.0), (11, "RB", "BE", 12.0), (41, "WR", "BE", 7.0)]}),
    6: box({1: [(20, "QB", "QB", 21.0), (42, "QB", "BE", 11.0)],
            2: [(10, "WR", "WR", 22.0), (11, "RB", "RB", 9.0), (41, "WR", "BE", 3.0)]}),
}


def outcome(weeks=WEEKS):
    [t] = trade_outcomes(trades_from_activity(acts(TRADE), 2026), weeks)
    return t, {s["team_id"]: s for s in t["sides"]}


def test_outcomes_count_starts_after_the_trade_for_the_new_team():
    t, by_team = outcome()
    assert by_team[1]["started_points"] == 45.0
    bravo = {p["name"]: p for p in by_team[2]["received"]}
    assert bravo["Jaxon Smith-Njigba"]["started_points"] == 40.0
    kyren = bravo["Kyren Williams"]
    assert (kyren["started_points"], kyren["bench_points"], kyren["weeks_started"]) == (9.0, 12.0, 1)
    assert by_team[2]["started_points"] == 49.0


def test_war_decides_the_winner():
    t, by_team = outcome()
    for side in by_team.values():
        assert side["war"] == pytest.approx(sum(p["war"] for p in side["received"]), abs=0.002)
    leader = max(by_team.values(), key=lambda s: s["war"])
    assert t["winner_team_id"] == leader["team_id"]
    assert t["margin"] == round(abs(by_team[1]["war"] - by_team[2]["war"]), 2)


def test_no_winner_before_anyone_plays():
    t, by_team = outcome({})
    assert t["winner_team_id"] is None and t["margin"] == 0
    assert by_team[1]["ppg"] is None and by_team[1]["games"] == 0


def test_players_who_leave_the_new_team_stop_counting():
    t, by_team = outcome({
        5: box({1: [(20, "QB", "QB", 24.0)], 2: [(10, "WR", "WR", 18.0)]}),
        6: box({1: [], 2: [(10, "WR", "WR", 22.0)]}),  # Dak gone from Alpha
    })
    assert by_team[1]["started_points"] == 24.0


def test_points_per_game_had_each_team_kept_its_players():
    t, by_team = outcome()
    # Alpha: Dak's QB slot goes to its own backup QB (JSN and Kyren can't play QB).
    assert (by_team[1]["ppg"], by_team[1]["ppg_if_kept"], by_team[1]["games"]) == (22.5, 10.5, 2)
    # Bravo: JSN's WR slot goes to its bench WR, Kyren's RB slot to nobody
    # (Dak can't play either, and benched Kyren never left a slot to fill).
    assert (by_team[2]["ppg"], by_team[2]["ppg_if_kept"], by_team[2]["games"]) == (24.5, 5.0, 2)


def test_kept_players_refill_slots_they_fit_best_first():
    lineup = {p["player_id"]: p for p in [
        entry(1, "WR", "RB/WR/TE", 9.0),  # the new player, in the flex
        entry(2, "RB", "RB", 12.0),
        entry(3, "TE", "BE", 6.0),
    ]}
    kept = [entry(9, "WR", "WR", 15.0), entry(8, "QB", "QB", 30.0)]
    assert _score_if_kept(lineup, {1}, kept) == 12.0 + 15.0  # the WR beats the bench TE; the QB can't flex
    assert _score_if_kept(lineup, {1}, []) == 12.0 + 6.0
    assert _score_if_kept(lineup, set(), kept) == 21.0  # nothing traded in: as played


def test_fits_slot():
    assert fits_slot("WR", "WR") and fits_slot("WR", "RB/WR/TE") and fits_slot("QB", "OP")
    assert fits_slot("D/ST", "D/ST")
    assert not fits_slot("QB", "RB/WR/TE") and not fits_slot("K", "OP") and not fits_slot("WR", "BE")


def test_war_baselines():
    # Four teams starting one QB each, with a backup apiece. 108 played one
    # game in two (a bye: no points, no projection), too few to be ranked.
    weeks = {
        1: box({1: [(101, "QB", "QB", 20.0), (105, "QB", "BE", 9.0)], 2: [(102, "QB", "QB", 18.0), (106, "QB", "BE", 8.0)],
                3: [(103, "QB", "QB", 15.0), (107, "QB", "BE", 5.0)], 4: [(104, "QB", "QB", 10.0), (108, "QB", "BE", 4.0)]}),
        2: box({1: [(101, "QB", "QB", 22.0), (105, "QB", "BE", 9.0)], 2: [(102, "QB", "QB", 16.0), (106, "QB", "BE", 6.0)],
                3: [(103, "QB", "QB", 15.0), (107, "QB", "BE", 5.0)], 4: [(104, "QB", "QB", 12.0), (108, "QB", "BE", 0.0, 0.0)]}),
    }
    b = war_baselines(weeks)
    assert b["average"]["QB"] == 16.0
    # The pool is the four starters; replacement is QB5-QB7 by points per game.
    assert b["replacement"]["QB"] == pytest.approx((9 + 7 + 5) / 3)
    assert b["sigma"] == pytest.approx((110 / 8) ** 0.5)  # team scores 20, 22, 18, 16, 15, 15, 10, 12
    assert start_war(b["replacement"]["QB"], "QB", b) == pytest.approx(0)
    assert start_war(16.0, "QB", b) > 0 > start_war(5.0, "QB", b)


def test_war_rewards_scarce_positions():
    baselines = {"sigma": 25.0, "average": {"TE": 9.0, "WR": 12.0}, "replacement": {"TE": 4.0, "WR": 9.0}}
    assert start_war(15.0, "TE", baselines) > start_war(15.0, "WR", baselines)
    assert start_war(15.0, "K", baselines) == 0  # nothing to measure against


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
    Base.metadata.create_all(engine, tables=[TradeRecord.__table__, TradeRecordPlayer.__table__, TradeRecordSide.__table__, TradeSync.__table__])
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
    [t] = results
    assert loaded["year"] == 2026 and loaded["winner_team_id"] == t["winner_team_id"] and loaded["margin"] == t["margin"]
    by_team = {s["team_id"]: s for s in loaded["sides"]}
    for side in t["sides"]:
        stored = by_team[side["team_id"]]
        for key in ("started_points", "war", "ppg", "ppg_if_kept", "games"):
            assert stored[key] == pytest.approx(side[key]), key
        assert [p["war"] for p in stored["received"]] == [p["war"] for p in side["received"]]
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
    expected, _ = outcome()
    assert t["week"] == 5 and t["year"] == 2026
    assert t["winner_team_id"] == expected["winner_team_id"] and t["margin"] == expected["margin"]
    espn_calls, box_calls = len(league.espn_request.calls), calls["box"]

    again = client.get("/api/leagues/1/seasons/2026/trades").json()
    assert again["trades"] == body["trades"]
    assert len(league.espn_request.calls) == espn_calls and calls["box"] == box_calls  # nothing refetched

    old = client.get("/api/leagues/1/seasons/2018/trades").json()
    assert old == {"league_id": 1, "year": 2018, "supported": False, "unavailable": False, "trades": []}


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


def test_the_week_being_played_waits_until_it_is_over(db, monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    league = fake_league([TRADE], cards=CARDS)
    league.current_week = 6  # week 6 is under way
    wire(monkeypatch, league, over=False)
    monkeypatch.setattr(main, "is_live_season", lambda year: True)

    [t] = TestClient(main.app).get("/api/leagues/1/seasons/2026/trades").json()["trades"]
    assert {s["team_id"]: s["games"] for s in t["sides"]} == {1: 1, 2: 1}


# --- Seasons the activity feed doesn't serve -------------------------------------

# The same trade and moves as the transactions view reports them.
TX_TRADE = {"id": "tx-trade", "type": "TRADE_ACCEPT", "status": "EXECUTED", "processDate": ms(2026, 10, 7), "items": [
    {"type": "TRADE", "playerId": 10, "fromTeamId": 1, "toTeamId": 2},
    {"type": "TRADE", "playerId": 11, "fromTeamId": 1, "toTeamId": 2},
    {"type": "TRADE", "playerId": 20, "fromTeamId": 2, "toTeamId": 1},
]}
TX_PROPOSAL = {**TX_TRADE, "id": "tx-proposal", "type": "TRADE_PROPOSAL", "status": "CANCELED"}
TX_WAIVER = {"id": "tx-waiver", "type": "WAIVER", "status": "EXECUTED", "bidAmount": 17, "processDate": ms(2026, 10, 14, 3),
             "items": [{"type": "ADD", "playerId": 30, "fromTeamId": 0, "toTeamId": 1},
                       {"type": "DROP", "playerId": 31, "fromTeamId": 1, "toTeamId": 0}]}
TX_FAILED = {**TX_WAIVER, "id": "tx-failed", "status": "FAILED_PLAYERALREADYDROPPED"}
TX_FA = {"id": "tx-fa", "type": "FREEAGENT", "status": "EXECUTED", "processDate": ms(2026, 10, 16),
         "items": [{"type": "ADD", "playerId": 32, "fromTeamId": 0, "toTeamId": 2}]}
TX_DROP = {"id": "tx-drop", "type": "FREEAGENT", "status": "EXECUTED", "processDate": ms(2026, 10, 17),
           "items": [{"type": "DROP", "playerId": 33, "fromTeamId": 2, "toTeamId": 0}]}
TX_LINEUP = {"id": "tx-lineup", "type": "ROSTER", "status": "EXECUTED", "processDate": ms(2026, 10, 18),
             "items": [{"type": "LINEUP", "playerId": 20, "fromTeamId": 1, "toTeamId": 1}]}


def tx_acts(*txs):
    return [a for t in txs if (a := activity_from_transaction(t, TEAMS.get, PLAYERS))]


def test_transactions_read_like_the_activity_feed():
    activities = tx_acts(TX_TRADE, TX_PROPOSAL, TX_WAIVER, TX_FAILED, TX_FA, TX_DROP, TX_LINEUP)
    assert len(activities) == 4  # the proposal, the failed claim and the lineup change aren't transactions
    assert trades_from_activity(activities, 2026) == [
        {**t, "uid": "tx:tx-trade"} for t in trades_from_activity(acts(TRADE), 2026)
    ]
    from_feed = [{k: v for k, v in m.items()} for m in moves_from_activity(acts(PICKUP, FA, DROP), 2026)]
    assert moves_from_activity(activities, 2026) == from_feed


def test_a_trade_listed_twice_counts_once():
    again = {**TRADE, "id": "trade-1b", "date": TRADE["date"] + 60_000}
    assert len(trades_from_activity(acts(TRADE, again), 2026)) == 1
    # The same players sent back the other way is a new trade.
    back = {"id": "trade-2", "date": TRADE["date"] + 86_400_000, "messages": [
        {**m, "from": m["to"], "to": m["from"]} for m in TRADE["messages"]
    ]}
    assert len(trades_from_activity(acts(TRADE, back), 2026)) == 2


class TxRequests(FakeRequests):
    """The activity feed answers with nothing (ESPN's 404, as espn_api passes
    it on); the transactions view has the season."""

    def __init__(self, transactions, **kw):
        super().__init__([], **kw)
        self.transactions, self.tx_calls = transactions, []

    def league_get(self, extend="", params=None, headers=None):
        if params and params.get("view") == "mTransactions2":
            self.tx_calls.append(params["scoringPeriodId"])
            return {"transactions": self.transactions}  # every period: deduplicated by id
        return super().league_get(extend, params, headers)


def played_league(requests_):
    league = fake_league([], cards=CARDS)
    league.espn_request = requests_
    league.finalScoringPeriod = 3
    for t in league.teams:
        t.wins, t.losses, t.ties = 5, 5, 0
    return league


def test_season_activity_falls_back_to_transactions(monkeypatch):
    from app import main

    league = played_league(TxRequests([TX_TRADE, TX_WAIVER, TX_FA], cards=CARDS))
    monkeypatch.setattr(main.cache, "get", lambda *a, **k: None)
    monkeypatch.setattr(main.cache, "put", lambda *a, **k: None)
    monkeypatch.setattr(main, "get_league", lambda *a, **k: league)
    activity = main._load_season_activity(1, 2024, None, None)
    assert activity["unavailable"] is False
    assert sorted(a["uid"] for a in activity["activities"]) == ["tx:tx-fa", "tx:tx-trade", "tx:tx-waiver"]
    assert league.espn_request.tx_calls == [1, 2, 3]
    [trade] = trades_from_activity(activity["activities"], 2024)
    assert {s["team_id"] for s in trade["sides"]} == {1, 2}


def test_a_season_espn_says_nothing_about_is_never_stored_as_final(db, monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    league = played_league(TxRequests([], cards=CARDS))
    stored = {}
    wire(monkeypatch, league)
    monkeypatch.setattr(main.cache, "put", lambda lid, year, key, payload: stored.setdefault(key, payload))
    client = TestClient(main.app)

    body = client.get("/api/leagues/1/seasons/2026/trades").json()
    assert body["trades"] == [] and body["unavailable"] is True
    assert stored[main.ACTIVITY_KEY]["activities"] == [] and stored[main.ACTIVITY_KEY]["unavailable"] is True
    assert db.get(TradeSync, (1, 2026)).final is False
    everything = client.get("/api/leagues/1/trades").json()
    assert everything["unavailable_years"] == [2026]
    assert client.get("/api/leagues/1/transactions").json()["unavailable_years"] == [2026]


def test_unavailable_activity_is_retried_after_the_next_refresh_point(monkeypatch):
    from app import main

    calls = []

    def get(lid, year, key, fresh_since=None):
        calls.append(fresh_since)
        return {"activities": [], "unavailable": True} if fresh_since is None else None

    league = played_league(TxRequests([TX_FA], cards=CARDS))
    monkeypatch.setattr(main.cache, "get", get)
    monkeypatch.setattr(main.cache, "put", lambda *a, **k: None)
    monkeypatch.setattr(main, "get_league", lambda *a, **k: league)
    activity = main._load_season_activity(1, 2020, None, None)
    assert calls[0] is None and calls[1] is not None  # the empty answer only counts until the refresh point
    assert [a["uid"] for a in activity["activities"]] == ["tx:tx-fa"]


def test_a_week_espn_wouldnt_serve_keeps_results_from_being_final(db, monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    wire(monkeypatch, fake_league([TRADE], cards=CARDS))

    def flaky(lid, year, week, *a, **k):
        if week == 6:
            raise RuntimeError("ESPN hiccup")
        if week > 6:
            raise main.WeekNotPlayedError("not yet")
        return WEEKS.get(week, {"matchups": []})

    monkeypatch.setattr(main, "_get_season_box_scores", flaky)
    TestClient(main.app).get("/api/leagues/1/seasons/2026/trades")
    assert db.get(TradeSync, (1, 2026)).final is False


def test_history_endpoint_seasons_read_the_feed_from_the_season_endpoint(monkeypatch):
    from app import main

    seen = {}

    class Response:
        status_code = 200

        def json(self):
            return {"topics": [TRADE]}

    def get(url, **kw):
        seen["url"] = url
        return Response()

    monkeypatch.setattr(main.requests, "get", get)
    req = NS(LEAGUE_ENDPOINT="https://x/apis/v3/games/ffl/leagueHistory/77?seasonId=2021", year=2021, league_id=77, cookies={})
    assert main._communication_page(NS(espn_request=req), {}) == {"topics": [TRADE]}
    assert seen["url"] == "https://x/apis/v3/games/ffl/seasons/2021/segments/0/leagues/77/communication/"


# --- Past seasons' trades, rebuilt from rosters --------------------------------------

def roster_week(rosters):
    """{team_id: [(player_id, position)]} -> a week's box scores, everyone on the bench."""
    return box({tid: [(pid, pos, "BE", 0.0) for pid, pos in players] for tid, players in rosters.items()})


# Weeks 4-6: Alpha sends JSN (10) and Kyren (11) for Dak (20) in week 5, and
# picks up Rico (30) off waivers in week 6 after Bravo dropped him.
ROSTER_WEEKS = {
    4: roster_week({1: [(10, "WR"), (11, "RB")], 2: [(20, "QB"), (30, "RB")]}),
    5: roster_week({1: [(20, "QB")], 2: [(10, "WR"), (11, "RB"), (30, "RB")]}),
    6: roster_week({1: [(20, "QB"), (30, "RB")], 2: [(10, "WR"), (11, "RB")]}),
}
TX_ACCEPT = {"id": "a", "type": "TRADE_ACCEPT", "teamId": 2, "scoringPeriodId": 5, "proposedDate": ms(2026, 10, 7),
             "executionType": "EXECUTE", "items": []}
TX_DECLINE = {"id": "d", "type": "TRADE_DECLINE", "status": "EXECUTED", "teamId": 1, "scoringPeriodId": 4, "items": []}
TX_RICO = {"id": "r", "type": "WAIVER", "status": "EXECUTED", "processDate": ms(2026, 10, 14), "bidAmount": 3,
           "items": [{"type": "ADD", "playerId": 30, "fromTeamId": 0, "toTeamId": 1}]}


def test_trade_events_are_trades_that_went_through():
    assert trade_events([TX_ACCEPT, TX_DECLINE, TX_PROPOSAL]) == [{"team_id": 2, "week": 5, "date": ms(2026, 10, 7)}]


def test_trades_rebuilt_from_rosters():
    [t] = trades_from_rosters(ROSTER_WEEKS, tx_acts(TX_RICO), trade_events([TX_ACCEPT]), TEAMS.get, 2026)
    assert t["week"] == 5 and t["date"] == ms(2026, 10, 7)  # the acceptance's time
    by_team = {s["team_id"]: s for s in t["sides"]}
    assert [p["player_id"] for p in by_team[1]["received"]] == [20]
    assert sorted(p["player_id"] for p in by_team[2]["received"]) == [10, 11]
    assert by_team[2]["owner_id"] == "o2" and by_team[1]["received"][0]["position"] == "QB"
    # Rico's move was a waiver claim, not a trade; outcomes read it like any trade.
    [outcome_] = trade_outcomes([t], WEEKS)
    assert {s["team_id"] for s in outcome_["sides"]} == {1, 2}


def test_a_rebuilt_trade_without_an_acceptance_dates_from_its_week():
    [t] = trades_from_rosters(ROSTER_WEEKS, tx_acts(TX_RICO), [], TEAMS.get, 2026)
    assert week_of(t["date"], 2026) == 5


def test_past_season_trades_come_from_rosters_end_to_end(db, monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    league = played_league(TxRequests([TX_ACCEPT, TX_RICO], cards=CARDS))
    wire(monkeypatch, league)

    def box_scores(lid, year, week, *a, **k):
        if week > max(ROSTER_WEEKS):
            raise main.WeekNotPlayedError("not yet")
        return ROSTER_WEEKS.get(week, {"matchups": []})

    monkeypatch.setattr(main, "_get_season_box_scores", box_scores)
    monkeypatch.setattr(main, "_get_season_teams", lambda *a, **k: {"teams": [
        {"team_id": tid, "team_name": t["team_name"], "final_standing": 1,
         "owners": [{"id": t["owner_id"], "first_name": "O", "last_name": t["owner_id"]}]}
        for tid, t in TEAMS.items()
    ]})
    body = TestClient(main.app).get("/api/leagues/1/seasons/2026/trades").json()
    assert body["unavailable"] is False
    [t] = body["trades"]
    assert t["week"] == 5 and {s["team_name"] for s in t["sides"]} == {"Alpha", "Bravo"}
    assert db.get(TradeSync, (1, 2026)).final is True


def test_past_season_trades_come_from_rosters_even_when_the_viewer_traded(db, monkeypatch):
    """The transactions view lists a past trade's players only to a member
    who was in it. That trade mustn't stop everyone else's from being found."""
    from fastapi.testclient import TestClient

    from app import main

    # The viewer's own trade (week 5), as ESPN lists it to them...
    own = {**TX_TRADE, "type": "TRADE_PROPOSAL", "status": "EXECUTED", "scoringPeriodId": 5}
    # ...and a later one they can only see in the rosters: Bravo sends JSN
    # back for Rico in week 7.
    weeks = {
        **ROSTER_WEEKS,
        7: roster_week({1: [(20, "QB"), (10, "WR")], 2: [(11, "RB"), (30, "RB")]}),
    }
    league = played_league(TxRequests([own, TX_ACCEPT, TX_RICO], cards=CARDS))
    wire(monkeypatch, league)

    def box_scores(lid, year, week, *a, **k):
        if week > max(weeks):
            raise main.WeekNotPlayedError("not yet")
        return weeks.get(week, {"matchups": []})

    monkeypatch.setattr(main, "_get_season_box_scores", box_scores)
    monkeypatch.setattr(main, "_get_season_teams", lambda *a, **k: {"teams": [
        {"team_id": tid, "team_name": t["team_name"], "final_standing": 1,
         "owners": [{"id": t["owner_id"], "first_name": "O", "last_name": t["owner_id"]}]}
        for tid, t in TEAMS.items()
    ]})
    trades = TestClient(main.app).get("/api/leagues/1/seasons/2026/trades").json()["trades"]
    assert [t["week"] for t in trades] == [5, 7]
    later = {s["team_id"]: [p["player_id"] for p in s["received"]] for s in trades[1]["sides"]}
    assert later == {1: [10], 2: [30]}


def test_an_executed_proposal_dates_its_trade():
    own = {**TX_TRADE, "type": "TRADE_PROPOSAL", "status": "EXECUTED", "teamId": 1, "scoringPeriodId": 5}
    assert trade_events([own, TX_PROPOSAL]) == [{"team_id": 1, "week": 5, "date": TX_TRADE["processDate"]}]


def test_a_season_saved_twice_at_once_keeps_one_copy(db):
    from app import trade_store

    results = trade_outcomes(trades_from_activity(acts(TRADE), 2026), WEEKS)
    other = sessionmaker(bind=db.get_bind())()
    # The other request has read "nothing stored yet" and added its rows...
    trade_store.save(other, 1, 2026, results, final=True)
    # ...while this one, which read the same, commits second.
    db.add(TradeSync(espn_league_id=1, season=2026, computed_at=datetime(2026, 1, 1), final=True))
    trade_store.save(db, 1, 2026, results, final=True)  # no IntegrityError
    assert len(trade_store.load(db, 1, [2026])) == 1
