"""Build notebooks/AgroMind_Method_Comparison.ipynb (execute with nbconvert)."""
from pathlib import Path
import nbformat as nbf

REPO = "ravixalgorithm/agromind"
NB = Path(__file__).resolve().parents[1] / "notebooks/AgroMind_Method_Comparison.ipynb"
md, code = nbf.v4.new_markdown_cell, nbf.v4.new_code_cell
cells = [
md(f"""# AgroMind: every method on the same data, and why we chose YieldRank

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/{REPO}/blob/main/notebooks/AgroMind_Method_Comparison.ipynb)

Every method below is trained and tested on **the same 43,443 district-season-year queries, the same 5 folds and the same calibration sets**
(DES APY 1997-98 to 2022-23 + NASA POWER + SoilGrids). The methods are:
* classic baselines (crop prior, last-year persistence, Gaussian NB, Random Forest, XGBoost, MLP);
* **reimplementations of six recent papers** with their published hyper-parameters: Dey 2024, Afzal 2025, Gunasekaran 2025, Ahmed 2025, Mahesh 2026 and Abu Bakr 2025 (fidelity note per method);
* ranking variants on the same (district-season, crop) pairs, and **YieldRank v4 (final)**;
* ablations of YieldRank.

Splits: random 5-fold, **unseen states** (leave-states-out, grouped by `state_group`) and **unseen years** (5 year blocks).
Hit@1 = the top-ranked crop is the one that yielded best. The full runs come from `experiments/compare.py` (about 2 CPU-hours) and are loaded here.
Section 5 re-trains one unseen-state fold live to show the saved numbers reproduce."""),
code(f"""import os, sys, json, subprocess, urllib.request
from pathlib import Path
RAW = "https://raw.githubusercontent.com/{REPO}/main/"
root = next((p for p in [Path.cwd(), Path.cwd().parent] if (p / "experiments/run.py").exists()), None)
if root is None:  # Colab
    subprocess.run([sys.executable, "-m", "pip", "-q", "install", "lightgbm", "xgboost", "catboost", "pyarrow"], check=True)
    root = Path("agromind")
    files = ["experiments/run.py", "experiments/compare.py", "experiments/crossconf.py", "backend/data/large/agromind_india_large.parquet",
             "docs/research/results.json"] + [f"experiments/results/compare_{{p}}_{{t}}.json" for p in ("random", "leave-states-out", "leave-years-out") for t in ("light", "heavyA", "heavyB")]
    for f in files:
        (root / f).parent.mkdir(parents=True, exist_ok=True)
        if not (root / f).exists():
            urllib.request.urlretrieve(RAW + f, root / f)
sys.path.insert(0, str(root / "experiments"))
import numpy as np, pandas as pd
pd.set_option("display.width", 220); pd.set_option("display.max_rows", 80); pd.set_option("display.max_colwidth", 60)
SPLITS = ["random", "leave-states-out", "leave-years-out"]
F = pd.DataFrame([r | {{"split": p}} for p in SPLITS for t in ("light", "heavyA", "heavyB")
                  for r in json.load(open(root / f"experiments/results/compare_{{p}}_{{t}}.json"))
                  if (root / f"experiments/results/compare_{{p}}_{{t}}.json").exists()])
print(f"{{F.method.nunique()}} methods x {{F.split.nunique()}} splits x {{F.fold.nunique()}} folds = {{len(F)}} trained models")"""),
md("## 1. Raw per-fold results (every number is one trained model on one test fold)"),
code("""for p in SPLITS:
    print(f"\\n==== {p} ====")
    for _, r in F[F.split == p].sort_values(["method", "fold"]).iterrows():
        print(f"fold {r.fold} | {r.method:44s} | Hit@1 {r.hit1:5.1f}% | Hit@3 {r.hit3:5.1f}% | NDCG@3 {r.ndcg3:.3f} | cold Hit@1 {r.hit1_cold:5.1f}% "
              f"| 90% set {r.conf_cov:5.1f}% / {r.conf_size:.2f} crops | train {r.train_s:6.1f}s")"""),
md("## 2. Summary table (mean over 5 folds), sorted by Hit@1 on unseen states"),
code("""S = F.pivot_table(index="method", columns="split", values="hit1", aggfunc="mean")[SPLITS].round(1)
S.columns = [f"Hit@1 {c}" for c in S.columns]
lso = F[F.split == "leave-states-out"].groupby("method")
S["NDCG@3 states"] = lso.ndcg3.mean().round(3); S["cold Hit@1 states"] = lso.hit1_cold.mean().round(1)
S["90% cov/size states"] = (lso.conf_cov.mean().round(1).astype(str) + " / " + lso.conf_size.mean().round(2).astype(str))
S["train s"] = F.groupby("method").train_s.mean().round(1); S["infer ms/q"] = F.groupby("method").infer_ms.mean().round(3)
meta = F.drop_duplicates("method").set_index("method")
S["source"] = meta.source; S["family"] = meta.family
S.sort_values("Hit@1 leave-states-out", ascending=False)"""),
md("## 3. Is YieldRank significantly better? (paired Wilcoxon over test queries, all 5 folds)"),
code("""R = json.load(open(root / "docs/research/results.json")).get("method_comparison")
if R:
    for m in R["methods"]:
        if m["p_vs_ours"]:
            print(f"{m['name']:44s} " + "  ".join(f"{s}: {m['hit1'][s]:5.1f}% (p={m['p_vs_ours'][s]:.1e})" for s in R["splits"]))
else:
    print("results.json has no method_comparison yet (run experiments/report.py)")"""),
md("## 4. Ablation: what each part of YieldRank buys on unseen states, and why we chose it"),
code("""if R:
    for a in R["ablation"]:
        c = a["conformal"]
        print(f"- {a['removed']:30s} -> Hit@1 {a['hit1']['leave-states-out']:5.1f}%  NDCG@3 {a['ndcg3']['leave-states-out']:.3f}  "
              f"90% set {c['cov']}% / {c['size']} crops   ({a['note']})")
    print("\\nWhy YieldRank:")
    for w in R["why"]:
        print(" *", w)"""),
md("## 5. Live check: retrain unseen-states fold 0 for three methods and compare with the saved numbers"),
code("""import run, compare
df = run.load(); crops = sorted(df.crop_slug.unique()); QX, Qy, Q = run.query_table(df, crops, True)
from sklearn.model_selection import GroupShuffleSplit
rng = np.random.default_rng(run.SEED); idx = lambda qs: df.index[df.qid.isin(qs)]
for protocol in SPLITS:  # replay run.py's random-number use so the calibration sets match exactly
    for f, (trq, teq, groups) in enumerate(run.folds(df, protocol)):
        a, b = next(GroupShuffleSplit(1, test_size=0.2, random_state=run.SEED + f).split(trq, groups=groups.loc[trq].values))
        iid = rng.choice(trq[a], size=len(trq[b]), replace=False)
        if protocol == "leave-states-out" and f == 0:
            fit_i, te_i = idx(np.setdiff1d(trq[a], iid)), idx(teq)
for name in ["Persistence", "XGBoost (Dey 2024)", "YieldRank (ours)"]:
    score = compare.METHODS[name][-1](df, fit_i, crops, QX, Qy)
    live = 100 * run.per_query(df.loc[te_i], score(te_i))["hit@1"].mean()
    saved = F[(F.split == "leave-states-out") & (F.fold == 0) & (F.method == name)].hit1.iloc[0]
    print(f"{name:24s} live Hit@1 {live:5.1f}%   saved {saved:5.1f}%   {'OK' if abs(live - saved) < 0.15 else 'DIFF'}")"""),
]
nb = nbf.v4.new_notebook(cells=cells, metadata={"kernelspec": {"name": "python3", "display_name": "Python 3"}, "colab": {"provenance": []}})
nbf.write(nb, NB)
print("wrote", NB)
