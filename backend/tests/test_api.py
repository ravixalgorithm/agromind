"""API checks. Run from backend/:  .venv/bin/python -m pytest tests -q"""

import time

from fastapi.testclient import TestClient

from app.main import app

LUDHIANA = {"state": "Punjab", "district": "Ludhiana", "season": "rabi"}


def test_predict_v4() -> None:
    t = time.time()
    with TestClient(app) as client:
        p = client.post("/predict", json=LUDHIANA).json()
        assert time.time() - t < 10  # model artifact loads instead of training
        assert p["model"] == "AgroMind v4" and p["fallback"] is None and p["coverage_target"] == 0.9
        recs = p["recommendations"]
        assert p["best_crop"] == "wheat" == recs[0]["crop"]  # Ludhiana rabi stays sensible
        assert [r["rank"] for r in recs] == list(range(1, len(recs) + 1)) == list(range(1, p["candidates"] + 1))
        assert p["set_size"] == sum(r["in_set"] for r in recs) >= 1 and recs[0]["in_set"]
        assert abs(sum(r["probability_best"] for r in recs) - 1) < 1e-3
        assert all(r["expected_yield"] > 0 and r["yield_unit"] and r["years_grown"] >= 1 for r in recs)
        assert any(r["cold_start"] for r in recs) and not recs[0]["cold_start"]
        assert p["history_years"] >= 20

        dry = client.post("/predict", json={**LUDHIANA, "rainfall": 0, "temperature": 35}).json()
        assert dry["inputs"]["rainfall"] == 0 and dry["recommendations"] != recs
        acid = client.post("/predict", json={**LUDHIANA, "soil_ph": 4.5}).json()
        assert acid["inputs"]["soil_ph"] == 4.5  # soil is a v4 model input

        assert client.post("/predict", json={**LUDHIANA, "district": "Atlantis"}).status_code == 404
        assert client.post("/predict", json={**LUDHIANA, "season": "monsoon"}).status_code == 422
        assert client.post("/v3/predict", json=LUDHIANA).json() == p  # alias

        fb = client.post("/predict", json={"state": "Andaman and Nicobar Islands", "district": "North and middle andaman",
                                            "season": "zaid"}).json()
        assert fb["fallback"] == "v3" and fb["model"] == "AgroMind v3" and fb["recommendations"]  # no YieldRank candidates


def test_other_endpoints() -> None:
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        opts = client.get("/options").json()
        assert opts == client.get("/v3/options").json()
        assert len(opts["states"]) >= 30 and len(opts["crops"]) >= 40
        wheat = next(c for c in opts["crops"] if c["slug"] == "wheat")
        assert wheat["sow_months"] and wheat["harvest_months"] and wheat["duration_days"]

        d = client.get("/district", params=LUDHIANA).json()
        assert set(d["climate"]) == {"temperature", "humidity", "rainfall"} and d["history"]["top_crops"]
        assert client.get("/district", params={**LUDHIANA, "district": "Atlantis"}).status_code == 404

        page = client.get("/dataset", params={"state": "Punjab", "crop": "wheat", "page": 2, "page_size": 10}).json()
        assert page["total_rows_in_dataset"] > 300_000 and page["page"] == 2 and len(page["rows"]) == 10
        assert all(r["state"] == "Punjab" and r["crop_slug"] == "wheat" for r in page["rows"])

        info = client.get("/model-info").json()
        assert info["model"].startswith("AgroMind v4") and info["holdout_check"]["coverage"] > 0.85
        assert info["data"]["records"] == page["total_rows_in_dataset"] and info["data"]["districts"] >= info["data"]["locations"]
        assert info["data"]["states"] >= info["data"]["training_states"]
        assert info["metrics"]["leave_states_out"]["hit1"] > info["metrics"]["leave_states_out"]["baseline_hit1"]
        assert info["history"]["v3"]["metrics"]["leave_districts_out"]["hit1_mean"] > 0.5
        assert info["history"]["v2"]["cv5_accuracy"] > 0.9
        assert client.get("/metadata").status_code == 404
