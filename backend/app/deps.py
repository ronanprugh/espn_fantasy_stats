"""The dependency every `/api/leagues/{league_id}/...` endpoint takes:
`get_user_league` checks the user has added that ESPN league, and that ESPN
has confirmed their cookies can read it, and decrypts the cookies into a
`LeagueContext`.
"""

import datetime as dt
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from .auth import (
    current_user,
)
from .crypto import decrypt
from .database import get_db
from .espn_client import (
    LeagueAccess,
    check_league_access,
)
from .models import League as LeagueModel
from .models import User


def _require_league_access(espn_league_id: int, espn_s2: str | None, swid: str | None) -> dt.datetime:
    """Check with ESPN that these cookies can read the league; the time of the
    check, or an HTTPException saying why not."""
    try:
        access = check_league_access(espn_league_id, espn_s2, swid)
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Couldn't reach ESPN to check access to this league. Try again in a minute.",
        )
    if access == LeagueAccess.DENIED:
        raise HTTPException(
            status_code=403,
            detail="ESPN didn't let these cookies read this league. For a private league, copy espn_s2 "
            "and SWID from a browser signed in to ESPN as a member of the league.",
        )
    if access == LeagueAccess.NOT_FOUND:
        raise HTTPException(status_code=404, detail="ESPN has no league with that ID in recent seasons.")
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


@dataclass
class LeagueContext:
    """A league the current user has added, with its ESPN cookies decrypted
    (None for a public league, or one whose cookies no longer decrypt)."""

    espn_league_id: int
    espn_s2: str | None
    swid: str | None
    display_name: str


def get_user_league(
    league_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LeagueContext:
    """Dependency for every `/api/leagues/{league_id}/...` endpoint: 404s unless
    the current user has added that ESPN league, and 403s unless ESPN has
    confirmed the user's cookies can read it. Leagues added before that check
    existed are checked here, once, on first use."""
    row = (
        db.query(LeagueModel)
        .filter(
            LeagueModel.user_id == user.id,
            LeagueModel.espn_league_id == league_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=404, detail="League not in your account"
        )
    espn_s2, swid = decrypt(row.espn_s2_encrypted), decrypt(row.swid_encrypted)
    if row.access_verified_at is None:
        row.access_verified_at = _require_league_access(row.espn_league_id, espn_s2, swid)
        db.commit()
    return LeagueContext(
        espn_league_id=row.espn_league_id,
        espn_s2=espn_s2,
        swid=swid,
        display_name=row.display_name,
    )
