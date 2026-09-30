from copy import deepcopy
import json
import pytest
from test_l1_api import client
from test_l2_api import open_l2, act
from app.l2_layout import initial_layout, overlap_footprint, footprint
from app.l2_metrics import measure, METRIC_VERSION
from app.l2_domain import with_completion
from app import l2_scoring
from app.l2_calibrate import build_policy


def configured(tmp_path, monkeypatch):
    path = tmp_path / "quartiles.json"
    policy = dict(metric_version=METRIC_VERSION, pool=dict(id="synthetic-test-only", version="1", sample_size=40, minimum_sample_size=20),
                  tie_policy="equal_to_lower_raw_bucket", thresholds=dict(wallWindowProximity=[.2,.5,.8], tidiness=[.2,.5,.8], adjustmentCount=[1,3,6]))
    path.write_text(json.dumps(dict(schema_version=1, active_version="test-v1", versions={"test-v1": policy})))
    monkeypatch.setattr(l2_scoring, "CONFIG_PATH", path)
    return path


@pytest.mark.parametrize("value,count,af,t", [(.1,0,-2,2),(.4,2,-1,1),(.7,5,1,-1),(.9,8,2,-2)])
def test_all_twelve_quartile_mappings(tmp_path,monkeypatch,value,count,af,t):
    configured(tmp_path,monkeypatch)
    p=measure(initial_layout(),count);p["metrics"].update(wallWindowProximity=value,tidiness=value,tidinessBand={-2:1,-1:2,1:3,2:4}[af])
    result=l2_scoring.evaluate(p)
    assert result["contributions"] == dict(A=af,V=None,T=t,F=af)
    assert result["policy"]["pool"]["id"] == "synthetic-test-only"


def test_boundaries_ties_and_invalid_configuration(tmp_path,monkeypatch):
    path=configured(tmp_path,monkeypatch)
    p=measure(initial_layout(),3);p["metrics"].update(wallWindowProximity=.5,tidiness=.5,tidinessBand=2)
    assert l2_scoring.evaluate(p)["quartiles"] == dict(wallWindowProximity=2,tidiness=2,adjustmentCount=2)
    data=json.loads(path.read_text());data["versions"]["test-v1"]["thresholds"]["adjustmentCount"]=[3,3,3]
    path.write_text(json.dumps(data))
    assert l2_scoring.evaluate(p)["quartiles"]["adjustmentCount"] == 1
    data["versions"]["test-v1"]["thresholds"]["tidiness"]=[.8,.5,.2];path.write_text(json.dumps(data))
    assert l2_scoring.evaluate(p)["reasons"] == ["INVALID_QUARTILE_CONFIGURATION"]


def test_overlap_is_continuous_and_table_chair_uses_full_footprint():
    layout=initial_layout()
    assert measure(layout,0)["metrics"]["tidiness"] == 1
    values=[]
    for offset in [.19,.15,.10,0]:
        candidate=deepcopy(layout);candidate["chair"]=dict(u=layout["sofa"]["u"]-offset,v=layout["sofa"]["v"])
        values.append(measure(candidate,1)["metrics"]["tidiness"])
    assert values == sorted(values,reverse=True) and values[0] > values[-1]
    full=footprint("table-chair",layout["table-chair"]);core=overlap_footprint("table-chair",layout["table-chair"])
    assert core == full
    assert core["top"] == full["top"] and core["bottom"] == full["bottom"]
    stacked={k:dict(u=.5,v=.5) for k in layout}
    assert measure(stacked,4)["metrics"]["tidinessBand"] == 1


def test_floor_quality_does_not_redefine_overlap_and_legacy_is_not_zero():
    layout=initial_layout();layout["chair"]=dict(u=.4,v=-.5)
    result=measure(layout,None)
    assert result["metrics"]["tidiness"] == 1
    assert set(result["reasons"]) == {"OUTSIDE_FLOOR","LEGACY_ADJUSTMENT_HISTORY_MISSING"}
    assert l2_scoring.evaluate(result)["contributions"] is None


def test_count_retry_undo_reset_refresh_and_latest_confirmation(client,tmp_path,monkeypatch):
    configured(tmp_path,monkeypatch)
    _,h,url,s=open_l2(client)
    act(client,url,h,s,dict(type="layout-start"))
    original=deepcopy(s["state"]["furniture"]["layout"])
    tiny=dict(original["chair"],u=original["chair"]["u"]+.0001)
    assert act(client,url,h,s,dict(type="layout-move",id="chair",point=tiny))[0].json()["code"] == "NO_CHANGE"
    response,request=act(client,url,h,s,dict(type="layout-move",id="chair",point=dict(u=.45,v=.35)))
    assert response.json()["outcome"]["adjustment_count"] == 1
    duplicate=client.post(url+"/actions",headers=h,json=request).json()
    assert duplicate["duplicate"] and duplicate["session"]["state"]["furniture"]["adjustmentCount"] == 1
    for action in [dict(type="layout-undo"),dict(type="layout-move",id="chair",point=dict(u=.45,v=.35)),dict(type="layout-reset")]:
        assert act(client,url,h,s,action)[0].status_code == 200
    assert client.get(url,headers=h).json()["state"]["furniture"]["adjustmentCount"] == 4
    result,request=act(client,url,h,s,dict(type="layout-confirm"))
    assert result.json()["scoring"]["status"] == "awaiting_l3_entry"
    first=deepcopy(s["state"]["furniture"]["assessment"])
    assert first["layout"] == original
    for action in [dict(type="layout-start"),dict(type="layout-move",id="chair",point=dict(u=.45,v=.35)),dict(type="layout-confirm")]:
        result,_=act(client,url,h,s,action)
    assert result.json()["scoring"]["status"] == "awaiting_l3_entry"
    assert result.json()["scoring"]["contributions"] is None
    assert s["state"]["furniture"]["assessment"]["action_id"] != first["action_id"]
    assert s["state"]["furniture"]["assessment"]["placement"]["metrics"]["adjustmentCount"] == 5
    assert client.post(url+"/actions",headers=h,json=request).json()["scoring"] == first["scoring"]


def test_legacy_counter_is_missing_not_inferred(client):
    _,h,url,s=open_l2(client)
    legacy=deepcopy(s["state"]);legacy["furniture"].pop("adjustmentCount")
    assert with_completion(legacy)["furniture"]["adjustmentCount"] is None
    assert "adjustmentCount" not in legacy["furniture"]


def test_pool_calibration_uses_distribution_and_rejects_duplicate_sessions():
    samples=[dict(session_id=str(i), placement=measure(initial_layout(),n)) for i,n in enumerate([1,2,6,10])]
    policy=build_policy(samples,pool_id="test-only",pool_version="1",minimum_sample_size=4)
    assert policy["thresholds"]["adjustmentCount"] == [1.75,4,7]
    assert policy["thresholds"]["tidiness"] == [1,1,1]
    with pytest.raises(ValueError,match="INSUFFICIENT_POOL_SIZE"):
        build_policy(samples,pool_id="test",pool_version="1",minimum_sample_size=5)
    samples[-1]["session_id"]="0"
    with pytest.raises(ValueError,match="POOL_REQUIRES_UNIQUE_SESSIONS"):
        build_policy(samples,pool_id="test",pool_version="1",minimum_sample_size=4)


def test_wall_proximity_has_correct_direction_and_pending_pool(tmp_path,monkeypatch):
    layout=initial_layout()
    center=deepcopy(layout);center["chair"]=dict(u=.5,v=.5)
    back=deepcopy(layout);back["chair"]=dict(u=.5,v=.065)
    assert measure(back,1)["metrics"]["wallWindowProximity"] > measure(center,1)["metrics"]["wallWindowProximity"]
    path=tmp_path/"pending.json";path.write_text('{"schema_version":1,"active_version":null,"versions":{}}')
    monkeypatch.setattr(l2_scoring,"CONFIG_PATH",path)
    assert l2_scoring.evaluate(measure(layout,0))["status"] == "pending_configuration"
    assert l2_scoring.evaluate(measure(layout,0))["contributions"] is None


def test_proximity_reachable_range_and_dense_grid_bound():
    from app.l2_proximity import calibration,describe,nearest_wall_distance
    from app.l2_layout import FURNITURE,footprint,constrain_point
    from bisect import bisect_left
    buckets=set()
    for key in FURNITURE:
        maximum,center=calibration(key)
        assert describe(key,footprint(key,center))['proximity']==pytest.approx(0,abs=1e-10)
        for side in (-4,4):
            edge=constrain_point(key,dict(u=side,v=center['v']))
            assert describe(key,footprint(key,edge))['proximity']==pytest.approx(1)
        # Independent coarse 2-D search cannot exceed the optimized maximum.
        for i in range(41):
            for j in range(41):
                p=constrain_point(key,dict(u=i/40,v=j/40))
                assert nearest_wall_distance(footprint(key,p))<=maximum+1e-9
    for i in range(101):
        layout={}
        for key in FURNITURE:
            _,center=calibration(key);edge=constrain_point(key,dict(u=-4,v=center['v']))
            layout[key]=dict(u=center['u']+(edge['u']-center['u'])*i/100,v=center['v'])
        value=measure(layout,0)['metrics']['wallWindowProximity']
        buckets.add(1+bisect_left([.25,.5,.75],value))
    assert buckets=={1,2,3,4}


def test_low_proximity_is_independent_of_visual_overlap():
    layout={
        'armchair':dict(u=.48367458333431806,v=.5642826639987756),
        'chair':dict(u=.3174398374902257,v=.5305600694496282),
        'sofa':dict(u=.48945212433202495,v=.8808201911641543),
        'table-chair':dict(u=.5071925065937517,v=.41303218886014825)}
    result=measure(layout,0)
    assert result['eligible'] and result['metrics']['tidiness']==1
    assert result['metrics']['wallWindowProximity']==pytest.approx(.2365251214454691)
    assert l2_scoring.evaluate(result)['contributions']==dict(A=-2,V=None,T=2,F=-2)
