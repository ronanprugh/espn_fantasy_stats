import datetime as dt

from app import power_rankings as pr
from app.models import PowerRankingEntry, PowerRankingPost


def _teams(n=4):
    return [
        {"team_id": i, "team_name": f"Team {i}", "abbrev": f"T{i}",
         "owners": [{"id": f"o{i}", "first_name": "Owner", "last_name": str(i)}]}
        for i in range(1, n + 1)
    ]


def _post(week, order, author="Commish", pid=None, kind="rankings", day=0):
    p = PowerRankingPost(
        id=pid or week * 10, season=2024, week=week, title=f"Week {week}", author=author,
        kind=kind, format="text", body="", posted_at=dt.datetime(2024, 9, 1) + dt.timedelta(days=7 * week + day),
    )
    p.entries = [
        PowerRankingEntry(rank=r, espn_team_id=t, written_name=f"T{t}", blurb=f"blurb {t}")
        for r, t in enumerate(order, 1)
    ]
    return p


def _games(weeks, reg=6):
    """Team 1 beats 2 and 3 beats 4, every week; then two playoff weeks."""
    out = []
    for w in range(1, reg + 3):
        for a, b in ((1, 2), (3, 4)):
            played = w <= weeks
            out.append({
                "week": w, "is_playoff": w > reg, "team_a_id": a, "team_b_id": b,
                "team_a_score": 100.0 if played else 0.0, "team_b_score": 90.0 if played else 0.0,
                "winner_id": a if played else None,
            })
    return out


def test_gaps_carry_forward_and_marked():
    season = pr.build_season(2024, [_post(1, [1, 2, 3, 4]), _post(3, [4, 3, 2, 1])],
                             _teams(), _games(6), "Commish", live=False)
    sources = [(w["week"], w["source"], w["source_week"]) for w in season["weeks"]]
    assert sources[:4] == [(1, "posted", 1), (2, "carried_forward", 1), (3, "posted", 3), (4, "carried_forward", 3)]
    assert len(season["weeks"]) == 6  # regular season only
    wk2 = season["weeks"][1]
    assert [e["rank"] for e in wk2["entries"]] == [1, 2, 3, 4]
    assert wk2["post_id"] is None
    # A carried week never shows the earlier week's write-up as its own.
    assert all(e["blurb"] == "" for e in wk2["entries"])
    # Records are the real ones entering the week, not copied from the post.
    assert wk2["entries"][0]["record"] == "1-0"


def test_season_start_backfills_from_first_rankings():
    season = pr.build_season(2024, [_post(3, [2, 1, 4, 3])], _teams(), _games(6), "Commish", live=False)
    first = season["weeks"][0]
    assert first["source"] == "carried_back" and first["source_week"] == 3
    assert [e["team_id"] for e in first["entries"]] == [2, 1, 4, 3]


def test_change_is_measured_against_previous_week():
    season = pr.build_season(2024, [_post(1, [1, 2, 3, 4]), _post(2, [4, 3, 2, 1])],
                             _teams(), _games(6), "Commish", live=False)
    wk2 = {e["team_id"]: e for e in season["weeks"][1]["entries"]}
    assert season["weeks"][0]["entries"][0]["change"] is None
    assert wk2[4]["change"] == 3 and wk2[1]["change"] == -3


def test_live_season_stops_at_the_week_about_to_be_played():
    season = pr.build_season(2024, [_post(1, [1, 2, 3, 4])], _teams(), _games(3), "Commish", live=True)
    assert season["last_week"] == 4
    assert season["weeks"][-1]["games"] == []
    assert len(season["weeks"][0]["games"]) == 2


def test_regular_writer_beats_guest_in_the_same_week():
    regular = _post(2, [1, 2, 3, 4], pid=21)
    guest = _post(2, [4, 3, 2, 1], author="Guest", pid=22, day=1)
    season = pr.build_season(2024, [_post(1, [1, 2, 3, 4]), regular, guest], _teams(), _games(6), "Commish", live=False)
    wk2 = season["weeks"][1]
    assert wk2["post_id"] == 21 and wk2["extra_post_ids"] == [22]


def test_guest_rankings_count_when_theyre_the_only_ones():
    guest = _post(2, [4, 3, 2, 1], author="Guest", pid=22)
    season = pr.build_season(2024, [_post(1, [1, 2, 3, 4]), guest], _teams(), _games(6), "Commish", live=False)
    assert season["weeks"][1]["post_id"] == 22


def test_no_ranked_posts_means_no_season():
    tiers = _post(1, [], kind="rankings")
    assert pr.build_season(2024, [tiers], _teams(), _games(6), "Commish", live=False) is None


def test_standings_use_win_pct_then_points():
    season = pr.build_season(2024, [_post(1, [1, 2, 3, 4])], _teams(), _games(6), "Commish", live=False)
    wk3 = {e["team_id"]: e["standing"] for e in season["weeks"][2]["entries"]}
    assert season["weeks"][0]["entries"][0]["standing"] is None
    assert {wk3[1], wk3[3]} == {1, 2} and {wk3[2], wk3[4]} == {3, 4}


def test_name_index_resolves_old_names_and_nicknames():
    seasons = {
        2020: [{"team_id": 13, "team_name": "THE FALLEN ANGELS", "abbrev": "FA"}],
        2024: [{"team_id": 13, "team_name": "The BoLitos", "abbrev": "BOLI"}],
    }
    index = pr.team_name_index(seasons)
    assert index[2024][pr._norm_name("Fallen Angels")] == 13
    assert index[2020][pr._norm_name("bolitos")] == 13
    assert index[2024][pr._norm_name("BOLI")] == 13
