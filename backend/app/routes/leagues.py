"""The signed-in user's leagues (`/api/me/leagues`): add one (ESPN must
confirm access first), rename it, replace its cookies, set their team, or
remove it.
"""


from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import (
    current_user,
)
from ..crypto import decrypt, encrypt
from ..database import get_db
from ..deps import _require_league_access
from ..models import League as LeagueModel
from ..models import User
from ..schemas import (
    CreateLeagueRequest,
    LeagueSummary,
    UpdateLeagueRequest,
)

router = APIRouter()


@router.get("/api/me/leagues", response_model=list[LeagueSummary])
def list_my_leagues(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The leagues the user has added."""
    rows = (
        db.query(LeagueModel)
        .filter(LeagueModel.user_id == user.id)
        .order_by(LeagueModel.id)
        .all()
    )
    return [
        LeagueSummary(
            id=r.id,
            espn_league_id=r.espn_league_id,
            display_name=r.display_name,
            favorite_owner_id=r.favorite_owner_id,
        )
        for r in rows
    ]


@router.post("/api/me/leagues", response_model=LeagueSummary)
def add_my_league(
    payload: CreateLeagueRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Add an ESPN league to the user's account. Cookies are optional (public
    leagues need none) and are encrypted before they are stored. ESPN must
    confirm the cookies can read the league first: its data is cached and
    shared by league id, so a row is what grants access to it."""
    existing = (
        db.query(LeagueModel)
        .filter(
            LeagueModel.user_id == user.id,
            LeagueModel.espn_league_id == payload.espn_league_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="League already added")
    verified_at = _require_league_access(payload.espn_league_id, payload.espn_s2 or None, payload.swid or None)
    row = LeagueModel(
        user_id=user.id,
        espn_league_id=payload.espn_league_id,
        display_name=payload.display_name,
        espn_s2_encrypted=encrypt(payload.espn_s2),
        swid_encrypted=encrypt(payload.swid),
        access_verified_at=verified_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return LeagueSummary(
        id=row.id,
        espn_league_id=row.espn_league_id,
        display_name=row.display_name,
        favorite_owner_id=row.favorite_owner_id,
    )


@router.patch("/api/me/leagues/{league_row_id}", response_model=LeagueSummary)
def update_my_league(
    league_row_id: int,
    payload: UpdateLeagueRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Rename a league, replace or clear its cookies (an empty string clears),
    or set or clear the user's own team (`favorite_owner_id`). New cookies
    must pass the same ESPN access check as adding the league."""
    row = (
        db.query(LeagueModel)
        .filter(LeagueModel.id == league_row_id, LeagueModel.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="League not found")
    if payload.display_name is not None:
        row.display_name = payload.display_name
    if payload.espn_s2 is not None or payload.swid is not None:
        espn_s2 = payload.espn_s2 if payload.espn_s2 is not None else decrypt(row.espn_s2_encrypted)
        swid = payload.swid if payload.swid is not None else decrypt(row.swid_encrypted)
        row.access_verified_at = _require_league_access(row.espn_league_id, espn_s2 or None, swid or None)
        row.espn_s2_encrypted = encrypt(espn_s2) if espn_s2 else None
        row.swid_encrypted = encrypt(swid) if swid else None
    if payload.clear_favorite:
        row.favorite_owner_id = None
    elif payload.favorite_owner_id is not None:
        row.favorite_owner_id = payload.favorite_owner_id
    db.commit()
    db.refresh(row)
    return LeagueSummary(
        id=row.id,
        espn_league_id=row.espn_league_id,
        display_name=row.display_name,
        favorite_owner_id=row.favorite_owner_id,
    )


@router.delete("/api/me/leagues/{league_row_id}")
def delete_my_league(
    league_row_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Remove a league from the user's account. Its shared cache stays."""
    row = (
        db.query(LeagueModel)
        .filter(LeagueModel.id == league_row_id, LeagueModel.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="League not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
