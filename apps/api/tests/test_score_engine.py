from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
import os
from uuid import uuid4
import pytest
from sqlalchemy import select,delete,event
from sqlalchemy.exc import SQLAlchemyError
from test_l1_api import client,session,send
from test_l2_api import open_l2,act
from test_l3_api import open_l3
from test_l4_api import open_l4
from app.main import app
from app.db import score_evaluations,score_ledger,sessions,events
from app.score_normalization import normalize,weighted_summary
from app.score_policy import bundle


def scores(client,s,h):
    response=client.get(f"/api/v1/sessions/{s['id']}/scoring",headers=h)
    assert response.status_code==200
    return response.json()


@pytest.mark.parametrize("raw,expected",[(-9,0),(-5,400/13),(0,900/13),(4,100)])
def test_fixed_theoretical_normalization(raw,expected):
    assert normalize(raw,-9,4)==pytest.approx(expected)
    assert normalize(None,-9,4) is None
    assert normalize(0,0,0) is None


def test_out_of_range_is_error_not_silent_clamp():
    with pytest.raises(ValueError):normalize(9,-2,2)


def test_fixed_weights_require_four_complete_levels():
    levels={k:dict(complete=True,weight=w,total=dict(normalized=s,provisional=s)) for k,w,s in [('l1',.2,10),('l2',.3,20),('l3',.3,30),('l4',.2,40)]}
    assert weighted_summary(levels)['score']==25
    levels['l4']['complete']=False
    assert weighted_summary(levels)['score'] is None
    levels['l4']['complete']=True;levels['l4']['total']['normalized']=None
    assert weighted_summary(levels)['status']=='pending_configuration'


def test_no_click_scores_and_raw_delta_matches_server_ledger(client):
    s,h=session(client)
    r,_=send(client,s,h,'search')
    assert r.json()['score_effect']['reason']=='MECHANICAL_STEP'
    assert scores(client,s,h)['ledger']==[]
    r,body=send(client,s,h,'swim')
    effect=r.json()['score_effect']
    assert effect['delta']==dict(A=-1,V=None,T=None,F=-2)
    assert effect['raw_total_delta']==-3
    assert effect['events'][0]['group_id']=='l1.crossing'
    duplicate=client.post(f"/api/v1/sessions/{s['id']}/actions",headers=h,json=body).json()
    assert duplicate['duplicate'] and duplicate['score_effect']==effect
    send(client,s,h,'enter')
    result=scores(client,s,h)
    total=result['levels']['l1']['total']
    assert total['raw']==-5 and (total['lower'],total['upper'])==(-9,4)
    assert total['normalized']==pytest.approx(400/13)
    assert result['final']['score'] is None
    assert len(result['ledger'])==2 and len(result['actions'])==3


def test_refusal_and_rejection_are_not_zero_score_events(client):
    s,h=session(client)
    r,_=send(client,s,h,'swim',yes=False)
    assert r.json()['score_effect']['reason']=='NO_SCORE_ON_NO'
    r,_=send(client,s,h,'enter')
    assert r.json()['score_effect']['reason']=='REJECTED'
    assert scores(client,s,h)['ledger']==[]
    assert len(scores(client,s,h)['actions'])==2
    assert client.get(f"/api/v1/sessions/{s['id']}/scoring").status_code==404


@pytest.mark.parametrize('lit,taken,expected',[(True,True,2),(True,False,0),(False,True,0),(False,False,-2)])
def test_lamp_finalization_and_explicit_zero(client,lit,taken,expected):
    s,h=session(client);send(client,s,h,'swim')
    if taken:assert send(client,s,h,'take-lamp')[0].json()['score_effect']['reason']=='AWAITING_FINALIZATION'
    if lit:assert send(client,s,h,'light-lamp')[0].json()['score_effect']['reason']=='AWAITING_FINALIZATION'
    assert len(scores(client,s,h)['ledger'])==1
    r,_=send(client,s,h,'enter')
    assert r.json()['score_effect']['delta']['F']==expected
    assert r.json()['score_effect']['reason']=='APPLIED'
    assert len(scores(client,s,h)['ledger'])==2


def test_boat_fifth_stroke_counts_once_and_retains_zero_f(client):
    s,h=session(client)
    for _ in range(5):send(client,s,h,'search')
    send(client,s,h,'board')
    for _ in range(4):assert send(client,s,h)[0].json()['score_effect']['events']==[]
    r,_=send(client,s,h)
    assert r.json()['score_effect']['delta']==dict(A=1,V=None,T=None,F=0)
    assert len(scores(client,s,h)['ledger'])==1


@pytest.mark.parametrize('window,tv,value',[(True,True,2),(True,False,0),(False,True,0),(False,False,-2)])
def test_environment_waits_for_all_answers_and_scores_once(client,window,tv,value):
    parent,h,url,s=open_l3(client)
    for slot,yes in [('open',False),('close',False),('window',window),('television',tv),('wait',False)]:
        r,_=act(client,url,h,s,dict(type='decision',slot=slot,yes=yes))
        assert not r.json()['score_effect']['events']
    r,body=act(client,url,h,s,dict(type='decision',slot='curtain',yes=False))
    groups=r.json()['score_effect']['events']
    assert len(groups)==4
    assert next(e for e in groups if e['group_id']=='l3.environment')['vector']==dict(A=None,V=None,T=None,F=value)
    assert client.post(url+'/actions',headers=h,json=body).json()['score_effect']==r.json()['score_effect']
    assert len([e for e in scores(client,parent,h)['ledger'] if e['group_id']=='l3.environment'])==1


def test_furniture_reconfirmation_never_duplicates_and_missing_pool_not_zero(client):
    parent,h,url,s=open_l2(client)
    for _ in range(2):
        act(client,url,h,s,dict(type='layout-start'))
        r,_=act(client,url,h,s,dict(type='layout-confirm'))
    assert all(e['reason']=='ALREADY_SCORED' for e in r.json()['score_effect']['events'])
    rows=[e for e in scores(client,parent,h)['ledger'] if e['level']=='l2']
    assert len(rows)==3 and all(e['reason']=='QUARTILE_POOL_NOT_CONFIGURED' and e['vector'] is None for e in rows)


@pytest.mark.parametrize('door,raw,norm',[('village',-2,0),('coast',2,100),('forest',0,50),('castle',0,50)])
def test_l4_normalized_total_and_no_fabricated_final(client,door,raw,norm):
    parent,h,url,s=open_l4(client)
    act(client,url,h,s,dict(type='confirm',door=door))
    value=scores(client,parent,h)
    assert value['levels']['l4']['total']['raw']==raw
    assert value['levels']['l4']['total']['normalized']==norm
    assert value['levels']['l4']['axes']['F']['raw'] is None
    assert value['final']['status']=='pending_configuration'
    assert value['final']['score'] is None


def test_bound_policy_cannot_change_when_next_journey_uses_new_version(client,monkeypatch):
    old,h=session(client)
    policy,digest=bundle();changed=deepcopy(policy)
    changed['event_score_version']='synthetic-test-v2'
    changed['groups']['l1.crossing']['swim']['vector']['A']=-5
    monkeypatch.setattr('app.score_service.bundle',lambda:(changed,'synthetic-test-hash'))
    new,h2=session(client)
    assert send(client,old,h,'swim')[0].json()['score_effect']['delta']['A']==-1
    assert send(client,new,h2,'swim')[0].json()['score_effect']['delta']['A']==-5
    assert scores(client,old,h)['policy_hash']==digest


def test_legacy_journey_remains_unbound_without_rewriting_events(client):
    s,h=session(client)
    with app.state.engine.begin() as conn:conn.execute(delete(score_evaluations).where(score_evaluations.c.session_id==s['id']))
    r,_=send(client,s,h,'swim')
    assert r.json()['score_effect']['status']=='legacy_unbound'
    assert scores(client,s,h)['status']=='legacy_unbound'


def test_score_insert_failure_rolls_back_game_and_receipt(client):
    s,h=session(client)
    def fail(conn,cursor,statement,parameters,context,executemany):
        if 'INSERT INTO score_ledger' in statement:raise SQLAlchemyError('injected')
    event.listen(app.state.engine,'before_cursor_execute',fail)
    try:assert send(client,s,h,'swim')[0].status_code==503
    finally:event.remove(app.state.engine,'before_cursor_execute',fail)
    with app.state.engine.connect() as conn:
        assert conn.execute(select(sessions.c.version).where(sessions.c.id==s['id'])).scalar_one()==0
        assert not conn.execute(select(events).where(events.c.session_id==s['id'])).all()
        assert not conn.execute(select(score_ledger).where(score_ledger.c.session_id==s['id'])).all()


@pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'),reason='isolated PostgreSQL required')
def test_concurrent_crossing_exactly_one_ledger_entry(client):
    s,h=session(client);url=f"/api/v1/sessions/{s['id']}/actions"
    body=dict(action_id=str(uuid4()),expected_version=0,action=dict(type='choose',choice='swim',yes=True),positions={})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses=list(pool.map(lambda _:client.post(url,headers=h,json=body),range(2)))
    assert all(r.status_code==200 for r in responses)
    assert sorted(r.json()['duplicate'] for r in responses)==[False,True]
    assert len(scores(client,s,h)['ledger'])==1
