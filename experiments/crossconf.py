"""Group-wise cross-conformal sets for YieldRank: every training query gets an out-of-fold score
from a ranker that never saw its state (or year block), so all training groups calibrate the
threshold instead of a single 20% hold-out. The final ranker is refit on all training queries.

    .venv/bin/python crossconf.py [--quick]
Writes results/crossconf_<tag>.json and results/crossconf_query_<tag>.parquet.
"""
import argparse, json
import numpy as np, pandas as pd
from sklearn.model_selection import GroupKFold
import run

REGION = {  # broad zones used only as Mondrian calibration groups
    **dict.fromkeys(["Punjab", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Uttarakhand", "Uttar Pradesh", "Delhi", "Chandigarh"], "north"),
    **dict.fromkeys(["Andhra Pradesh", "Telangana", "Karnataka", "Kerala", "Tamil Nadu", "Puducherry", "Andaman and Nicobar Islands"], "south"),
    **dict.fromkeys(["Bihar", "Jharkhand", "Odisha", "West Bengal"], "east"),
    **dict.fromkeys(["Gujarat", "Maharashtra", "Rajasthan", "Goa", "Dadra and Nagar Haveli", "Daman and Diu"], "west"),
    **dict.fromkeys(["Madhya Pradesh", "Chhattisgarh"], "central"),
    **dict.fromkeys(["Assam", "Arunachal Pradesh", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Sikkim", "Tripura"], "northeast")}


def mondrian(cal, test, group, alpha=0.1, min_n=50):
    """LAC with a separate threshold per group (falls back to the pooled threshold for small groups)."""
    def qhat(s):
        n = len(s)
        return np.quantile(s, min(1, np.ceil((n + 1) * (1 - alpha)) / n), method="higher")
    c = cal[cal.best == 1]
    s = 1 - c.p.values
    g = c.qid.map(group).values
    pooled = qhat(s)
    th = {k: (qhat(s[g == k]) if (g == k).sum() >= min_n else pooled) for k in np.unique(g)}
    t = test.assign(inset=(1 - test.p.values) <= test.qid.map(group).map(th).fillna(pooled).values)
    cov = t[t.best == 1].set_index("qid").inset.astype(float)
    size = t.groupby("qid").inset.sum().astype(float)
    return {"coverage": float(cov.mean()), "size": float(size.mean())}, cov, size


ap = argparse.ArgumentParser()
ap.add_argument("--quick", action="store_true")
args = ap.parse_args()
df = run.load()
if args.quick:
    df = df[df.qid.isin(df.qid.drop_duplicates().sample(6000, random_state=run.SEED))].reset_index(drop=True)
crops = sorted(df.crop_slug.unique())
Q = df.groupby("qid").first()
ncand = df.groupby("qid").size()
BUCKET = pd.cut(ncand, [1, 3, 5, 8, 100], labels=["2-3", "4-5", "6-8", "9+"]).astype(str)
ZONE = Q.state.map(REGION).fillna("other")
idx = lambda qs: df.index[df.qid.isin(qs)]
out, perq = {}, []
for protocol in ("random", "leave-states-out", "leave-years-out"):
    for f, (trq, teq, groups) in enumerate(run.folds(df, protocol)):
        if args.quick and f >= 2:
            break
        oof = pd.Series(np.nan, index=idx(trq))
        g = groups.loc[trq].values
        for itr, iho in GroupKFold(min(5, len(set(g)))).split(trq, groups=g):
            score = run.fit_rank(df, idx(trq[itr]), crops, True, "lambdarank")
            oof.loc[idx(trq[iho])] = score(idx(trq[iho]))
        tr_i, te_i = idx(trq), idx(teq)
        T = run.fit_T(df.loc[tr_i, "qid"], oof.values, df.loc[tr_i, "best"].values)
        final = run.fit_rank(df, tr_i, crops, True, "lambdarank")
        s_te = final(te_i)
        mk = lambda i, s: df.loc[i, ["qid", "best"]].assign(p=run.softmax_by_q(df.loc[i, "qid"], s, T))
        res, per = run.conformal(mk(tr_i, oof.values), mk(te_i, s_te))
        pq = run.per_query(df.loc[te_i], s_te)
        rec = {k: float(v) for k, v in pq.mean().items()} | {"conformal_crossgroup": res}
        cal_df, te_df = mk(tr_i, oof.values), mk(te_i, s_te)
        for name, grp in (("ncand", BUCKET), ("region", ZONE)):
            rec[f"mondrian_{name}"], cov, size = mondrian(cal_df, te_df, grp)
            per[f"cov_M{name}"], per[f"size_M{name}"] = cov, size
        out.setdefault(protocol, []).append(rec)
        per["state"], per["protocol"], per["fold"] = Q.state.reindex(per.index).values, protocol, f
        perq.append(per.reset_index(names="qid"))
        print(f"{protocol:17s} f{f} hit@1={rec['hit@1']:.4f} ndcg@3={rec['ndcg@3']:.4f} "
              f"LAC90 cov={res['LAC@0.9']['coverage']:.3f} size={res['LAC@0.9']['size']:.2f} "
              f"APS90 cov={res['APS@0.9']['coverage']:.3f} | Mondrian ncand {rec['mondrian_ncand']['coverage']:.3f}/{rec['mondrian_ncand']['size']:.2f} "
              f"region {rec['mondrian_region']['coverage']:.3f}/{rec['mondrian_region']['size']:.2f}", flush=True)
tag = "quick" if args.quick else "main"
json.dump(out, open(run.OUT / f"crossconf_{tag}.json", "w"), indent=1)
pd.concat(perq, ignore_index=True).to_parquet(run.OUT / f"crossconf_query_{tag}.parquet")
print("wrote", run.OUT / f"crossconf_{tag}.json")
