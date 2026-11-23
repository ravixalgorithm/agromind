# AgroMind — Project documentation

Technical reference for AgroMind, a district-level crop recommender for India. UI craft: [`frontend/DESIGN.md`](../frontend/DESIGN.md).
Research: [`notebooks/`](../notebooks) and [`docs/research/`](research) (dataset, provenance, literature, `results.json`).

---

## 1. Purpose

Pick an Indian **state, district and season**. AgroMind v4 ranks the crops that district actually grows by
how well they are expected to yield there next season, relative to the same crop elsewhere. It also returns
a **90 % conformal set**, a short list that contains the best-yielding crop about 90 % of the time. Each crop
comes with its expected (recent median) and historical median yield in that district. The model learns from
26 years of official Government of India district crop statistics, measured season climate, soil and the
district's own crop history.

---

## 2. Architecture

```text
React UI  ←→  FastAPI (backend/app/main.py)
                 ├─ POST /predict ─→ AgroMind v4 final (experiments/final_model.py via backend/app/v4_service.py,
                 │                    artifact backend/models/v4_final.joblib)
                 ├─ /options /district /dataset, and /predict fallback ─→ v3 district model (backend/app/v3_service.py)
                 └─ both read backend/data/large/agromind_india_large.parquet
                    400,379 DES APY rows × NASA POWER climate × SoilGrids soil
```

The served model is **v4**. v3 still answers the lookup endpoints, and answers `/predict` only for the
65 of 2,654 district-seasons that have no crop with a recorded yield (labelled `"fallback": "v3"`), and while the v4 artifact is being retrained.
Earlier versions are research history:

| Version | Data | Fate |
|---------|------|------|
| v1 | Kaggle `Crop_recommendation.csv` (2,200 rows, 22 crops) | flawed one-vs-rest decoding; ~99 % is near-lookup on that set (`AgroMind_v2_Research.ipynb` §1–2) |
| v2 | 3 merged CSVs in `backend/data/*.csv` (67,200 rows, 74 crops) | 94.3 % in random CV, but 7–13 % when a whole source is held out, because the sources disagree on the same crop. Retired; the CSVs stay for the research notebook |
| v3 | official DES APY district statistics + climate | ExtraTrees classifier of the top-3 crops: unseen districts hit@1 72.66 % vs 61.69 % popularity (`AgroMind_v3_LargeScale.ipynb`). Now the `/predict` fallback only |
| **v4 (live)** | same data + soil + district crop history | YieldRank + conformal sets (`AgroMind_v4_Novel_Method.ipynb`, paper); this document |

---

## 3. Dataset

`backend/data/large/agromind_india_large.parquet` (and `.csv.gz`) is built by
`backend/scripts/build_large_dataset.py`. Sources, licences and checks are in
[`docs/research/DATASET.md`](research/DATASET.md) and [`DATA_PROVENANCE.md`](research/DATA_PROVENANCE.md).

| Property | Value |
|----------|--------|
| Rows | 400,379, one per state × district × crop year × season × crop |
| Source | Government of India DES, Area-Production-Yield reports (data.desagri.gov.in), crop years 1997-98 … 2022-23 |
| Coverage | 37 states/UTs, 748 districts at 742 matched locations, 54 crops (49 with an app slug) |
| Climate | NASA POWER season-window mean temperature (°C), mean humidity (%), total rainfall (mm) at the district centroid |
| Soil | ISRIC SoilGrids 0–30 cm at the centroid (99.81 % of rows); pH, total N g/kg, SOC, clay, sand, CEC, soil class |
| Label | `recommend == 1`: the top-3 crops by within-crop yield percentile in each district-year-season (96,411 rows) |

---

## 4. Model (v4, served)

The served model is the paper's frozen final model, `experiments/final_model.py` ("YieldRank v4 (final)",
owned by the research track). `backend/app/v4_service.py` only loads it and adapts its output.

| Item | Detail |
|------|--------|
| Query | one district × season × year. Serving query = the district-season's next year (last record + 1) |
| Candidates | crops grown in that district-season in its last 5 recorded years (median 5, up to 27) |
| Model | per-district-season z-score blend of a listwise ranker (XGBoost `rank:ndcg`), a pointwise yield-percentile regressor (LightGBM) and 0.25 × last-year persistence (`lag1_pct`, else the crop × season prior). Chosen on held-out training states/years |
| Features | season climate (`temperature`, `humidity`, `rainfall`), SoilGrids soil (`soil_ph`, `soil_n_gkg`, `soil_soc_gkg`, `soil_clay_pct`, `soil_sand_pct`, `soil_cec_cmolkg`), season one-hot, district history (`lag1_pct`, `mean3_pct`, `lag1_share`), crop |
| Defaults | the district-season's latest recorded climate and soil. Values the user edits in the form override them |
| Probabilities | softmax of the blend scores with a temperature (T = 1.816) fitted on out-of-state scores: `probability_best` = P(this candidate is the best-yielding one) |
| 90 % set | state-robust split conformal: out-of-fold scores from models that never saw the state (GroupKFold by `state_group`), a 90 % threshold per state, then the β = 0.9 quantile across 32 states (q̂ = 0.9405). The crop is in the set if 1 − p ≤ q̂. If the set comes out empty, the top crop is forced in (`set_was_empty`) |
| Artifact | `backend/models/v4_final.joblib` (~19 MB, committed) + `v4_final.json` (sha256 of the parquet it was trained on). Loaded at startup; retrained in the background (several minutes) only if missing or trained on another data build, during which `/predict` returns the labelled v3 fallback. Rebuild: `OMP_NUM_THREADS=4 python train_model.py` |
| Cold start | per crop: no yield record for that crop in the district-season in the previous year (the model then leans on climate, soil and older history) |

### Validation (paper, `docs/research/results.json` → `final`, `v4.numbers`)

hit@1 = the top-ranked candidate is the best-yielding crop of that district-season-year.

| Protocol | YieldRank v4 hit@1 / NDCG@3 | Best classifier baseline | Persistence | Served 90 % set coverage / size |
|----------|----------------|--------------------------|-------------|------------------|
| Random (5-fold) | 60.0 % / 0.935 | Random Forest 57.5 % / 0.915 | 55.3 % | 93.3 % / 3.21 |
| Leave-states-out | **56.3 % / 0.922** | MLP 38.3 % / 0.830 | 54.4 % | 94.2 % / 3.66 |
| Leave-years-out | 58.8 % / 0.930 | XGBoost 52.0 % / 0.897 | 55.1 % | 93.8 % / 3.40 |

The state-robust sets are deliberately conservative. With them, only 1 of 32 states falls below 85 %
coverage (Telangana, 84.5 %), against 2 with plain LAC (90.3 % coverage / 3.02 crops when states are
held out). On cold-start queries in unseen states the model scores 47.4 % against 42.4 % for persistence.
On warm queries it ties with persistence (62.1 % vs 62.4 %). `GET /model-info` serves these numbers.

### v3 (fallback and lookups)

`backend/app/v3_service.py`: ExtraTrees (300 trees) on season climate + centroid + season + state, trained in
memory at startup (~2 s). Its grouped results (unseen districts hit@1 72.66 % on a different label, the
top-3 set) are in `/model-info` → `history.v3`. It answers `/predict` only when v4 has no candidates.

---

## 5. API

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness probe |
| `GET /options` | States → districts → seasons that have records, plus the crop list (with curated calendars where available) |
| `GET /district?state=&district=&season=` | District defaults: season climate averaged over years, soil, centroid, last-5-years crop history |
| `POST /predict` | v4: the district's candidate crops ranked by YieldRank, with the 90 % conformal set, probability, expected and historical yield, cold-start flags |
| `GET /dataset?state=&district=&crop=&year=&page=&page_size=` | Server-side filtered, paginated browse of all 400,379 rows |
| `GET /model-info` | v4 (model, features, artifact, held-out check, paper metrics) + `history` {v3, v1, v2} |

`/v3/options`, `/v3/district`, `/v3/predict` and `/v3/dataset` are aliases of the root paths, kept for
clients written against the earlier two-mode API. The v2 endpoints (`/metadata` and the N-P-K body of
`/predict`) have been removed.

### Request / response shapes

Names are as published by the DES portal (`"Punjab"`, `"Ludhiana"`, `"Fatehgarh sahib"`); send them back
exactly as `/options` lists them. `season` is one of `kharif`, `rabi`, `zaid`, `whole_year`; only the
seasons listed for a district in `/options` have records. An unknown state, district or season returns
**404**, and an invalid season name or body returns **422**.

```text
GET /options
→ {"states": [{"state": "Punjab", "districts": [{"district": "Ludhiana", "seasons": ["kharif","rabi","whole_year"]}, …]}, …],
   "seasons": ["kharif","rabi","zaid","whole_year"],
   "crops": [{"slug": "wheat", "name": "Wheat", "type": "Cereal",
              "sow_months": [10, 11], "harvest_months": [2, 3], "duration_days": 120}, …]}   # 49 crops; months 0-based;
                                                                                             # calendar fields null when no curated calendar (24 crops)

GET /district?state=Punjab&district=Ludhiana&season=rabi
→ {"state","district","season",
   "climate": {"temperature": 16.95, "humidity": 42.46, "rainfall": 95.91},   # °C, %, mm per season
   "climate_years": 26, "location": {"lat": 30.8054, "lon": 75.8329},
   "soil": {"soil_ph": 7.7, "soil_n_gkg": 0.9, "soil_soc_gkg": 10.0, "soil_clay_pct": 29.42,
            "soil_sand_pct": 40.62, "soil_cec_cmolkg": 16.15, "soil_class": "Loamy",
            "source": "soilgrids_centroid" | "state_median" | null},
   "history": {"years": [2018, 2022],
               "top_crops": [{"crop": "Wheat", "crop_slug": "wheat", "name": "Wheat", "mean_area_ha": …,
                              "median_yield": …, "yield_unit": "Tonnes/ha", "years": 5, "recommended_years": 5}, …]}}  # ≤10, by area

POST /predict
   {"state": "Punjab", "district": "Ludhiana", "season": "rabi",
    "temperature"?, "humidity"?, "rainfall"?,                                    # optional overrides of the /district defaults
    "soil_ph"?, "soil_n_gkg"?, "soil_soc_gkg"?, "soil_clay_pct"?, "soil_sand_pct"?, "soil_cec_cmolkg"?}   # all feed the v4 model
→ {"model": "AgroMind v4", "method": "z-score blend, per district-season, of a listwise ranker (XGBoost rank:ndcg) and …",
   "fallback": null, "state", "district", "season", "apy_season": "Rabi", "based_on_year": 2022, "target_year": 2023,
   "inputs": {"temperature": 16.94, "humidity": 52.56, "rainfall": 100.2, "soil_ph": 7.7, …},   # values fed to the model
   "coverage_target": 0.9, "set_size": 4, "set_was_empty": false, "candidates": 6, "history_years": 26,
   "best_crop": "wheat",
   "recommendations": [                                                          # candidates only, by rank
     {"rank": 1, "crop": "wheat", "name": "Wheat", "rank_score": 3.0565, "probability_best": 0.5349, "in_set": true,
      "expected_yield": 4.97, "historical_median_yield": 4.814, "yield_unit": "t/ha",   # "bales/ha" cotton, "nuts/ha" coconut
      "years_grown": 26, "last_year": 2022, "cold_start": false},
     {"rank": 2, "crop": "sunflower", …, "probability_best": 0.1598, "in_set": true, …, "cold_start": true},
     {"rank": 3, "crop": "barley", …, "in_set": true}, {"rank": 4, "crop": "mustard", …, "in_set": true},
     {"rank": 5, "crop": "mungbean", …, "in_set": false}, {"rank": 6, "crop": "peas", …, "in_set": false}]}
   # fallback (no candidates, 65 of 2,654 district-seasons; or while the v4 artifact retrains):
   #   {"model": "AgroMind v3", "fallback": "v3", "fallback_reason", …v3 fields:
   #   "inputs", "model_inputs", "note", "best_crop", "recommendations": [{crop, name, probability, grown_here,
   #   historical_median_yield, yield_unit, years_grown}] for all 49 crops}

GET /dataset?state=Punjab&crop=wheat&year=2010&page=1&page_size=50     # all filters optional, case-insensitive; crop = raw name or slug
→ {"columns": [...18 names...], "rows": [{...}], "total": …, "page": 1, "page_size": 50, "pages": …,
   "total_rows_in_dataset": 400379}                                          # page_size ≤ 200; NaN → null

GET /model-info
→ {"model": "AgroMind v4: YieldRank v4 (final)", "description", "features": [...17 names...], "candidates", "label",
   "calibration": {"method": "state-robust split conformal on out-of-state (GroupKFold by state_group) scores",
                   "alpha": 0.1, "beta": 0.9, "calibration_states": 32, "temperature": 1.8162, "qhat": 0.9405},
   "artifact": "artifact" | "trained", "train_seconds", "training_rows": 259181, "training_queries": 43443, "crops": 49,
   "metrics": {"random" | "leave_states_out" | "leave_years_out": {"hit1", "hit3", "ndcg3", "best_baseline",
               "baseline_hit1", "baseline_ndcg3", "persistence_hit1",
               "served_set_coverage", "served_set_size",       # the app's 90% sets (state-robust), e.g. 0.942 / 3.66 unseen states
               "lac_set_coverage", "lac_set_size"},            # plain LAC, for comparison
               "worst_state_coverage": {"state": "Telangana", "coverage": 0.845, "states_below_85": "1", "of": "32"},
               "source", "note"},
   "data": {"records": 400379, "districts": 748, "locations": 742, "states": 37,   # all APY rows (= /dataset)
            "rows": 259181, "queries": 43443, "crops": 49, "training_states": 36, "years": [1997, 2022]},   # v4 training subset
   "history": {"v3": {"model", "rows", "training_rows", "crops", "states", "districts", "locations", "years", "metrics"},
               "v1": {…}, "v2": {…}, "source"}}
   # while a missing artifact retrains: {"model": "AgroMind v4", "status": "training …", "history": {"v3": …}}
```

Check: `cd backend && .venv/bin/python -m pytest tests -q` (hits every endpoint and alias).
`OMP_NUM_THREADS=4 python train_model.py` rebuilds the v4 artifact (several minutes) and prints its calibration.

---

## 6. Code layout

| File | Role |
|------|------|
| `backend/app/main.py` | FastAPI routes (root paths + `/v3/*` aliases) |
| `experiments/final_model.py` | the final v4 model: `train` / `save` / `load` / `predict` (research track) |
| `backend/app/v4_service.py` | loads the v4 artifact, adapts `final_model.predict` to `/predict`, adds expected yield / inputs / history |
| `backend/models/v4_final.{joblib,json}` | trained v4 artifact + data stamp (committed; `train_model.py` rebuilds) |
| `backend/app/v3_service.py` | loads the parquet once; `/options`, `/district`, `/dataset`, v3 fallback model |
| `backend/app/schemas.py` | `/predict` request model; `NUMERIC_FIELDS` used by `data_loader.py` |
| `backend/app/india_ref.py` | crop names / types and curated calendars |
| `backend/app/data_loader.py` | merges the three v2 CSVs. Not served; imported by `notebooks/AgroMind_v2_Research.ipynb` |
| `backend/scripts/build_large_dataset.py` | builds the large table (CC4) |
| `backend/tests/test_api.py` | endpoint test |

---

## 7. Honesty checklist

- [ ] Say the data are official Government of India DES district crop statistics joined with NASA POWER climate and SoilGrids soil at district centroids
- [ ] Quote the paper's leave-states-out / leave-years-out numbers from `/model-info` alongside the random-split ones
- [ ] Say that the ranking is by **relative yield** (the crop's yield percentile among districts growing it), not profit, price or water use, and that candidates are only crops the district already grows
- [ ] Say the 90 % set is a statistical guarantee on average over queries, not for every district (with the served state-robust threshold, 1 of 32 states, Telangana, is at 84.5 %)
- [ ] Say v1 and v2 are research history: v2's 94 % does not transfer beyond its own sources
- [ ] Credit that recommendations are demos for education
