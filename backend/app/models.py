import datetime as dt
from typing import Any

from sqlalchemy import BigInteger, Boolean, ForeignKey, LargeBinary, String, Text, UniqueConstraint, func
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
