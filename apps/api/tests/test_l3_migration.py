"""Upgrade evidence using actual L1/L2 API records in an isolated database."""
import os

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, inspect, text

from app.main import app
from app.db import sessions, events, l2_runs, l2_events
from test_l3_api import completed_l2


def test_migration_preserves_existing_l1_l2(tmp_path, monkeypatch):
    # A separate, fresh DB: never downgrade the shared PostgreSQL suite database.
    url = os.getenv("L3_MIGRATION_TEST_DATABASE_URL") or f"sqlite:///{tmp_path / 'migration.db'}"
    from sqlalchemy.engine import make_url
    if os.getenv("L3_MIGRATION_TEST_DATABASE_URL"):
        assert (make_url(url).database or "").endswith("_test")
    monkeypatch.setenv("DATABASE_URL", url)
    engine = create_engine(url)
    assert not inspect(engine).has_table("game_sessions"), "Migration evidence requires a fresh test database"
    config = Config("alembic.ini")
    command.upgrade(config, "0002_l2")
    with TestClient(app) as client:
        # Seed the historical schema without the newly introduced score hooks.
        with monkeypatch.context() as legacy:
            legacy.setattr("app.main.bind_scoring", lambda *a, **k: None)
            legacy.setattr("app.l2_api.has_l3", lambda *a, **k: False)
            legacy.setattr("app.l2_api.finalize_greetings", lambda *a, **k: None)
            legacy.setattr("app.l3_api.finalize_furniture", lambda *a, **k: None)
            for module in ("app.main", "app.l2_api", "app.l3_api"):
                legacy.setattr(module+".record_scoring", lambda *a, **k: {"status":"legacy_unbound"})
            _, h, l3_url = completed_l2(client)
        def records():
            with engine.connect() as conn:
                return [[dict(r) for r in conn.execute(select(t)).mappings()]
                        for t in (sessions, events, l2_runs, l2_events)]
        before = records()
        assert all(before)
        assert client.get("/api/v1/ready").status_code == 503
        command.upgrade(config, "head")
        assert records() == before
        assert client.get("/api/v1/ready").json()["schema_version"] == "0005_scoring"
        assert client.post(l3_url, headers=h, json={}).status_code == 200
        assert records() == before
        command.upgrade(config, "head")
        with engine.connect() as conn:
            assert conn.execute(text("SELECT count(*) FROM l3_runs")).scalar_one() == 1
    engine.dispose()
