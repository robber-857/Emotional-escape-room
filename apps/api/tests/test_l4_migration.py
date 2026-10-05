from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

from app.main import app
from app.db import sessions, events, l2_runs, l2_events, l3_runs, l3_events
from test_l4_api import completed_l3


def test_migration_preserves_all_previous_levels(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migration-l4.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    engine = create_engine(url)
    config = Config("alembic.ini")
    command.upgrade(config, "0003_l3")
    with TestClient(app) as client:
        # Seed the historical schema without the newly introduced score hooks.
        with monkeypatch.context() as legacy:
            legacy.setattr("app.main.bind_scoring", lambda *a, **k: None)
            legacy.setattr("app.l2_api.has_l3", lambda *a, **k: False)
            legacy.setattr("app.l2_api.finalize_greetings", lambda *a, **k: None)
            legacy.setattr("app.l3_api.finalize_furniture", lambda *a, **k: None)
            legacy.setattr("app.l3_api.finalize_search", lambda *a, **k: None)
            legacy.setattr("app.l3_api.finalize_explore", lambda *a, **k: None)
            for module in ("app.main", "app.l2_api", "app.l3_api"):
                legacy.setattr(module+".record_scoring", lambda *a, **k: {"status":"legacy_unbound"})
            _, h, l4url = completed_l3(client, "lantern")
        def records():
            with engine.connect() as conn:
                return [[dict(r) for r in conn.execute(select(t)).mappings()]
                        for t in (sessions, events, l2_runs, l2_events, l3_runs, l3_events)]
        before = records()
        assert all(before)
        assert client.get("/api/v1/ready").status_code == 503
        command.upgrade(config, "head")
        assert records() == before
        assert client.get("/api/v1/ready").json()["schema_version"] == "0005_scoring"
        assert client.post(l4url, headers=h, json={}).json()["state"]["item"] == "lantern"
        command.upgrade(config, "head")
        assert records() == before
    engine.dispose()
