"""Resume the last started act and replay an act without altering the old journey."""
from copy import deepcopy
import hashlib
import hmac
from typing import Literal
from uuid import UUID, uuid5, NAMESPACE_URL
from fastapi import Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, insert
from .db import sessions, events, l2_runs, l2_events, l3_runs, l4_runs, score_evaluations, score_ledger, score_actions

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

    @app.post("/api/v1/sessions/{sid}/levels/{level}/restart", tags=["Journey"])
    def restart(sid: UUID, level: Literal["l2", "l3"], body: RestartRequest, authorization: str = Header(default="")):
        # A deterministic child ID makes a lost-response retry safe. The token is
        # derived from the caller's secret, never persisted in plain text.
        child_id = str(uuid5(NAMESPACE_URL, f"{sid}/restart-{level}/{body.action_id}"))
        token = hmac.new(authorization.encode(), child_id.encode(), hashlib.sha256).hexdigest()
        with app.state.engine.begin() as conn:
            parent = authorize(conn, sid, authorization, lock=True)
            existing = conn.execute(select(sessions).where(sessions.c.id == child_id)).mappings().first()
            if existing:
                return dict(**snapshot(existing), token=token)
            table = l2_runs if level == "l2" else l3_runs
            run = conn.execute(select(table).where(table.c.session_id == str(sid))).mappings().first()
            if parent["state"]["scene"] != "complete" or run is None:
                raise HTTPException(409, f"{level.upper()}_NOT_STARTED")
            if run["version"] != body.expected_version:
                raise HTTPException(409, "VERSION_CONFLICT")
            child = dict(parent, id=child_id, token_hash=hashlib.sha256(token.encode()).hexdigest())
            conn.execute(insert(sessions).values(**child))
            evaluation = conn.execute(select(score_evaluations).where(score_evaluations.c.session_id == str(sid))).mappings().first()
            evaluation_id = str(uuid5(NAMESPACE_URL, f"{child_id}/evaluation"))
            if evaluation:
                conn.execute(insert(score_evaluations).values(**dict(evaluation, session_id=child_id, evaluation_id=evaluation_id)))
            # Carry completed earlier acts, including their frozen scoring policy.
            retained_levels = ["l1"] if level == "l2" else ["l1", "l2"]
            if level == "l3":
                for table in (l2_runs, l2_events):
                    for row in conn.execute(select(table).where(table.c.session_id == str(sid))).mappings().all():
                        conn.execute(insert(table).values(**dict(row, session_id=child_id)))
            for table in (events, score_ledger, score_actions):
                query = select(table).where(table.c.session_id == str(sid))
                if table is not events: query = query.where(table.c.level.in_(retained_levels))
                for row in conn.execute(query).mappings().all():
                    copied = deepcopy(dict(row)); copied["session_id"] = child_id
                    if table is score_ledger: copied["entry"]["evaluation_id"] = evaluation_id
                    if table is score_actions: copied["receipt"]["evaluation_id"] = evaluation_id
                    conn.execute(insert(table).values(**copied))
            return dict(**snapshot(child), token=token)
