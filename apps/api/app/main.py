"""Authoritative anonymous L1-L4 sessions. Run Alembic before starting the API."""
import hashlib
import hmac
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import select, insert, update, text
from sqlalchemy.exc import SQLAlchemyError
from .db import make_engine, sessions, events, l2_runs, l2_events, l3_runs, l3_events, l4_runs, l4_events
from .score_service import bind as bind_scoring, record as record_scoring, summary as scoring_summary
from .score_policy import published_policy
from .db import score_evaluations, score_ledger, score_actions
from .domain import initial_state, normalize_state, apply_action, RULES_VERSION, SUPPORTED_RULES_VERSIONS

log = logging.getLogger("uvicorn.error")
class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
class Choose(StrictModel):
    type: Literal["choose"]
    choice: Literal["inspect-bridge", "take-rope", "collect-wood", "repair", "cross-bridge", "swim", "use-ring", "search", "board", "greet", "greet-woman", "take-lamp", "light-lamp", "enter"]
    yes: StrictBool
class Paddle(StrictModel):
    type: Literal["paddle"]
class Position(StrictModel):
    x: float = Field(ge=-1, le=1, allow_inf_nan=False)
    y: float = Field(ge=-1, le=1, allow_inf_nan=False)
class ActionRequest(StrictModel):
    action_id: UUID
    expected_version: int = Field(ge=0, strict=True)
    action: Annotated[Choose | Paddle, Field(discriminator="type")]
    positions: dict[Literal["planks", "rope", "ring", "oar"], Position] = Field(default_factory=dict)

@asynccontextmanager
async def lifespan(app):
    published_policy()
    app.state.engine = make_engine()
    yield
    app.state.engine.dispose()

app = FastAPI(title="Emotional Escape Room API", version="0.4.0", lifespan=lifespan)

@app.middleware("http")
async def no_cache(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response

@app.exception_handler(SQLAlchemyError)
async def database_error(request, exc):
    log.error("Database operation failed (%s)", type(exc).__name__)
    return JSONResponse(status_code=503, content={"detail":"DATABASE_UNAVAILABLE"})

def authorize(conn, sid, authorization, lock=False):
    query = select(sessions).where(sessions.c.id == str(sid))
    if lock: query = query.with_for_update()
    row = conn.execute(query).mappings().first()
    token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
    if not row or not token or not hmac.compare_digest(row["token_hash"], hashlib.sha256(token.encode()).hexdigest()):
        raise HTTPException(404, "SESSION_NOT_FOUND")
    return row

def snapshot(row):
    return {**{key: row[key] for key in ("id", "rules_version", "version", "positions")},
            "state": normalize_state(row["state"])}

@app.get("/api/v1/health", tags=["operations"])
def health():
    return dict(status="ok", environment=os.getenv("APP_ENV", "development"), version="0.4.0",
                game_api_ready=True, l2_api_ready=True, l3_api_ready=True, l4_api_ready=True, scoring_ready=False, persistence_ready=False)

@app.get("/api/v1/ready", tags=["operations"])
def ready():
    with app.state.engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        conn.execute(select(sessions.c.id).limit(1))
        conn.execute(select(events.c.action_id).limit(1))
        conn.execute(select(l2_runs.c.session_id).limit(1))
        conn.execute(select(l2_events.c.action_id).limit(1))
        conn.execute(select(l3_runs.c.session_id).limit(1))
        conn.execute(select(l3_events.c.action_id).limit(1))
        conn.execute(select(l4_runs.c.session_id).limit(1))
        conn.execute(select(l4_events.c.action_id).limit(1))
        conn.execute(select(score_evaluations.c.session_id).limit(1))
        conn.execute(select(score_ledger.c.session_id).limit(1))
        conn.execute(select(score_actions.c.session_id).limit(1))
    if revision != "0005_scoring": raise HTTPException(503, "MIGRATION_REQUIRED")
    return dict(status="ok", persistence_ready=True, schema_version=revision, scoring_ready=False, scoring_engine_ready=True)

@app.post("/api/v1/sessions", status_code=201, tags=["L1"])
def create_session():
    token = secrets.token_urlsafe(32)
    row = dict(id=str(uuid4()), token_hash=hashlib.sha256(token.encode()).hexdigest(),
               rules_version=RULES_VERSION, version=0, state=initial_state(), positions={})
    with app.state.engine.begin() as conn:
        conn.execute(insert(sessions).values(**row))
        bind_scoring(conn,row["id"])
    return dict(**snapshot(row), token=token)

@app.get("/api/v1/sessions/{sid}", tags=["L1"])
def get_session(sid: UUID, authorization: str = Header(default="")):
    with app.state.engine.connect() as conn:
        return snapshot(authorize(conn, sid, authorization))

@app.get("/api/v1/sessions/{sid}/events", tags=["L1"])
def get_events(sid: UUID, authorization: str = Header(default="")):
    with app.state.engine.connect() as conn:
        authorize(conn, sid, authorization)
        rows = conn.execute(select(events).where(events.c.session_id == str(sid)).order_by(events.c.received_at)).mappings()
        return [dict(action_id=r["action_id"], received_at=r["received_at"], **r["result"]) for r in rows]

@app.post("/api/v1/sessions/{sid}/actions", tags=["L1"])
def action(sid: UUID, body: ActionRequest, authorization: str = Header(default="")):
    payload = body.model_dump(mode="json")
    with app.state.engine.begin() as conn:
        row = authorize(conn, sid, authorization, lock=True)
        old = conn.execute(select(events).where(events.c.session_id == str(sid), events.c.action_id == str(body.action_id))).mappings().first()
        if old:
            if old["request"] != payload: raise HTTPException(409, "ACTION_ID_REUSED_WITH_DIFFERENT_PAYLOAD")
            result = dict(old["result"], duplicate=True, session=snapshot(row))
        else:
            code = None
            if row["rules_version"] not in SUPPORTED_RULES_VERSIONS: code = "RULES_VERSION_UNSUPPORTED"
            elif row["version"] != body.expected_version: code = "VERSION_CONFLICT"
            elif row["version"] >= 1000: code = "SESSION_EVENT_LIMIT"
            state = row["state"]
            if not code:
                try: state = apply_action(state, payload["action"], payload["positions"])
                except ValueError as exc: code = str(exc)
            now = datetime.now(timezone.utc).isoformat()
            accepted = code is None
            version = row["version"] + int(accepted)
            result = dict(accepted=accepted, code=code or "ACCEPTED", version=version,
                          action=payload["action"], rules_version=row["rules_version"])
            result["score_effect"] = record_scoring(conn,sid,"l1",body.action_id,payload["action"],row["state"],state,accepted,version,result["code"],now)
            if accepted:
                state["events"].append(dict(id=str(body.action_id), at=now, action=payload["action"]))
                conn.execute(update(sessions).where(sessions.c.id == str(sid)).values(state=state, positions=payload["positions"], version=version))
            conn.execute(insert(events).values(session_id=str(sid), action_id=str(body.action_id),
                         request=payload, result=result, received_at=now))
            row = dict(row, state=state, positions=payload["positions"] if accepted else row["positions"], version=version)
            result = dict(result, duplicate=False, session=snapshot(row))
    log.info("L1 action session=%s action_id=%s accepted=%s code=%s version=%s", sid, body.action_id, result["accepted"], result["code"], result["version"])
    return JSONResponse(status_code=200 if result["accepted"] else 409, content=result)

from .l2_api import register_l2
register_l2(app, authorize)

from .l3_api import register_l3
register_l3(app, authorize)

from .l4_api import register_l4
register_l4(app, authorize)

@app.get("/api/v1/sessions/{sid}/scoring", tags=["Scoring"])
def scores(sid: UUID, authorization: str = Header(default="")):
    with app.state.engine.begin() as conn:
        authorize(conn,sid,authorization,lock=True)
        return scoring_summary(conn,sid)
