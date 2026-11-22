# AgroMind

**Generalized crop recommendation for Indian fields** — pick a state, enter soil and climate readings, get ranked crop fits with confidence, calendars, and growing profiles.

<p align="center">
  <img src="docs/dashboard.png" alt="AgroMind dashboard — crop analysis with confidence, ranking, and field readings" width="100%" />
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.115%2B-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img alt="Rows" src="https://img.shields.io/badge/Training%20rows-67%2C200-2e7d32?style=flat-square" />
  <img alt="Crops" src="https://img.shields.io/badge/Crops-74-2e7d32?style=flat-square" />
</p>

---

## Overview

AgroMind is a full-stack advisor for matching field conditions to crops **across India**. A Random Forest model trained on a **merged three-source dataset** (67,200 rows · 74 crops · 16 states) ranks candidates from NPK, pH, temperature, humidity, rainfall, soil type, season, and **state**.

The UI is a floated desktop-style app: dark sidebar, Chrome-style tabs, hatch-framed metric shells, live rankings, and a raw dataset viewer.

**Docs:** [Project documentation](docs/PROJECT.md) · [UI design system](frontend/DESIGN.md)

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Vite, Iconsax, Plus Jakarta Sans |
| Backend | FastAPI, scikit-learn, pandas, joblib |
| Model | RandomForest (300 trees), one-hot soil / season / state |
| Data | Merged `india_crops` + `tamilnadu_crops` + `Crop_recommendation` CSVs |

> **Note:** Training rows come from public / synthetic agro reference sets. Metrics are for demo / coursework — not farm-validated agronomy advice.

**States covered:** Andhra Pradesh, Assam, Bihar, Gujarat, Haryana, Karnataka, Kerala, Madhya Pradesh, Maharashtra, Odisha, Punjab, Rajasthan, Tamil Nadu, Telangana, Uttar Pradesh, West Bengal.

---

## Features

- **State-aware recommendations** — location is a model feature, not just a label
- **Live results** — update as soon as every reading is set
- **Confidence & fit** — top pick with %, reading marks, soil match, sow/harvest window
- **Crop ranking** — model pick plus same-season alternatives by in-range fit
- **Growing calendar** — sow / grow / harvest months per crop
- **Field panel** — state, season, soil chips, craft sliders
- **Saved analyses** — sidebar history (`localStorage`)
- **Raw data viewer** — browse merged training rows, filterable by crop, with the source set shown per row

---

## Quick start

### Prerequisites

- Python **3.10+** (verified on 3.15)
- Node.js **18+** and npm (verified on 22)

### Windows — one click

```bat
start_all.bat
```

This opens the backend and frontend in separate terminals. First run creates `backend/.venv`,
installs dependencies and trains the model (a minute or two); later runs start instantly.

Then open **http://127.0.0.1:5173**

### Manual

```bash
# backend
cd backend
py -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev
```

First boot trains (or loads) `backend/models/crop_model_v2.joblib`.

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:8000/docs | Swagger |
| http://127.0.0.1:8000/metadata | Fields, states, crop profiles |
| http://127.0.0.1:8000/model-info | Metrics and per-source row counts |
| http://127.0.0.1:8000/dataset | Paginated training rows |

To retrain from scratch:

```bash
cd backend
.venv\Scripts\python train_model.py --force
```

---

## API example

`POST /predict`

```json
{
  "N": 90,
  "P": 40,
  "K": 40,
  "ph": 6.5,
  "temperature": 28,
  "humidity": 80,
  "water": 1200,
  "soil": "Alluvial",
  "season": "kharif",
  "water_source": "irrigated",
  "state": "Punjab"
}
```

---

## Model & data

| Item | Detail |
|------|--------|
| Artifact | `backend/models/crop_model_v2.joblib` |
| Scale | 67,200 rows · 74 crops · 16 states · 10 soil classes |
| Features | N, P, K, pH, temp, RH, rainfall, soil, season, **state** |
| Target | crop slug (`rice`, `mango`, …) |
| Held-out | See live `GET /model-info` |

### Sources

`backend/app/data_loader.py` normalises all three CSVs into one schema
(`N, P, K, temperature, humidity, ph, rainfall, soil, season, state, crop, water_source`)
before training, so the model learns from every row:

| File | Rows | Contributes |
|------|------|-------------|
| `data/india_crops.csv` | 8,000 | state, soil, season, climate |
| `data/tamilnadu_crops.csv` | 57,000 | free-text soil, month-level sow/harvest, durations |
| `data/Crop_recommendation.csv` | 2,200 | the Kaggle agronomy readings (22 crops) |

Normalisation rules:

- **Soil** — 34 free-text strings from the Tamil Nadu set are folded into 10 canonical buckets
  (see `SOIL_TYPES` in `backend/app/india_ref.py`).
- **Crop names** — spelling variants are aliased (`bengalgram` → chickpea, `Pearl millet` → bajra,
  `gingely` → sesame, `redgram` → pigeon pea, `small onion` → onion) so 100+ raw labels collapse to 74 crops.
- **Season** — taken from the row when present, otherwise from the crop's dominant season, otherwise
  from the curated calendar.
- **State** — rows that carry no location (the Kaggle set) use an `Unspecified` bucket which the API
  never offers, so it cannot be selected from the UI.
- **Sow / harvest / duration** — curated where the data has no calendar columns, otherwise read off
  the Tamil Nadu records (`SOWN`, `HARVESTED`, `CROPDURATION`).

---

## Repository layout

```text
agromind/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI routes
│   │   ├── model_service.py  # training, metrics, prediction, metadata
│   │   ├── data_loader.py    # merges the three CSVs
│   │   ├── india_ref.py      # states, soils, crop catalog, calendars
│   │   └── schemas.py        # request/response models + field bounds
│   ├── data/                 # the three training CSVs
│   ├── models/               # crop_model_v2.joblib (generated)
│   └── train_model.py
├── frontend/
│   ├── src/                  # App.jsx, Slider.jsx, styles.css
│   └── DESIGN.md
├── docs/
│   ├── dashboard.png
│   └── PROJECT.md
├── notebooks/                # original Kaggle exploration
├── start_all.bat
├── start_backend.bat
└── start_frontend.bat
```

---

## License & attribution

Application code is for education and demonstration.

Training data combines public agro reference patterns and the Kaggle crop recommendation set; treat outputs as illustrative.
