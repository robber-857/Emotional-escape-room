import pytest
from app.results import stars, build_result
from app import results
from test_l1_api import client, session
from test_l4_api import open_l4, act, records

@pytest.mark.parametrize('score,expected', [(0,1),(19.999,1),(20,2),(39.999,2),(40,3),(59.999,3),(60,4),(79.999,4),(80,5),(99.999,5),(100,5)])
def test_rating_boundaries(score,expected):
    assert stars(score)==expected

@pytest.mark.parametrize('score', [-1,100.001,101,float('nan'),float('inf'),True,'20',None])
def test_invalid_scores(score):
    with pytest.raises(ValueError): stars(score)


def test_result_auth_gate_and_pending_no_mutation(client):
    parent,h,url,s=open_l4(client)
    endpoint=f"/api/v1/sessions/{parent['id']}/result"
    assert client.get(endpoint).status_code==404
    _,other=session(client)
    assert client.get(endpoint,headers=other).status_code==404
    assert client.get(endpoint,headers=h).json()['detail']=='L4_NOT_COMPLETE'
    act(client,url,h,s,dict(type='confirm',door='forest'))
    before=records(parent['id'])
    first=client.get(endpoint,headers=h)
    assert first.status_code==200
    data=first.json()
    assert data['status']=='pending_configuration'
    assert all(data[k] is None for k in ('portrait_id','vector','metrics','policy_version'))
    assert set(data['input_versions'])=={'l1','l2','l3','l4'}
    assert client.get(endpoint,headers=h).json()==data
    assert before==records(parent['id'])
    assert client.post(endpoint,headers=h,json={'portrait_id':'01','score':90}).status_code==405


def test_ready_uses_only_server_policy(client,monkeypatch):
    parent,h,url,s=open_l4(client)
    act(client,url,h,s,dict(type='confirm',door='forest'))
    def policy(snapshots):
        assert snapshots['l4']['state']['door']=='forest'
        return dict(policy_version='test-only',portrait_id='16',vector=dict(A=1,V=2,T=3,F=4),authenticity=100,love=100)
    monkeypatch.setattr(results,'evaluate_journey',policy)
    data=client.get(f"/api/v1/sessions/{parent['id']}/result",headers=h).json()
    assert data['status']=='ready' and data['portrait_id']=='16'
    assert data['metrics']==dict(authenticity=dict(score=100,stars=5),love=dict(score=100,stars=5))

@pytest.mark.parametrize('bad', [dict(portrait_id='17'),dict(vector={'A':1}),dict(authenticity=100.001),dict(love=float('nan'))])
def test_invalid_policy_fails_closed(monkeypatch,bad):
    value=dict(policy_version='test',portrait_id='01',vector=dict(A=1,V=1,T=1,F=1),authenticity=0,love=0)
    value.update(bad)
    monkeypatch.setattr(results,'evaluate_journey',lambda _:value)
    with pytest.raises(ValueError): build_result('test',{})

