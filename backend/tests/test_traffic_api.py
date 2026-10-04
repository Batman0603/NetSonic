from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_traffic_status_endpoint_exists() -> None:
    response = client.get(
        "/api/traffic/status"
    )

    assert response.status_code == 200

    body = response.json()

    assert "running" in body
    assert "interface_name" in body
    assert "last_error" in body