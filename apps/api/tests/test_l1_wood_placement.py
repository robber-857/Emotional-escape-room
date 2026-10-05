import pytest
from test_l1_api import client, session, send


def wood_position(x=960, y=1160):
    return {"planks": {"x": (x-2446.355)/2944, "y": (y-1426.75)/1568}}


def test_direct_wood_placement_unlocks_rope_once_and_survives_resume(client):
    s, h = session(client)
    assert send(client, s, h, "take-rope")[0].status_code == 409
    r, body = send(client, s, h, "place-wood", positions=wood_position())
    assert r.status_code == 200
    assert s["state"]["woodPlaced"] is True
    assert s["state"]["bridgeInspected"] is False
    assert s["state"]["wood"] is False
    url = f"/api/v1/sessions/{s['id']}"
    assert client.post(url + "/actions", headers=h, json=body).json()["duplicate"] is True
    assert send(client, s, h, "place-wood", positions=wood_position())[0].status_code == 409
    s.update(client.get(url, headers=h).json())
    for count in range(1, 6):
        assert send(client, s, h, "take-rope", positions=wood_position())[0].status_code == 200
        assert s["state"]["ropeClicks"] == count
    assert client.get(url + "/scoring", headers=h).json()["ledger"] == []
    assert send(client, s, h, "collect-wood", positions=wood_position())[0].status_code == 409
    positions = {**wood_position(), "rope": {"x": (960-2104.5)/2944, "y": (1160-1413.5)/1568}}
    assert send(client, s, h, "collect-wood", positions=positions)[0].status_code == 200
    assert send(client, s, h, "repair", positions=positions)[0].status_code == 200
    assert s["state"]["repaired"] is True


@pytest.mark.parametrize("x,y", [(759,1160),(1161,1160),(960,1059),(960,1261)])
def test_outside_gap_does_not_unlock_rope(client, x, y):
    s, h = session(client)
    assert send(client, s, h, "place-wood", positions=wood_position(x,y))[0].json()["code"] == "WOOD_NOT_AT_GAP"
    assert s["state"]["woodPlaced"] is False
    assert send(client, s, h, "take-rope")[0].status_code == 409


def test_old_state_without_wood_placement_still_loads():
    from app.domain import initial_state, normalize_state
    s = initial_state()
    del s["woodPlaced"]
    assert normalize_state(s)["woodPlaced"] is False
