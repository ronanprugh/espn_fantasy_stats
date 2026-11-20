from app.db_url import normalize_database_url


def test_plain_postgres_urls_use_psycopg_3():
    assert normalize_database_url("postgres://u:p@h/db?sslmode=require") == "postgresql+psycopg://u:p@h/db?sslmode=require"
    assert normalize_database_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_explicit_drivers_and_other_urls_are_left_alone():
    for url in ("postgresql+psycopg://u@h/db", "postgresql+psycopg2://u@h/db", "sqlite://"):
        assert normalize_database_url(url) == url
