"""Admin CLI for managing users and leagues.

Usage (from backend/ with venv active):
    python -m app.admin create-user --username ronan
    python -m app.admin add-league --username ronan --league-id 1375368 --name "Payton"
    python -m app.admin reset-password --username ronan
    python -m app.admin list-users
    python -m app.admin seed-from-env --username ronan
"""
import argparse
import sys
from getpass import getpass

from .auth import hash_password
from .config import SEED_ESPN_S2, SEED_LEAGUE_ID, SEED_SWID
from .crypto import encrypt
from .database import SessionLocal
from .models import League, User


def _read_password(provided: str | None) -> str:
    if provided:
        return provided
    pw = getpass("Password: ")
    confirm = getpass("Confirm:  ")
    if pw != confirm:
        sys.exit("Passwords do not match")
    return pw


def create_user(args):
    password = _read_password(args.password)
    with SessionLocal() as db:
        if db.query(User).filter(User.username == args.username).first():
            sys.exit(f"User '{args.username}' already exists")
        user = User(username=args.username, password_hash=hash_password(password))
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Created user '{args.username}' (id={user.id})")


def add_league(args):
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == args.username).first()
        if not user:
            sys.exit(f"User '{args.username}' not found")
        existing = (
            db.query(League)
            .filter(League.user_id == user.id, League.espn_league_id == args.league_id)
            .first()
        )
        if existing:
            sys.exit(f"User '{args.username}' already has league {args.league_id}")
        league = League(
            user_id=user.id,
            espn_league_id=args.league_id,
            display_name=args.name,
            espn_s2_encrypted=encrypt(args.espn_s2),
            swid_encrypted=encrypt(args.swid),
        )
        db.add(league)
        db.commit()
        print(
            f"Added league {args.league_id} ('{args.name}') to user '{args.username}'"
        )


def reset_password(args):
    password = _read_password(args.password)
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == args.username).first()
        if not user:
            sys.exit(f"User '{args.username}' not found")
        user.password_hash = hash_password(password)
        db.commit()
        print(f"Updated password for '{args.username}'")


def list_users(_args):
    with SessionLocal() as db:
        users = db.query(User).order_by(User.id).all()
        if not users:
            print("(no users)")
            return
        for u in users:
            league_count = (
                db.query(League).filter(League.user_id == u.id).count()
            )
            print(f"  {u.id}\t{u.username}\t{league_count} leagues\t{u.created_at}")


def seed_from_env(args):
    """One-shot bootstrap: create the named user + add the league in .env."""
    if not SEED_LEAGUE_ID:
        sys.exit("LEAGUE_ID is not set in .env")
    password = _read_password(args.password)
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == args.username).first()
        if user:
            print(f"User '{args.username}' already exists, skipping create")
        else:
            user = User(username=args.username, password_hash=hash_password(password))
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created user '{args.username}'")
        existing = (
            db.query(League)
            .filter(
                League.user_id == user.id,
                League.espn_league_id == int(SEED_LEAGUE_ID),
            )
            .first()
        )
        if existing:
            print(f"League {SEED_LEAGUE_ID} already attached, skipping")
        else:
            league = League(
                user_id=user.id,
                espn_league_id=int(SEED_LEAGUE_ID),
                display_name=args.name or f"League {SEED_LEAGUE_ID}",
                espn_s2_encrypted=encrypt(SEED_ESPN_S2),
                swid_encrypted=encrypt(SEED_SWID),
            )
            db.add(league)
            db.commit()
            print(f"Attached league {SEED_LEAGUE_ID} to '{args.username}'")


def main():
    parser = argparse.ArgumentParser(description="espn_fantasy_stats admin CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    cu = sub.add_parser("create-user")
    cu.add_argument("--username", required=True)
    cu.add_argument("--password", default=None, help="If omitted, prompted")
    cu.set_defaults(func=create_user)

    al = sub.add_parser("add-league")
    al.add_argument("--username", required=True)
    al.add_argument("--league-id", type=int, required=True)
    al.add_argument("--name", required=True)
    al.add_argument("--espn-s2", default=None)
    al.add_argument("--swid", default=None)
    al.set_defaults(func=add_league)

    rp = sub.add_parser("reset-password")
    rp.add_argument("--username", required=True)
    rp.add_argument("--password", default=None, help="If omitted, prompted")
    rp.set_defaults(func=reset_password)

    lu = sub.add_parser("list-users")
    lu.set_defaults(func=list_users)

    sd = sub.add_parser("seed-from-env")
    sd.add_argument("--username", required=True)
    sd.add_argument("--password", default=None)
    sd.add_argument("--name", default=None, help="Display name for the seeded league")
    sd.set_defaults(func=seed_from_env)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
