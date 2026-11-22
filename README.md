# AgroMind

**District-level crop recommendation for India**: pick a state, district and season, and get every crop ranked by how likely it is to be among the best-yielding crops there. Learned from 26 years of official Government of India crop statistics.

<p align="center">
  <img src="docs/dashboard.png" alt="AgroMind dashboard — crop analysis with confidence, ranking, and field readings" width="100%" />
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.115%2B-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img alt="Rows" src="https://img.shields.io/badge/DES%20rows-4%2C00%2C379-2e7d32?style=flat-square" />
  <img alt="Districts" src="https://img.shields.io/badge/Districts-748-2e7d32?style=flat-square" />
</p>

---

## Overview

AgroMind recommends crops for a **real Indian district and season**. The data are
**4,00,379 official district-wise crop records** from the Government of India's Directorate of
Economics & Statistics (APY reports, data.desagri.gov.in, crop years 1997-98 to 2022-23, 37 states/UTs,
748 districts). Each record is joined with NASA POWER season climate and ISRIC SoilGrids soil at the
district centroid. An ExtraTrees model learns which crops end up among the top-3 by relative yield in
each district-season.

The validation is honest: every split is grouped, so test districts, states or years are never seen in training.

| Test | hit@1 | hit@3 | Popularity baseline hit@1 |
|------|-------|-------|---------------------------|
| Unseen districts | **72.66 %** | **93.53 %** | 61.69 % |
| Unseen states | 41.80 % | 70.70 % | 30.46 % |
| Future years (2015–2022) | 65.34 % | 87.80 % | 55.49 % |

**Docs:** [Project documentation](docs/PROJECT.md) · [Dataset](docs/research/DATASET.md) · [Data provenance](docs/research/DATA_PROVENANCE.md) · [UI design system](frontend/DESIGN.md)

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Vite |
| Backend | FastAPI, scikit-learn, pandas, pyarrow |
| Model | ExtraTrees (300 trees) on season climate + district location + season + state |
| Data | `backend/data/large/agromind_india_large.parquet` (DES APY × NASA POWER × SoilGrids) |

> **Note:** "Recommended" means "among the top-3 crops by relative yield in that district-season" in the
> official statistics. It is not profit or agronomy advice. Treat outputs as a demonstration for education.

### Research history: v1 → v2 → v3

| Version | Data | Result |
|---------|------|--------|
| v1 | Kaggle `Crop_recommendation.csv` (2,200 rows, 22 crops) | 98 % reported, but the one-vs-rest decoding was flawed and a min–max lookup already gets 88 % on that set |
| v2 | 3 merged CSVs (67,200 rows, 74 crops) | 94.3 % in random 5-fold CV, but only 7–13 % on a source held out, because the sources disagree. Retired |
| v3 (live) | official DES APY + climate + soil (4,00,379 rows) | the grouped results above |

All of it is reproducible in Colab: `notebooks/AgroMind_v2_Research.ipynb` (v1 → v2) and
`notebooks/AgroMind_v3_LargeScale.ipynb` (v3). Numbers are in `docs/research/results.json`.

---

## Quick start

### Prerequisites

- Python **3.10+**
- Node.js **18+** and npm

### Windows — one click

```bat
start_all.bat
```

This opens the backend and frontend in separate terminals. The first run creates `backend/.venv` and
installs dependencies. The model trains in memory in a few seconds each time the API starts.

Then open **http://127.0.0.1:5173**

### Manual

```bash
# backend
cd backend
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev
```

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:8000/docs | Swagger |
| http://127.0.0.1:8000/options | States → districts → seasons, crop list |
| http://127.0.0.1:8000/model-info | Model, data coverage, grouped metrics, v1/v2 history |
| http://127.0.0.1:8000/dataset | Paginated browse of all 4,00,379 rows |

Checks:

```bash
cd backend
python -m pytest tests -q     # every endpoint
python train_model.py         # trains once, prints coverage + grouped metrics
```

---

## API example

`POST /predict`: `temperature`, `humidity` and `rainfall` are optional overrides of the district's
season averages (`GET /district` returns the defaults).

```json
{ "state": "Punjab", "district": "Ludhiana", "season": "rabi" }
```

The response ranks all 49 crops (wheat first for Ludhiana rabi), each with its probability and its
historical median yield in that district. Full shapes: [docs/PROJECT.md §5](docs/PROJECT.md#5-api).

---

## Repository layout

```text
agromind/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI routes
│   │   ├── v3_service.py     # district model: data, training, prediction, browse
│   │   ├── schemas.py        # /predict request model
│   │   ├── india_ref.py      # crop names, types, curated calendars
│   │   └── data_loader.py    # v2 CSV merge (used by the v2 research notebook only)
│   ├── data/large/           # DES APY × NASA POWER × SoilGrids table (+ build stats)
│   ├── data/*.csv            # v1/v2 research CSVs
│   ├── scripts/build_large_dataset.py
│   ├── tests/test_api.py
│   └── train_model.py
├── frontend/                 # React UI (see DESIGN.md)
├── notebooks/                # v1 (original), v2 research, v3 large-scale, v4 method
├── docs/
│   ├── PROJECT.md
│   └── research/             # DATASET, DATA_PROVENANCE, LITERATURE, results.json, figures
├── start_all.bat
├── start_backend.bat
└── start_frontend.bat
```

---

## License & attribution

Application code is for education and demonstration.

Crop statistics: Government of India, Directorate of Economics & Statistics (DES), under the DES copyright policy (reproduction free of charge after taking permission; see provenance). Climate: NASA POWER. Soil: ISRIC SoilGrids 2.0 (CC BY 4.0). Details and citations: [DATA_PROVENANCE.md](docs/research/DATA_PROVENANCE.md). Treat outputs as illustrative.
