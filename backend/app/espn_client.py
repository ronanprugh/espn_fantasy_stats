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


def serialize_teams(league: League) -> list[dict]:
    return [
        {
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
            "points_for": t.points_for,
            "points_against": t.points_against,
            "final_standing": t.final_standing,
            "standing": t.standing,
            "scores": list(t.scores),
        }
        for t in league.teams
    ]
