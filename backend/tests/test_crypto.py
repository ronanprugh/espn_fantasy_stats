"""ESPN cookies are stored encrypted, and survive only under the same key."""

from cryptography.fernet import Fernet

from app import crypto


def test_round_trip_and_blanks():
    token = crypto.encrypt("AEAsecret")
    assert token != b"AEAsecret" and crypto.decrypt(token) == "AEAsecret"
    assert crypto.encrypt("") is None and crypto.encrypt(None) is None
    assert crypto.decrypt(None) is None


def test_a_token_from_another_key_reads_as_none(monkeypatch):
    other = Fernet(Fernet.generate_key()).encrypt(b"AEAsecret")
    # After ENCRYPTION_KEY rotates, old rows decrypt to None (the league acts
    # as public until its cookies are re-entered) instead of raising.
    assert crypto.decrypt(other) is None
