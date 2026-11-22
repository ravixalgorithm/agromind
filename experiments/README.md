# Experiments: yield-grounded crop ranking + conformal sets

Reproduces every number in `paper/main.pdf` and `notebooks/AgroMind_v4_Novel_Method.ipynb`.

```bash
uv venv --python 3.12 experiments/.venv
uv pip install --python experiments/.venv/bin/python pandas numpy scikit-learn xgboost lightgbm scipy matplotlib pyarrow requests nbformat nbconvert ipykernel
cd experiments
.venv/bin/python run.py              # main: climate + soil + district history   (~30 min)
.venv/bin/python run.py --no-hist    # ablation without district history
.venv/bin/python crossconf.py        # cross-group + Mondrian conformal for YieldRank
.venv/bin/python report.py main      # -> paper/tables/*.tex, paper/figures/*.pdf, results/summary_main.json
cd ../paper && tectonic main.tex     # -> paper/main.pdf
```

| File | What |
|------|------|
| `run.py` | Data → queries; baselines (crop prior, persistence, NB, RF, XGBoost, MLP); YieldRank (LightGBM LambdaMART); LAC/APS conformal with i.i.d. vs held-out-group calibration; random / leave-states-out / leave-years-out |
| `crossconf.py` | Out-of-fold scores over all training states → cross-group conformal; Mondrian by #candidates and by region |
| `report.py` | The only place numbers are turned into paper text (`paper/tables/numbers.tex` macros) |
| `make_notebook.py` | Builds the Colab notebook (execute it with `jupyter nbconvert --execute`) |
| `verify_refs.py` | Crossref / arXiv lookup used to verify every new citation |

Data: `backend/data/large/agromind_india_large.parquet` (built by `backend/scripts/build_large_dataset.py`, see `docs/research/DATASET.md`).
Results JSON is committed. Per-query parquet files are gitignored and regenerate with the commands above.
