from .score_service import record as record_scoring
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import insert, select, update

from .db import sessions, l2_runs, l3_runs, l4_runs, l4_events, score_evaluations
from .results import build_result
from .score_service import summary as scoring_summary
from .l2_domain import with_completion
from .l4_domain import initial_state, apply_action, RULES_VERSION, COMPLETION_POLICY_VERSION
from .l4_receipts import AUTHORITY, VALIDATION_VERSION, pending_scoring, outcome


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Confirm(StrictModel):
    type: Literal["confirm"]
    door: Literal["village", "coast", "forest", "castle"]


class ActionRequest(StrictModel):
    action_id: UUID
    expected_version: int = Field(ge=0, strict=True)
    action: Confirm


def snapshot(row):
    return dict(id=row["session_id"], level="l4", source="server_database", version=row["version"],
                rules_version=row["rules_version"], state=row["state"], completion=row["state"]["completion"],
                completion_policy_version=COMPLETION_POLICY_VERSION, scoring=pending_scoring())


def register_l4(app, authorize):
    def run(conn, sid, authorization, lock=False):
        # Serialize all levels on the original journey row, including concurrent starts.
        parent = authorize(conn, sid, authorization, lock=lock)
        if parent["state"]["scene"] != "complete":
            raise HTTPException(409, "L1_NOT_COMPLETE")
        l2 = conn.execute(select(l2_runs).where(l2_runs.c.session_id == str(sid))).mappings().first()
        if l2 is None or not with_completion(l2["state"])["exitDoorOpen"]:
            raise HTTPException(409, "L2_NOT_COMPLETE")
        l3 = conn.execute(select(l3_runs).where(l3_runs.c.session_id == str(sid))).mappings().first()
        if l3 is None or l3["state"]["completion"] != "complete":
            raise HTTPException(409, "L3_NOT_COMPLETE")
        row = conn.execute(select(l4_runs).where(l4_runs.c.session_id == str(sid))).mappings().first()
        return row, l3["state"]["item"]

    @app.get("/api/v1/sessions/{sid}/result", tags=["Results"])
    def final_result(sid: UUID, authorization: str = Header(default="")):
        with app.state.engine.begin() as conn:
            row, _ = run(conn, sid, authorization, lock=True)
            if row is None or row["state"]["completion"] != "complete":
                raise HTTPException(409, "L4_NOT_COMPLETE")
            snapshots = {"l4": dict(row)}
            for level, table, column in (("l1", sessions, sessions.c.id),
                                         ("l2", l2_runs, l2_runs.c.session_id),
                                         ("l3", l3_runs, l3_runs.c.session_id)):
                snapshots[level] = dict(conn.execute(select(table).where(column == str(sid))).mappings().one())
            scores=scoring_summary(conn,sid)
            binding=conn.execute(select(score_evaluations.c.policy).where(score_evaluations.c.session_id==str(sid))).scalar_one_or_none()
            return dict(build_result(sid, snapshots, scores, (binding or {}).get('portrait_policy')), score_summary=scores)

    @app.post("/api/v1/sessions/{sid}/levels/l4", tags=["L4"])
    def start(sid: UUID, body: StrictModel, authorization: str = Header(default="")):
        with app.state.engine.begin() as conn:
            row, item = run(conn, sid, authorization, lock=True)
            if row is None:
                row = dict(session_id=str(sid), rules_version=RULES_VERSION, version=0, state=initial_state(item))
                conn.execute(insert(l4_runs).values(**row))
            return snapshot(row)

    @app.get("/api/v1/sessions/{sid}/levels/l4", tags=["L4"])
    def get(sid: UUID, authorization: str = Header(default="")):
        with app.state.engine.connect() as conn:
            row, _ = run(conn, sid, authorization)
            if row is None:
                raise HTTPException(404, "L4_NOT_STARTED")
            return snapshot(row)

    @app.get("/api/v1/sessions/{sid}/levels/l4/events", tags=["L4"])
    def receipts(sid: UUID, authorization: str = Header(default="")):
        with app.state.engine.connect() as conn:
            row, _ = run(conn, sid, authorization)
            if row is None:
                raise HTTPException(404, "L4_NOT_STARTED")
            rows = conn.execute(select(l4_events).where(l4_events.c.session_id == str(sid))
                                .order_by(l4_events.c.received_at, l4_events.c.action_id)).mappings()
            return [dict(r["result"], action_id=r["action_id"], received_at=r["received_at"]) for r in rows]

    @app.post("/api/v1/sessions/{sid}/levels/l4/actions", tags=["L4"])
    def action(sid: UUID, body: ActionRequest, authorization: str = Header(default="")):
        payload = body.model_dump(mode="json")
        with app.state.engine.begin() as conn:
            row, _ = run(conn, sid, authorization, lock=True)
            if row is None:
                raise HTTPException(409, "L4_NOT_STARTED")
            old = conn.execute(select(l4_events).where(l4_events.c.session_id == str(sid),
                               l4_events.c.action_id == str(body.action_id))).mappings().first()
            if old:
                if old["request"] != payload:
                    raise HTTPException(409, "ACTION_ID_REUSED_WITH_DIFFERENT_PAYLOAD")
                result = dict(old["result"], duplicate=True, session=snapshot(row))
            else:
                code, state, changed = None, row["state"], False
                validation = dict(source="server", authenticated=True, l1_complete=True, l2_complete=True,
                                  l3_complete=True, rules_supported=row["rules_version"] == RULES_VERSION,
                                  expected_version=body.expected_version, actual_version=row["version"],
                                  version_matches=row["version"] == body.expected_version,
                                  flow_evaluated=False, flow_allowed=None)
                if not validation["rules_supported"]:
                    code = "RULES_VERSION_UNSUPPORTED"
                elif not validation["version_matches"]:
                    code = "VERSION_CONFLICT"
                else:
                    validation["flow_evaluated"] = True
                    try:
                        state = apply_action(state, payload["action"])
                        changed = True
                        validation["flow_allowed"] = True
                    except ValueError as exc:
                        code = str(exc)
                        validation["flow_allowed"] = False
                accepted = code is None
                version = row["version"] + int(changed)
                now = datetime.now(timezone.utc).isoformat()
                result = dict(accepted=accepted, code=code or "ACCEPTED", version=version,
                              previous_version=row["version"], state_changed=changed, action=payload["action"],
                              rules_version=row["rules_version"], validation_version=VALIDATION_VERSION,
                              authority=AUTHORITY, validation=validation, outcome=outcome(state) if accepted else None,
                              scoring=pending_scoring() if accepted else None)
                result["score_effect"] = record_scoring(conn,sid,"l4",body.action_id,payload["action"],row["state"],state,accepted,version,result["code"],now)
                if changed:
                    state["events"].append(dict(id=str(body.action_id), at=now, action=payload["action"]))
                    conn.execute(update(l4_runs).where(l4_runs.c.session_id == str(sid)).values(state=state, version=version))
                conn.execute(insert(l4_events).values(session_id=str(sid), action_id=str(body.action_id),
                             request=payload, result=result, received_at=now))
                result = dict(result, duplicate=False, session=snapshot(dict(row, state=state, version=version)))
        return JSONResponse(status_code=200 if result["accepted"] else 409, content=result)
