from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_endpoint_returns_application_information() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["name"] == "NetSonic API"
    assert response.json()["docs"] == "/docs"


def test_health_endpoint_returns_ok_status() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "version" in response.json()