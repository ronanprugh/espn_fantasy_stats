from espn_api.football import League

from .config import ESPN_S2, SWID

_leagues: dict[tuple[int, int], League] = {}


def get_league(league_id: int, year: int) -> League:
    key = (league_id, year)
    if key not in _leagues:
        _leagues[key] = League(
            league_id=league_id,
            year=year,
            espn_s2=ESPN_S2,
            swid=SWID,
        )
    return _leagues[key]


def _playoff_record(team, reg_season_count: int, playoff_team_count: int) -> tuple[int, int]:
    """Single-elimination playoff record. Stops counting after first loss."""
    if team.standing > playoff_team_count:
        return (0, 0)
    wins = losses = 0
    for week_num, outcome in enumerate(team.outcomes):
        if week_num + 1 <= reg_season_count:
            continue
        if outcome == "W":
            wins += 1
        elif outcome == "L":
            losses += 1
            break
    return (wins, losses)


def serialize_teams(league: League) -> list[dict]:
    reg_count = league.settings.reg_season_count
    playoff_count = league.settings.playoff_team_count

    result = []
    for t in league.teams:
        playoff_w, playoff_l = _playoff_record(t, reg_count, playoff_count)
        avg_pf = t.points_for / reg_count if reg_count else 0.0
        avg_pa = t.points_against / reg_count if reg_count else 0.0
        result.append({
            "team_id": t.team_id,
            "team_name": t.team_name,
            "abbrev": t.team_abbrev,
            "owners": [
                {
                    "id": o.get("id", ""),
                    "first_name": o.get("firstName", ""),
                    "last_name": o.get("lastName", ""),
                }
                for o in t.owners
            ],
            "wins": t.wins,
            "losses": t.losses,
            "ties": t.ties,
            "playoff_wins": playoff_w,
            "playoff_losses": playoff_l,
            "points_for": t.points_for,
            "points_against": t.points_against,
            "avg_points_for": round(avg_pf, 2),
            "avg_points_against": round(avg_pa, 2),
            "avg_plus_minus": round(avg_pf - avg_pa, 2),
            "final_standing": t.final_standing,
            "standing": t.standing,
            "scores": list(t.scores),
        })
    return result
