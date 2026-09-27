from fastapi.testclient import TestClient
from app.main import app

def test_health_reports_scoring_boundary():
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["game_api_ready"] is True
    assert response.json()["scoring_ready"] is False
    assert response.json()["persistence_ready"] is False
