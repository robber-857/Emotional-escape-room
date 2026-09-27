"""API bootstrap. Game authority, scoring, and persistence are not implemented yet."""
import os
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Emotional Escape Room API", version="0.1.0")


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    environment: str
    version: str = "0.1.0"
    game_api_ready: bool = False
    scoring_ready: bool = False
    persistence_ready: bool = False


@app.get("/api/v1/health", response_model=Health, tags=["operations"])
def health() -> Health:
    """Process health only; does not certify game readiness or UAT."""
    return Health(environment=os.getenv("APP_ENV", "development"))
