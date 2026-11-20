"""Encryption at rest for the ESPN cookies (`espn_s2`, `SWID`) stored per league.

Uses Fernet (AES-128-CBC with an HMAC) keyed by ENCRYPTION_KEY. Losing or
rotating that key makes every stored cookie unreadable; `decrypt` then returns
None and the league acts as public until its owner re-enters the cookies.
"""

from cryptography.fernet import Fernet, InvalidToken

from .config import ENCRYPTION_KEY

_fernet = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)


def encrypt(value: str | None) -> bytes | None:
    """Encrypt a cookie for storage. Empty or missing values store as None
    (a public league needs no cookies)."""
    if value is None or value == "":
        return None
    return _fernet.encrypt(value.encode())


def decrypt(value: bytes | None) -> str | None:
    """Decrypt a Fernet token. Returns None for null or undecryptable values
    (e.g. after rotating ENCRYPTION_KEY), so the app stays usable and the
    affected league entry can be re-credentialed via the UI."""
    if value is None:
        return None
    try:
        return _fernet.decrypt(value).decode()
    except InvalidToken:
        return None
