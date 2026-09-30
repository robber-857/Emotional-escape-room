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
    v4=deepcopy(placement);v4['ruleVersion']='l2-metrics-full-footprint-v4'
    assert metric_band(v4,'tidiness',load_policy())==1
    v3=deepcopy(placement);v3['ruleVersion']='l2-metrics-overlap-groups-v3'
    assert metric_band(v3,'tidiness',load_policy())==1


import json
from pathlib import Path
from app.l2_layout import footprint
from app.l2_visual import intersect_rows
CASES=json.loads((Path(__file__).parents[3]/'content/l2-overlap-regression.json').read_text())


def test_alpha_masks_match_current_assets():
    from hashlib import sha256
    from app.l2_visual import MASKS
    root=Path(__file__).parents[3]
    for key,mask in MASKS['pieces'].items():
        assert sha256((root/f'apps/web/public/game/l2/{key}.png').read_bytes()).hexdigest()==mask['sha256']


def test_reported_two_visual_pairs_have_zero_floor_pairs():
    layout=CASES['reported']['layout']
    assert overlap_groups({k:footprint(k,p) for k,p in layout.items()})['pairs']==[]
    result=measure(layout,1)
    assert result['evidence']['overlapGroups']['pairs']==CASES['reported']['groups']['pairs']
    assert result['metrics']['tidinessBand']==2
    assert evaluate(result)['contributions']['F']==-1


def test_alpha_rows_ignore_transparent_holes_and_edge_contact():
    a=[(0,10,[(0,2),(8,10)])]
    assert intersect_rows(a,[(0,10,[(3,7)])])==[]
    assert intersect_rows(a,[(10,20,[(0,10)])])==[]
    assert intersect_rows(a,[(0,10,[(2,8)])])==[]
    assert intersect_rows(a,[(0,10,[(1.999,8.001)])])


@pytest.mark.parametrize('case', CASES.values())
def test_saved_scene_groups(case):
    actual=measure(case['layout'],1)['evidence']['overlapGroups']
    for k in ('pairs','triples','quadruples','band'):assert actual[k]==case['groups'][k]


@pytest.mark.parametrize('layout,band', [(c['layout'],c['groups']['band']) for c in CASES.values()])
def test_real_api_confirmation_settlement_and_retry(client,layout,band):
    parent,headers,url,state=open_l2(client)
    act(client,url,headers,state,dict(type='layout-start'))
    for key,point in layout.items():
        response,_=act(client,url,headers,state,dict(type='layout-move',id=key,point=point))
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
