"""Resume the last started act and replay L2 without altering the old journey."""
from copy import deepcopy
import hashlib
import hmac
from uuid import UUID, uuid5, NAMESPACE_URL
from fastapi import Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, insert
from .db import sessions, events, l2_runs, l3_runs, l4_runs, score_evaluations, score_ledger, score_actions

class RestartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action_id: UUID
    expected_version: int = Field(ge=0, strict=True)

def register_journey(app, authorize, snapshot):
    @app.get("/api/v1/sessions/{sid}/journey", tags=["Journey"])
    def resume(sid: UUID, authorization: str = Header(default="")):
        with app.state.engine.connect() as conn:
            authorize(conn, sid, authorization)
            for level, table in (("l4", l4_runs), ("l3", l3_runs), ("l2", l2_runs)):
                if conn.execute(select(table.c.session_id).where(table.c.session_id == str(sid))).first():
                    return dict(path=f"/{level}")
            return dict(path="/")

    @app.post("/api/v1/sessions/{sid}/levels/l2/restart", tags=["Journey"])
    def restart(sid: UUID, body: RestartRequest, authorization: str = Header(default="")):
        # A deterministic child ID makes a lost-response retry safe. The token is
        # derived from the caller's secret, never persisted in plain text.
        child_id = str(uuid5(NAMESPACE_URL, f"{sid}/restart-l2/{body.action_id}"))
        token = hmac.new(authorization.encode(), child_id.encode(), hashlib.sha256).hexdigest()
        with app.state.engine.begin() as conn:
            parent = authorize(conn, sid, authorization, lock=True)
            existing = conn.execute(select(sessions).where(sessions.c.id == child_id)).mappings().first()
            if existing:
                return dict(**snapshot(existing), token=token)
            run = conn.execute(select(l2_runs).where(l2_runs.c.session_id == str(sid))).mappings().first()
            if parent["state"]["scene"] != "complete" or run is None:
                raise HTTPException(409, "L2_NOT_STARTED")
            if run["version"] != body.expected_version:
                raise HTTPException(409, "VERSION_CONFLICT")
            child = dict(parent, id=child_id, token_hash=hashlib.sha256(token.encode()).hexdigest())
            conn.execute(insert(sessions).values(**child))
            evaluation = conn.execute(select(score_evaluations).where(score_evaluations.c.session_id == str(sid))).mappings().first()
            evaluation_id = str(uuid5(NAMESPACE_URL, f"{child_id}/evaluation"))
            if evaluation:
                conn.execute(insert(score_evaluations).values(**dict(evaluation, session_id=child_id, evaluation_id=evaluation_id)))
            # Carry only the already completed first act, including its frozen scoring policy.
            for table in (events, score_ledger, score_actions):
                query = select(table).where(table.c.session_id == str(sid))
                if table is not events: query = query.where(table.c.level == "l1")
                for row in conn.execute(query).mappings().all():
                    copied = deepcopy(dict(row)); copied["session_id"] = child_id
                    if table is score_ledger: copied["entry"]["evaluation_id"] = evaluation_id
                    if table is score_actions: copied["receipt"]["evaluation_id"] = evaluation_id
                    conn.execute(insert(table).values(**copied))
            return dict(**snapshot(child), token=token)
