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
    assert data['status']=='ready'
    assert data['portrait_id'] is not None and data['policy_version']=='avtf-signs-v1'
    assert all(data['vector'][axis] is not None for axis in 'AVTF')
    assert data['metrics']['authenticity']['score']==data['vector']['T']
    assert data['metrics']['love']['score']==data['vector']['F']
    assert set(data['input_versions'])=={'l1','l2','l3','l4'}
    assert client.get(endpoint,headers=h).json()==data
    assert before==records(parent['id'])
    assert client.post(endpoint,headers=h,json={'portrait_id':'01','score':90}).status_code==405


def test_ready_uses_only_server_policy(client,monkeypatch):
    from app.score_policy import bundle
    policy,digest=bundle()
    policy['portrait_policy']=dict(version='synthetic-test-only',thresholds=dict.fromkeys('AVTF',50),equal_to='high',
                                  portraits={key:'16' for key in ('LLLL','LLLH','LLHL','LLHH','LHLL','LHLH','LHHL','LHHH','HLLL','HLLH','HLHL','HLHH','HHLL','HHLH','HHHL','HHHH')})
    monkeypatch.setattr('app.score_service.bundle',lambda:(policy,digest))
    parent,h,url,s=open_l4(client)
    act(client,url,h,s,dict(type='confirm',door='forest'))
    data=client.get(f"/api/v1/sessions/{parent['id']}/result",headers=h).json()
    assert data['status']=='ready' and data['portrait_id']=='16'
    final=data['score_summary']['final']
    assert data['vector']==final['vector']
    for key,axis in [('authenticity','T'),('love','F')]:
        assert data['metrics'][key]==dict(score=final['vector'][axis],stars=stars(final['vector'][axis]))


def test_backpack_null_allows_final_scores_without_zero_imputation(client):
    parent,h,url,s=open_l4(client,item='backpack')
    act(client,url,h,s,dict(type='confirm',door='castle'))
    data=client.get(f"/api/v1/sessions/{parent['id']}/result",headers=h).json()
    summary=data['score_summary'];final=summary['final']
    assert final['status']=='ready'
    backpack=next(e for e in summary['ledger'] if e['group_id']=='l3.item')
    assert backpack['status']=='not_measured' and backpack['vector']==dict.fromkeys('AVTF')
    for axis in 'AVTF':
        measured=[level for level in summary['levels'].values() if level['axes'][axis]['status']!='not_measured']
        expected=sum(level['axes'][axis]['normalized']*level['weight'] for level in measured)/sum(level['weight'] for level in measured)
        assert final['vector'][axis]==pytest.approx(expected)
    assert data['metrics']['authenticity']['stars']==stars(final['vector']['T'])
    assert data['metrics']['love']['stars']==stars(final['vector']['F'])

@pytest.mark.parametrize('bad', [{'A':1},dict(A=101,V=1,T=1,F=1),dict(A=1,V=1,T=100.001,F=1),dict(A=1,V=1,T=1,F=float('nan'))])
def test_invalid_policy_fails_closed(bad):
    from app.portrait_policy import load_portrait_policy
    with pytest.raises(ValueError):build_result('test',{},dict(final=dict(status='ready',vector=bad)),load_portrait_policy())


def test_missing_bound_mapping_shows_scores_without_guessing_card(client,monkeypatch):
    from app.score_policy import bundle
    policy,digest=bundle();policy.pop('portrait_policy')
    monkeypatch.setattr('app.score_service.bundle',lambda:(policy,digest))
    parent,h,url,s=open_l4(client)
    act(client,url,h,s,dict(type='confirm',door='forest'))
    data=client.get(f"/api/v1/sessions/{parent['id']}/result",headers=h).json()
    assert data['reason']=='PORTRAIT_MAPPING_PENDING' and data['portrait_id'] is None
    assert data['vector']==data['score_summary']['final']['vector']


def test_result_mapping_is_bound_to_journey(client,monkeypatch):
    parent,h,url,s=open_l4(client)
    act(client,url,h,s,dict(type='confirm',door='forest'))
    endpoint=f"/api/v1/sessions/{parent['id']}/result"
    before=client.get(endpoint,headers=h).json()
    monkeypatch.setattr('app.portrait_policy.load_portrait_policy',lambda:None)
    assert client.get(endpoint,headers=h).json()==before

