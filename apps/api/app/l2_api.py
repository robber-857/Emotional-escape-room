from datetime import datetime, timezone
from copy import deepcopy
import logging
from typing import Annotated, Literal
from uuid import UUID
from fastapi import Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import select, insert, update
from .db import l2_runs, l2_events
from .l2_domain import initial_state, apply_action, RULES_VERSION, MAX_EVENTS, with_completion, COMPLETION_POLICY_VERSION
from .scoring import evaluate_l2_event
from .l2_receipts import AUTHORITY, VALIDATION_VERSION, outcome
log = logging.getLogger("uvicorn.error")

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
class SimpleAction(StrictModel):
    type: Literal["arrive-table", "return-hall", "curtain-click", "layout-start", "layout-exit", "layout-confirm", "layout-undo", "layout-reset"]
class ChoiceAction(StrictModel):
    type: Literal["explore", "search-choice"]
    yes: StrictBool
class SitAction(StrictModel):
    type: Literal["sit"]
    seat: Literal["chair", "table-seat"]
    yes: StrictBool
class KeyAction(StrictModel):
    type: Literal["select-key", "try-door"]
    key: Literal["key-1", "key-2"]
class ViewAction(StrictModel):
    type: Literal["view"]
    view: Literal["room", "table"]
class SearchTimeAction(StrictModel):
    type: Literal["search-time"]
    activeMs: int = Field(ge=0, le=9007199254740991, strict=True)
class Point(StrictModel):
    u: float = Field(ge=-4, le=4, allow_inf_nan=False, strict=True)
    v: float = Field(ge=-4, le=4, allow_inf_nan=False, strict=True)
class MoveAction(StrictModel):
    type: Literal["layout-move"]
    id: Literal["armchair", "chair", "sofa", "table-chair"]
    point: Point
class ActionRequest(StrictModel):
    action_id: UUID
    expected_version: int = Field(ge=0, strict=True)
    action: Annotated[SimpleAction | ChoiceAction | SitAction | KeyAction | ViewAction | SearchTimeAction | MoveAction, Field(discriminator="type")]

def validate_active_time(state, target_ms, anchor, now):
    starts = [e for e in state["events"] if e["action"]["type"] == "search-choice" and e["action"]["yes"]]
    if not anchor or not starts: raise ValueError("ACTIVE_TIME_ANCHOR_MISSING")
    interval = max(0, (now-datetime.fromisoformat(anchor)).total_seconds()*1000)
    segment = max(0, (now-datetime.fromisoformat(starts[-1]["at"])).total_seconds()*1000)
    # The tolerance is also bounded over the entire search segment: requests cannot farm 250ms each.
    if target_ms-state["search"]["activeMs"] > interval+250 or target_ms > segment+250:
        raise ValueError("ACTIVE_TIME_EXCEEDS_WALL_TIME")

def snapshot(row, parent):
    state = with_completion(row["state"])
    return dict(id=row["session_id"], level="l2", rules_version=row["rules_version"], version=row["version"], state=state,
                l1=dict(version=parent["version"], rules_version=parent["rules_version"], scene=parent["state"]["scene"],
                        route=parent["state"]["route"], lampTaken=parent["state"]["lampTaken"], lampLit=parent["state"]["lampLit"]),
                scoring=dict(status="pending_configuration", policy_version=None, totals=None), completion="complete" if state["exitDoorOpen"] else "in_progress",
                completion_policy_version=COMPLETION_POLICY_VERSION)

def register_l2(app, authorize):
    def parent_run(conn, sid, auth, lock=False):
        parent = authorize(conn, sid, auth, lock=lock)
        if parent["state"]["scene"] != "complete": raise HTTPException(409, "L1_NOT_COMPLETE")
        row = conn.execute(select(l2_runs).where(l2_runs.c.session_id == str(sid))).mappings().first()
        return parent, row

    @app.post("/api/v1/sessions/{sid}/levels/l2", tags=["L2"])
    def start(sid: UUID, body: StrictModel, authorization: str = Header(default="")):
        with app.state.engine.begin() as conn:
            parent, row = parent_run(conn, sid, authorization, lock=True)
            if row is None:
                row = dict(session_id=str(sid), rules_version=RULES_VERSION, version=0, state=initial_state(), time_anchor=None)
                conn.execute(insert(l2_runs).values(**row))
            return snapshot(row, parent)

    @app.get("/api/v1/sessions/{sid}/levels/l2", tags=["L2"])
    def get(sid: UUID, authorization: str = Header(default="")):
        with app.state.engine.connect() as conn:
            parent, row = parent_run(conn, sid, authorization)
            if row is None: raise HTTPException(404, "L2_NOT_STARTED")
            return snapshot(row, parent)

    @app.get("/api/v1/sessions/{sid}/levels/l2/events", tags=["L2"])
    def receipts(sid: UUID, authorization: str = Header(default="")):
        with app.state.engine.connect() as conn:
            _, row = parent_run(conn, sid, authorization)
            if row is None: raise HTTPException(404, "L2_NOT_STARTED")
            rows = conn.execute(select(l2_events).where(l2_events.c.session_id == str(sid)).order_by(l2_events.c.received_at, l2_events.c.action_id)).mappings()
            return [dict(r["result"], action_id=r["action_id"], received_at=r["received_at"], authority=AUTHORITY) for r in rows]

    @app.post("/api/v1/sessions/{sid}/levels/l2/actions", tags=["L2"])
    def action(sid: UUID, body: ActionRequest, authorization: str = Header(default="")):
        payload = body.model_dump(mode="json")
        with app.state.engine.begin() as conn:
            parent, row = parent_run(conn, sid, authorization, lock=True)
            if row is None: raise HTTPException(409, "L2_NOT_STARTED")
            old = conn.execute(select(l2_events).where(l2_events.c.session_id == str(sid), l2_events.c.action_id == str(body.action_id))).mappings().first()
            if old:
                if old["request"] != payload: raise HTTPException(409, "ACTION_ID_REUSED_WITH_DIFFERENT_PAYLOAD")
                result = dict(old["result"], duplicate=True, session=snapshot(row, parent))
            else:
                code = None; state = row["state"]; now = datetime.now(timezone.utc)
                if row["rules_version"] != RULES_VERSION: code = "RULES_VERSION_UNSUPPORTED"
                elif row["version"] != body.expected_version: code = "VERSION_CONFLICT"
                elif row["version"] >= MAX_EVENTS: code = "SESSION_EVENT_LIMIT"
                if not code:
                    try:
                        state = apply_action(state, payload["action"])
                        if body.action.type == "search-time":
                            validate_active_time(row["state"], state["search"]["activeMs"], row["time_anchor"], now)
                    except ValueError as exc: code = str(exc); state = row["state"]
                accepted = code is None; version = row["version"]+int(accepted)
                scoring = evaluate_l2_event(payload["action"], state) if accepted else None
                if accepted and body.action.type == "layout-confirm" and state["furniture"]["assessment"] is None:
                    state["furniture"]["assessment"] = dict(action_id=str(body.action_id), version=version,
                        layout=deepcopy(state["furniture"]["layout"]), scoring=deepcopy(scoring))
                result = dict(accepted=accepted, code=code or "ACCEPTED", version=version, action=payload["action"], rules_version=RULES_VERSION,
                              previous_version=row["version"], validation_version=VALIDATION_VERSION, authority=AUTHORITY,
                              outcome=outcome(payload["action"], state, row["state"]) if accepted else None,
                              scoring=scoring)
                if accepted:
                    state["events"].append(dict(id=str(body.action_id), at=now.isoformat(), action=payload["action"]))
                    anchor = now.isoformat() if body.action.type in ("search-choice", "search-time") else row["time_anchor"]
                    conn.execute(update(l2_runs).where(l2_runs.c.session_id == str(sid)).values(state=state, version=version, time_anchor=anchor))
                conn.execute(insert(l2_events).values(session_id=str(sid), action_id=str(body.action_id), request=payload, result=result, received_at=now.isoformat()))
                result = dict(result, duplicate=False, session=snapshot(dict(row, state=state, version=version), parent))
        log.info("L2 action session=%s action_id=%s accepted=%s code=%s version=%s", sid, body.action_id, result["accepted"], result["code"], result["version"])
        return JSONResponse(status_code=200 if result["accepted"] else 409, content=result)
