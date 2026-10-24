import time
import pytest
from app.ai_report import NAMES, validate_report, collect_evidence, describe_action
from test_l1_api import client, session
from test_l4_api import open_l4, act

def sample(evidence):
    ids=[evidence[0]['id']]
    return dict(title='你的旅程解读', introduction='从这次选择出发。',
      insights=[dict(title='尝试',evidence_ids=ids,behavior='选择行动',emotional_feature='可能愿意尝试',relationship='可能主动沟通',suggestion='表达需求')],
      semantics=[dict(evidence_ids=ids,node='过河',option='行动',meaning='尝试',explanation='仅供参考',tags=['尝试'])],
      limitation='不是心理诊断。')

def test_v5_mapping_and_evidence_validation():
    assert len(NAMES)==16 and len({x['name'] for x in NAMES})==16
    assert NAMES[5]['name']=='释怀者' and NAMES[1]['name']=='自若者'
    value=sample([dict(id='l1-1')])
    validate_report(value,[dict(id='l1-1')])
    value['insights'][0]['evidence_ids']=['invented']
    with pytest.raises(ValueError):validate_report(value,[dict(id='l1-1')])

def test_action_semantics_keep_refusals_and_closing_actions():
    assert describe_action('l3',dict(type='decision',slot='window',yes=True))=='选择：关闭左窗'
    assert describe_action('l3',dict(type='decision',slot='television',yes=False))=='明确拒绝：关掉电视机电源'
    assert '耳环' in describe_action('l2',dict(type='search-choice',yes=False))
    assert '明确拒绝' in describe_action('l2',dict(type='search-choice',yes=False))

def test_report_auth_completion_dedup_and_cached_result(client,monkeypatch):
    from app.main import app
    calls=[]
    def generate(payload):
        calls.append(payload)
        return sample(payload['evidence'])
    monkeypatch.setenv('OPENAI_API_KEY','test-only')
    monkeypatch.setattr('app.ai_report.generate_report',generate)
    parent,h,url,s=open_l4(client)
    endpoint=f"/api/v1/sessions/{parent['id']}/report"
    assert client.post(endpoint).status_code==404
    _,other=session(client)
    assert client.get(endpoint,headers=other).status_code==404
    assert client.post(endpoint,headers=h).status_code==409
    act(client,url,h,s,dict(type='confirm',door='forest'))
    with app.state.engine.connect() as conn:
        evidence=collect_evidence(conn,parent['id'])
    assert evidence and all('token' not in e and 'session_id' not in e for e in evidence)
    assert client.post(endpoint,headers=h).status_code==200
    for _ in range(100):
        data=client.get(endpoint,headers=h).json()
        if data['status']!='generating':break
        time.sleep(.01)
    assert data['status']=='ready'
    assert client.post(endpoint,headers=h).json()==data
    assert len(calls)==1
    assert calls[0]['evidence']==evidence

def test_provider_error_redacted_and_retry_cooled_down(client,monkeypatch):
    calls=[]
    def fail(payload):
        calls.append(1)
        raise RuntimeError('secret-provider-key-and-body')
    monkeypatch.setenv('OPENAI_API_KEY','test-only')
    monkeypatch.setattr('app.ai_report.generate_report',fail)
    parent,h,url,s=open_l4(client)
    act(client,url,h,s,dict(type='confirm',door='forest'))
    endpoint=f"/api/v1/sessions/{parent['id']}/report"
    client.post(endpoint,headers=h)
    for _ in range(100):
        data=client.get(endpoint,headers=h).json()
        if data['status']!='generating':break
        time.sleep(.01)
    assert data['status']=='error' and 'secret' not in str(data)
    client.post(endpoint,headers=h)
    assert len(calls)==1
