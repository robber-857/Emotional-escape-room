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
    levels={k:dict(complete=True,weight=w,axes={a:dict(normalized=n,status='final') for a in 'AVTF'}) for k,w,n in [('l1',.2,10),('l2',.3,20),('l3',.3,30),('l4',.2,40)]}
    assert weighted_summary(levels)['vector']==dict.fromkeys('AVTF',25)
    levels['l4']['axes']['T']=dict(normalized=None,status='not_measured')
    result=weighted_summary(levels)
    assert result['vector']['T']==pytest.approx(21.25)
    assert result['metrics']['authenticity']['stars']==2
    assert result['metrics']['love']['score']==25
    levels['l4']['complete']=False
    assert all(v is None for v in weighted_summary(levels)['vector'].values())
    levels['l4']['complete']=True;levels['l3']['axes']['F']['normalized']=None
    result=weighted_summary(levels)
    assert result['vector']['F'] is None and result['vector']['A']==25


def test_no_click_scores_and_raw_delta_matches_server_ledger(client):
    s,h=session(client)
    r,_=send(client,s,h,'search')
    assert r.json()['score_effect']['reason']=='MECHANICAL_STEP'
    assert scores(client,s,h)['ledger']==[]
    r,body=send(client,s,h,'swim')
    effect=r.json()['score_effect']
    assert effect['delta']==dict(A=-1,V=None,T=None,F=-2)
    assert 'raw_total_delta' not in effect
    assert effect['events'][0]['group_id']=='l1.crossing'
    duplicate=client.post(f"/api/v1/sessions/{s['id']}/actions",headers=h,json=body).json()
    assert duplicate['duplicate'] and duplicate['score_effect']==effect
    send(client,s,h,'enter')
    result=scores(client,s,h)
    axes=result['levels']['l1']['axes']
    assert axes['A']['raw']==-1 and axes['F']['raw']==-4
    assert axes['A']['normalized']==0 and axes['F']['normalized']==0
    assert all(v is None for v in result['final']['vector'].values())
    assert 'total' not in result['levels']['l1']
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


def test_furniture_reconfirmation_never_duplicates_and_fixed_thresholds_score(client):
    parent,h,url,s=open_l2(client)
    for _ in range(2):
        act(client,url,h,s,dict(type='layout-start'))
        r,_=act(client,url,h,s,dict(type='layout-confirm'))
    assert all(e['reason']=='ALREADY_SCORED' for e in r.json()['score_effect']['events'])
    rows=[e for e in scores(client,parent,h)['ledger'] if e['level']=='l2']
    assert len(rows)==3 and all(e['reason']=='APPLIED' and e['vector'] is not None for e in rows)


@pytest.mark.parametrize('door,a,v',[('village',0,0),('coast',100,100),('forest',0,100),('castle',100,0)])
def test_l4_independent_axes_and_no_fabricated_final(client,door,a,v):
    parent,h,url,s=open_l4(client)
    act(client,url,h,s,dict(type='confirm',door=door))
    value=scores(client,parent,h)
    assert value['levels']['l4']['axes']['A']['normalized']==a
    assert value['levels']['l4']['axes']['V']['normalized']==v
    assert value['levels']['l4']['axes']['F']['raw'] is None
    assert value['final']['status']=='pending_configuration'
    assert value['final']['vector']['F'] is None


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


def test_fixed_furniture_boundaries_and_count_cap():
    from app.l2_scoring import evaluate,load_policy
    policy=load_policy()
    assert policy['adjustment_count_cap']==20
    for count,t in [(0,2),(5,2),(6,1),(10,1),(11,-1),(15,-1),(16,-2),(20,-2),(21,-2)]:
        value=evaluate(dict(eligible=True,metrics=dict(wallWindowProximity=.25,tidiness=.75,adjustmentCount=count)))
        assert value['contributions']==dict(A=-2,V=None,T=t,F=1)


def test_old_scalar_policy_is_not_silently_reinterpreted(client):
    from sqlalchemy import update
    s,h=session(client)
    with app.state.engine.begin() as conn:
        row=conn.execute(select(score_evaluations).where(score_evaluations.c.session_id==s['id'])).mappings().one()
        policy=dict(row['policy'],normalization_version='theoretical-minmax-v1')
        conn.execute(update(score_evaluations).where(score_evaluations.c.session_id==s['id']).values(policy=policy))
    assert scores(client,s,h)['status']=='legacy_normalization'
    assert send(client,s,h,'swim')[0].json()['score_effect']['status']=='legacy_normalization'


def test_user_armchair_outside_confirm_rejected_then_recoverable(client):
    parent,h,url,s=open_l2(client)
    act(client,url,h,s,dict(type='layout-start'))
    act(client,url,h,s,dict(type='layout-move',id='armchair',point=dict(u=.27791321372763345,v=.9298451630714811)))
    r,_=act(client,url,h,s,dict(type='layout-confirm'))
    assert r.status_code==409 and r.json()['code']=='LAYOUT_OUTSIDE_FLOOR'
    assert r.json()['score_effect']['diagnostic']['outsideFloor']==['armchair']
    assert s['state']['furniture']['assessment'] is None
    assert not [e for e in scores(client,parent,h)['ledger'] if e['group_id'].startswith('l2.furniture.')]
    act(client,url,h,s,dict(type='layout-move',id='armchair',point=dict(u=.27791321372763345,v=.89)))
    r,_=act(client,url,h,s,dict(type='layout-confirm'))
    assert r.status_code==200
    assert len(r.json()['score_effect']['events'])==3
    assert all(e['status']=='applied' for e in r.json()['score_effect']['events'])


def test_l3_open_close_true_is_final_before_remaining_answers(client):
    parent,h,url,s=open_l3(client)
    act(client,url,h,s,dict(type='decision',slot='open',yes=True))
    r,_=act(client,url,h,s,dict(type='decision',slot='close',yes=False))
    assert r.json()['score_effect']['reason']=='AWAITING_STORM_CUTOFF'
    r,body=act(client,url,h,s,dict(type='decision',slot='close',yes=True))
    assert r.json()['score_effect']['events'][0]['option_id']=='closed'
    assert s['state']['segment']=='storm'
    assert client.post(url+'/actions',headers=h,json=body).json()['score_effect']==r.json()['score_effect']
    for slot in ['wait','curtain','window','television']:
        act(client,url,h,s,dict(type='decision',slot=slot,yes=False))
    assert len([e for e in scores(client,parent,h)['ledger'] if e['group_id']=='l3.storm-door'])==1


@pytest.mark.parametrize('seat,delta',[('chair',1),('table-seat',-1)])
def test_first_seat_maps_and_never_scores_twice(client,seat,delta):
    parent,h,url,s=open_l2(client)
    act(client,url,h,s,dict(type='sit',seat=seat,yes=False))
    assert not [e for e in scores(client,parent,h)['ledger'] if e['group_id']=='l2.seat']
    r,_=act(client,url,h,s,dict(type='sit',seat=seat,yes=True))
    assert r.json()['score_effect']['delta']==dict(A=delta,V=None,T=None,F=None)
    if seat=='table-seat':act(client,url,h,s,dict(type='view',view='room'))
    r,_=act(client,url,h,s,dict(type='sit',seat='chair' if seat=='table-seat' else 'table-seat',yes=True))
    assert r.json()['score_effect']['reason']=='ALREADY_SCORED'
    assert len([e for e in scores(client,parent,h)['ledger'] if e['group_id']=='l2.seat'])==1


def test_no_seat_first_table_scores_explicit_zero(client):
    parent,h,url,s=open_l2(client)
    r,_=act(client,url,h,s,dict(type='arrive-table'))
    assert r.json()['score_effect']['delta']==dict(A=0,V=None,T=None,F=None)
    r,_=act(client,url,h,s,dict(type='sit',seat='table-seat',yes=True))
    assert r.json()['score_effect']['reason']=='ALREADY_SCORED'
