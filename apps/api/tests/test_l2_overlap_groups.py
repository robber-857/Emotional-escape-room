from itertools import combinations
from copy import deepcopy
import pytest
from app.l2_metrics import overlap_groups, measure
from app.l2_layout import initial_layout
from app.l2_scoring import evaluate, metric_band, load_policy
from test_l1_api import client
from test_l2_api import open_l2, act


def box(x, width=1):
    return dict(left=x, right=x+width, top=0, bottom=1)


@pytest.mark.parametrize('ids', list(combinations('ABCD', 2))+list(combinations('ABCD', 3))+[tuple('ABCD')])
def test_every_pair_triple_and_quadruple(ids):
    cores={k:box(0 if k in ids else 10+i*2) for i,k in enumerate('ABCD')}
    result=overlap_groups(cores)
    assert result['band'] == (3 if len(ids)==2 else 1)
    assert len(result['pairs']) == len(list(combinations(ids,2)))
    assert result['triples'] == [list(g) for g in combinations(ids,3)]
    assert len(result['quadruples']) == (len(ids)==4)


@pytest.mark.parametrize('positions,band,pairs', [([0,2,4,6],4,0),([0,1,2,3],4,0),
    ([0,.9,1.8,5],2,2),([0,.9,4,4.9],2,2),([0,.9,1.8,2.7],2,3),([0,.999,4,6],3,1)])
def test_chain_disjoint_pairs_contact_and_small_overlap(positions,band,pairs):
    result=overlap_groups(dict(zip('ABCD',map(box,positions))))
    assert result['band']==band and len(result['pairs'])==pairs
    assert not result['triples'] and not result['quadruples']


def test_vertical_edge_contact_is_not_overlap():
    cores={k:dict(left=0,right=1,top=i,bottom=i+1) for i,k in enumerate('ABCD')}
    assert overlap_groups(cores)['band']==4


def test_new_band_overrides_average_but_old_confirmation_keeps_old_rule():
    placement=measure(initial_layout(),0)
    placement['metrics'].update(tidiness=1,tidinessBand=1)
    assert evaluate(placement)['contributions']['F']==-2
    old=deepcopy(placement);old['ruleVersion']='l2-metrics-proximity-v2'
    old['metrics'].pop('tidinessBand')
    assert metric_band(old,'tidiness',load_policy())==4
    assert evaluate(old)['contributions']['F']==2
    v3=deepcopy(placement);v3['ruleVersion']='l2-metrics-overlap-groups-v3'
    assert metric_band(v3,'tidiness',load_policy())==1


def test_table_chair_outer_strip_counts_as_one_pair():
    layout={'armchair':dict(u=.25,v=.5),'table-chair':dict(u=.52,v=.5),
            'chair':dict(u=.8,v=.25),'sofa':dict(u=.75,v=.85)}
    result=measure(layout,1)
    assert result['metrics']['tidinessBand']==3
    assert result['evidence']['overlapGroups']['pairs']==[['armchair','table-chair']]
    assert evaluate(result)['contributions']['F']==1


@pytest.mark.parametrize('layout,band', [
    ({'armchair':(.25,.5),'table-chair':(.52,.5),'chair':(.8,.25),'sofa':(.75,.85)},3),
    ({'armchair':(.2,.4),'chair':(.7,.4),'sofa':(.25,.8),'table-chair':(.7,.8)},4),
    ({'armchair':(.3,.4),'chair':(.3,.4),'sofa':(.25,.8),'table-chair':(.7,.8)},3),
    ({'armchair':(.3,.4),'chair':(.3,.4),'sofa':(.6,.8),'table-chair':(.6,.8)},2),
    ({'armchair':(.5,.5),'chair':(.5,.5),'sofa':(.5,.5),'table-chair':(.7,.8)},1),
    ({k:(.5,.5) for k in ('armchair','chair','sofa','table-chair')},1),
])
def test_real_api_confirmation_settlement_and_retry(client,layout,band):
    parent,headers,url,state=open_l2(client)
    act(client,url,headers,state,dict(type='layout-start'))
    for key,(u,v) in layout.items():
        response,_=act(client,url,headers,state,dict(type='layout-move',id=key,point=dict(u=u,v=v)))
        assert response.status_code==200
    response,request=act(client,url,headers,state,dict(type='layout-confirm'))
    assert response.status_code==200
    placement=state['state']['furniture']['assessment']['placement']
    assert placement['metrics']['tidinessBand']==band
    assert response.json()['score_effect']['reason']=='AWAITING_L3_ENTRY'
    duplicate=client.post(url+'/actions',headers=headers,json=request).json()
    assert duplicate['duplicate'] and duplicate['outcome']==response.json()['outcome']
    start=url.replace('/l2','/l3')
    assert client.post(start,headers=headers,json={}).status_code==200
    score_url=f"/api/v1/sessions/{parent['id']}/scoring"
    ledger=client.get(score_url,headers=headers).json()['ledger']
    row=next(e for e in ledger if e['group_id']=='l2.furniture.tidiness')
    assert row['option_id']==str(band) and row['vector']['F']==(-2,-1,1,2)[band-1]
    assert row['evidence']['placement']==placement
    assert client.post(start,headers=headers,json={}).status_code==200
    assert client.get(score_url,headers=headers).json()['ledger']==ledger
