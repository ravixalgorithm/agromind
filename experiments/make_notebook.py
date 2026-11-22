"""Build notebooks/AgroMind_v4_Novel_Method.ipynb (executed separately with nbconvert)."""
from pathlib import Path
import nbformat as nbf

REPO = "ravixalgorithm/agromind"
NB = Path(__file__).resolve().parents[1] / "notebooks/AgroMind_v4_Novel_Method.ipynb"
md, code = nbf.v4.new_markdown_cell, nbf.v4.new_code_cell
cells = [
md(f"""# AgroMind v4 (final): yield-grounded crop ranking + conformal prediction sets

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/{REPO}/blob/main/notebooks/AgroMind_v4_Novel_Method.ipynb)

**Research question.** Published crop recommenders report ~99% accuracy, mostly on the Kaggle crop table split at random.
How good are they on **real Government of India data**, in **states and years the model has never seen**, and can we do better?

* **Data:** DES district × season × year crop statistics (1997-98 to 2022-23, official DES portal) + NASA POWER climate + SoilGrids soil (built by `backend/scripts/build_large_dataset.py`).
* **Task:** for each district-season-year, rank the crops grown there by realised yield percentile. The "best crop" is the top-yielding one.
* **Baselines (as in the literature):** Gaussian NB, Random Forest, XGBoost, MLP classifiers, plus naive *crop prior* and *last-year persistence*.
* **Ours (YieldRank v4, final):** a blend, per district-season, of a listwise ranker (XGBoost rank:ndcg) and a pointwise yield-percentile regressor (LightGBM) on (district-season, crop) pairs, plus 0.25 × last-year persistence. The configuration was chosen on held-out training states and years, never on test folds (`experiments/select_final.py`). Recommendations come with **split-conformal prediction sets** at a 90% coverage target.
* **Protocols:** random 5-fold, **leave-states-out** (5 folds over states), **leave-years-out** (5 contiguous year blocks).

Everything below is computed live; nothing is pasted in. The code lives in `experiments/run.py` (fetched from GitHub on Colab)."""),
code(f"""# Setup: works locally (repo checkout) and on Colab (downloads from GitHub)
import os, sys, subprocess, urllib.request
from pathlib import Path
RAW = "https://raw.githubusercontent.com/{REPO}/main/"
root = next((p for p in [Path.cwd(), Path.cwd().parent] if (p / "experiments/run.py").exists()), None)
if root is None:  # Colab
    subprocess.run([sys.executable, "-m", "pip", "-q", "install", "lightgbm", "xgboost", "pyarrow"], check=True)
    root = Path("agromind");
    for f in ["experiments/run.py", "backend/data/large/agromind_india_large.parquet", "backend/data/Crop_recommendation.csv"]:
        (root / f).parent.mkdir(parents=True, exist_ok=True)
        if not (root / f).exists():
            urllib.request.urlretrieve(RAW + f, root / f)
sys.path.insert(0, str(root / "experiments"))
import numpy as np, pandas as pd, run
from scipy.stats import wilcoxon
pd.set_option("display.width", 200); pd.set_option("display.max_columns", 30)
print("repo root:", root.resolve())"""),
md("## 0. How AgroMind got here: v1 → v2 → v3 → v4 (read from `docs/research/results.json`)"),
code("""import json
R = json.load(open(root / "docs/research/results.json")) if (root / "docs/research/results.json").exists() else {}
g = lambda *ks, d=None: (lambda v: v)(__import__("functools").reduce(lambda a, k: a.get(k, {}) if isinstance(a, dict) else {}, ks, R) or d)
v1 = g("v1", "RandomForest", "reported_accuracy"); v1x = g("v1", "GaussianNB", "exact_match_accuracy")
v2 = g("models", "RandomForest (v2 deployed)", "accuracy_mean"); v2l = max([v.get("accuracy", 0) for k, v in g("loso", d={}).items() if "closed" in k] or [0])
v3 = g("v3", "leave_states_out", "ExtraTrees: climate + season + lat/lon", "hit1_mean"); v3b = g("v3", "leave_states_out", "baseline: season popularity", "hit1_mean")
n4 = g("final", "numbers", d=None) or g("v4", "numbers", d={})
print(f"v1  Kaggle table, 2,200 rows, random 80/20  -> RF accuracy {100*(v1 or 0):.1f}%.  Weakness: near-synthetic data, no location/year; "
      f"its multi-output decoder hides errors (exact-match GNB {100*(v1x or 0):.1f}%).")
print(f"v2  67,200 merged rows, 74 crops, random 5-fold -> RF accuracy {100*(v2 or 0):.1f}%.  Weakness: train on two sources, test on the third "
      f"-> at most {100*v2l:.1f}% (leave-one-source-out).")
print(f"v3  400,379 Govt APY rows, grouped splits -> unseen states hit@1 {100*(v3 or 0):.1f}% (ExtraTrees; season-popularity baseline {100*(v3b or 0):.1f}%; "
      "v3 hit@1 counts any of the top-3 yield crops).  Weakness: no uncertainty, classifier framing.")
print(f"v4  same Govt data, best-yield crop per district-season-year -> unseen states hit@1 {n4.get('OursHitLSO','?')}% vs best literature classifier "
      f"{n4.get('BaseHitLSO','?')}% and persistence {n4.get('PersHitLSO','?')}%; 90% conformal sets cover {n4.get('CovIIDLSO','?')}% with "
      f"{n4.get('SizeIIDLSO','?')} crops.  Remaining weakness: per-state coverage, single country (see paper).")"""),
md("""## 1. The literature's setting: Kaggle crop table, random 80/20 split
This reproduces the ~99% figures (2,200 rows, 100 per crop, no location or year)."""),
code("""from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.model_selection import train_test_split
k = pd.read_csv(root / "backend/data/Crop_recommendation.csv")
Xtr, Xte, ytr, yte = train_test_split(k.drop(columns="label"), k.label, test_size=0.2, stratify=k.label, random_state=0)
for name, m in [("Random Forest", RandomForestClassifier(300, random_state=0)), ("Gaussian NB", GaussianNB())]:
    print(f"{name:14s} accuracy on Kaggle random split: {100*(m.fit(Xtr, ytr).predict(Xte) == yte).mean():.2f}%")"""),
md("## 2. Real data: DES district-season-year crop statistics"),
code("""df = run.load()
crops = sorted(df.crop_slug.unique())
QX, Qy, Q = run.query_table(df, crops, hist=True)
print(f"(query, crop) rows : {len(df):,}")
print(f"queries            : {df.qid.nunique():,}  (district x season x year)")
print(f"crops / states     : {len(crops)} / {df.state.nunique()}   years {df.year.min()}-{df.year.max()}")
print("candidates per query:", df.groupby('qid').size().describe()[['mean','50%','max']].round(1).to_dict())
print("soil source share  :", df.soil_source.value_counts(normalize=True, dropna=False).round(3).to_dict())
df[['state','district','year','season','crop_slug','yield','yield_pct','temperature','rainfall','lag1_pct']].head(8)"""),
md("""## 3. The method (source shown for transparency)
`fit_rank` = YieldRank (LambdaMART on yield-percentile relevance); `conformal` = LAC / APS split-conformal sets."""),
code("""import inspect
print(inspect.getsource(run.fit_rank)); print(inspect.getsource(run.conformal))"""),
code("""MODELS = ["Persistence", "GaussianNB [6,12]", "RandomForest [8,21]", "XGBoost [11,22]", "MLP [13]", "YieldRank (ours)"]
rng = np.random.default_rng(run.SEED)
idx = lambda qs: df.index[df.qid.isin(qs)]

def evaluate(protocol):
    rows, perq, conf = [], [], []
    for f, (trq, teq, groups) in enumerate(run.folds(df, protocol)):
        a, b = next(run.GroupShuffleSplit(1, test_size=0.2, random_state=run.SEED + f).split(trq, groups=groups.loc[trq].values))
        grp_cal, rest = trq[b], trq[a]
        iid_cal = rng.choice(rest, size=len(grp_cal), replace=False)
        fit_i, te_i, gc_i, ic_i = idx(np.setdiff1d(rest, iid_cal)), idx(teq), idx(grp_cal), idx(iid_cal)
        for name in MODELS:
            score = run.MODELS[name](df, fit_i, crops, True, QX, Qy)
            s_te = score(te_i)
            pq = run.per_query(df.loc[te_i], s_te)
            s_gc, s_ic = score(gc_i), score(ic_i)
            T = run.fit_T(df.loc[ic_i, "qid"], s_ic, df.loc[ic_i, "best"].values)
            mk = lambda i, s: df.loc[i, ["qid", "best"]].assign(p=run.softmax_by_q(df.loc[i, "qid"], s, T))
            ci, per_i = run.conformal(mk(ic_i, s_ic), mk(te_i, s_te))
            cg, per_g = run.conformal(mk(gc_i, s_gc), mk(te_i, s_te))
            r = dict(fold=f, model=name.split(" [")[0], ndcg3=pq["ndcg@3"].mean(), hit1=100*pq["hit@1"].mean(), hit3=100*pq["hit@3"].mean(),
                     cov_iid=100*ci["LAC@0.9"]["coverage"], size_iid=ci["LAC@0.9"]["size"],
                     cov_heldout=100*cg["LAC@0.9"]["coverage"], size_heldout=cg["LAC@0.9"]["size"])
            rows.append(r)
            print(f"fold {f} | {r['model']:13s} | NDCG@3 {r['ndcg3']:.3f} | Hit@1 {r['hit1']:5.1f}% | Hit@3 {r['hit3']:5.1f}% | "
                  f"90% sets: iid-cal {r['cov_iid']:5.1f}% (size {r['size_iid']:.2f})  held-out-cal {r['cov_heldout']:5.1f}% (size {r['size_heldout']:.2f})", flush=True)
            perq.append(pq.assign(model=r["model"], fold=f).reset_index())
            conf.append(per_i.add_suffix("_iid").join(per_g.add_suffix("_grp")).assign(model=r["model"], fold=f,
                        state=lambda d: Q.state.reindex(d.index).values).reset_index(names="qid"))
    R = pd.DataFrame(rows)
    summ = R.groupby("model", sort=False)[["ndcg3", "hit1", "hit3", "cov_iid", "size_iid", "cov_heldout", "size_heldout"]].agg(["mean", "std"]).round(3)
    return R, summ, pd.concat(perq), pd.concat(conf)

def significance(P, base):
    o = P[P.model == "YieldRank (ours)"].set_index(["fold", "qid"])
    for b in base:
        x = P[P.model == b].set_index(["fold", "qid"]).reindex(o.index)
        for k in ["hit@1", "ndcg@3"]:
            d = (o[k] - x[k]).dropna()
            print(f"YieldRank vs {b:13s} {k:7s}: mean diff {d.mean():+.4f}   Wilcoxon p = {wilcoxon(d).pvalue:.2e}   (n = {len(d):,} test queries)")"""),
md("## 4. Random split (optimistic, for reference)"),
code("""R_rand, S_rand, P_rand, C_rand = evaluate("random")
S_rand"""),
md("## 5. Leave-states-out: train on some states, test on states never seen"),
code("""R_lso, S_lso, P_lso, C_lso = evaluate("leave-states-out")
S_lso"""),
code("""significance(P_lso, ["Persistence", "GaussianNB", "RandomForest", "XGBoost", "MLP"])"""),
md("""### Conformal coverage per held-out state (YieldRank, 90% target, LAC)
`cov_iid` = calibrated on random queries from training states; `cov_heldout` = calibrated on held-out training states."""),
code("""c = C_lso[C_lso.model == "YieldRank (ours)"]
per_state = (c.groupby("state").agg(test_queries=("qid", "size"), cov_iid=("cov_LAC_iid", "mean"), cov_heldout=("cov_LAC_grp", "mean"),
                                     avg_set_size=("size_LAC_grp", "mean")))
per_state[["cov_iid", "cov_heldout"]] *= 100
per_state = per_state[per_state.test_queries >= 30].sort_values("test_queries", ascending=False).round(2)
print(f"states below 85% coverage: iid-cal {(per_state.cov_iid < 85).sum()} / {len(per_state)},  held-out-cal {(per_state.cov_heldout < 85).sum()} / {len(per_state)}")
per_state"""),
md("## 6. Leave-years-out: train on some years, test on unseen year blocks"),
code("""R_lyo, S_lyo, P_lyo, C_lyo = evaluate("leave-years-out")
S_lyo"""),
code("""significance(P_lyo, ["Persistence", "GaussianNB", "RandomForest", "XGBoost", "MLP"])"""),
md("## 7. Summary: Hit@1 (%) and NDCG@3 by protocol"),
code("""summary = pd.concat({"random": S_rand, "leave-states-out": S_lso, "leave-years-out": S_lyo}, axis=0)
summary[[("hit1", "mean"), ("hit1", "std"), ("ndcg3", "mean"), ("cov_iid", "mean"), ("size_iid", "mean"), ("cov_heldout", "mean"), ("size_heldout", "mean")]]"""),
md("""## 8. Check: the paper's numbers, recomputed here
Each value below is computed from this notebook's own runs and compared with `docs/research/results.json` → `v4.numbers`, which is the same file the paper's `numbers.tex` comes from."""),
code("""import json
paper = json.load(open(root / "docs/research/results.json"))["v4"]["numbers"] if (root / "docs/research/results.json").exists() else {}
ours, ab = "YieldRank (ours)", {"random": "R", "leave-states-out": "LSO", "leave-years-out": "LYO"}
check = {}
for p, (S_, R_) in {"random": (S_rand, R_rand), "leave-states-out": (S_lso, R_lso), "leave-years-out": (S_lyo, R_lyo)}.items():
    m = R_.groupby("model").mean(numeric_only=True)
    base = m.drop(index=["YieldRank (ours)", "Persistence"]).hit1.idxmax()
    check |= {f"OursHit{ab[p]}": f"{m.loc[ours, 'hit1']:.1f}", f"OursNDCG{ab[p]}": f"{m.loc[ours, 'ndcg3']:.3f}",
              f"PersHit{ab[p]}": f"{m.loc['Persistence', 'hit1']:.1f}", f"BaseHit{ab[p]}": f"{m.loc[base, 'hit1']:.1f}", f"BaseName{ab[p]}": base.replace("RandomForest", "Random Forest").replace("GaussianNB", "Gaussian NB"),
              f"CovIID{ab[p]}": f"{m.loc[ours, 'cov_iid']:.1f}", f"SizeIID{ab[p]}": f"{m.loc[ours, 'size_iid']:.2f}",
              f"CovGRP{ab[p]}": f"{m.loc[ours, 'cov_heldout']:.1f}", f"SizeGRP{ab[p]}": f"{m.loc[ours, 'size_heldout']:.2f}"}
for k, v in check.items():
    print(f"{k:14s} notebook {v:>14s}   paper {paper.get(k, '?'):>14s}   {'OK' if paper.get(k) == v else 'DIFF'}")
print("all match:", all(paper.get(k) == v for k, v in check.items()))"""),
md("""## Reading the numbers
* The ~99% of Section 1 is a property of the Kaggle table, not of crop choice. On real data, **no** model's top-1 pick matches the best-yielding crop anywhere near that often.
* Compare each baseline's Hit@1 between the random and leave-states-out tables: the drop is the over-optimism of random splits.
* *Persistence* (repeat last year's yield ranking) is a strong, rarely reported baseline. The gap between it and YieldRank is the honest size of the learned gain.
* Conformal coverage with i.i.d. calibration is a guarantee about *seen* states. Per-state coverage shows how it behaves on unseen ones.

The paper (`paper/main.pdf`) reports the same experiment from `experiments/run.py`."""),
]
nb = nbf.v4.new_notebook(cells=cells, metadata={"kernelspec": {"name": "python3", "display_name": "Python 3"}, "colab": {"provenance": []}})
NB.parent.mkdir(exist_ok=True)
nbf.write(nb, NB)
print("wrote", NB)
