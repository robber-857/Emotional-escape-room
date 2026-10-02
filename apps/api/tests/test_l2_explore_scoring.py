from copy import deepcopy
import pytest
from sqlalchemy import select, update
from test_l1_api import client
from test_l2_api import open_l2, act, unlock
from app.main import app
from app.db import score_evaluations


def entries(client, parent, headers):
    summary = client.get(f"/api/v1/sessions/{parent['id']}/scoring", headers=headers).json()
    return [e for e in summary['ledger'] if e['group_id'] == 'l2.explore']


def leave(client, url, headers, state):
    assert act(client, url, headers, state, dict(type='layout-start'))[0].status_code == 200
    assert act(client, url, headers, state, dict(type='layout-confirm'))[0].status_code == 200
    assert client.post(url.replace('/l2', '/l3'), headers=headers, json={}).status_code == 200


@pytest.mark.parametrize('refusals,option,v,t', [(0,'direct',-2,1),(1,'returned',0,-2),(3,'returned',0,-2)])
def test_first_entry_settles_once_after_resume_and_reentry(client, refusals, option, v, t):
    parent,h,url,s = open_l2(client)
    assert act(client,url,h,s,dict(type='explore',yes=True))[0].status_code == 409
    unlock(client,url,h,s)
    for _ in range(refusals):
        r,_ = act(client,url,h,s,dict(type='explore',yes=False))
        assert r.json()['score_effect']['reason'] == 'AWAITING_EXPLORE_EXIT'
        assert entries(client,parent,h) == []
    s.update(client.get(url,headers=h).json())
    r,body = act(client,url,h,s,dict(type='explore',yes=True))
    effect = r.json()['score_effect']
    assert effect['delta'] == dict(A=None,V=v,T=t,F=None)
    assert effect['events'][0]['option_id'] == option
    assert effect['events'][0]['evidence']['settlement'] == 'first-entry'
    assert client.post(url+'/actions',headers=h,json=body).json()['score_effect'] == effect
    saved = entries(client,parent,h)
    assert len(saved) == 1
    act(client,url,h,s,dict(type='return-hall'))
    act(client,url,h,s,dict(type='explore',yes=False))
    act(client,url,h,s,dict(type='explore',yes=True))
    act(client,url,h,s,dict(type='return-hall'))
    leave(client,url,h,s)
    assert client.post(url.replace('/l2','/l3'),headers=h,json={}).status_code == 200
    assert entries(client,parent,h) == saved
    assert act(client,url,h,s,dict(type='explore',yes=True))[0].json()['code'] == 'L2_FINALIZED'


@pytest.mark.parametrize('opened,refused', [(True,True),(True,False),(False,False)])
def test_staying_settles_only_at_exit_and_only_if_door_opened(client, opened, refused):
    parent,h,url,s = open_l2(client)
    if opened: unlock(client,url,h,s)
    if refused: act(client,url,h,s,dict(type='explore',yes=False))
    assert entries(client,parent,h) == []
    leave(client,url,h,s)
    rows = entries(client,parent,h)
    assert len(rows) == int(opened)
    if opened:
        assert rows[0]['option_id'] == 'stayed'
        assert rows[0]['vector'] == dict(A=None,V=2,T=1,F=None)
        assert rows[0]['evidence']['settlement'] == 'l2-exit'
    assert client.post(url.replace('/l2','/l3'),headers=h,json={}).status_code == 200
    assert entries(client,parent,h) == rows


@pytest.mark.parametrize('enter', [True,False])
def test_old_policy_does_not_gain_new_door_scores(client, enter):
    parent,h,url,s = open_l2(client)
    with app.state.engine.begin() as conn:
        policy = deepcopy(conn.execute(select(score_evaluations.c.policy).where(score_evaluations.c.session_id==parent['id'])).scalar_one())
        policy.pop('explore_settlement_version')
        policy['event_score_version'] = 'event-scores-v6-search-exit'
        policy['groups']['l2.explore'] = {'pending':dict(label='进入/不进入卧室探索',status='not_measured',vector=dict.fromkeys('AVTF'))}
        conn.execute(update(score_evaluations).where(score_evaluations.c.session_id==parent['id']).values(policy=policy))
    unlock(client,url,h,s)
    r,_ = act(client,url,h,s,dict(type='explore',yes=enter))
    assert r.json()['score_effect']['events'] == []
    if enter: act(client,url,h,s,dict(type='return-hall'))
    leave(client,url,h,s)
    assert entries(client,parent,h) == []
