"""Final-model selection for v4 (weak points: pointwise vs listwise, persistence gap).
Validation = held-out training groups of each fold (20% of training states / year blocks / queries),
exactly the group-calibration split of run.py; test folds are only scored, never used to choose.

    .venv/bin/python tune.py --protocol leave-states-out
Writes results/tune_scores_<protocol>.parquet: per (fold, part in {val,test}, row) the score of every config.
"""
import argparse, time
import numpy as np, pandas as pd
from sklearn.model_selection import GroupShuffleSplit
import run

CONFIGS = {
    "L0 LambdaMART (v4)": ("lambdarank", {}),
    "L1 LambdaMART tuned": ("lambdarank", dict(n_estimators=800, learning_rate=0.03, num_leaves=31, min_child_samples=100,
                                               lambdarank_truncation_level=30)),
    "L2 LambdaMART exp-gain": ("lambdarank", dict(label_gain=[2 ** i - 1 for i in range(10)], n_estimators=600)),
    "P0 pointwise (v4)": ("regression", {}),
    "P1 pointwise tuned": ("regression", dict(n_estimators=800, learning_rate=0.03, num_leaves=31, min_child_samples=100)),
    "X0 XGB rank:ndcg": ("xgb_rank", {}),
}

ap = argparse.ArgumentParser()
ap.add_argument("--protocol", required=True)
args = ap.parse_args()
df = run.load()
crops = sorted(df.crop_slug.unique())
idx = lambda qs: df.index[df.qid.isin(qs)]
rng = np.random.default_rng(run.SEED)
out = []
for protocol in ("random", "leave-states-out", "leave-years-out"):
    for f, (trq, teq, groups) in enumerate(run.folds(df, protocol)):
        a, b = next(GroupShuffleSplit(1, test_size=0.2, random_state=run.SEED + f).split(trq, groups=groups.loc[trq].values))
        iid_cal = rng.choice(trq[a], size=len(trq[b]), replace=False)
        if protocol != args.protocol:
            continue
        fit_i = idx(np.setdiff1d(trq[a], iid_cal))
        parts = {"val": idx(trq[b]), "test": idx(teq)}
        frames = {k: df.loc[v, ["qid", "crop_slug", "yield_pct", "best", "lag1_pct"]].assign(part=k, fold=f) for k, v in parts.items()}
        pers = run.fit_persist(df, fit_i)
        for k, v in parts.items():
            frames[k]["persistence"] = pers(v)
        for name, (obj, ov) in CONFIGS.items():
            t0 = time.time()
            score = run.fit_rank(df, fit_i, crops, True, obj, **dict(ov))
            for k, v in parts.items():
                frames[k][name] = score(v)
            print(f"{protocol} f{f} {name:24s} {time.time()-t0:5.1f}s "
                  f"val Hit@1 {100*run.per_query(df.loc[parts['val']], frames['val'][name].values)['hit@1'].mean():.1f}  "
                  f"test Hit@1 {100*run.per_query(df.loc[parts['test']], frames['test'][name].values)['hit@1'].mean():.1f}", flush=True)
        out += list(frames.values())
pd.concat(out).to_parquet(run.OUT / f"tune_scores_{args.protocol}.parquet")
print("done")
