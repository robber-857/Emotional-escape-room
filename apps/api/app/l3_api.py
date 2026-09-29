from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import insert, select, update

from .db import l2_runs, l3_runs, l3_events
from .l2_domain import with_completion
from .l3_domain import initial_state, apply_action, RULES_VERSION, MAX_EVENTS, COMPLETION_POLICY_VERSION
from .l3_receipts import AUTHORITY, VALIDATION_VERSION, outcome, pending_scoring


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Decision(StrictModel):
    type: Literal["decision"]
    slot: Literal["open", "close", "wait", "curtain", "window", "television"]
    yes: StrictBool


class Carry(StrictModel):
    type: Literal["carry"]
    yes: StrictBool


class Draft(StrictModel):
    type: Literal["draft"]
    item: Literal["scarf", "lantern", "umbrella", "compass", "doll", "key", "journal", "rope", "backpack"]


class Confirm(StrictModel):
    type: Literal["confirm"]


class ActionRequest(StrictModel):
    action_id: UUID
    expected_version: int = Field(ge=0, strict=True)
    action: Annotated[Decision | Carry | Draft | Confirm, Field(discriminator="type")]


def snapshot(row):
    return dict(id=row["session_id"], level="l3", source="server_database", rules_version=row["rules_version"],
                version=row["version"], state=row["state"], completion=row["state"]["completion"],
                completion_policy_version=COMPLETION_POLICY_VERSION, scoring=pending_scoring())


def register_l3(app, authorize):
    def run(conn, sid, authorization, lock=False):
        # Use the same parent lock as L1 and L2 so starts/actions serialize across levels.
        parent = authorize(conn, sid, authorization, lock=lock)
        if parent["state"]["scene"] != "complete":
            raise HTTPException(409, "L1_NOT_COMPLETE")
        l2 = conn.execute(select(l2_runs).where(l2_runs.c.session_id == str(sid))).mappings().first()
        if l2 is None or not with_completion(l2["state"])["exitDoorOpen"]:
            raise HTTPException(409, "L2_NOT_COMPLETE")
        return conn.execute(select(l3_runs).where(l3_runs.c.session_id == str(sid))).mappings().first()

    @app.post("/api/v1/sessions/{sid}/levels/l3", tags=["L3"])
    def start(sid: UUID, body: StrictModel, authorization: str = Header(default="")):
        with app.state.engine.begin() as conn:
            row = run(conn, sid, authorization, lock=True)
            if row is None:
                row = dict(session_id=str(sid), rules_version=RULES_VERSION, version=0, state=initial_state())
                conn.execute(insert(l3_runs).values(**row))
            return snapshot(row)

    @app.get("/api/v1/sessions/{sid}/levels/l3", tags=["L3"])
    def get(sid: UUID, authorization: str = Header(default="")):
        with app.state.engine.connect() as conn:
            row = run(conn, sid, authorization)
            if row is None:
                raise HTTPException(404, "L3_NOT_STARTED")
            return snapshot(row)

    @app.get("/api/v1/sessions/{sid}/levels/l3/events", tags=["L3"])
    def receipts(sid: UUID, authorization: str = Header(default="")):
        with app.state.engine.connect() as conn:
            if run(conn, sid, authorization) is None:
                raise HTTPException(404, "L3_NOT_STARTED")
            rows = conn.execute(select(l3_events).where(l3_events.c.session_id == str(sid))
                                .order_by(l3_events.c.received_at, l3_events.c.action_id)).mappings()
            return [dict(r["result"], action_id=r["action_id"], received_at=r["received_at"]) for r in rows]

    @app.post("/api/v1/sessions/{sid}/levels/l3/actions", tags=["L3"])
    def action(sid: UUID, body: ActionRequest, authorization: str = Header(default="")):
        payload = body.model_dump(mode="json")
        with app.state.engine.begin() as conn:
            row = run(conn, sid, authorization, lock=True)
            if row is None:
                raise HTTPException(409, "L3_NOT_STARTED")
            old = conn.execute(select(l3_events).where(l3_events.c.session_id == str(sid),
                               l3_events.c.action_id == str(body.action_id))).mappings().first()
            if old:
                if old["request"] != payload:
                    raise HTTPException(409, "ACTION_ID_REUSED_WITH_DIFFERENT_PAYLOAD")
                result = dict(old["result"], duplicate=True, session=snapshot(row))
            else:
                code = None
                state = row["state"]
                changed = False
                if row["rules_version"] != RULES_VERSION:
                    code = "RULES_VERSION_UNSUPPORTED"
                elif row["version"] != body.expected_version:
                    code = "VERSION_CONFLICT"
                if not code:
                    try:
                        state, changed = apply_action(state, payload["action"])
                        if changed and row["version"] >= MAX_EVENTS:
                            raise ValueError("SESSION_EVENT_LIMIT")
                    except ValueError as exc:
                        code, state, changed = str(exc), row["state"], False
                accepted = code is None
                version = row["version"] + int(changed)
                now = datetime.now(timezone.utc).isoformat()
                result = dict(accepted=accepted, code=code or ("ACCEPTED" if changed else "ALREADY_RECORDED"),
                              version=version, previous_version=row["version"], state_changed=changed,
                              action=payload["action"], rules_version=row["rules_version"],
                              validation_version=VALIDATION_VERSION, authority=AUTHORITY,
                              outcome=outcome(state) if accepted else None,
                              scoring=pending_scoring() if accepted else None)
                if changed:
                    state["events"].append(dict(id=str(body.action_id), at=now, action=payload["action"]))
                    conn.execute(update(l3_runs).where(l3_runs.c.session_id == str(sid)).values(state=state, version=version))
                # Repeated refusals have an audit receipt but never a second flow/scoring event.
                conn.execute(insert(l3_events).values(session_id=str(sid), action_id=str(body.action_id),
                             request=payload, result=result, received_at=now))
                result = dict(result, duplicate=False, session=snapshot(dict(row, state=state, version=version)))
        return JSONResponse(status_code=200 if result["accepted"] else 409, content=result)
