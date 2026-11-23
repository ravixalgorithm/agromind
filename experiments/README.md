# Experiments: yield-grounded crop ranking + conformal sets

Reproduces every number in `paper/main.pdf` and `notebooks/AgroMind_v4_Novel_Method.ipynb`.

```bash
uv venv --python 3.12 experiments/.venv
uv pip install --python experiments/.venv/bin/python pandas numpy scikit-learn xgboost lightgbm scipy matplotlib pyarrow requests nbformat nbconvert ipykernel
cd experiments
.venv/bin/python run.py              # main: climate + soil + district history   (~30 min)
.venv/bin/python run.py --no-hist    # ablation without district history
.venv/bin/python run.py --no-soil    # ablation without SoilGrids columns
.venv/bin/python crossconf.py        # cross-group, Mondrian and state-robust conformal for YieldRank
for p in random leave-states-out leave-years-out; do .venv/bin/python compare.py --protocol $p --tag light --only ...; done  # method comparison
.venv/bin/python final_model.py      # train + save backend/models/v4_final.joblib, then self-check
.venv/bin/python report.py main      # -> paper/tables/*.tex, paper/figures/*.pdf, results/summary_main.json
cd ../paper && tectonic main.tex     # -> paper/main.pdf
```

| File | What |
|------|------|
| `run.py` | Data → queries; baselines (crop prior, persistence, NB, RF, XGBoost, MLP); `FINAL` = YieldRank v4 (XGBoost rank:ndcg + LightGBM pointwise + 0.25×persistence); LAC/APS conformal with i.i.d. vs held-out-group calibration; random / leave-states-out (by `state_group`) / leave-years-out |
| `tune.py`, `select_final.py` | Model selection on validation = held-out training groups (never test folds) → `results/select_final.json` |
| `compare.py` | 26 methods on identical folds: baselines, 12 reimplementations of 6 recent papers (exact configs + fidelity notes), ranking variants, YieldRank ablations |
| `final_model.py` | Frozen v4 model for the app: `train/save/load/predict/self_check` |
| `make_compare_notebook.py` | Builds `notebooks/AgroMind_Method_Comparison.ipynb` |
| `crossconf.py` | Out-of-fold scores over all training states → cross-group conformal; Mondrian by #candidates and by region |
| `report.py` | The only place numbers are turned into paper text (`paper/tables/numbers.tex` macros) |
| `make_notebook.py` | Builds the Colab notebook (execute it with `jupyter nbconvert --execute`) |
| `verify_refs.py` | Crossref / arXiv lookup used to verify every new citation |

Data: `backend/data/large/agromind_india_large.parquet` (built by `backend/scripts/build_large_dataset.py`, see `docs/research/DATASET.md`).
Results JSON is committed. Per-query parquet files are gitignored and regenerate with the commands above.
