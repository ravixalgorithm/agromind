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

## 5. API

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness probe |
| `GET /metadata` | Input fields, allowed options, per-crop profiles, source coverage |
| `GET /model-info` | Live metrics, feature list, per-source row counts |
| `POST /predict` | Ranked crop recommendations (`best_crop` + `top_recommendations`) |
| `GET /dataset` | Paginated merged training rows (filterable by `crop`) |

`POST /predict` body includes `state` plus soil/season/water_source and numeric fields (`water` maps to rainfall mm).

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
- [ ] Credit that recommendations are demos for education
