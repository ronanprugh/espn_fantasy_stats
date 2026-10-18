import os

# app.config refuses to import without these; the tests never touch a real
# session or a stored credential.
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "Zb0p3QqgWVSYcO2t4Ywq3C2yPF4QO7sGzsG0Wq2T3cE=")
