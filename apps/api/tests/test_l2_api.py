from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
import os
import pytest
from sqlalchemy import update, select
from test_l1_api import client, session, send
from app.main import app
from app.l2_api import validate_active_time
from app.db import l2_runs, l2_events
from app.l2_domain import initial_state, apply_action
from app.l2_layout import initial_layout, valid_layout, classify, move_layout

def open_l2(client):
    parent, headers = session(client)
    for choice in ("swim", "take-lamp", "light-lamp", "enter"):
        assert send(client, parent, headers, choice)[0].status_code == 200
    url = f"/api/v1/sessions/{parent['id']}/levels/l2"
    result = client.post(url, headers=headers, json={})
    assert result.status_code == 200
    return parent, headers, url, result.json()

def act(client, url, h, state, action, aid=None, version=None):
    body = dict(action_id=aid or str(uuid4()), expected_version=state["version"] if version is None else version, action=action)
    response = client.post(url+"/actions", headers=h, json=body)
    if "session" in response.json(): state.update(response.json()["session"])
    return response, body

def unlock(client, url, h, s):
    for a in [dict(type="arrive-table"), dict(type="select-key", key="key-2"), dict(type="try-door", key="key-2"),
              dict(type="select-key", key="key-1"), dict(type="try-door", key="key-1")]:
        assert act(client, url, h, s, a)[0].status_code == 200

def test_gate_authorization_existing_l1_and_idempotent_start(client):
    parent, h = session(client);url = f"/api/v1/sessions/{parent['id']}/levels/l2"
    assert client.post(url, headers=h, json={}).json()["detail"] == "L1_NOT_COMPLETE"
    assert client.post(url, json={}).status_code == 404
    parent, h, url, s = open_l2(client)
    assert s["id"] == parent["id"]
    assert s["l1"]["lampTaken"] and s["l1"]["lampLit"] and s["l1"]["route"] == "swim"
    assert s["scoring"] == dict(status="pending_configuration", policy_version=None, totals=None)
    assert s["completion"] == "in_progress"
    _, other = session(client)
    for suffix in ("", "/events"):
        assert client.get(url+suffix, headers=other).status_code == 404
    act(client, url, h, s, dict(type="arrive-table"))
    assert client.post(url, headers=h, json={}).json() == s
    assert client.get(f"/api/v1/sessions/{parent['id']}", headers=h).json()["state"] == parent["state"]

@pytest.mark.parametrize("explore", [False, True])
def test_furniture_exit_after_optional_exploration_persists(client, explore):
    parent, h, url, s = open_l2(client)
    unlock(client, url, h, s)
    assert act(client, url, h, s, dict(type="explore", yes=explore))[0].status_code == 200
    if explore: assert act(client, url, h, s, dict(type="return-hall"))[0].status_code == 200
    for a in [dict(type="layout-start"), dict(type="layout-confirm")]:
        assert act(client, url, h, s, a)[0].status_code == 200
    assert s["completion"] == "in_progress"
    for a in [dict(type="layout-start"), dict(type="layout-move", id="sofa", point=dict(u=.1, v=.5))]:
        assert act(client, url, h, s, a)[0].status_code == 200
    assert not s["state"]["exitDoorOpen"]
    response, body = act(client, url, h, s, dict(type="layout-confirm"))
    assert response.status_code == 200
    assert s["completion"] == "complete" and s["state"]["exitDoorOpen"]
    assert s["state"]["search"]["status"] == "idle"
    assert s["scoring"]["totals"] is None
    assert client.get(url, headers=h).json() == s
    assert client.post(url+"/actions", headers=h, json=body).json()["duplicate"]
    receipt = next(r for r in client.get(url+"/events", headers=h).json() if r["action_id"] == body["action_id"])
    assert receipt["outcome"]["exit_door_open"]
    assert client.get(f"/api/v1/sessions/{parent['id']}", headers=h).json()["state"] == parent["state"]

def test_legacy_tidy_save_exposes_exit_without_rewriting_old_records(client):
    _, h, url, s = open_l2(client)
    legacy = deepcopy(s["state"]);legacy.pop("exitDoorOpen");legacy["furniture"]["triggered"]["tidy"] = True
    with app.state.engine.begin() as conn:
        conn.execute(update(l2_runs).where(l2_runs.c.session_id == s["id"]).values(state=legacy))
    restored = client.get(url, headers=h).json()
    assert restored["state"]["exitDoorOpen"] and restored["completion"] == "complete"
    assert restored["version"] == s["version"]
    with app.state.engine.connect() as conn:
        stored = conn.execute(select(l2_runs.c.state).where(l2_runs.c.session_id == s["id"])).scalar_one()
    assert stored == legacy

def test_keys_bedroom_and_rejection_rules(client):
    _, h, url, s = open_l2(client)
    for a in [dict(type="select-key", key="key-1"), dict(type="explore", yes=True), dict(type="curtain-click")]:
        assert act(client, url, h, s, a)[0].status_code == 409
    assert act(client, url, h, s, dict(type="sit", seat="chair", yes=True))[0].status_code == 200
    assert not s["state"]["atTable"]
    unlock(client, url, h, s)
    assert s["state"]["attempts"] == ["key-2", "key-1"]
    assert act(client, url, h, s, dict(type="try-door", key="key-2"))[0].status_code == 409
    for yes in (False, True): assert act(client, url, h, s, dict(type="explore", yes=yes))[0].status_code == 200
    assert act(client, url, h, s, dict(type="layout-start"))[0].status_code == 409
    assert act(client, url, h, s, dict(type="return-hall"))[0].status_code == 200
    assert client.get(url, headers=h).json()["state"] == s["state"]

def test_payload_versions_and_retry_receipts(client):
    _, h, url, s = open_l2(client)
    response, body = act(client, url, h, s, dict(type="arrive-table"))
    assert response.json()["scoring"]["contributions"] is None
    duplicate = client.post(url+"/actions", headers=h, json=body).json()
    assert duplicate["duplicate"] and duplicate["version"] == 1
    changed = deepcopy(body);changed["action"] = dict(type="layout-start")
    assert client.post(url+"/actions", headers=h, json=changed).status_code == 409
    assert act(client, url, h, s, dict(type="layout-start"), version=0)[0].json()["code"] == "VERSION_CONFLICT"
    for action in [dict(type="find-earring"), dict(type="sit", seat="sofa", yes=True), dict(type="explore", yes="true"),
                   dict(type="search-time", activeMs=True), dict(type="layout-move", id="chair", point=dict(u=0.4, v=0.4), tidy=True)]:
        assert act(client, url, h, s, action)[0].status_code == 422
    forged = dict(body, state={"doorOpen": True}, score=99)
    assert client.post(url+"/actions", headers=h, json=forged).status_code == 422
    assert len(client.get(url+"/events", headers=h).json()) == 2

def test_search_timing_curtain_resume_and_scoring_evidence(client):
    _, h, url, s = open_l2(client);unlock(client, url, h, s)
    for a in [dict(type="explore", yes=True), dict(type="search-choice", yes=False), dict(type="search-choice", yes=True)]:
        assert act(client, url, h, s, a)[0].status_code == 200
    assert act(client, url, h, s, dict(type="search-time", activeMs=9000))[0].json()["code"] == "ACTIVE_TIME_EXCEEDS_WALL_TIME"
    for elapsed in (10000, 15000, 15001):
        with app.state.engine.begin() as conn:
            fixture_state = deepcopy(s["state"])
            for e in fixture_state["events"]:
                if e["action"]["type"] == "search-choice" and e["action"]["yes"]:
                    e["at"] = (datetime.now(timezone.utc)-timedelta(seconds=30)).isoformat()
            conn.execute(update(l2_runs).where(l2_runs.c.session_id == s["id"]).values(state=fixture_state, time_anchor=(datetime.now(timezone.utc)-timedelta(seconds=12)).isoformat()))
        result = act(client, url, h, s, dict(type="search-time", activeMs=elapsed))[0]
        assert result.status_code == 200
        assert s["state"]["search"]["long"] is (elapsed > 15000)
        assert result.json()["scoring"]["facts"]["search"]["timing_verified"] is False
    for _ in range(2): assert act(client, url, h, s, dict(type="curtain-click"))[0].status_code == 200
    for a in [dict(type="return-hall"), dict(type="explore", yes=True), dict(type="search-choice", yes=True), dict(type="curtain-click")]:
        assert act(client, url, h, s, a)[0].status_code == 200
    assert s["state"]["search"]["status"] == "found"
    assert act(client, url, h, s, dict(type="curtain-click"))[0].status_code == 409
    assert client.get(url, headers=h).json()["state"] == s["state"]

def test_furniture_draft_undo_confirm_and_immutable_evidence(client):
    _, h, url, s = open_l2(client)
    assert act(client, url, h, s, dict(type="layout-move", id="chair", point=dict(u=.45, v=.35)))[0].status_code == 409
    assert act(client, url, h, s, dict(type="layout-start"))[0].status_code == 200
    assert act(client, url, h, s, dict(type="arrive-table"))[0].status_code == 409
    assert act(client, url, h, s, dict(type="layout-move", id="chair", point=dict(u=.45, v=-.5)))[0].status_code == 200
    assert act(client, url, h, s, dict(type="layout-move", id="chair", point=dict(u=.45, v=.35)))[0].status_code == 200
    assert client.get(url, headers=h).json()["state"]["furniture"]["editing"]
    assert act(client, url, h, s, dict(type="layout-confirm"))[0].json()["scoring"]["facts"]["placement"]["events"] == ["tidy", "open-placement"]
    first = client.get(url+"/events", headers=h).json()[-1]
    for a in [dict(type="layout-start"), dict(type="layout-confirm")]: assert act(client, url, h, s, a)[0].status_code == 200
    assert s["state"]["furniture"]["classification"]["events"] == []
    assert first in client.get(url+"/events", headers=h).json()
    for a in [dict(type="layout-start"), dict(type="layout-reset"), dict(type="layout-undo"), dict(type="layout-exit")]:
        assert act(client, url, h, s, a)[0].status_code == 200
    assert s["state"]["furniture"]["layout"]["chair"] == dict(u=.45, v=.35)

@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires isolated PostgreSQL database")
def test_concurrent_l2_actions_and_starts(client):
    _, h, url, s = open_l2(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        starts = list(pool.map(lambda _: client.post(url, headers=h, json={}), range(2)))
    assert all(r.status_code == 200 and r.json()["version"] == 0 for r in starts)
    def post(_):
        return client.post(url+"/actions", headers=h, json=dict(action_id=str(uuid4()), expected_version=0, action=dict(type="sit", seat="chair", yes=False)))
    with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(post, range(2)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert len(client.get(url, headers=h).json()["state"]["events"]) == 1

def test_geometry_initial_and_light_overlap():
    layout = initial_layout();assert valid_layout(layout)
    moved = move_layout(layout, "chair", dict(u=.45, v=.35))
    assert classify(moved, layout, dict(tidy=False, openPlacement=False))["events"] == ["tidy", "open-placement"]
    assert not valid_layout(move_layout(layout, "chair", layout["sofa"]))

def test_event_limit_keeps_existing_receipts_retryable(client):
    _, h, url, s = open_l2(client)
    _, body = act(client, url, h, s, dict(type="arrive-table"))
    with app.state.engine.begin() as conn:
        conn.execute(update(l2_runs).where(l2_runs.c.session_id == s["id"]).values(version=1000))
    assert client.post(url+"/actions", headers=h, json=body).json()["duplicate"]
    s["version"] = 1000
    assert act(client, url, h, s, dict(type="layout-start"))[0].json()["code"] == "SESSION_EVENT_LIMIT"
    assert s["state"]["events"][0]["id"] == body["action_id"]

@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires isolated PostgreSQL database")
def test_concurrent_same_id_is_exactly_once(client):
    _, h, url, s = open_l2(client)
    body = dict(action_id=str(uuid4()), expected_version=0, action=dict(type="arrive-table"))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post(url+"/actions", headers=h, json=body), range(2)))
    assert all(r.status_code == 200 for r in results)
    assert sorted(r.json()["duplicate"] for r in results) == [False, True]
    assert client.get(url, headers=h).json()["version"] == 1

def test_timing_tolerance_cannot_accumulate_per_request():
    now = datetime.now(timezone.utc)
    s = initial_state()
    s["events"] = [dict(at=now.isoformat(), action=dict(type="search-choice", yes=True))]
    validate_active_time(s, 250, now.isoformat(), now)
    s["search"]["activeMs"] = 250
    with pytest.raises(ValueError, match="ACTIVE_TIME_EXCEEDS_WALL_TIME"):
        validate_active_time(s, 500, now.isoformat(), now)
    with pytest.raises(ValueError, match="ACTIVE_TIME_ANCHOR_MISSING"):
        validate_active_time(s, 500, None, now)

def test_server_receipts_have_immutable_outcomes_and_rejections(client):
    _, h, url, s = open_l2(client)
    assert act(client, url, h, s, dict(type="curtain-click"))[0].status_code == 409
    unlock(client, url, h, s)
    rows = client.get(url+"/events", headers=h).json()
    assert len(rows) == 6
    rejected = next(r for r in rows if r["action"]["type"] == "curtain-click")
    assert rejected["outcome"] is None and not rejected["accepted"]
    for r in rows:
        assert r["authority"] == dict(record_source="server_database", decision_source="server", input_source="client_claim")
        assert r["validation_version"] == "l2-validation-v4"
        assert r["previous_version"] + int(r["accepted"]) == r["version"]
    first, second = sorted([r for r in rows if r["action"]["type"] == "try-door"], key=lambda r: r["version"])
    assert first["outcome"]["attempt"] == 1 and not first["outcome"]["door_open"]
    assert second["outcome"]["attempt"] == 2 and second["outcome"]["door_open"]
    assert first in client.get(url+"/events", headers=h).json()

def test_events_before_l2_start_are_not_an_empty_started_run(client):
    s, h = session(client)
    for choice in ("swim", "enter"): assert send(client, s, h, choice)[0].status_code == 200
    result = client.get(f"/api/v1/sessions/{s['id']}/levels/l2/events", headers=h)
    assert result.status_code == 404 and result.json()["detail"] == "L2_NOT_STARTED"

def test_noop_and_invalid_furniture_keep_state_and_are_auditable(client):
    _, h, url, s = open_l2(client)
    act(client, url, h, s, dict(type="layout-start"))
    before = deepcopy(s)
    for a, code in [(dict(type="layout-reset"), "NO_CHANGE"),
                    (dict(type="layout-move", id="chair", point=s["state"]["furniture"]["layout"]["chair"]), "NO_CHANGE")]:
        assert act(client, url, h, s, a)[0].json()["code"] == code
        assert s == before
    assert len(client.get(url+"/events", headers=h).json()) == 3


@pytest.mark.parametrize("gap,tidy", [(1.4*96/2.54-.1, True), (1.4*96/2.54, True), (1.4*96/2.54+.1, False), (180, False)])
def test_free_placement_suspension_tolerance_persists(client, gap, tidy):
    _, h, url, s = open_l2(client)
    point = dict(u=.45, v=.13/2-gap/270)
    for a in [dict(type="layout-start"), dict(type="layout-move", id="chair", point=point), dict(type="layout-confirm")]:
        assert act(client, url, h, s, a)[0].status_code == 200
    state = client.get(url, headers=h).json()["state"]
    assert state["furniture"]["confirmed"]["chair"] == point
    assert state["furniture"]["classification"]["tidy"] is tidy
    assert state["exitDoorOpen"] is tidy
    assert abs(state["furniture"]["classification"]["suspensionGapsPx"]["chair"]-gap) < 1e-8
