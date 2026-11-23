"""v4 (final): served by POST /predict, delegating to experiments/final_model.py (the paper's frozen model).

final_model.train() builds the artifact: a per-district-season z-score blend of an XGBoost listwise ranker,
a LightGBM yield-percentile regressor and last-year persistence, a softmax temperature, and a state-robust
90 % conformal threshold calibrated on out-of-state scores. It is saved to backend/models/v4_final.joblib
(committed, ~19 MB); the API loads it at startup and trains it in the background only when it is missing
or was trained on a different build of the parquet (sha256 recorded in v4_final.json). This module only adapts final_model.predict() to the API's response shape and adds the
recent expected yield, the model inputs and the district-season's history length.
"""

from __future__ import annotations

import hashlib
import json
import sys
import threading
import time
from pathlib import Path

import pandas as pd

from .india_ref import crop_name

BASE_DIR = Path(__file__).resolve().parents[1]
EXPERIMENTS = BASE_DIR.parent / "experiments"
sys.path.insert(0, str(EXPERIMENTS))
import final_model  # noqa: E402  (experiments/final_model.py: train / save / load / predict)
import run  # noqa: E402

PARQUET = BASE_DIR / "data" / "large" / "agromind_india_large.parquet"
ARTIFACT = Path(final_model.ART_PATH)
STAMP = ARTIFACT.with_suffix(".json")  # which data build the artifact was trained on
RESULTS = BASE_DIR.parent / "docs" / "research" / "results.json"
RECENT_YEARS = 5


class NoCandidates(LookupError):
    pass


class V4Service:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = threading.Event()
        self._art: dict | None = None
        self.source: str | None = None  # "artifact" or "trained"
        self.train_seconds: float | None = None

    @property
    def art(self) -> dict:
        with self._lock:
            if self._art is None:
                if self._fresh():
                    self._art, self.source = final_model.load(ARTIFACT), "artifact"
                else:
                    self._art = self.train()
                self._loaded.set()
            return self._art

    def ready(self) -> bool:
        """True once the model is in memory. Waits a few seconds while an existing artifact loads,
        but not while a missing one trains (that takes minutes; /predict falls back to v3 meanwhile)."""
        return self._loaded.wait(timeout=30 if self._fresh() else 0)

    @staticmethod
    def _parquet_sha() -> str:
        return hashlib.sha256(PARQUET.read_bytes()).hexdigest()

    def _fresh(self) -> bool:
        if not (ARTIFACT.exists() and STAMP.exists()):
            return False
        return json.loads(STAMP.read_text()).get("parquet_sha256") == self._parquet_sha()

    def train(self) -> dict:
        t = time.time()
        art = final_model.train()
        final_model.save(art, ARTIFACT)
        STAMP.write_text(json.dumps({"parquet_sha256": self._parquet_sha(), "model": art["final"]["name"],
                                     "T": art["T"], "qhat": art["qhat"], "trained": time.strftime("%Y-%m-%d %H:%M")}, indent=1))
        self.train_seconds, self.source = round(time.time() - t, 1), "trained"
        return art

    def warm_up(self) -> None:
        threading.Thread(target=lambda: self.art, daemon=True).start()

    def predict(self, state: str, district: str, season: str, overrides: dict) -> dict:
        """overrides: climate / soil values the user edited (None = keep the district's latest-season values)."""
        art = self.art
        env = {k: float(v) for k, v in overrides.items() if k in run.ENV and v is not None}
        try:
            r = final_model.predict(art, state, district, season, env=env)
            rows, _, _ = final_model._query_rows(art, state, district, season, env)
        except ValueError as exc:
            raise NoCandidates(str(exc)) from None
        d = art["data"]
        here = d[(d.state == r["state"]) & (d.district == r["district"]) & (d.season == r["season"])]
        recent = here[here.year > here.year.max() - RECENT_YEARS].groupby("crop_slug")["yield"].median()
        crops = r["crops"]
        set_was_empty = not any(c["in_set"] for c in crops)
        if set_was_empty:  # LAC can return an empty set; keep the top crop so the answer is never empty
            crops[0]["in_set"] = True
        num = lambda v, nd=3: None if v is None or pd.isna(v) else round(float(v), nd)
        recs = [{
            "rank": c["rank"], "crop": c["crop"], "name": crop_name(c["crop"]),
            "rank_score": num(c["score"], 4), "probability_best": num(c["probability"], 4), "in_set": c["in_set"],
            "expected_yield": num(recent.get(c["crop"])), "historical_median_yield": num(c["median_yield"]),
            "yield_unit": c["yield_unit"], "years_grown": c["years_grown"], "last_year": c["last_year"],
            "cold_start": c["no_history_last_year"],
        } for c in crops]
        return {
            "model": "AgroMind v4", "method": art["final"]["description"], "fallback": None,
            "state": state, "district": district, "season": season, "apy_season": r["season"],
            "based_on_year": r["based_on_year"], "target_year": r["based_on_year"] + 1,
            "inputs": {k: num(rows[k].iloc[0], 2) for k in run.ENV},
            "coverage_target": round(r["coverage_target"], 2), "set_size": sum(c["in_set"] for c in recs),
            "set_was_empty": set_was_empty, "candidates": len(recs), "history_years": int(here.year.nunique()),
            "best_crop": recs[0]["crop"], "recommendations": recs,
        }

    def info(self) -> dict:
        art = self.art
        v4 = json.loads(RESULTS.read_text()).get("v4", {}) if RESULTS.exists() else {}
        n = v4.get("numbers", {})
        pct = lambda k: round(float(n[k]) / 100, 4) if k in n else None
        flt = lambda k: float(n[k]) if k in n else None
        proto = lambda tag: {
            "hit1": pct(f"OursHit{tag}"), "hit3": pct(f"OursHitThree{tag}"), "ndcg3": flt(f"OursNDCG{tag}"),
            "best_baseline": n.get(f"BaseName{tag}"), "baseline_hit1": pct(f"BaseHit{tag}"),
            "baseline_ndcg3": flt(f"BaseNDCG{tag}"), "persistence_hit1": pct(f"PersHit{tag}"),
            "served_set_coverage": pct(f"CCSRCov{tag}"), "served_set_size": flt(f"CCSRSize{tag}"),  # state-robust (served)
            "lac_set_coverage": pct(f"CovGRP{tag}"), "lac_set_size": flt(f"SizeGRP{tag}")}
        d = art["data"]
        return {
            "model": f"AgroMind v4: {art['final']['name']}",
            "description": art["final"]["description"],
            "features": run.ENV + [f"s_{s}" for s in run.SEASONS] + run.HIST + ["crop"],
            "candidates": f"crops grown in the district-season in its last {RECENT_YEARS} recorded years",
            "label": "relevance = the crop's yield percentile among all districts that grew it that year; "
                     "the set targets the best-yielding candidate",
            "calibration": {"method": "state-robust split conformal on out-of-state (GroupKFold by state_group) scores",
                            "alpha": art["alpha"], "beta": art["beta"], "calibration_states": art["n_cal_states"],
                            "temperature": round(art["T"], 4), "qhat": round(art["qhat"], 4)},
            "artifact": self.source, "train_seconds": self.train_seconds,
            "training_rows": int(len(d)), "training_queries": int(d.qid.nunique()), "crops": len(art["crops"]),
            "metrics": {"leave_states_out": proto("LSO"), "leave_years_out": proto("LYO"), "random": proto("R"),
                        "source": "docs/research/results.json v4.numbers (experiments/, paper)",
                        "worst_state_coverage": {"state": n.get("SRWorstState"), "coverage": pct("SRWorstCov"),
                                                 "states_below_85": n.get("SRStatesBelow"), "of": n.get("StatesN")},
                        "note": "hit1 = top-ranked candidate is the best-yielding crop of that district-season-year; "
                                "served_set = the app's 90% sets (state-robust threshold); lac_set = plain LAC for comparison."},
            "data": {k: v4.get("meta", {}).get(k) for k in ("rows", "queries", "crops", "states", "years")},
        }
