"""A league's power rankings: the archive with every week laid out, single
posts and their images, importing an archive and deleting it.
"""


from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session, selectinload

from .. import loaders
from .. import power_rankings as pr
from ..database import get_db
from ..deps import LeagueContext, get_user_league
from ..errors import espn_failure
from ..models import PowerRankingPost
from ..schemas import (
    PowerRankingImport,
    PowerRankingImportResult,
    PowerRankings,
)
from ..schemas import (
    PowerRankingPost as PowerRankingPostSchema,
)

router = APIRouter()


def _league_posts(db: Session, espn_league_id: int) -> list[PowerRankingPost]:
    """The league's archive, or nothing if the tables aren't there yet.

    Render deploys and the migrate workflow run side by side, so new code can
    briefly run before its migration has been applied (or before anyone has
    set the workflow up). Every other page should keep working in that
    window, and this one should show its empty state rather than an error.
    """
    try:
        return (
            db.query(PowerRankingPost)
            .options(selectinload(PowerRankingPost.entries))
            .filter(PowerRankingPost.espn_league_id == espn_league_id)
            .order_by(PowerRankingPost.posted_at)
            .all()
        )
    except ProgrammingError:
        db.rollback()
        return []


@router.get("/api/leagues/{league_id}/power_rankings", response_model=PowerRankings)
def power_rankings(
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """The league's power rankings: every post's summary and, per season, every
    regular-season week's ranks with gaps filled (see power_rankings.py)."""
    posts = _league_posts(db, ctx.espn_league_id)
    author = pr.primary_author(posts)
    seasons = []
    for season in sorted({p.season for p in posts}):
        try:
            teams_payload = loaders._get_season_teams(ctx.espn_league_id, season, ctx.espn_s2, ctx.swid, refresh)
            matchups = loaders._get_season_matchups(ctx.espn_league_id, season, ctx.espn_s2, ctx.swid, refresh)
        except Exception as e:
            raise espn_failure(e, f"season {season}") from e
        built = pr.build_season(
            season,
            [p for p in posts if p.season == season],
            teams_payload["teams"],
            matchups,
            author,
            loaders.is_live_season(season),
        )
        if built:
            seasons.append(built)
    return {
        "league_id": ctx.espn_league_id,
        "primary_author": author,
        "posts": [pr.post_summary(p, author) for p in posts],
        "seasons": seasons,
    }


def _league_post(db: Session, espn_league_id: int, post_id: int) -> PowerRankingPost:
    post = next((p for p in _league_posts(db, espn_league_id) if p.id == post_id), None)
    if post is None:
        raise HTTPException(status_code=404, detail="That post isn't in this league's power rankings.")
    return post


@router.get(
    "/api/leagues/{league_id}/power_rankings/posts/{post_id}",
    response_model=PowerRankingPostSchema,
)
def power_ranking_post(
    post_id: int,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """One power rankings post in full, with its text."""
    posts = _league_posts(db, ctx.espn_league_id)
    post = next((p for p in posts if p.id == post_id), None)
    if post is None:
        raise HTTPException(status_code=404, detail="That post isn't in this league's power rankings.")
    return {**pr.post_summary(post, pr.primary_author(posts)), "text": post.body}


@router.get("/api/leagues/{league_id}/power_rankings/posts/{post_id}/image")
def power_ranking_image(
    post_id: int,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """The saved image for an image post (a tier list, say)."""
    post = _league_post(db, ctx.espn_league_id, post_id)
    # The type comes from the bytes, not the stored label, so nothing but a
    # real image is ever served from this origin (imports before the check
    # existed included).
    mime = pr.image_type(post.image)
    if mime is None:
        raise HTTPException(status_code=404, detail="That post has no saved image.")
    return Response(
        content=post.image,
        media_type=mime,
        headers={
            "Cache-Control": "private, max-age=86400",
            "Content-Disposition": "inline",
            # An image needs none of this; if a browser ever did render it as
            # a document, it gets no scripts, no requests and no same-origin.
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@router.post(
    "/api/leagues/{league_id}/power_rankings/import",
    response_model=PowerRankingImportResult,
)
def import_power_rankings(
    payload: PowerRankingImport,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """Replace the league's power rankings with an uploaded archive.

    Any member of the league can import. The archive is shared by everyone who
    has added the league, the same way its ESPN data is.
    """
    if not payload.posts:
        raise HTTPException(status_code=400, detail="The file has no posts in it.")
    try:
        available = set(loaders.discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid))
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    seasons_teams = {}
    for season in sorted({p.season for p in payload.posts}):
        if season not in available:
            raise HTTPException(
                status_code=400, detail=f"The file has posts for {season}, which this league didn't play."
            )
        try:
            seasons_teams[season] = loaders._get_season_teams(
                ctx.espn_league_id, season, ctx.espn_s2, ctx.swid
            )["teams"]
        except Exception as e:
            raise espn_failure(e, f"season {season}") from e
    try:
        return pr.store_import(
            db, ctx.espn_league_id, [p.model_dump() for p in payload.posts], seasons_teams
        )
    except pr.ImportError_ as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except ProgrammingError:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Power rankings aren't set up on the server yet. Try again after the next update.",
        )


@router.delete("/api/leagues/{league_id}/power_rankings")
def delete_power_rankings(
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """Delete the league's whole power rankings archive, for everyone who has
    added the league."""
    for post in _league_posts(db, ctx.espn_league_id):
        db.delete(post)
    db.commit()
    return {"ok": True}
