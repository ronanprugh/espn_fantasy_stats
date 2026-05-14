from cryptography.fernet import Fernet

from .config import ENCRYPTION_KEY

_fernet = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)


def encrypt(value: str | None) -> bytes | None:
    if value is None or value == "":
        return None
    return _fernet.encrypt(value.encode())


def decrypt(value: bytes | None) -> str | None:
    if value is None:
        return None
    return _fernet.decrypt(value).decode()
