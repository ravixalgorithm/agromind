"""v3 endpoint checks. Run from backend/:  .venv/bin/python -m pytest tests/test_v3.py -q"""

from fastapi.testclient import TestClient

from app.main import app


def test_v3_endpoints() -> None:
    with TestClient(app) as client:
        opts = client.get("/v3/options").json()
        assert len(opts["states"]) >= 30 and len(opts["crops"]) >= 40
        state = next(s for s in opts["states"] if s["state"] == "Punjab")
        dist = state["districts"][0]
        season = dist["seasons"][0]
        q = {"state": "Punjab", "district": dist["district"], "season": season}

        d = client.get("/v3/district", params=q).json()
        assert set(d["climate"]) == {"temperature", "humidity", "rainfall"}
        assert d["climate"]["rainfall"] is not None and d["history"]["top_crops"]
        assert "soil_class" in d["soil"]

        p = client.post("/v3/predict", json=q).json()
        recs = p["recommendations"]
        assert len(recs) == len(opts["crops"]) and recs[0]["crop"] == p["best_crop"]
        assert abs(sum(r["probability"] for r in recs) - 1) < 1e-3
        assert any(r["grown_here"] and r["historical_median_yield"] is not None for r in recs)

        wet = client.post("/v3/predict", json={**q, "rainfall": 3000}).json()
        assert wet["inputs"]["rainfall"] == 3000 and wet["recommendations"] != recs

        assert client.get("/v3/district", params={**q, "district": "Atlantis"}).status_code == 404
        assert client.post("/v3/predict", json={**q, "season": "monsoon"}).status_code == 422

        page = client.get("/v3/dataset", params={"state": "Punjab", "crop": "wheat", "page": 2, "page_size": 10}).json()
        assert page["total_rows_in_dataset"] > 300_000 and page["page"] == 2 and len(page["rows"]) == 10
        assert all(r["state"] == "Punjab" and r["crop_slug"] == "wheat" for r in page["rows"])
        assert client.get("/v3/dataset", params={"year": 2010}).json()["total"] > 0

        info = client.get("/model-info").json()
        assert info["v3"]["rows"] > 300_000 and info["v3"]["districts"] > 700
        assert "accuracy" in info["metrics"]  # v2 fields still at the top level
