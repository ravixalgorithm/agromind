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
                 ├─ POST /predict ─→ AgroMind v4: YieldRank + conformal sets (backend/app/v4_service.py,
                 │                    artifact backend/models/v4_yieldrank.{txt,json})
                 ├─ /options /district /dataset, and /predict fallback ─→ v3 district model (backend/app/v3_service.py)
                 └─ both read backend/data/large/agromind_india_large.parquet
                    400,379 DES APY rows × NASA POWER climate × SoilGrids soil
```

The served model is **v4**. v3 still answers the lookup endpoints, and answers `/predict` only for the
65 of 2,654 district-seasons that have no crop with a recorded yield (labelled `"fallback": "v3"`).
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

| Item | Detail |
|------|--------|
| Code | `backend/app/v4_service.py` (recipe of `experiments/run.py`, YieldRank) |
| Query | one district × season × year. Serving query = the district-season's next year (last record + 1) |
| Candidates | crops grown in that district-season in its last 5 recorded years (median 5, up to 27) |
| Ranker | LightGBM LambdaMART (`LGBMRanker`, 400 trees, 63 leaves, lr 0.05), graded relevance = ⌊10 × yield percentile⌋ |
| Features | season climate (`temperature`, `humidity`, `rainfall`), SoilGrids soil (`soil_ph`, `soil_n_gkg`, `soil_soc_gkg`, `soil_clay_pct`, `soil_sand_pct`, `soil_cec_cmolkg`), season one-hot, district history (`lag1_pct`, `mean3_pct`, `lag1_share`), crop (categorical) |
| Probabilities | softmax of the scores with a temperature fitted on held-out queries: `probability_best` = P(this candidate is the best-yielding one) |
| 90 % set | split-conformal LAC: the crop is in the set if 1 − p ≤ q̂, with q̂ the conformal quantile of held-out queries at α = 0.1. If the set comes out empty, the top crop is forced in (`set_was_empty`) |
| Split | queries 70 % fit / 15 % temperature / 15 % conformal threshold (random, grouped by query) |
| Held-out check | 6,517 queries: hit@1 **60.04 %**, coverage **90.04 %**, mean set size **2.62**, which matches the paper's random protocol (59.7 %, 90.3 %, 2.65) |
| Artifact | `backend/models/v4_yieldrank.txt` (2.8 MB booster) + `.json` (T, q̂, crops, check). Loaded at startup (first `/predict` ≈ 1 s); retrained in the background (~12 s) if missing or built from other data. Rebuild: `python train_model.py` |
| Cold start | per crop: no yield record for that crop in the district-season in the previous year (the model then leans on climate, soil and older history) |

### Validation (paper, `docs/research/results.json` → `v4.numbers`)

hit@1 = the top-ranked candidate is the best-yielding crop of that district-season-year.

| Protocol | YieldRank hit@1 / NDCG@3 | Best classifier baseline | Persistence | 90 % set coverage / size |
|----------|----------------|--------------------------|-------------|------------------|
| Random (5-fold) | 59.7 % / 0.936 | Random Forest 57.5 % / 0.915 | 55.3 % | 90.1 % / 2.64 |
| Leave-states-out | **55.6 % / 0.922** | MLP 38.5 % / 0.833 | 54.5 % | 89.6 % / 2.82 |
| Leave-years-out | 57.8 % / 0.930 | XGBoost 52.1 % / 0.897 | 55.2 % | 89.7 % / 2.71 |

`GET /model-info` serves these numbers.

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
→ {"model": "AgroMind v4", "method": "YieldRank (LightGBM LambdaMART) + 90% split-conformal set", "fallback": null,
   "state", "district", "season", "apy_season": "Rabi", "target_year": 2023,
   "inputs": {"temperature": 16.95, "humidity": 42.46, "rainfall": 95.91, "soil_ph": 7.7, …},   # values fed to the model
   "coverage_target": 0.9, "set_size": 2, "set_was_empty": false, "candidates": 6, "history_years": 26,
   "best_crop": "wheat",
   "recommendations": [                                                          # candidates only, by rank
     {"rank": 1, "crop": "wheat", "name": "Wheat", "rank_score": 3.7567, "probability_best": 0.5855, "in_set": true,
      "expected_yield": 4.97, "historical_median_yield": 4.814, "yield_unit": "Tonnes/ha",   # "Bales/ha" cotton, "Nuts/ha" coconut
      "years_grown": 26, "last_year": 2022, "cold_start": false},
     {"rank": 2, "crop": "sunflower", …, "probability_best": 0.155, "in_set": true, …, "cold_start": true}, …]}
   # fallback (no candidates, 65 of 2,654 district-seasons): {"model": "AgroMind v3", "fallback": "v3", "fallback_reason", …v3 fields:
   #   "inputs", "model_inputs", "note", "best_crop", "recommendations": [{crop, name, probability, grown_here,
   #   historical_median_yield, yield_unit, years_grown}] for all 49 crops}

GET /dataset?state=Punjab&crop=wheat&year=2010&page=1&page_size=50     # all filters optional, case-insensitive; crop = raw name or slug
→ {"columns": [...18 names...], "rows": [{...}], "total": …, "page": 1, "page_size": 50, "pages": …,
   "total_rows_in_dataset": 400379}                                          # page_size ≤ 200; NaN → null

GET /model-info
→ {"model": "AgroMind v4: YieldRank (LightGBM LambdaMART) + 90% split-conformal crop sets", "features": [...],
   "candidates", "label", "artifact": "artifact" | "trained", "train_seconds", "training_rows": 259181,
   "training_queries": 43443, "crops": 49, "temperature", "conformal_qhat",
   "holdout_check": {"hit1": 0.6004, "coverage": 0.9004, "set_size": 2.62, "queries": 6517},
   "metrics": {"random" | "leave_states_out" | "leave_years_out": {"hit1", "hit3", "ndcg3", "best_baseline",
               "baseline_hit1", "baseline_ndcg3", "persistence_hit1", "conformal90_coverage", "conformal90_set_size"},
               "source", "note"},
   "data": {"rows", "queries", "crops", "states", "years"},
   "history": {"v3": {"model", "rows", "training_rows", "crops", "states", "districts", "locations", "years", "metrics"},
               "v1": {…}, "v2": {…}, "source"}}
```

Check: `cd backend && .venv/bin/python -m pytest tests -q` (hits every endpoint and alias).
`python train_model.py` rebuilds the v4 artifact and prints the held-out hit@1, coverage and set size.

---

## 6. Code layout

| File | Role |
|------|------|
| `backend/app/main.py` | FastAPI routes (root paths + `/v3/*` aliases) |
| `backend/app/v4_service.py` | v4: candidate/history features, YieldRank fit + temperature + conformal threshold, artifact, `/predict` |
| `backend/models/v4_yieldrank.{txt,json}` | trained v4 booster + calibration (committed; `train_model.py` rebuilds) |
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
- [ ] Say the 90 % set is a statistical guarantee on average over queries, not for every district (4 of 32 states fall below 85 % coverage in the paper)
- [ ] Say v1 and v2 are research history: v2's 94 % does not transfer beyond its own sources
- [ ] Credit that recommendations are demos for education
