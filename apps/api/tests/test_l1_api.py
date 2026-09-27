import os
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url
from app.main import app

@pytest.fixture
def client(tmp_path, monkeypatch):
    # PostgreSQL integration uses a dedicated test database, never the app database.
    url = os.getenv("TEST_DATABASE_URL") or f"sqlite:///{tmp_path / 'test.db'}"
    if os.getenv("TEST_DATABASE_URL") and not (make_url(url).database or "").endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a dedicated database ending in _test")
    monkeypatch.setenv("DATABASE_URL", url)
    command.upgrade(Config("alembic.ini"), "head")
    with TestClient(app) as client: yield client

def session(client):
    r = client.post("/api/v1/sessions")
    assert r.status_code == 201
    s = r.json()
    return s, {"Authorization": "Bearer " + s["token"]}

def send(client, s, headers, choice=None, yes=True, positions=None, aid=None, version=None):
    body = dict(action_id=aid or str(uuid4()), expected_version=s["version"] if version is None else version,
                action=dict(type="choose", choice=choice, yes=yes) if choice else dict(type="paddle"), positions=positions or {})
    r = client.post(f"/api/v1/sessions/{s['id']}/actions", headers=headers, json=body)
    if "session" in r.json(): s.update(r.json()["session"])
    return r, body

def test_readiness_and_session_isolation(client):
    assert client.get("/api/v1/ready").json()["persistence_ready"] is True
    s, h = session(client)
    assert client.get(f"/api/v1/sessions/{s['id']}").status_code == 404
    assert client.get(f"/api/v1/sessions/{s['id']}/events").status_code == 404
    assert client.get(f"/api/v1/sessions/{s['id']}", headers=h).json()["version"] == 0

def test_rejections_and_forged_state_do_not_advance(client):
    s, h = session(client)
    for choice in ("board", "repair", "cross-bridge", "enter", "take-lamp"):
        r, _ = send(client, s, h, choice)
        assert r.status_code == 409
        assert s["version"] == 0
    r, body = send(client, s, h)
    assert r.json()["code"] == "PADDLE_NOT_ALLOWED"
    body["state"] = {"scene":"complete"}
    assert client.post(f"/api/v1/sessions/{s['id']}/actions", headers=h, json=body).status_code == 422
    assert len(client.get(f"/api/v1/sessions/{s['id']}/events", headers=h).json()) == 6

def test_boat_fifth_search_and_fifth_paddle(client):
    s, h = session(client)
    for i in range(5):
        assert send(client, s, h, "search")[0].status_code == 200
        assert s["state"]["oar"] is (i == 4)
    assert send(client, s, h, "board")[0].status_code == 200
    assert send(client, s, h, "swim")[0].status_code == 409
    for i in range(5):
        assert send(client, s, h)[0].status_code == 200
        assert s["state"]["scene"] == ("shore" if i == 4 else "river")
    assert s["state"]["route"] == "boat"
    assert send(client, s, h)[0].status_code == 409

def test_bridge_geometry_and_completion(client):
    s, h = session(client)
    assert send(client, s, h, "collect-wood")[0].json()["code"] == "REPAIR_MATERIALS_NOT_AT_GAP"
    positions = {"planks":{"x":(960-2446.355)/2944,"y":(1160-1426.75)/1568}, "rope":{"x":(960-2104.5)/2944,"y":(1160-1413.5)/1568}}
    assert send(client, s, h, "collect-wood", positions=positions)[0].status_code == 200
    assert send(client, s, h, "repair")[0].status_code == 409
    assert send(client, s, h, "repair", positions=positions)[0].status_code == 200
    assert send(client, s, h, "cross-bridge")[0].status_code == 200
    assert s["state"]["route"] == "bridge"
    for choice in ("greet", "greet-woman", "take-lamp", "light-lamp", "enter"):
        assert send(client, s, h, choice)[0].status_code == 200
    assert s["state"]["scene"] == "complete"
    assert send(client, s, h, "enter")[0].status_code == 409
    restored = client.get(f"/api/v1/sessions/{s['id']}", headers=h).json()
    assert restored["state"] == s["state"]

@pytest.mark.parametrize("choice,route", [("swim","swim"),("use-ring","ring")])
def test_refusal_then_other_routes(client, choice, route):
    s, h = session(client)
    assert send(client, s, h, choice, False)[0].status_code == 200
    assert s["state"]["scene"] == "river"
    assert send(client, s, h, choice)[0].status_code == 200
    assert s["state"]["route"] == route
    assert send(client, s, h, "light-lamp")[0].status_code == 200
    assert s["state"]["lampTaken"] is False

def test_idempotency_payload_conflict_and_version_conflict(client):
    s, h = session(client)
    _, body = send(client, s, h, "search")
    url = f"/api/v1/sessions/{s['id']}/actions"
    r = client.post(url, headers=h, json=body)
    assert r.json()["duplicate"] is True
    assert r.json()["session"]["state"]["bushClicks"] == 1
    body["action"]["yes"] = False
    assert client.post(url, headers=h, json=body).status_code == 409
    r, rejected = send(client, s, h, "search", version=0)
    assert r.json()["code"] == "VERSION_CONFLICT"
    assert s["version"] == 1
    assert client.post(url, headers=h, json=rejected).json()["duplicate"] is True
    assert send(client, s, h, "search")[0].status_code == 200
    assert s["state"]["bushClicks"] == 2

@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires isolated PostgreSQL database")
def test_concurrent_requests_only_one_advances(client):
    s, h = session(client)
    url = f"/api/v1/sessions/{s['id']}/actions"
    def post(_):
        return client.post(url, headers=h, json=dict(action_id=str(uuid4()), expected_version=0, action=dict(type="choose",choice="search",yes=True)))
    with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(post, range(2)))
    assert sorted(r.status_code for r in results) == [200,409]
    assert client.get(f"/api/v1/sessions/{s['id']}", headers=h).json()["state"]["bushClicks"] == 1
