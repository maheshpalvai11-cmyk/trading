import os
import tempfile
from pathlib import Path

import pytest

_test_database = tempfile.TemporaryDirectory(prefix="signalforge-test-")
os.environ.pop("DATABASE_URL", None)
os.environ["DATABASE_PATH"] = str(Path(_test_database.name) / "signalforge.sqlite3")

from fastapi.testclient import TestClient

from app.api.routes import model_cache
from app.main import app
from app.persistence import engine


@pytest.fixture(scope="module", autouse=True)
def remove_test_database():
    yield
    engine.dispose()
    _test_database.cleanup()


def test_frontend_api_data_and_database_round_trip():
    with TestClient(app) as client:
        preflight = client.options(
            "/api/backtest/run",
            headers={
                "Origin": "http://127.0.0.1:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"

        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["database"] == "connected"

        latest = client.get("/api/signals/latest?symbol=RELIANCE")
        assert latest.status_code == 200
        signal = latest.json()["signals"][0]
        history = client.get("/api/signals/history?symbol=RELIANCE")
        assert history.status_code == 200
        assert history.json()["signals"][0]["id"] == signal["id"]

        run = client.post("/api/backtest/run", json={"symbol": "RELIANCE"})
        assert run.status_code == 201
        run_id = run.json()["id"]
        assert client.get(f"/api/backtest/{run_id}").json()["id"] == run_id
        assert any(item["id"] == run_id for item in client.get("/api/backtest").json()["runs"])

        metrics = client.get("/api/model/metrics?symbol=RELIANCE")
        assert metrics.status_code == 200
        model_cache.pop("RELIANCE")
        restored = client.get("/api/model/metrics?symbol=RELIANCE")
        assert restored.status_code == 200
        assert restored.json()["selected_model"] == metrics.json()["selected_model"]
