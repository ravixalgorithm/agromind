"""AgroMind paper experiments: yield-grounded crop ranking + conformal prediction sets
under random / leave-states-out / leave-years-out splits, against classifier baselines.

Query = one district x season x year. Candidates = crops grown there (area >= 100 ha).
Relevance = yield_pct (crop's yield percentile among all districts that grew it that year).
Target for top-1 / conformal = the candidate with the highest yield_pct.

    .venv/bin/python run.py [--quick] [--no-hist]
Writes results/metrics.json, results/per_query.parquet.
"""
import argparse, json, time, warnings
from pathlib import Path
import numpy as np, pandas as pd
import lightgbm as lgb
from xgboost import XGBClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import GroupKFold, GroupShuffleSplit
from scipy.stats import wilcoxon

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / "backend/data/large/agromind_india_large.parquet"
OUT = ROOT / "results"
SEED = 0
ENV = ["temperature", "humidity", "rainfall", "soil_ph", "soil_n_gkg", "soil_soc_gkg",
       "soil_clay_pct", "soil_sand_pct", "soil_cec_cmolkg"]
SEASONS = ["kharif", "rabi", "zaid", "whole_year"]
HIST = ["lag1_pct", "mean3_pct", "lag1_share"]
ALPHAS = (0.1, 0.2)


def load():
    df = pd.read_parquet(DATA)
    df = df[df.crop_slug.notna() & df.yield_pct.notna()].copy()
    df["season_app"] = df.season_app.astype(str)
    # one row per (district, season, year, crop): APY has a few duplicate crop names per slug
    key = ["state", "district", "season", "year", "crop_slug"]
    df = df.sort_values("area_ha").groupby(key, as_index=False).last()
    df["share"] = df.area_ha / df.groupby(["state", "district", "season", "year"]).area_ha.transform("sum")
    # district history: only strictly earlier years of the same district/season/crop
    df = df.sort_values("year")
    g = df.groupby(["state", "district", "season", "crop_slug"])
    prev_year = g.year.shift(1)
    df["lag1_pct"] = g.yield_pct.shift(1).where(prev_year == df.year - 1)
    df["lag1_share"] = g.share.shift(1).where(prev_year == df.year - 1)
    df["mean3_pct"] = g.yield_pct.transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    df["qid"] = df.groupby(["state", "district", "season", "year"]).ngroup()
    n = df.groupby("qid").crop_slug.transform("size")
    df = df[n >= 2].copy()
    df["best"] = (df.yield_pct == df.groupby("qid").yield_pct.transform("max")).astype(int)
    # break exact ties deterministically: keep the first best per query
    first = df[df.best == 1].groupby("qid").head(1).index
    df["best"] = 0
    df.loc[first, "best"] = 1
    for s in SEASONS:
        df[f"s_{s}"] = (df.season_app == s).astype(float)
    df = df.sort_values(["qid", "crop_slug"]).reset_index(drop=True)
    return df


def query_table(df, crops, hist):
    """One row per query: env + season one-hot (+ flattened per-crop history) and best-crop label."""
    q = df.groupby("qid").first()
    X = q[ENV + [f"s_{s}" for s in SEASONS]].copy()
    if hist:
        piv = df.pivot_table(index="qid", columns="crop_slug", values="lag1_pct")
        X = X.join(piv.reindex(columns=crops).add_prefix("h_"))
    y = df[df.best == 1].set_index("qid").crop_slug.reindex(q.index)
    return X, y, q


def pair_features(df, crops, hist):
    X = df[ENV + [f"s_{s}" for s in SEASONS] + (HIST if hist else [])].copy()
    X["crop"] = pd.Categorical(df.crop_slug, categories=crops)
    return X


# ---------------------------------------------------------------- models
def fit_rank(df, tr, crops, hist, objective, target="yield"):
    """objective: lambdarank | regression | xendcg | xgb_rank. target: yield (yield_pct) or share
    (current area share, i.e. 'what farmers grow most': the no-yield-target ablation)."""
    d = df.loc[tr]
    X = pair_features(d, crops, hist)
    y = d.yield_pct if target == "yield" else d.share.groupby(d.qid).rank(pct=True)
    rel = np.clip(np.floor(y * 10), 0, 9).astype(int)  # graded 0..9
    group = d.groupby("qid", sort=False).size().values
    params = dict(n_estimators=400, learning_rate=0.05, num_leaves=63, min_child_samples=40,
                  subsample=0.8, subsample_freq=1, colsample_bytree=0.8, random_state=SEED, verbose=-1)
    if objective in ("lambdarank", "xendcg"):
        extra = dict(label_gain=list(range(10)), lambdarank_truncation_level=10) if objective == "lambdarank" else {}
        m = lgb.LGBMRanker(objective="lambdarank" if objective == "lambdarank" else "rank_xendcg", **extra, **params)
        m.fit(X, rel, group=group)
    elif objective == "xgb_rank":
        from xgboost import XGBRanker
        m = XGBRanker(objective="rank:ndcg", n_estimators=400, learning_rate=0.05, max_depth=6, subsample=0.8,
                      colsample_bytree=0.8, enable_categorical=True, tree_method="hist", random_state=SEED, n_jobs=-1)
        m.fit(X, rel, group=group)
    else:
        m = lgb.LGBMRegressor(objective="regression", **params)
        m.fit(X, y)
    return lambda idx: m.predict(pair_features(df.loc[idx], crops, hist))


def make_clf(name):
    if name == "NB":
        return GaussianNB()
    if name == "RF":
        return RandomForestClassifier(300, min_samples_leaf=2, n_jobs=-1, random_state=SEED)
    if name == "XGB":
        return XGBClassifier(n_estimators=200, max_depth=6, learning_rate=0.1, subsample=0.8,
                             colsample_bytree=0.8, n_jobs=-1, random_state=SEED, verbosity=0)
    return make_pipeline(StandardScaler(), MLPClassifier((128, 64), early_stopping=True, max_iter=200, random_state=SEED))


def fit_clf(name, df, tr, crops, hist, QX, Qy, est=None, max_q=None):
    """Query-level classifier of the best crop. est: any sklearn-style estimator (default make_clf(name));
    max_q: subsample training queries (for O(n^2) models such as kernel SVM)."""
    qtr = df.loc[tr, "qid"].unique()
    if max_q and len(qtr) > max_q:
        qtr = np.random.default_rng(SEED).choice(qtr, max_q, replace=False)
    X = QX.loc[qtr]
    fill = None if name in ("XGB", "CAT") else X.median().fillna(0)  # models without native NaN support
    if fill is not None:
        X = X.fillna(fill)
    y = Qy.loc[qtr]
    classes = np.array(sorted(y.unique()))
    m = est if est is not None else make_clf(name)
    m.fit(X, np.searchsorted(classes, y))
    col = {c: i for i, c in enumerate(classes)}

    def score(idx):
        d = df.loc[idx]
        qs = d.qid.unique()
        Xq = QX.loc[qs]
        if fill is not None:
            Xq = Xq.fillna(fill)
        S = np.log(m.predict_proba(Xq) + 1e-9) if hasattr(m, "predict_proba") else m.decision_function(Xq)
        j = d.crop_slug.map(col)
        out = np.full(len(d), S.min() - 10.0)  # crops never seen as a label rank last
        ok = j.notna().values
        out[ok] = S[pd.Index(qs).get_indexer(d.qid.values[ok]), j.values[ok].astype(int)]
        return out  # log-prob (or decision value) as ranking score
    return score


def fit_prior(df, tr, *_):
    pri = df.loc[tr].groupby(["crop_slug", "season_app"]).yield_pct.mean()
    glob = df.loc[tr].groupby("crop_slug").yield_pct.mean()
    def score(idx):
        d = df.loc[idx]
        s = pd.Series(list(zip(d.crop_slug, d.season_app))).map(pri).values
        return np.where(np.isnan(s), d.crop_slug.map(glob).fillna(0.5).values, s)
    return score


def fit_persist(df, tr, *_):
    prior = fit_prior(df, tr)
    def score(idx):
        d = df.loc[idx]
        return np.where(d.lag1_pct.isna(), prior(idx), d.lag1_pct.values)
    return score


# ---------------------------------------------------------------- metrics
def per_query(d, s):
    """d: candidate rows of test queries (sorted by qid), s: scores. Returns per-query metrics."""
    d = d[["qid", "yield_pct", "best"]].assign(s=s)
    d["r"] = d.groupby("qid").s.rank(ascending=False, method="first")
    d["ideal"] = d.groupby("qid").yield_pct.rank(ascending=False, method="first")
    disc = lambda r: 1 / np.log2(r + 1)
    out = {}
    for k in (1, 3):
        dcg = (d.yield_pct * disc(d.r) * (d.r <= k)).groupby(d.qid).sum()
        idcg = (d.yield_pct * disc(d.ideal) * (d.ideal <= k)).groupby(d.qid).sum()
        out[f"ndcg@{k}"] = (dcg / idcg.replace(0, np.nan)).fillna(1.0)
    br = d[d.best == 1].set_index("qid").r
    out["hit@1"] = (br <= 1).astype(float)
    out["hit@3"] = (br <= 3).astype(float)
    out["top1_pct"] = d[d.r == 1].set_index("qid").yield_pct  # yield percentile of the recommended crop
    return pd.DataFrame(out)


def softmax_by_q(qid, s, T):
    z = pd.Series(s / T).groupby(qid.values)
    e = np.exp(pd.Series(s / T).values - z.transform("max").values)
    return e / pd.Series(e).groupby(qid.values).transform("sum").values


def fit_T(qid, s, best):
    grid = np.exp(np.linspace(np.log(0.02), np.log(50), 60))
    nll = [-np.log(softmax_by_q(qid, s, T)[best == 1] + 1e-12).mean() for T in grid]
    return grid[int(np.argmin(nll))]


def conformal(cal, test):
    """cal/test: DataFrames with qid, p, best. LAC + APS sets; returns coverage, size per alpha."""
    res, per = {}, {}
    for method in ("LAC", "APS"):
        def scores(d):
            if method == "LAC":
                return 1 - d.p.values
            d = d.sort_values(["qid", "p"], ascending=[True, False])
            d["cum"] = d.groupby("qid").p.cumsum()
            return d.cum.sort_index().values  # cum mass up to and incl. each crop
        sc = scores(cal)
        cal_s = sc[cal.best.values == 1]
        n = len(cal_s)
        st = scores(test)
        for a in ALPHAS:
            qhat = np.quantile(cal_s, min(1, np.ceil((n + 1) * (1 - a)) / n), method="higher")
            inset = st <= qhat
            if method == "APS":  # always include the top crop so sets are never empty
                inset |= test.groupby("qid").p.rank(ascending=False, method="first").values == 1
            t = test.assign(inset=inset)
            cov = t[t.best == 1].inset.mean()
            size = t.groupby("qid").inset.sum()
            ncand = t.groupby("qid").size()
            res[f"{method}@{1-a:.1f}"] = dict(coverage=float(cov), size=float(size.mean()),
                                               frac=float((size / ncand).mean()),
                                               singleton=float((size == 1).mean()))
            if a == 0.1:
                per[f"cov_{method}"] = t[t.best == 1].set_index("qid").inset.astype(float)
                per[f"size_{method}"] = size.astype(float)
    return res, pd.DataFrame(per)


# ---------------------------------------------------------------- protocol
def folds(df, protocol):
    q = df.groupby("qid").first()
    if protocol == "random":
        groups = q.index.values
    elif protocol == "leave-states-out":
        groups = q.state.values
    else:  # leave-years-out: 5 contiguous blocks of years
        yrs = np.sort(q.year.unique())
        block = {y: i for i, b in enumerate(np.array_split(yrs, 5)) for y in b}
        groups = q.year.map(block).values
    for tr_q, te_q in GroupKFold(5).split(q, groups=groups):
        yield q.index[tr_q], q.index[te_q], pd.Series(groups, index=q.index)


MODELS = {
    "Crop prior": lambda df, tr, c, h, QX, Qy: fit_prior(df, tr),
    "Persistence": lambda df, tr, c, h, QX, Qy: fit_persist(df, tr),
    "GaussianNB [6,12]": lambda df, tr, c, h, QX, Qy: fit_clf("NB", df, tr, c, h, QX, Qy),
    "RandomForest [8,21]": lambda df, tr, c, h, QX, Qy: fit_clf("RF", df, tr, c, h, QX, Qy),
    "XGBoost [11,22]": lambda df, tr, c, h, QX, Qy: fit_clf("XGB", df, tr, c, h, QX, Qy),
    "MLP [13]": lambda df, tr, c, h, QX, Qy: fit_clf("MLP", df, tr, c, h, QX, Qy),
    "LGBM pointwise": lambda df, tr, c, h, QX, Qy: fit_rank(df, tr, c, h, "regression"),
    "YieldRank (ours)": lambda df, tr, c, h, QX, Qy: fit_rank(df, tr, c, h, "lambdarank"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="2 folds, subsample, for smoke tests")
    ap.add_argument("--no-hist", action="store_true", help="drop district-history features")
    ap.add_argument("--no-soil", action="store_true", help="drop SoilGrids columns (ablation)")
    ap.add_argument("--tag", default="")
    args = ap.parse_args()
    global ENV
    if args.no_soil:
        ENV = [c for c in ENV if not c.startswith("soil_")]
    hist = not args.no_hist
    df = load()
    if args.quick:
        df = df[df.qid.isin(df.qid.drop_duplicates().sample(6000, random_state=SEED))].reset_index(drop=True)
    crops = sorted(df.crop_slug.unique())
    QX, Qy, Q = query_table(df, crops, hist)
    print(f"rows {len(df)} queries {df.qid.nunique()} crops {len(crops)} states {df.state.nunique()} hist={hist}", flush=True)
    rng = np.random.default_rng(SEED)
    metrics, perq, confq = {}, [], []
    for protocol in ("random", "leave-states-out", "leave-years-out"):
        for f, (trq, teq, groups) in enumerate(folds(df, protocol)):
            if args.quick and f >= 2:
                break
            # calibration: 20% of training *groups* (unseen-group cal) and 20% of the rest's queries (iid cal)
            gtr = groups.loc[trq]
            a_idx, b_idx = next(GroupShuffleSplit(1, test_size=0.2, random_state=SEED + f).split(trq, groups=gtr.values))
            grp_cal_q = trq[b_idx]
            rest = trq[a_idx]
            iid_cal_q = rng.choice(rest, size=len(grp_cal_q), replace=False)
            fit_q = np.setdiff1d(rest, iid_cal_q)
            idx = lambda qs: df.index[df.qid.isin(qs)]
            fit_i, te_i, gc_i, ic_i = idx(fit_q), idx(teq), idx(grp_cal_q), idx(iid_cal_q)
            for name, maker in MODELS.items():
                if not hist and name == "Persistence":
                    continue
                t0 = time.time()
                score = maker(df, fit_i, crops, hist, QX, Qy)
                s_te = score(te_i)
                pq = per_query(df.loc[te_i], s_te)
                pq["model"], pq["protocol"], pq["fold"] = name, protocol, f
                perq.append(pq.reset_index())
                rec = metrics.setdefault(protocol, {}).setdefault(name, {"folds": []})
                fold_rec = {k: float(v) for k, v in pq.drop(columns=["model", "protocol", "fold"]).mean().items()}
                # conformal sets for "which crop is best here?"
                s_gc, s_ic = score(gc_i), score(ic_i)
                T = fit_T(df.loc[ic_i, "qid"], s_ic, df.loc[ic_i, "best"].values)
                mk = lambda i, s: df.loc[i, ["qid", "best"]].assign(p=softmax_by_q(df.loc[i, "qid"], s, T))
                tst = mk(te_i, s_te)
                fold_rec["conformal_iid_cal"], per_i = conformal(mk(ic_i, s_ic), tst)
                fold_rec["conformal_group_cal"], per_g = conformal(mk(gc_i, s_gc), tst)
                cp = per_i.add_suffix("_iid").join(per_g.add_suffix("_grp"))
                cp["state"] = Q.state.reindex(cp.index).values
                cp["year"] = Q.year.reindex(cp.index).values
                cp["model"], cp["protocol"], cp["fold"] = name, protocol, f
                confq.append(cp.reset_index(names="qid"))
                rec["folds"].append(fold_rec)
                print(f"{protocol:17s} f{f} {name:22s} ndcg@3={fold_rec['ndcg@3']:.4f} hit@1={fold_rec['hit@1']:.4f} "
                      f"cov90 iid={fold_rec['conformal_iid_cal']['LAC@0.9']['coverage']:.3f} "
                      f"grp={fold_rec['conformal_group_cal']['LAC@0.9']['coverage']:.3f} ({time.time()-t0:.0f}s)", flush=True)
    perq = pd.concat(perq, ignore_index=True)
    # summaries: mean/std over folds + paired Wilcoxon vs ours on per-query NDCG@3
    for protocol, ms in metrics.items():
        ours = perq[(perq.protocol == protocol) & (perq.model == "YieldRank (ours)")].set_index(["fold", "qid"])
        for name, rec in ms.items():
            F = pd.DataFrame([{k: v for k, v in r.items() if not k.startswith("conformal")} for r in rec["folds"]])
            rec["mean"], rec["std"] = F.mean().to_dict(), F.std(ddof=1).to_dict()
            if name != "YieldRank (ours)":
                other = perq[(perq.protocol == protocol) & (perq.model == name)].set_index(["fold", "qid"])
                for k in ("ndcg@3", "hit@1"):
                    diff = (ours[k] - other[k].reindex(ours.index)).dropna()
                    p = wilcoxon(diff).pvalue if (diff != 0).any() else 1.0
                    rec[f"wilcoxon_vs_ours_{k}"] = {"mean_diff": float(diff.mean()), "p": float(p), "n": int(len(diff))}
    OUT.mkdir(exist_ok=True)
    tag = args.tag or ("quick" if args.quick else "nohist" if args.no_hist else "nosoil" if args.no_soil else "main")
    meta = dict(rows=len(df), queries=int(df.qid.nunique()), crops=len(crops), states=int(df.state.nunique()),
                years=[int(df.year.min()), int(df.year.max())], hist=hist,
                soil_coverage=df.soil_source.value_counts(dropna=False).to_dict())
    json.dump({"meta": meta, "metrics": metrics}, open(OUT / f"metrics_{tag}.json", "w"), indent=1, default=str)
    perq.to_parquet(OUT / f"per_query_{tag}.parquet")
    pd.concat(confq, ignore_index=True).to_parquet(OUT / f"conformal_query_{tag}.parquet")
    print("wrote", OUT / f"metrics_{tag}.json")


if __name__ == "__main__":
    main()
