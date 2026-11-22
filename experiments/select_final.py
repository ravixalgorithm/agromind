"""Pick the final v4 config from tune.py scores: choose on VALIDATION (held-out training groups), then report TEST.
Candidates = each config, z-score blends of a listwise + a pointwise config, and + w * persistence.

    .venv/bin/python select_final.py      -> results/select_final.json
"""
import json, itertools
import numpy as np, pandas as pd
import run

S = pd.concat([pd.read_parquet(run.OUT / f"tune_scores_{p}.parquet").assign(protocol=p)
               for p in ("random", "leave-states-out", "leave-years-out")], ignore_index=True)
S["key"] = S.protocol + "|" + S.part + "|" + S.fold.astype(str) + "|" + S.qid.astype(str)
cfgs = [c for c in S.columns if c[:2] in ("L0", "L1", "L2", "P0", "P1", "X0")]
z = lambda c: (S[c] - S.groupby("key")[c].transform("mean")) / (S.groupby("key")[c].transform("std").fillna(0) + 1e-9)
for c in cfgs + ["persistence"]:
    S["z_" + c] = z(c)
cands = {c: S[c].values for c in cfgs}
for a, b in itertools.product([c for c in cfgs if c[0] in "LX"], [c for c in cfgs if c[0] == "P"]):
    cands[f"{a} + {b}"] = (S["z_" + a] + S["z_" + b]).values
base = dict(cands)
for name, v in base.items():
    for w in (0.25, 0.5, 1.0):
        cands[f"{name} + {w}*persistence"] = v + w * S["z_persistence"].values
cold = S.groupby("key").lag1_pct.transform(lambda x: x.isna().any())


def hit1(v):
    d = S.assign(s=v, cold=cold)
    r = d.groupby("key").s.rank(ascending=False, method="first")
    h = d[d.best == 1].assign(h=(r[d.best == 1] == 1).astype(float))
    return h.groupby(["protocol", "part", "fold"]).h.mean().groupby(["protocol", "part"]).mean(), \
        h.groupby(["protocol", "part", "cold"]).h.mean()


rows = []
for name, v in cands.items():
    m, mc = hit1(v)
    rows.append(dict(name=name, **{f"{p}|{part}": 100 * m.get((p, part), np.nan) for p in ("random", "leave-states-out", "leave-years-out") for part in ("val", "test")},
                     **{f"{p}|test|{'cold' if c else 'warm'}": 100 * mc.get((p, "test", c), np.nan) for p in ("leave-states-out",) for c in (True, False)}))
R = pd.DataFrame(rows).set_index("name")
R["val_mean"] = R[[c for c in R.columns if c.endswith("|val")]].mean(1)
R = R.sort_values("val_mean", ascending=False)
pers = hit1(S.persistence.values)
pd.set_option("display.width", 250)
print(R.round(1).head(15).to_string())
print("persistence test:", (100 * pers[0]).round(1).to_dict())
choice = R.index[0]
json.dump({"chosen": choice, "table": R.round(2).reset_index().to_dict(orient="records"),
           "persistence": {f"{k[0]}|{k[1]}": round(100 * v, 2) for k, v in pers[0].items()}},
          open(run.OUT / "select_final.json", "w"), indent=1)
print("CHOSEN (best mean validation Hit@1):", choice)
