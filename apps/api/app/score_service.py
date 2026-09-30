"""Immutable score records written inside the same transaction as actions."""
from bisect import bisect_left
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import insert, select
from .db import score_evaluations, score_ledger, score_actions, sessions, l2_runs, l3_runs, l4_runs
from .score_policy import bundle, AXES, DEFINITION_VERSION
from .score_rules import candidates, no_score_reason
from .score_normalization import level_summary, weighted_summary


def bind(conn, sid):
    policy, digest=bundle()
    conn.execute(insert(score_evaluations).values(session_id=str(sid),evaluation_id=str(uuid4()),policy=policy,
        policy_hash=digest,created_at=datetime.now(timezone.utc).isoformat()))


def record(conn, sid, level, action_id, action, before, state, accepted, version, code, now):
    sid=str(sid);action_id=str(action_id)
    evaluation=conn.execute(select(score_evaluations).where(score_evaluations.c.session_id==sid)).mappings().first()
    if evaluation is None:
        return dict(status="legacy_unbound", reason="LEGACY_UNBOUND", delta=None, events=[])
    policy=evaluation["policy"]
    if policy['normalization_version'] != 'avtf-minmax-v2' or policy['event_definition_version'] != DEFINITION_VERSION:
        return dict(status='legacy_normalization',reason='LEGACY_NORMALIZATION',delta=None,events=[])
    previous={e["group_id"] for e in conn.execute(select(score_ledger.c.group_id).where(score_ledger.c.session_id==sid)).mappings()}
    emitted=[]
    facts=candidates(level,before,state,action) if accepted else []
    for fact in facts:
        group,option=fact["group_id"],fact["option_id"]
        if group in previous:
            emitted.append(dict(group_id=group,option_id=option,status="already_scored",reason="ALREADY_SCORED",vector=None));continue
        evidence={"source":"server_validated_state","cutoff_state":deepcopy(state)}
        evidence["cutoff_state"].pop("events",None)
        missing_reason=None
        if group.startswith("l2.furniture."):
            placement=state["furniture"]["classification"];quartile=policy["quartile_policy"]
            metric={"wall":"wallWindowProximity","tidiness":"tidiness","adjustments":"adjustmentCount"}[group.rsplit(".",1)[1]]
            evidence=dict(placement=deepcopy(placement),layout=deepcopy(state["furniture"]["layout"]))
            if not placement["eligible"]: missing_reason="INSUFFICIENT_EVIDENCE"
            elif quartile is None: missing_reason="QUARTILE_POOL_NOT_CONFIGURED"
            else:
                option=str(1+bisect_left(quartile["thresholds"][metric],placement["metrics"][metric]))
                evidence["quartile_policy"]=quartile
        configured=policy["groups"].get(group,{}).get(option)
        status="unconfigured" if missing_reason or configured is None or configured["status"]=="unconfigured" else "not_measured" if configured["status"]=="not_measured" else "applied"
        vector=deepcopy(configured["vector"]) if status in ("applied","not_measured") else None
        entry=dict(evaluation_id=evaluation["evaluation_id"],group_id=group,option_id=option,level=level,
                   label=configured["label"] if configured else group,status=status,
                   reason=missing_reason or ("APPLIED" if status=="applied" else "NOT_MEASURED" if status=="not_measured" else "UNCONFIGURED"),
                   vector=vector,source_action_ids=[e["id"] for e in state.get("events",[])]+[action_id],cutoff_version=version,created_at=now,
                   event_definition_version=policy["event_definition_version"],event_score_version=policy["event_score_version"],
                   weight_version=policy["weight_version"],policy_hash=evaluation["policy_hash"],evidence=evidence)
        conn.execute(insert(score_ledger).values(session_id=sid,group_id=group,level=level,entry=entry))
        emitted.append(entry);previous.add(group)
    applied=[e for e in emitted if e["status"]=="applied"]
    delta={a:sum(e["vector"][a] for e in applied if e["vector"][a] is not None) if any(e["vector"][a] is not None for e in applied) else None for a in AXES}
    reason="REJECTED" if not accepted else "APPLIED" if applied else emitted[0]["reason"] if emitted else no_score_reason(level,action)
    result=dict(status="applied" if applied else "no_score",reason=reason,delta=delta,events=emitted,
                evaluation_id=evaluation["evaluation_id"],policy_hash=evaluation["policy_hash"],
                source="server_database",accepted=accepted,state_changed=accepted and before!=state,
                code=code,action=action,action_id=action_id,level=level,version=version)
    if level=='l2' and code=='LAYOUT_OUTSIDE_FLOOR':
        from .l2_metrics import measure
        result['diagnostic']=measure(state['furniture']['layout'],state['furniture']['adjustmentCount'])['evidence']
    if level=='l3' and action['type']=='decision':
        result['settlement']=dict(cutoff='storm_answers_complete',remaining_slots=[k for k,v in state['choices'].items() if v is None],
                                  door_locked=state['choices']['open'] is True and state['choices']['close'] is True)
    entries=[r["entry"] for r in conn.execute(select(score_ledger).where(score_ledger.c.session_id==sid,score_ledger.c.level==level)).mappings()]
    complete=state["scene"]=="complete" if level=="l1" else state.get("exitDoorOpen",False) if level=="l2" else state["completion"]=="complete"
    result["level_score"]=level_summary(level,policy,entries,complete)
    conn.execute(insert(score_actions).values(session_id=sid,level=level,action_id=action_id,receipt=result,created_at=now))
    return result


def summary(conn,sid):
    sid=str(sid)
    evaluation=conn.execute(select(score_evaluations).where(score_evaluations.c.session_id==sid)).mappings().first()
    if evaluation is None: return dict(source="server_database",session_id=sid,status="legacy_unbound",levels={},ledger=[],actions=[],final=None)
    if evaluation['policy']['normalization_version'] != 'avtf-minmax-v2' or evaluation['policy']['event_definition_version'] != DEFINITION_VERSION:
        return dict(source='server_database',session_id=sid,status='legacy_normalization',levels={},ledger=[],actions=[],final=None)
    ledger=[r["entry"] for r in conn.execute(select(score_ledger).where(score_ledger.c.session_id==sid)).mappings()]
    levels={}
    for level,table,key in (("l1",sessions,sessions.c.id),("l2",l2_runs,l2_runs.c.session_id),("l3",l3_runs,l3_runs.c.session_id),("l4",l4_runs,l4_runs.c.session_id)):
        row=conn.execute(select(table).where(key==sid)).mappings().first()
        complete=bool(row and (row["state"]["scene"]=="complete" if level=="l1" else row["state"].get("exitDoorOpen",False) if level=="l2" else row["state"]["completion"]=="complete"))
        levels[level]=level_summary(level,evaluation["policy"],[e for e in ledger if e["level"]==level],complete)
    actions=[r["receipt"] for r in conn.execute(select(score_actions).where(score_actions.c.session_id==sid).order_by(score_actions.c.created_at.desc(),score_actions.c.action_id.desc()).limit(100)).mappings()]
    return dict(source="server_database",session_id=sid,status="active",evaluation_id=evaluation["evaluation_id"],policy_hash=evaluation["policy_hash"],
                event_score_version=evaluation["policy"]["event_score_version"],normalization_version=evaluation["policy"]["normalization_version"],
                weight_version=evaluation["policy"]["weight_version"],levels=levels,ledger=ledger,actions=actions,final=weighted_summary(levels))
