"""SQLAlchemy ORM models: the database schema.

Per-user tables: `users`, `leagues` (a user's link to an ESPN league, with
encrypted cookies), `invite_codes` and `api_tokens`.

Per-ESPN-league tables, shared by every user who added the league: `cache`
(raw ESPN payloads), `power_ranking_posts`/`power_ranking_entries`, and the
stored trade results `trade_records`, `trade_record_sides`,
`trade_record_players` and `trade_syncs`.

Changing a model needs an Alembic migration in `backend/alembic/versions/`
(see backend/README.md).
"""

import datetime as dt
from typing import Any

from sqlalchemy import BigInteger, Boolean, Float, ForeignKey, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(server_default=func.now(), nullable=False)

    leagues: Mapped[list["League"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    invite_codes: Mapped[list["InviteCode"]] = relationship(
        back_populates="created_by_user", cascade="all, delete-orphan"
    )
    api_tokens: Mapped[list["ApiToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class League(Base):
    __tablename__ = "leagues"
    __table_args__ = (UniqueConstraint("user_id", "espn_league_id", name="uq_user_league"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    espn_league_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # NULL for public leagues (no auth cookies needed)
    espn_s2_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    swid_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    favorite_owner_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="leagues")


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[dt.datetime] = mapped_column(nullable=False)
    max_uses: Mapped[int] = mapped_column(nullable=False)
    use_count: Mapped[int] = mapped_column(server_default="0", nullable=False)
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(server_default=func.now(), nullable=False)

    created_by_user: Mapped["User"] = relationship(back_populates="invite_codes")


class ApiToken(Base):
    """A personal API token: read-only access to the owner's data without a
    browser session, for scripts and assistants.

    Only a SHA-256 of the token is stored. Tokens are 256 random bits, so a
    fast hash is enough (no salt or bcrypt needed), and it lets a request's
    token be looked up directly. `prefix` is the token's first characters,
    kept so the Account page can tell tokens apart.
    """
    __tablename__ = "api_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(server_default=func.now(), nullable=False)
    last_used_at: Mapped[dt.datetime | None] = mapped_column(nullable=True)

    user: Mapped["User"] = relationship(back_populates="api_tokens")


class TradeRecord(Base):
    """A trade's calculated result: which team won and by how much, from what
    each side's new players scored for it (app/trades.py). The raw league
    activity it comes from stays in Cache; this keeps the calculation, so the
    Transactions page doesn't rebuild it from every week's box scores.

    Keyed on the ESPN league id, like Cache, so everyone who has added the
    league shares the rows.
    """
    __tablename__ = "trade_records"
    __table_args__ = (UniqueConstraint("espn_league_id", "season", "uid", name="uq_trade_record"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    espn_league_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    season: Mapped[int] = mapped_column(nullable=False)
    # ESPN's activity id for the trade.
    uid: Mapped[str] = mapped_column(String(96), nullable=False)
    # Milliseconds since the epoch, as ESPN reports it.
    occurred_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    week: Mapped[int] = mapped_column(nullable=False)
    winner_team_id: Mapped[int | None] = mapped_column(nullable=True)
    # The winner's lead in WAR (wins).
    margin: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")

    players: Mapped[list["TradeRecordPlayer"]] = relationship(
        back_populates="trade", cascade="all, delete-orphan", order_by="TradeRecordPlayer.id"
    )
    sides: Mapped[list["TradeRecordSide"]] = relationship(
        back_populates="trade", cascade="all, delete-orphan", order_by="TradeRecordSide.id"
    )


class TradeRecordSide(Base):
    """One team's side of a trade: its new players' WAR, and its points per
    game since the trade, as it played and had it kept the players it sent."""
    __tablename__ = "trade_record_sides"

    id: Mapped[int] = mapped_column(primary_key=True)
    trade_id: Mapped[int] = mapped_column(
        ForeignKey("trade_records.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id: Mapped[int] = mapped_column(nullable=False)
    war: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    ppg: Mapped[float | None] = mapped_column(Float, nullable=True)
    ppg_if_kept: Mapped[float | None] = mapped_column(Float, nullable=True)
    games: Mapped[int] = mapped_column(nullable=False, server_default="0")

    trade: Mapped["TradeRecord"] = relationship(back_populates="sides")


class TradeRecordPlayer(Base):
    """One player in a trade, from one team's side, with what he scored for
    the team that received him from the trade's week on."""
    __tablename__ = "trade_record_players"

    id: Mapped[int] = mapped_column(primary_key=True)
    trade_id: Mapped[int] = mapped_column(
        ForeignKey("trade_records.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id: Mapped[int] = mapped_column(nullable=False)
    team_name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False)
    owner_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # "received" or "sent", from this team's side.
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    player_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    player_name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[str] = mapped_column(String(16), nullable=False, server_default="")
    # Received players only.
    started_points: Mapped[float | None] = mapped_column(Float, nullable=True)
    bench_points: Mapped[float | None] = mapped_column(Float, nullable=True)
    weeks_started: Mapped[int | None] = mapped_column(nullable=True)
    war: Mapped[float | None] = mapped_column(Float, nullable=True)

    trade: Mapped["TradeRecord"] = relationship(back_populates="players")


class TradeSync(Base):
    """When a league season's trade results were last calculated. Results
    calculated after the season was over (`final`) are kept for good; a season
    in progress is recalculated after each refresh point."""
    __tablename__ = "trade_syncs"

    espn_league_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    season: Mapped[int] = mapped_column(primary_key=True)
    computed_at: Mapped[dt.datetime] = mapped_column(nullable=False)
    final: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)


class Cache(Base):
    """Shared cache for ESPN responses. Keyed on the ESPN league_id so multiple
    users adding the same league share the cached data (it's the same upstream)."""
    __tablename__ = "cache"

    league_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    year: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[Any] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(server_default=func.now(), nullable=False)


class PowerRankingPost(Base):
    """One post from a league's power rankings history: a week's rankings, a
    tier-list image, or a playoff preview.

    Keyed on the ESPN league_id, like Cache, so everyone who has added the
    league sees the same history. `week` is the week the post looks ahead to,
    so preseason rankings are week 1 and rankings written after Week 3's games
    are week 4.
    """
    __tablename__ = "power_ranking_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    espn_league_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    season: Mapped[int] = mapped_column(nullable=False)
    week: Mapped[int] = mapped_column(nullable=False)
    posted_at: Mapped[dt.datetime] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    author: Mapped[str] = mapped_column(String(128), nullable=False)
    # "rankings" or "preview"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # "text" or "image"
    format: Mapped[str] = mapped_column(String(16), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    image: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    image_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    imported_at: Mapped[dt.datetime] = mapped_column(server_default=func.now(), nullable=False)

    entries: Mapped[list["PowerRankingEntry"]] = relationship(
        back_populates="post", cascade="all, delete-orphan", order_by="PowerRankingEntry.rank"
    )


class PowerRankingEntry(Base):
    """One team's line in a rankings post."""
    __tablename__ = "power_ranking_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("power_ranking_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rank: Mapped[int] = mapped_column(nullable=False)
    espn_team_id: Mapped[int] = mapped_column(nullable=False)
    # The name as the author wrote it ("Skins", "TFZ"), kept for display.
    written_name: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    record: Mapped[str | None] = mapped_column(String(16), nullable=True)
    change: Mapped[str | None] = mapped_column(String(16), nullable=True)
    blurb: Mapped[str] = mapped_column(Text, nullable=False, server_default="")

    post: Mapped["PowerRankingPost"] = relationship(back_populates="entries")
