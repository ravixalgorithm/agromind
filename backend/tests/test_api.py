"""API checks. Run from backend/:  .venv/bin/python -m pytest tests -q"""

from fastapi.testclient import TestClient

from app.main import app


def test_api() -> None:
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}

        opts = client.get("/options").json()
        assert opts == client.get("/v3/options").json()  # alias
        assert len(opts["states"]) >= 30 and len(opts["crops"]) >= 40
        wheat = next(c for c in opts["crops"] if c["slug"] == "wheat")
        assert wheat["sow_months"] and wheat["harvest_months"] and wheat["duration_days"]
        state = next(s for s in opts["states"] if s["state"] == "Punjab")
        dist = state["districts"][0]
        q = {"state": "Punjab", "district": dist["district"], "season": dist["seasons"][0]}

        d = client.get("/district", params=q).json()
        assert set(d["climate"]) == {"temperature", "humidity", "rainfall"}
        assert d["climate"]["rainfall"] is not None and d["history"]["top_crops"]
        assert "soil_class" in d["soil"]

        p = client.post("/predict", json=q).json()
        assert p == client.post("/v3/predict", json=q).json()  # alias
        recs = p["recommendations"]
        assert len(recs) == len(opts["crops"]) and recs[0]["crop"] == p["best_crop"]
        assert abs(sum(r["probability"] for r in recs) - 1) < 1e-3
        assert any(r["grown_here"] and r["historical_median_yield"] is not None for r in recs)

        wet = client.post("/predict", json={**q, "rainfall": 3000}).json()
        assert wet["inputs"]["rainfall"] == 3000 and wet["recommendations"] != recs
        assert client.post("/predict", json={**q, "soil_ph": 6.0}).json()["note"]

        assert client.get("/district", params={**q, "district": "Atlantis"}).status_code == 404
        assert client.post("/predict", json={**q, "season": "monsoon"}).status_code == 422
        assert client.post("/predict", json={"N": 90, "P": 40, "K": 40}).status_code == 422  # old N-P-K body is gone

        page = client.get("/dataset", params={"state": "Punjab", "crop": "wheat", "page": 2, "page_size": 10}).json()
        assert page["total_rows_in_dataset"] > 300_000 and page["page"] == 2 and len(page["rows"]) == 10
        assert all(r["state"] == "Punjab" and r["crop_slug"] == "wheat" for r in page["rows"])
        assert client.get("/dataset", params={"year": 2010}).json()["total"] > 0

        info = client.get("/model-info").json()
        assert info["rows"] > 300_000 and 0 < info["locations"] <= info["districts"]
        assert info["metrics"]["leave_districts_out"]["hit1_mean"] > 0.5
        assert info["history"]["v2"]["cv5_accuracy"] > 0.9
        assert client.get("/metadata").status_code == 404  # v2 endpoint removed
