from cryptography.fernet import Fernet, InvalidToken

from .config import ENCRYPTION_KEY

_fernet = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)


def encrypt(value: str | None) -> bytes | None:
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
