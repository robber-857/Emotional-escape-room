from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from itertools import product
import os
from uuid import uuid4

import pytest
from sqlalchemy import event, select, update
from sqlalchemy.exc import SQLAlchemyError

from test_l1_api import client, session, send
from test_l2_api import open_l2, act
from app.main import app
from app.db import sessions, events, l2_runs, l2_events, l3_runs
from app.l3_domain import SLOTS, ITEMS, initial_state, apply_action


def completed_l2(client):
    parent, h, url, s = open_l2(client)
    for a in [dict(type="layout-start"), dict(type="layout-move", id="sofa", point=dict(u=.1, v=.5)),
              dict(type="layout-confirm")]:
        assert act(client, url, h, s, a)[0].status_code == 200
    assert s["completion"] == "complete"
    return parent, h, url.replace("/l2", "/l3")


def open_l3(client):
    parent, h, url = completed_l2(client)
    response = client.post(url, headers=h, json={})
    assert response.status_code == 200
    return parent, h, url, response.json()


def storm(client, url, h, s, yes=False):
    for slot in SLOTS:
        assert act(client, url, h, s, dict(type="decision", slot=slot, yes=yes))[0].status_code == 200
    assert s["state"]["segment"] == "carry"


def old_records(sid):
    with app.state.engine.connect() as conn:
        return [[dict(row) for row in conn.execute(select(table).where(
            (table.c.id if table is sessions else table.c.session_id) == sid)).mappings()]
            for table in (sessions, events, l2_runs, l2_events)]


def test_gates_auth_and_no_preview_import(client):
    p, h = session(client)
    url = f"/api/v1/sessions/{p['id']}/levels/l3"
    assert client.post(url, headers=h, json={}).json()["detail"] == "L1_NOT_COMPLETE"
    for choice in ("swim", "enter"):
        assert send(client, p, h, choice)[0].status_code == 200
    assert client.post(url, headers=h, json={}).json()["detail"] == "L2_NOT_COMPLETE"
    _, h, l2_url, _ = open_l2(client)
    assert client.post(l2_url.replace("/l2", "/l3"), headers=h, json={}).json()["detail"] == "L2_NOT_COMPLETE"
    p, h, url = completed_l2(client)
    for suffix in ("", "/events"):
        assert client.get(url+suffix, headers=h).json()["detail"] == "L3_NOT_STARTED"
        assert client.get(url+suffix).status_code == 404
    assert client.post(url+"/actions", headers=h, json=dict(action_id=str(uuid4()), expected_version=0,
                       action=dict(type="decision", slot="open", yes=False))).json()["detail"] == "L3_NOT_STARTED"
    assert client.post(url, headers=h, json=dict(source="local_preview", events=[])).status_code == 422
    assert client.post(url, headers=h, json={}).status_code == 200
    _, other = session(client)
    assert client.post(url, headers=other, json={}).status_code == 404
    assert client.post(url+"/actions", headers=other, json=dict(action_id=str(uuid4()), expected_version=0,
                       action=dict(type="carry", yes=False))).status_code == 404


@pytest.mark.parametrize("answers", list(product((False, True), repeat=6)))
def test_all_answer_combinations(answers):
    s = initial_state()
    for index, (slot, yes) in enumerate(zip(SLOTS, answers)):
        s, changed = apply_action(s, dict(type="decision", slot=slot, yes=yes))
        assert changed
        assert s["segment"] == ("carry" if index == 5 else "storm")
    assert list(s["choices"].values()) == list(answers)


@pytest.mark.parametrize("item", ITEMS)
def test_single_item_resume_and_original_session_unchanged(client, item):
    p, h, url, s = open_l3(client)
    before = old_records(p["id"])
    storm(client, url, h, s, yes=True)
    assert s["state"]["choices"]["television"] is True
    assert client.get(url, headers=h).json() == s
    assert act(client, url, h, s, dict(type="draft", item=item))[0].json()["code"] == "CARRY_NOT_ACCEPTED"
    assert act(client, url, h, s, dict(type="carry", yes=True))[0].status_code == 200
    assert act(client, url, h, s, dict(type="confirm"))[0].json()["code"] == "ITEM_NOT_SELECTED"
    other = "rope" if item != "rope" else "doll"
    for selected in (other, item):
        assert act(client, url, h, s, dict(type="draft", item=selected))[0].status_code == 200
        assert s["state"]["item"] is None
    assert client.post(url, headers=h, json={}).json() == s
    response, body = act(client, url, h, s, dict(type="confirm"))
    assert s["completion"] == "complete" and s["state"]["item"] == item
    assert response.json()["outcome"]["television_off"] is True
    assert client.get(url, headers=h).json() == s
    for a in (dict(type="carry", yes=False), dict(type="draft", item=other), dict(type="confirm")):
        assert act(client, url, h, s, a)[0].json()["code"] == "L3_COMPLETE"
    assert client.post(url+"/actions", headers=h, json=body).json()["duplicate"]
    assert s["scoring"] == dict(status="pending_configuration", policy_version=None, contributions=None, totals=None)
    assert old_records(p["id"]) == before


def test_no_item_is_terminal_and_all_no_preserves_tv(client):
    _, h, url, s = open_l3(client)
    storm(client, url, h, s)
    response, _ = act(client, url, h, s, dict(type="carry", yes=False))
    assert response.status_code == 200 and s["completion"] == "complete"
    assert not response.json()["outcome"]["television_off"]
    assert s["state"]["item"] is None
    assert act(client, url, h, s, dict(type="carry", yes=True))[0].status_code == 409


def test_repeated_refusal_retry_conflict_and_immutable_receipts(client):
    _, h, url, s = open_l3(client)
    for a, code in [(dict(type="decision", slot="close", yes=False), "OPEN_NOT_ANSWERED"),
                    (dict(type="carry", yes=False), "STORM_NOT_COMPLETE")]:
        assert act(client, url, h, s, a)[0].json()["code"] == code
    _, first_body = act(client, url, h, s, dict(type="decision", slot="open", yes=False))
    first = next(r for r in client.get(url+"/events", headers=h).json() if r["action_id"] == first_body["action_id"])
    assert act(client, url, h, s, dict(type="decision", slot="wait", yes=False))[0].json()["code"] == "CLOSE_NOT_ANSWERED"
    before = deepcopy(s)
    response, repeat = act(client, url, h, s, dict(type="decision", slot="open", yes=False))
    assert response.json()["code"] == "ALREADY_RECORDED" and not response.json()["state_changed"]
    assert s == before and len(s["state"]["events"]) == 1
    assert act(client, url, h, s, dict(type="decision", slot="open", yes=True))[0].status_code == 200
    assert len(s["state"]["events"]) == 2
    assert act(client, url, h, s, dict(type="decision", slot="open", yes=False))[0].json()["code"] == "ACTION_ALREADY_EXECUTED"
    for body in (first_body, repeat):
        replay = client.post(url+"/actions", headers=h, json=body).json()
        assert replay["duplicate"] and replay["version"] == 1 and replay["session"]["version"] == 2
    forged = deepcopy(first_body); forged["action"]["yes"] = True
    assert client.post(url+"/actions", headers=h, json=forged).json()["detail"] == "ACTION_ID_REUSED_WITH_DIFFERENT_PAYLOAD"
    response, rejected = act(client, url, h, s, dict(type="decision", slot="close", yes=False), version=0)
    assert response.json()["code"] == "VERSION_CONFLICT"
    assert client.post(url+"/actions", headers=h, json=rejected).json()["duplicate"]
    assert first in client.get(url+"/events", headers=h).json()
    for r in client.get(url+"/events", headers=h).json():
        assert r["previous_version"] + int(r["state_changed"]) == r["version"]
        assert r["authority"]["record_source"] == "server_database"
        assert r["scoring"] is None or r["scoring"]["contributions"] is None


@pytest.mark.parametrize("action", [dict(type="decision", slot="fan", yes=True),
    dict(type="decision", slot="television", yes="true"), dict(type="draft", item="invalid"),
    dict(type="confirm", item="doll"), dict(type="reset"), dict(type="decision", slot="open", yes=True, score=2)])
def test_strict_contract(client, action):
    _, h, url, s = open_l3(client)
    assert act(client, url, h, s, action)[0].status_code == 422
    assert client.get(url+"/events", headers=h).json() == []


def test_rule_and_event_limits_keep_receipts_retryable(client):
    _, h, url, s = open_l3(client)
    _, body = act(client, url, h, s, dict(type="decision", slot="open", yes=False))
    with app.state.engine.begin() as conn:
        conn.execute(update(l3_runs).where(l3_runs.c.session_id == s["id"]).values(version=400))
    s["version"] = 400
    assert act(client, url, h, s, dict(type="decision", slot="open", yes=False))[0].json()["code"] == "ALREADY_RECORDED"
    assert act(client, url, h, s, dict(type="decision", slot="open", yes=True))[0].json()["code"] == "SESSION_EVENT_LIMIT"
    with app.state.engine.begin() as conn:
        conn.execute(update(l3_runs).where(l3_runs.c.session_id == s["id"]).values(rules_version="future"))
    assert act(client, url, h, s, dict(type="decision", slot="open", yes=True))[0].json()["code"] == "RULES_VERSION_UNSUPPORTED"
    assert client.post(url+"/actions", headers=h, json=body).json()["duplicate"]


def test_receipt_insert_failure_rolls_back_state(client):
    _, h, url, s = open_l3(client)
    def fail(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO l3_events"):
            raise SQLAlchemyError("injected receipt failure")
    event.listen(app.state.engine, "before_cursor_execute", fail)
    try:
        response, body = act(client, url, h, s, dict(type="decision", slot="open", yes=False))
        assert response.status_code == 503
    finally:
        event.remove(app.state.engine, "before_cursor_execute", fail)
    assert client.get(url, headers=h).json()["version"] == 0
    assert client.get(url+"/events", headers=h).json() == []
    assert client.post(url+"/actions", headers=h, json=body).json()["version"] == 1


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires isolated PostgreSQL")
def test_concurrent_starts_actions_and_same_id(client):
    _, h, url = completed_l2(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        starts = list(pool.map(lambda _: client.post(url, headers=h, json={}), range(2)))
    assert all(r.status_code == 200 and r.json()["version"] == 0 for r in starts)
    body = dict(action_id=str(uuid4()), expected_version=0, action=dict(type="decision", slot="open", yes=False))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post(url+"/actions", headers=h, json=body), range(2)))
    assert sorted(r.json()["duplicate"] for r in results) == [False, True]
    def post(_):
        return client.post(url+"/actions", headers=h, json=dict(action_id=str(uuid4()), expected_version=1,
                           action=dict(type="decision", slot="close", yes=False)))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(post, range(2)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert client.get(url, headers=h).json()["version"] == 2
