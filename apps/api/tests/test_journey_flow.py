from copy import deepcopy
from uuid import uuid4
import os
import pytest
from concurrent.futures import ThreadPoolExecutor
from test_l1_api import client, session, send
from test_l2_api import open_l2, act

def test_two_choices_gate_repeated_furniture_and_transport_do_not_count(client):
    parent, h, url, s = open_l2(client)
    for _ in range(2):
        for action in [dict(type="layout-start"), dict(type="layout-confirm")]:
            assert act(client, url, h, s, action)[0].status_code == 200
    assert s["state"]["choiceActions"] == ["furniture"]
    assert not s["state"]["exitDoorOpen"]
    assert client.post(url.replace("/l2", "/l3"), headers=h, json={}).status_code == 409
    act(client, url, h, s, dict(type="arrive-table"))
    assert not s["state"]["exitDoorOpen"]
    response, body = act(client, url, h, s, dict(type="select-key", key="key-1"))
    assert response.status_code == 200 and s["state"]["exitDoorOpen"]
    assert client.post(url+"/actions", headers=h, json=body).json()["duplicate"]
    assert client.get(url, headers=h).json()["state"] == s["state"]
    assert client.post(url.replace("/l2", "/l3"), headers=h, json={}).status_code == 200

def test_key_pick_and_door_attempt_are_enough_without_tidy(client):
    _, h, url, s = open_l2(client)
    for action in [dict(type="arrive-table"), dict(type="select-key",key="key-1")]:
        act(client,url,h,s,action)
    assert not s["state"]["exitDoorOpen"]
    act(client,url,h,s,dict(type="try-door",key="key-1"))
    assert s["state"]["exitDoorOpen"] and not s["state"]["doorOpen"]

def test_resume_uses_last_started_act_and_is_authorized(client):
    p,h=session(client);base=f"/api/v1/sessions/{p['id']}"
    assert client.get(base+"/journey").status_code==404
    assert client.get(base+"/journey",headers=h).json()==dict(path="/")
    for c in ("swim","enter"):send(client,p,h,c)
    s=client.post(base+"/levels/l2",headers=h,json={}).json()
    assert client.get(base+"/journey",headers=h).json()==dict(path="/l2")
    for a in [dict(type="arrive-table"),dict(type="select-key",key="key-1"),dict(type="select-key",key="key-2")]:act(client,base+"/levels/l2",h,s,a)
    s=client.post(base+"/levels/l3",headers=h,json={}).json()
    assert client.get(base+"/journey",headers=h).json()==dict(path="/l3")
    for slot in ("open","close","wait","curtain","window","television"):act(client,base+"/levels/l3",h,s,dict(type="decision",slot=slot,yes=False))
    act(client,base+"/levels/l3",h,s,dict(type="carry",yes=False))
    assert client.post(base+"/levels/l4",headers=h,json={}).status_code==200
    assert client.get(base+"/journey",headers=h).json()==dict(path="/l4")

def test_restart_preserves_l1_and_original_journey_and_is_retry_safe(client):
    p,h,url,s=open_l2(client)
    act(client,url,h,s,dict(type="arrive-table"));act(client,url,h,s,dict(type="select-key",key="key-1"))
    original=deepcopy(s);base=f"/api/v1/sessions/{p['id']}"
    scores=client.get(base+"/scoring",headers=h).json()
    body=dict(action_id=str(uuid4()),expected_version=s["version"])
    assert client.post(url+"/restart",json=body).status_code==404
    assert client.post(url+"/restart",headers=h,json={**body,"expected_version":0}).status_code==409
    child=client.post(url+"/restart",headers=h,json=body).json()
    assert child["id"]!=p["id"] and child["state"]==p["state"]
    assert client.post(url+"/restart",headers=h,json=body).json()==child
    assert client.get(url,headers=h).json()==original
    ch={"Authorization":"Bearer "+child["token"]};cb=f"/api/v1/sessions/{child['id']}"
    assert client.get(cb+"/levels/l3",headers=ch).status_code==409
    fresh=client.post(cb+"/levels/l2",headers=ch,json={}).json()
    assert fresh["version"]==0 and fresh["state"]["keys"]==[] and not fresh["state"]["exitDoorOpen"]
    after=client.get(cb+"/scoring",headers=ch).json()
    assert [(e["group_id"],e["vector"]) for e in after["ledger"]]==[(e["group_id"],e["vector"]) for e in scores["ledger"] if e["level"]=="l1"]

@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"),reason="isolated PostgreSQL required")
def test_concurrent_restart_retry_creates_one_child(client):
    _,h,url,s=open_l2(client)
    body=dict(action_id=str(uuid4()),expected_version=s["version"])
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses=list(pool.map(lambda _:client.post(url+"/restart",headers=h,json=body),range(2)))
    assert all(r.status_code==200 for r in responses)
    assert responses[0].json()==responses[1].json()
