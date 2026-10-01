from copy import deepcopy
import pytest
from sqlalchemy import select, update
from test_l1_api import client
from test_l2_api import open_l2, act, unlock
from app.main import app
from app.db import l2_runs, score_evaluations, score_ledger


@pytest.mark.parametrize("elapsed,expected", [(0,0),(14999,0),(15000,0),(15001,2),(30000,2)])
@pytest.mark.parametrize("legacy", [False,True])
def test_third_click_settles_bound_search_once(client, elapsed, expected, legacy):
    parent,h,url,s=open_l2(client)
    if legacy:
        with app.state.engine.begin() as conn:
            policy=deepcopy(conn.execute(select(score_evaluations.c.policy).where(score_evaluations.c.session_id==parent['id'])).scalar_one())
            policy.pop('search_settlement_version',None)
            conn.execute(update(score_evaluations).where(score_evaluations.c.session_id==parent['id']).values(policy=policy))
    unlock(client,url,h,s)
    for action in [dict(type='explore',yes=True),dict(type='search-choice',yes=True)]:
        r,_=act(client,url,h,s,action)
        assert r.json()['accepted']
        assert r.json()['score_effect']['events']==[]
    # Seed accepted elapsed time to cover exact millisecond boundaries without sleeping.
    # Client time validation remains covered by test_l2_api.
    with app.state.engine.begin() as conn:
        state=deepcopy(s['state']);state['search'].update(activeMs=elapsed,long=elapsed>15000)
        conn.execute(update(l2_runs).where(l2_runs.c.session_id==parent['id']).values(state=state))
    s.update(client.get(url,headers=h).json())
    for _ in range(2):
        r,_=act(client,url,h,s,dict(type='curtain-click'))
        assert r.json()['score_effect']['events']==[]
    r,body=act(client,url,h,s,dict(type='curtain-click'))
    effect=r.json()['score_effect']
    assert s['state']['search']['status']=='found'
    if legacy:
        assert effect['events']==[]
    else:
        assert effect['delta']==dict(A=expected,V=None,T=None,F=None)
        entry=effect['events'][0]
        assert entry['group_id']=='l2.search'
        assert entry['option_id']==('long' if elapsed>15000 else 'found_short')
        assert entry['evidence']['active_ms']==elapsed
        assert entry['evidence']['timing_verified'] is False
    duplicate=client.post(url+'/actions',headers=h,json=body).json()
    assert duplicate['duplicate'] and duplicate['score_effect']==effect
    rejected,_=act(client,url,h,s,dict(type='curtain-click'))
    assert not rejected.json()['accepted']
    act(client,url,h,s,dict(type='return-hall'))
    act(client,url,h,s,dict(type='explore',yes=True))
    with app.state.engine.connect() as conn:
        rows=conn.execute(select(score_ledger).where(score_ledger.c.session_id==parent['id'],score_ledger.c.group_id=='l2.search')).all()
    assert len(rows)==(0 if legacy else 1)


@pytest.mark.parametrize("mode,elapsed,expected", [('declined',0,-2),('returned',14999,-2),('returned',15000,-2),('returned',15001,2),('idle',0,None)])
def test_abandon_waits_until_l3_entry_and_uses_latest_state(client,mode,elapsed,expected):
    parent,h,url,s=open_l2(client);unlock(client,url,h,s)
    act(client,url,h,s,dict(type='explore',yes=True))
    if mode=='declined':
        r,_=act(client,url,h,s,dict(type='search-choice',yes=False))
        assert r.json()['score_effect']['reason']=='AWAITING_SEARCH_EXIT'
    elif mode=='returned':
        act(client,url,h,s,dict(type='search-choice',yes=True))
        with app.state.engine.begin() as conn:
            state=deepcopy(s['state']);state['search'].update(activeMs=elapsed,long=elapsed>15000)
            conn.execute(update(l2_runs).where(l2_runs.c.session_id==parent['id']).values(state=state))
        s.update(client.get(url,headers=h).json())
    act(client,url,h,s,dict(type='return-hall'))
    def ledger():
        with app.state.engine.connect() as conn:
            return conn.execute(select(score_ledger.c.entry).where(score_ledger.c.session_id==parent['id'],score_ledger.c.group_id=='l2.search')).scalars().all()
    assert ledger()==[]
    act(client,url,h,s,dict(type='layout-start'));act(client,url,h,s,dict(type='layout-confirm'))
    start=url.replace('/l2','/l3')
    assert client.post(start,headers=h,json={}).status_code==200
    rows=ledger()
    assert len(rows)==(0 if expected is None else 1)
    if rows:
        assert rows[0]['vector']==dict(A=expected,V=None,T=None,F=None)
        assert rows[0]['evidence']['settlement']=='l2-exit'
    assert client.post(start,headers=h,json={}).status_code==200
    assert ledger()==rows


@pytest.mark.parametrize('abandon',['declined','returned'])
def test_revisit_and_find_replaces_abandon_without_penalty(client,abandon):
    parent,h,url,s=open_l2(client);unlock(client,url,h,s)
    act(client,url,h,s,dict(type='explore',yes=True))
    act(client,url,h,s,dict(type='search-choice',yes=abandon=='returned'))
    act(client,url,h,s,dict(type='return-hall'))
    # Confirm furniture before revisiting: search evidence must not use its old cutoff.
    act(client,url,h,s,dict(type='layout-start'));act(client,url,h,s,dict(type='layout-confirm'))
    act(client,url,h,s,dict(type='explore',yes=True))
    act(client,url,h,s,dict(type='search-choice',yes=True))
    for _ in range(3):r,_=act(client,url,h,s,dict(type='curtain-click'))
    assert r.json()['score_effect']['delta']==dict(A=0,V=None,T=None,F=None)
    act(client,url,h,s,dict(type='return-hall'))
    assert client.post(url.replace('/l2','/l3'),headers=h,json={}).status_code==200
    with app.state.engine.connect() as conn:
        rows=conn.execute(select(score_ledger.c.entry).where(score_ledger.c.session_id==parent['id'],score_ledger.c.group_id=='l2.search')).scalars().all()
    assert len(rows)==1 and rows[0]['option_id']=='found_short'
