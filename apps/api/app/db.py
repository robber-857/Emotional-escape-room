import os
from sqlalchemy import create_engine, MetaData, Table, Column, String, Integer, JSON, ForeignKey

metadata = MetaData()
sessions = Table("game_sessions", metadata,
    Column("id", String(36), primary_key=True), Column("token_hash", String(64), nullable=False),
    Column("rules_version", String(40), nullable=False), Column("version", Integer, nullable=False),
    Column("state", JSON, nullable=False), Column("positions", JSON, nullable=False))
events = Table("game_events", metadata,
    Column("session_id", String(36), ForeignKey("game_sessions.id"), primary_key=True),
    Column("action_id", String(36), primary_key=True), Column("request", JSON, nullable=False),
    Column("result", JSON, nullable=False), Column("received_at", String(40), nullable=False))

def make_engine():
    url = os.environ.get("DATABASE_URL")
    if not url: raise RuntimeError("DATABASE_URL is required; see apps/api/.env.example")
    return create_engine(url, pool_pre_ping=True)

l2_runs = Table("l2_runs", metadata,
    Column("session_id", String(36), ForeignKey("game_sessions.id"), primary_key=True),
    Column("rules_version", String(40), nullable=False), Column("version", Integer, nullable=False),
    Column("state", JSON, nullable=False), Column("time_anchor", String(40), nullable=True))
l2_events = Table("l2_events", metadata,
    Column("session_id", String(36), ForeignKey("l2_runs.session_id"), primary_key=True),
    Column("action_id", String(36), primary_key=True), Column("request", JSON, nullable=False),
    Column("result", JSON, nullable=False), Column("received_at", String(40), nullable=False))
