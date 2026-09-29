from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import os
from uuid import uuid4

import pytest
from sqlalchemy import event, select, update
from sqlalchemy.exc import SQLAlchemyError

from test_l1_api import client, session, send
from test_l2_api import act
from test_l3_api import completed_l2, open_l3, storm, old_records
from app.main import app
from app.db import l3_runs, l3_events, l4_runs, l4_events
from app.l4_domain import DOORS


def completed_l3(client, item=None):
    parent, h, url, state = open_l3(client)
    storm(client, url, h, state)
    assert act(client, url, h, state, dict(type="carry", yes=item is not None))[0].status_code == 200
    if item:
        assert act(client, url, h, state, dict(type="draft", item=item))[0].status_code == 200
        assert act(client, url, h, state, dict(type="confirm"))[0].status_code == 200
    return parent, h, url.replace("/l3", "/l4")


def open_l4(client, item=None):
    parent, h, url = completed_l3(client, item)
    response = client.post(url, headers=h, json={})
    assert response.status_code == 200
    return parent, h, url, response.json()


def records(sid):
    with app.state.engine.connect() as conn:
        return old_records(sid) + [[dict(row) for row in conn.execute(select(table).where(table.c.session_id == sid)).mappings()]
                                  for table in (l3_runs, l3_events)]


def test_gates_auth_and_preview_import(client):
    parent, h = session(client)
    url = f"/api/v1/sessions/{parent['id']}/levels/l4"
    assert client.post(url, headers=h, json={}).json()["detail"] == "L1_NOT_COMPLETE"
    for choice in ("swim", "enter"):
        assert send(client, parent, h, choice)[0].status_code == 200
    assert client.post(url, headers=h, json={}).json()["detail"] == "L2_NOT_COMPLETE"
    _, h, l3url = completed_l2(client)
    assert client.post(l3url.replace("/l3", "/l4"), headers=h, json={}).json()["detail"] == "L3_NOT_COMPLETE"
    _, h, l3url, s = open_l3(client)
    storm(client, l3url, h, s)
    act(client, l3url, h, s, dict(type="carry", yes=True))
    act(client, l3url, h, s, dict(type="draft", item="lantern"))
    assert client.post(l3url.replace("/l3", "/l4"), headers=h, json={}).json()["detail"] == "L3_NOT_COMPLETE"
    _, h, url = completed_l3(client)
    body = dict(action_id=str(uuid4()), expected_version=0, action=dict(type="confirm", door="forest"))
    for suffix in ("", "/events"):
        assert client.get(url+suffix, headers=h).json()["detail"] == "L4_NOT_STARTED"
        assert client.get(url+suffix).status_code == 404
    assert client.post(url+"/actions", headers=h, json=body).json()["detail"] == "L4_NOT_STARTED"
    assert client.post(url, headers=h, json=dict(source="local_preview", door="castle")).status_code == 422
    assert client.post(url, headers=h, json={}).status_code == 200
    _, other = session(client)
    assert client.post(url, headers=other, json={}).status_code == 404
    assert client.post(url+"/actions", headers=other, json=body).status_code == 404


@pytest.mark.parametrize("door", DOORS)
@pytest.mark.parametrize("item", [None, "lantern"])
def test_each_door_is_terminal_and_preserves_previous_levels(client, door, item):
    parent, h, url, s = open_l4(client, item)
    before = records(parent["id"])
    assert s["state"]["item"] == item
    assert client.post(url, headers=h, json={}).json() == s
    response, body = act(client, url, h, s, dict(type="confirm", door=door))
    assert response.status_code == 200
    assert s["completion"] == "complete" and s["version"] == 1
    assert s["state"]["door"] == door and len(s["state"]["events"]) == 1
    assert client.get(url, headers=h).json() == s
    assert client.post(url, headers=h, json={}).json() == s
    receipt = response.json()
    assert receipt["outcome"] == dict(door=door, item=item, completion="complete", completion_policy_version="l4-confirm-door-v1")
    assert receipt["authority"]["record_source"] == "server_database"
    assert receipt["validation"]["l3_complete"] and receipt["validation"]["flow_allowed"]
    assert s["scoring"] == dict(status="pending_configuration", policy_version=None, contributions=None, totals=None)
    for other in DOORS:
        assert act(client, url, h, s, dict(type="confirm", door=other))[0].json()["code"] == "L4_COMPLETE"
    assert client.post(url+"/actions", headers=h, json=body).json()["duplicate"]
    assert records(parent["id"]) == before


def test_conflict_replay_immutable_receipts_and_reused_ids(client):
    _, h, url, s = open_l4(client)
    stale = dict(action_id=str(uuid4()), expected_version=7, action=dict(type="confirm", door="village"))
    denied = client.post(url+"/actions", headers=h, json=stale).json()
    assert denied["code"] == "VERSION_CONFLICT" and denied["outcome"] is None
    assert denied["validation"]["flow_evaluated"] is False
    response, body = act(client, url, h, s, dict(type="confirm", door="coast"))
    replay = client.post(url+"/actions", headers=h, json=stale).json()
    assert replay["duplicate"] and replay["validation"] == denied["validation"]
    assert replay["version"] == 0 and replay["session"]["version"] == 1
    replay = client.post(url+"/actions", headers=h, json=body).json()
    assert replay["outcome"] == response.json()["outcome"] and replay["duplicate"]
    changed = deepcopy(body);changed["action"]["door"] = "forest"
    assert client.post(url+"/actions", headers=h, json=changed).json()["detail"] == "ACTION_ID_REUSED_WITH_DIFFERENT_PAYLOAD"
    rows = client.get(url+"/events", headers=h).json()
    assert len(rows) == 2
    assert next(r for r in rows if r["action_id"] == stale["action_id"])["validation"] == denied["validation"]


@pytest.mark.parametrize("alter", [
    {"state":{"completion":"complete"}}, {"scoring":{"A":1}}, {"validation":{"flow_allowed":True}},
    {"expected_version":True}, {"expected_version":-1}, {"action_id":"bad"},
    {"action":{"type":"confirm","door":"unknown"}}, {"action":{"type":"confirm","door":"forest","item":"key"}},
    {"action":{"type":"draft","door":"forest"}},
])
def test_strict_inputs_do_not_create_receipts(client, alter):
    _, h, url, s = open_l4(client)
    body = dict(action_id=str(uuid4()), expected_version=0, action=dict(type="confirm", door="forest"))
    body.update(alter)
    assert client.post(url+"/actions", headers=h, json=body).status_code == 422
    assert client.get(url, headers=h).json() == s
    assert client.get(url+"/events", headers=h).json() == []


def test_unknown_rule_version_is_rejected(client):
    _, h, url, s = open_l4(client)
    with app.state.engine.begin() as conn:
        conn.execute(update(l4_runs).where(l4_runs.c.session_id == s["id"]).values(rules_version="future"))
    response, _ = act(client, url, h, s, dict(type="confirm", door="forest"))
    assert response.json()["code"] == "RULES_VERSION_UNSUPPORTED"
    assert not response.json()["validation"]["flow_evaluated"]
    assert s["version"] == 0


def test_receipt_failure_rolls_back_choice_and_retry_keeps_id(client):
    _, h, url, s = open_l4(client)
    body = dict(action_id=str(uuid4()), expected_version=0, action=dict(type="confirm", door="forest"))
    def fail(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().startswith("INSERT INTO l4_events"):
            raise SQLAlchemyError("test receipt failure")
    event.listen(app.state.engine, "before_cursor_execute", fail)
    try:
        assert client.post(url+"/actions", headers=h, json=body).status_code == 503
    finally:
        event.remove(app.state.engine, "before_cursor_execute", fail)
    assert client.get(url, headers=h).json() == s
    assert client.get(url+"/events", headers=h).json() == []
    assert client.post(url+"/actions", headers=h, json=body).status_code == 200


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires isolated PostgreSQL")
def test_concurrent_start_duplicate_and_competing_doors(client):
    _, h, url = completed_l3(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        starts = list(pool.map(lambda _: client.post(url, headers=h, json={}), range(2)))
    assert all(r.status_code == 200 and r.json()["version"] == 0 for r in starts)
    body = dict(action_id=str(uuid4()), expected_version=0, action=dict(type="confirm", door="forest"))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post(url+"/actions", headers=h, json=body), range(2)))
    assert sorted(r.json()["duplicate"] for r in results) == [False, True]
    assert len(client.get(url+"/events", headers=h).json()) == 1
    _, h, url, _ = open_l4(client)
    def post(door):
        return client.post(url+"/actions", headers=h, json=dict(action_id=str(uuid4()), expected_version=0,
                           action=dict(type="confirm", door=door)))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(post, ("village", "castle")))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert client.get(url, headers=h).json()["version"] == 1
    assert sum(r["accepted"] for r in client.get(url+"/events", headers=h).json()) == 1
