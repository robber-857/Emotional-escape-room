"""Exercise the real ASGI application without a mock server."""
import asyncio

import httpx

from app.main import app


def request(method: str, url: str) -> httpx.Response:
    async def run() -> httpx.Response:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            return await client.request(method, url)
    return asyncio.run(run())


def test_health_does_not_claim_unimplemented_game_capabilities():
    response = request("GET", "/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["game_api_ready"] is False
    assert body["scoring_ready"] is False
    assert body["persistence_ready"] is False


def test_game_mutation_route_is_not_faked():
    assert request("POST", "/api/v1/sessions").status_code == 404
