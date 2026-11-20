import os

# app.config refuses to import without these; the tests never touch a real
# session or a stored credential.
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "Zb0p3QqgWVSYcO2t4Ywq3C2yPF4QO7sGzsG0Wq2T3cE=")


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_attempt_counts():
    """Failed sign-in counts live in memory for the process; start each test
    with none."""
    from app import auth

    auth._attempts.clear()
    yield
    auth._attempts.clear()
