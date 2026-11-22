# AgroMind — Project documentation

Technical reference for AgroMind, a district-level crop recommender for India. UI craft: [`frontend/DESIGN.md`](../frontend/DESIGN.md).
Research: [`notebooks/`](../notebooks) and [`docs/research/`](research) (dataset, provenance, literature, `results.json`).

---

## 1. Purpose

Pick an Indian **state, district and season**. AgroMind ranks every crop by how likely it is to be one of
the best-yielding crops there, from 26 years of official Government of India district crop statistics and
measured season climate. Each crop also gets its historical median yield in that district.

---

## 2. Architecture

```text
React UI  ←→  FastAPI (backend/app/main.py)  →  ExtraTrees district model (backend/app/v3_service.py)
                                                  │
                                                  └─ backend/data/large/agromind_india_large.parquet
                                                     400,379 DES APY rows × NASA POWER climate × SoilGrids soil
```

There is one served model. The earlier versions remain as **research history** in the notebooks and
are not served:

| Version | Data | Fate |
|---------|------|------|
| v1 | Kaggle `Crop_recommendation.csv` (2,200 rows, 22 crops) | flawed one-vs-rest decoding; ~99 % is near-lookup on that set (`AgroMind_v2_Research.ipynb` §1–2) |
| v2 | 3 merged CSVs in `backend/data/*.csv` (67,200 rows, 74 crops) | 94.3 % in random CV, but 7–13 % when a whole source is held out, because the sources disagree on the same crop. Retired; the CSVs stay for the research notebook |
| v3 (live) | official DES APY district statistics + climate + soil | this document |

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

## 4. Model

| Item | Detail |
|------|--------|
| Code | `backend/app/v3_service.py` |
| Estimator | `ExtraTreesClassifier` (300 trees, `min_samples_leaf=2`), the best setup in `notebooks/AgroMind_v3_LargeScale.ipynb` |
| Features | season-window `temperature`, `humidity`, `rainfall` + district centroid `lat`, `lon` + one-hot `season_app`, `state` |
| Target | crop slug over the `recommend == 1` rows, 49 crops |
| Not a model input | soil. It is returned for context and is editable in the UI, but adding it did not help in the v3 study (hit@1 71.14 % with vs 72.26 % without, on 43,901 queries with their own SoilGrids point) |
| Training | in memory, ~2 s on a free CPU, started in a background thread at API startup, so `/health` answers at once and `/predict` waits for training if it is called during warm-up. There is no joblib cache, because one would be ~400 MB |

### Validation (grouped, `docs/research/results.json` → `v3`)

A query is one district-year-season. **hit@1** is the share of queries whose top-ranked crop is one of
that query's recommended crops; **hit@3** asks the same of the top three. All splits are grouped, so
the same district (or state, or year) is never in both training and test.

| Test | ExtraTrees (live) hit@1 / hit@3 | Popularity baseline hit@1 / hit@3 |
|------|------------------|-------------------|
| Unseen districts (GroupKFold 5 by district) | **72.66 % / 93.53 %** | 61.69 % / 88.26 % (state × season) |
| Unseen states (GroupKFold 5 by state, `state` dropped) | 41.80 % / 70.70 % | 30.46 % / 55.44 % (season) |
| Future years (train ≤ 2014, test 2015–2022) | 65.34 % / 87.80 % | 55.49 % / 83.68 % (state × season) |

`GET /model-info` serves these numbers.

---

## 5. API

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness probe |
| `GET /options` | States → districts → seasons that have records, plus the crop list (with curated calendars where available) |
| `GET /district?state=&district=&season=` | District defaults: season climate averaged over years, soil, centroid, last-5-years crop history |
| `POST /predict` | Every crop ranked by probability + its historical median yield in that district |
| `GET /dataset?state=&district=&crop=&year=&page=&page_size=` | Server-side filtered, paginated browse of all 400,379 rows |
| `GET /model-info` | The served model (rows, crops, states, districts, locations, years, grouped metrics) + v1/v2 `history` |

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
    "temperature"?: float, "humidity"?: float, "rainfall"?: float,            # optional overrides (used by the model)
    "soil_ph"?, "soil_n_gkg"?, "soil_soc_gkg"?, "soil_clay_pct"?, "soil_sand_pct"?, "soil_cec_cmolkg"?}  # accepted, context only
→ {"state","district","season",
   "inputs": {"temperature","humidity","rainfall","lat","lon"},              # values actually fed to the model
   "model_inputs": ["temperature","humidity","rainfall","lat","lon","season_app","state"],
   "note": null | "Soil values are shown for context; …",                   # set when soil overrides were sent
   "best_crop": "wheat",
   "recommendations": [{"crop": "wheat", "name": "Wheat", "probability": 0.3531, "grown_here": true,
                        "historical_median_yield": 4.814, "yield_unit": "Tonnes/ha", "years_grown": …}, …]}  # all 49, sorted

GET /dataset?state=Punjab&crop=wheat&year=2010&page=1&page_size=50     # all filters optional, case-insensitive; crop = raw name or slug
→ {"columns": [...18 names...], "rows": [{...}], "total": …, "page": 1, "page_size": 50, "pages": …,
   "total_rows_in_dataset": 400379}                                          # page_size ≤ 200; NaN → null

GET /model-info
→ {"model", "features", "trained", "train_seconds", "rows": 400379, "training_rows": 96411, "crops": 49,
   "states": 37, "districts": 748, "locations": 742, "years": [1997, 2022], "label", "dataset",
   "metrics": {"leave_districts_out": {"hit1_mean","hit1_std","hit3_mean","hit3_std","recall3_mean"},
               "leave_districts_out_baseline": {…}, "leave_states_out": {…}, "leave_years_out": {"hit1","hit3","recall3"},
               "source", "note"},
   "history": {"v1": {"data", "reported_accuracy", "fixed_cv5_accuracy"},
               "v2": {"data", "cv5_accuracy", "cv5_top3", "leave_one_source_out_accuracy": [min, max]}, "source"}}
```

Check: `cd backend && .venv/bin/python -m pytest tests -q` (hits every endpoint and alias).
`python train_model.py` trains once and prints the coverage and grouped metrics.

---

## 6. Code layout

| File | Role |
|------|------|
| `backend/app/main.py` | FastAPI routes (root paths + `/v3/*` aliases) |
| `backend/app/v3_service.py` | loads the parquet once, trains the model, answers every endpoint |
| `backend/app/schemas.py` | `/predict` request model; `NUMERIC_FIELDS` used by `data_loader.py` |
| `backend/app/india_ref.py` | crop names / types and curated calendars |
| `backend/app/data_loader.py` | merges the three v2 CSVs. Not served; imported by `notebooks/AgroMind_v2_Research.ipynb` |
| `backend/scripts/build_large_dataset.py` | builds the large table (CC4) |
| `backend/tests/test_api.py` | endpoint test |

---

## 7. Honesty checklist

- [ ] Say the data are official Government of India DES district crop statistics joined with NASA POWER climate and SoilGrids soil at district centroids
- [ ] Quote the grouped metrics (unseen districts / states / years) from `/model-info`, never random-split ones
- [ ] Say that "recommended" means "among the top-3 crops by relative yield in that district-season", not profit or suitability advice
- [ ] Say v1 and v2 are research history: v2's 94 % does not transfer beyond its own sources
- [ ] Credit that recommendations are demos for education
