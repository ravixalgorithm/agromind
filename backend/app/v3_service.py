"""v3: district-level recommender trained on the large real dataset.

Data: backend/data/large/agromind_india_large.parquet (Govt of India APY district x season x year
crop statistics + NASA POWER climate + SoilGrids soil, built by backend/scripts/build_large_dataset.py).

Model: the best setup from notebooks/AgroMind_v3_LargeScale.ipynb, i.e. ExtraTrees (300 trees,
min_samples_leaf=2) on season-window climate + season + state + district centroid, trained on the
`recommend == 1` rows. Soil is returned for context but is not a model input: the notebook found no
measurable gain from it (v3 section 6).
"""

from __future__ import annotations

import json
import threading
import time
from functools import cached_property
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder

from .india_ref import CROP_META, crop_name

BASE_DIR = Path(__file__).resolve().parents[1]
LARGE_DIR = BASE_DIR / "data" / "large"
PARQUET = LARGE_DIR / "agromind_india_large.parquet"
CSV = LARGE_DIR / "agromind_india_large.csv.gz"
RESULTS = BASE_DIR.parent / "docs" / "research" / "results.json"

CLIMATE = ["temperature", "humidity", "rainfall"]
GEO = ["lat", "lon"]
CATS = ["season_app", "state"]
FEATURES = CLIMATE + GEO + CATS
SOIL = ["soil_ph", "soil_n_gkg", "soil_soc_gkg", "soil_clay_pct", "soil_sand_pct", "soil_cec_cmolkg"]
SEASON_ORDER = ["kharif", "rabi", "zaid", "whole_year"]
DATASET_COLUMNS = ["state", "district", "crop_year", "season", "crop", "crop_slug", "area_ha", "production",
                   "production_unit", "yield", "yield_pct", "recommend", "temperature", "humidity", "rainfall",
                   "soil_ph", "soil_class", "soil_source"]


class UnknownDistrict(LookupError):
    pass


def _num(v: object, nd: int = 2) -> float | None:
    return None if v is None or pd.isna(v) else round(float(v), nd)


class V3Service:
    """Loads the parquet once (lazily) and trains the model once, on first need or in warm-up."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model = None
        self.train_seconds: float | None = None

    # ── data ─────────────────────────────────────────────────────────────

    @cached_property
    def df(self) -> pd.DataFrame:
        df = pd.read_parquet(PARQUET) if PARQUET.exists() else pd.read_csv(CSV, low_memory=False)
        for col in ("state", "district", "season", "season_app", "crop", "crop_slug"):
            df[col] = df[col].astype("string")
        return df

    @cached_property
    def labelled(self) -> pd.DataFrame:
        df = self.df
        return df[(df.recommend == 1) & df.crop_slug.notna()]

    @cached_property
    def districts(self) -> pd.DataFrame:
        """One row per (state, district, season_app): climate averaged over years, soil, centroid."""
        df = self.df
        # climate is identical for every crop of one district-year-season, so average per year first
        per_year = df.groupby(["state", "district", "season_app", "year"])[CLIMATE + GEO].first()
        clim = per_year.groupby(level=[0, 1, 2]).agg(
            temperature=("temperature", "mean"), humidity=("humidity", "mean"), rainfall=("rainfall", "mean"),
            lat=("lat", "first"), lon=("lon", "first"), years=("temperature", "size"))
        soil = df.groupby(["state", "district"])[SOIL + ["soil_class", "soil_source", "wrb_class"]].first()
        return clim.join(soil)

    @cached_property
    def crop_history(self) -> pd.DataFrame:
        """Per (state, district, season_app, crop_slug): median yield, unit, mean area, years grown."""
        df = self.df[self.df.crop_slug.notna()]
        return df.groupby(["state", "district", "season_app", "crop_slug"]).agg(
            median_yield=("yield", "median"), unit=("production_unit", "first"),
            mean_area_ha=("area_ha", "mean"), years=("year", "nunique"), last_year=("year", "max"))

    # ── model ────────────────────────────────────────────────────────────

    @property
    def model(self):
        with self._lock:
            if self._model is None:
                lab = self.labelled
                t = time.time()
                model = make_pipeline(
                    ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATS)], remainder="passthrough"),
                    ExtraTreesClassifier(n_estimators=300, min_samples_leaf=2, random_state=42, n_jobs=-1),
                )
                model.fit(lab[FEATURES], lab.crop_slug.astype(str))
                self.train_seconds = round(time.time() - t, 1)
                self._model = model
            return self._model

    def warm_up(self) -> None:
        """Load data and train in a background thread so the API starts instantly."""
        threading.Thread(target=lambda: self.model, daemon=True).start()

    # ── read APIs ────────────────────────────────────────────────────────

    def options(self) -> dict:
        d = self.districts.reset_index()
        states = []
        for state, g in d.groupby("state", sort=True):
            dists = [{"district": dist, "seasons": sorted(gg.season_app.tolist(), key=SEASON_ORDER.index)}
                     for dist, gg in g.groupby("district", sort=True)]
            states.append({"state": state, "districts": dists})
        crops = sorted(self.labelled.crop_slug.unique().tolist())
        return {"states": states, "seasons": SEASON_ORDER,
                "crops": [{"slug": c, "name": crop_name(c), "type": CROP_META.get(c, {}).get("type", "Crop")} for c in crops]}

    def _district_row(self, state: str, district: str, season: str) -> pd.Series:
        try:
            return self.districts.loc[(state, district, season)]
        except KeyError:
            raise UnknownDistrict(f"No records for {district}, {state} in season '{season}'.") from None

    def district(self, state: str, district: str, season: str) -> dict:
        row = self._district_row(state, district, season)
        recent = self.df[(self.df.state == state) & (self.df.district == district) & (self.df.season_app == season)]
        recent = recent[recent.year > recent.year.max() - 5]
        hist = (recent.groupby("crop").agg(crop_slug=("crop_slug", "first"), mean_area_ha=("area_ha", "mean"),
                                          median_yield=("yield", "median"), unit=("production_unit", "first"),
                                          years=("year", "nunique"), recommended_years=("recommend", "sum"))
                .sort_values("mean_area_ha", ascending=False).head(10))
        return {
            "state": state, "district": district, "season": season,
            "climate": {c: _num(row[c]) for c in CLIMATE},
            "climate_years": int(row["years"]),
            "location": {"lat": _num(row["lat"], 4), "lon": _num(row["lon"], 4)},
            "soil": {**{c: _num(row[c]) for c in SOIL}, "soil_class": row["soil_class"] if pd.notna(row["soil_class"]) else None,
                     "source": row["soil_source"] if pd.notna(row["soil_source"]) else None},
            "history": {
                "years": [int(recent.year.min()), int(recent.year.max())] if len(recent) else [],
                "top_crops": [{"crop": crop, "crop_slug": r.crop_slug if pd.notna(r.crop_slug) else None,
                               "name": crop_name(r.crop_slug) if pd.notna(r.crop_slug) else crop,
                               "mean_area_ha": _num(r.mean_area_ha, 1), "median_yield": _num(r.median_yield, 3),
                               "yield_unit": f"{r.unit}/ha" if pd.notna(r.unit) else None,
                               "years": int(r.years), "recommended_years": int(r.recommended_years)}
                              for crop, r in hist.iterrows()],
            },
        }

    def predict(self, state: str, district: str, season: str, overrides: dict | None = None) -> dict:
        row = self._district_row(state, district, season)
        climate = {c: float(row[c]) for c in CLIMATE}
        climate.update({k: float(v) for k, v in (overrides or {}).items() if k in CLIMATE and v is not None})
        x = pd.DataFrame([{**climate, "lat": row["lat"], "lon": row["lon"], "season_app": season, "state": state}])[FEATURES]
        model = self.model
        proba = model.predict_proba(x)[0]
        try:
            hist = self.crop_history.loc[(state, district, season)]
        except KeyError:
            hist = pd.DataFrame(columns=self.crop_history.columns)
        ranked = []
        for slug, p in sorted(zip(model.classes_, proba), key=lambda t: t[1], reverse=True):
            h = hist.loc[slug] if slug in hist.index else None
            ranked.append({
                "crop": slug, "name": crop_name(slug), "probability": round(float(p), 4),
                "grown_here": h is not None,
                "historical_median_yield": _num(h["median_yield"], 3) if h is not None else None,
                "yield_unit": f"{h['unit']}/ha" if h is not None and pd.notna(h["unit"]) else None,
                "years_grown": int(h["years"]) if h is not None else 0,
            })
        soil_used = {k: v for k, v in (overrides or {}).items() if k in SOIL and v is not None}
        return {
            "state": state, "district": district, "season": season,
            "inputs": {**{k: round(v, 2) for k, v in climate.items()}, "lat": _num(row["lat"], 4), "lon": _num(row["lon"], 4)},
            "model_inputs": FEATURES,
            "note": "Soil values are shown for context; the v3 model does not use them (no measurable gain in the v3 study)."
            if soil_used else None,
            "best_crop": ranked[0]["crop"],
            "recommendations": ranked,
        }

    def dataset(self, *, state=None, district=None, crop=None, year=None, page=1, page_size=50) -> dict:
        df = self.df
        mask = pd.Series(True, index=df.index)
        if state:
            mask &= df.state.str.lower() == state.lower()
        if district:
            mask &= df.district.str.lower() == district.lower()
        if crop:
            c = crop.lower()
            mask &= (df.crop.str.lower() == c).fillna(False) | (df.crop_slug.str.lower() == c).fillna(False)
        if year is not None:
            mask &= df.year == int(year)
        view = df.loc[mask, DATASET_COLUMNS]
        total = int(len(view))
        page_size = max(1, min(int(page_size), 200))
        pages = max(1, -(-total // page_size))
        page = max(1, min(int(page), pages))
        chunk = view.iloc[(page - 1) * page_size: page * page_size]
        rows = json.loads(chunk.to_json(orient="records"))  # NaN -> null
        return {"columns": DATASET_COLUMNS, "rows": rows, "total": total, "page": page, "page_size": page_size,
                "pages": pages, "total_rows_in_dataset": int(len(df))}

    def info(self) -> dict:
        df, lab = self.df, self.labelled
        metrics = {}
        if RESULTS.exists():
            v3 = json.loads(RESULTS.read_text()).get("v3", {})
            metrics = {
                "leave_districts_out": v3.get("leave_districts_out", {}).get("ExtraTrees: + state + lat/lon"),
                "leave_districts_out_baseline": v3.get("leave_districts_out", {}).get("baseline: state x season popularity"),
                "leave_states_out": v3.get("leave_states_out", {}).get("ExtraTrees: climate + season + lat/lon"),
                "leave_years_out": {k: v for k, v in v3.get("leave_years_out", {}).get("ExtraTrees: + state + lat/lon", {}).items()
                                    if k != "hit1_by_year"},
                "source": "docs/research/results.json (notebooks/AgroMind_v3_LargeScale.ipynb)",
                "note": "hit1/hit3 = share of district-year-season queries whose top-1 / top-3 contains a recommended crop. "
                        "All three grouped tests are for this same ExtraTrees model.",
            }
        return {
            "model": "ExtraTreesClassifier(300, min_samples_leaf=2), one-hot season + state",
            "features": FEATURES,
            "trained": self._model is not None,
            "train_seconds": self.train_seconds,
            "rows": int(len(df)), "training_rows": int(len(lab)),
            "crops": int(lab.crop_slug.nunique()), "states": int(df.state.nunique()),
            "districts": int(df.groupby(["state", "district"]).ngroups),
            "locations": int(df[["lat", "lon"]].drop_duplicates().shape[0]),  # matched centroids (several APY names share one)
            "years": [int(df.year.min()), int(df.year.max())],
            "label": "recommend == 1: top-3 crops by within-crop yield percentile per district-year-season",
            "metrics": metrics,
            "dataset": "Govt of India APY district-wise crop statistics + NASA POWER climate + ISRIC SoilGrids",
        }
