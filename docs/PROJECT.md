# AgroMind — Project documentation

Detailed technical reference for the AgroMind **India-wide** crop recommendation system. UI craft: [`frontend/DESIGN.md`](../frontend/DESIGN.md).

---

## 1. Purpose

Match a field’s conditions (including **Indian state**) to suitable crops with confidence, calendars, and profile bands.

---

## 2. Architecture

```text
React UI  ←→  FastAPI  →  RandomForest (soil + season + state one-hot)
                │
                ├─ india_crops.csv         (16 states, 8,000 rows)
                ├─ tamilnadu_crops.csv     (Tamil Nadu field records, 57,000 rows)
                └─ Crop_recommendation.csv (Kaggle agronomy set, 2,200 rows)
```

The three CSVs are folded into one schema by `backend/app/data_loader.py` before training,
so the model learns from every row (67,200 in total).

---

## 3. Dataset

| Property | Value |
|----------|--------|
| Files | `backend/data/india_crops.csv`, `backend/data/tamilnadu_crops.csv`, `backend/data/Crop_recommendation.csv` |
| Merged rows | 67,200 |
| Coverage | 16 states (+ `Unspecified` for Kaggle rows without a location) |
| Crops | 74 (after alias folding) |
| Soil classes | 10 (Alluvial, Black, Clay, Laterite, Loamy, Red, Sandy, Saline, Silty, Other) |
| Columns | N, P, K, temperature, humidity, ph, rainfall, soil, season, state, crop, water_source |

### Normalisation (`backend/app/data_loader.py`)

| Rule | Detail |
|------|--------|
| Soil | 34 free-text TN strings folded to 10 canonical buckets (`soil_bucket`) |
| Crop names | Spelling variants aliased to slugs (`bengalgram` → chickpea, `Pearl millet` → bajra, `gingely` → sesame, `redgram` → pigeon pea, `small onion` → onion) |
| Season | Row value, else the crop’s dominant season, else the curated calendar |
| State | Kaggle rows (no location) use `Unspecified`, which the API never offers in `options.state` |
| Water source | TN column when present; india set derived from rainfall (`≥ 900 mm` → rainfed); Kaggle left unknown |
| Sow / harvest / duration | Curated calendar wins, else read off TN `SOWN` / `HARVESTED` / `CROPDURATION` |

---

## 4. Model

| Item | Detail |
|------|--------|
| Path | `backend/models/crop_model_v2.joblib` |
| Estimator | `RandomForestClassifier` (300 trees, `min_samples_leaf=2`) |
| Features | numerics (`N, P, K, ph, temperature, humidity, rainfall`) + `soil`, `season`, `state` (one-hot, `handle_unknown="ignore"`) |
| Target | crop slug (`rice`, `wheat`, …) |
| Split | stratified 80 / 20 — 53,760 train / 13,440 test |
| Held-out accuracy | **0.9453** (top-3 **0.992**) |
| UI-only | `water_source` (used for display / soft checks, not a model input) |

The cache is invalidated automatically when the merged row count or crop count changes.
Confirm live metrics with `GET /model-info`.

---

## 4b. v3 district model (primary mode)

The live app's primary mode recommends crops for a **real Indian district and season**. Its data are
`backend/data/large/agromind_india_large.parquet`: 344,539 Government of India APY rows (district ×
season × crop year 1997-98 … 2020-21, 36 states, 792 districts, 55 crops) joined with NASA POWER
climate and ISRIC SoilGrids soil (see `docs/research/DATASET.md`). The v2 model above is kept as the
secondary **soil-test (N-P-K) mode**.

| Item | Detail |
|------|--------|
| Code | `backend/app/v3_service.py` |
| Estimator | `ExtraTreesClassifier` (300 trees, `min_samples_leaf=2`), the best setup in `notebooks/AgroMind_v3_LargeScale.ipynb` |
| Features | season-window `temperature`, `humidity`, `rainfall` + district centroid `lat`, `lon` + one-hot `season_app`, `state` |
| Target | `recommend == 1` rows (84,253): the top-3 crops by within-crop yield percentile per district-year-season, 49 crops |
| Not a model input | soil. It is returned for context and is editable in the UI, but the v3 study found no measurable gain from it |
| Grouped validation (results.json `v3`) | unseen districts hit@1 **72.90 %**, hit@3 **93.50 %** (popularity baseline 62.90 % / 88.30 %); future years 2015-2020 hit@1 66.06 %; unseen states hit@1 39.47 % |
| Training | in memory, ~2 s on a free CPU, started in a background thread at API startup so `/health` and the v2 endpoints answer at once. There is no joblib cache, because one would be ~400 MB. `/v3/predict` waits for training if it is called during warm-up |

---

## 5. API

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness probe |
| `GET /metadata` | Input fields, allowed options, per-crop profiles, source coverage |
| `GET /model-info` | v2 metrics, feature list, per-source row counts at the top level; the v3 model under `"v3"` (rows, crops, states, districts = APY names, locations = matched centroids, years, grouped metrics) |
| `POST /predict` | Ranked crop recommendations (`best_crop` + `top_recommendations`) |
| `GET /dataset` | Paginated merged training rows (filterable by `crop`) |
| `GET /v3/options` | States → districts → seasons that have records, plus the crop list |
| `GET /v3/district?state=&district=&season=` | District defaults: season climate averaged over years, soil, centroid, last-5-years crop history |
| `POST /v3/predict` | Every crop ranked by probability + its historical median yield in that district |
| `GET /v3/dataset?state=&district=&crop=&year=&page=&page_size=` | Server-side filtered, paginated browse of all 344,539 rows |

`POST /predict` body includes `state` plus soil/season/water_source and numeric fields (`water` maps to rainfall mm).

### v3 request / response shapes

Names are as published by APY: districts are UPPER CASE (`"LUDHIANA"`) and states are title case
(`"Punjab"`). `season` is one of `kharif`, `rabi`, `zaid`, `whole_year`; only the seasons listed for a
district in `/v3/options` have records. An unknown state, district or season returns **404**, and an
invalid season name returns **422**.

```text
GET /v3/options
→ {"states": [{"state": "Punjab", "districts": [{"district": "LUDHIANA", "seasons": ["kharif","rabi","whole_year"]}, …]}, …],
   "seasons": ["kharif","rabi","zaid","whole_year"],
   "crops": [{"slug": "wheat", "name": "Wheat", "type": "Cereal"}, …]}           # 49 crops

GET /v3/district?state=Punjab&district=LUDHIANA&season=rabi
→ {"state","district","season",
   "climate": {"temperature": 16.98, "humidity": 41.13, "rainfall": 93.69},   # °C, %, mm per season
   "climate_years": 23, "location": {"lat": 30.8054, "lon": 75.8329},
   "soil": {"soil_ph": 7.7, "soil_n_gkg": 0.9, "soil_soc_gkg": 10.0, "soil_clay_pct": 29.42,
            "soil_sand_pct": 40.62, "soil_cec_cmolkg": 16.15, "soil_class": "Loamy",
            "source": "soilgrids_centroid" | "state_median" | null},
   "history": {"years": [2015, 2019],
               "top_crops": [{"crop": "Wheat", "crop_slug": "wheat", "name": "Wheat", "mean_area_ha": 250800.0,
                              "median_yield": 5.1, "yield_unit": "Tonnes/ha", "years": 5, "recommended_years": 5}, …]}}  # ≤10, by area

POST /v3/predict
   {"state": "Punjab", "district": "LUDHIANA", "season": "rabi",
    "temperature"?: float, "humidity"?: float, "rainfall"?: float,            # optional overrides (used by the model)
    "soil_ph"?, "soil_n_gkg"?, "soil_soc_gkg"?, "soil_clay_pct"?, "soil_sand_pct"?, "soil_cec_cmolkg"?}  # accepted, context only
→ {"state","district","season",
   "inputs": {"temperature","humidity","rainfall","lat","lon"},              # values actually fed to the model
   "model_inputs": ["temperature","humidity","rainfall","lat","lon","season_app","state"],
   "note": null | "Soil values are shown for context; …",                   # set when soil overrides were sent
   "best_crop": "wheat",
   "recommendations": [{"crop": "wheat", "name": "Wheat", "probability": 0.3581, "grown_here": true,
                        "historical_median_yield": 4.83, "yield_unit": "Tonnes/ha", "years_grown": 23}, …]}  # all 49, sorted

GET /v3/dataset?state=Punjab&crop=wheat&year=2010&page=1&page_size=50     # all filters optional, case-insensitive; crop = raw name or slug
→ {"columns": [...18 names...], "rows": [{...}], "total": 123, "page": 1, "page_size": 50, "pages": 3,
   "total_rows_in_dataset": 344539}                                          # page_size ≤ 200; NaN → null
```

Test: `cd backend && .venv/bin/python -m pytest tests/test_v3.py -q`.

---

## 6. Frontend

- Required inputs: state, season, soil, water source, all numeric bars
- Samples: rice, wheat, cotton, maize, sugarcane, groundnut
- Raw data viewer reads `GET /dataset` and shows the source set per row
- Storage keys: `agromind.saved-analyses.v2` / `agromind.active-analysis.v2`

---

## 7. Honesty checklist

- [ ] Say the training set **merges public / synthetic agro sets** (multi-state + Tamil Nadu field records + the Kaggle agronomy set), not ICAR farm surveys
- [ ] Quote metrics from live `/model-info` (currently 94.5% hold-out accuracy, 99.2% top-3)
- [ ] v3 mode: say the data are real Government APY statistics joined with NASA POWER / SoilGrids at district centroids, and quote grouped (unseen-district) metrics, not random-split ones
- [ ] Credit that recommendations are demos for education
