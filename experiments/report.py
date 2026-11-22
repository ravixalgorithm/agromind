"""Turn results/metrics_<tag>.json into paper tables/figures + results/summary.json.
Numbers in the paper come only from here, never typed by hand.

    .venv/bin/python report.py [tag]      # default tag: main
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent
RES, PAPER = ROOT / "results", ROOT.parent / "paper"
TAG = sys.argv[1] if len(sys.argv) > 1 else "main"
PROTO = {"random": "Random", "leave-states-out": "Leave-states-out", "leave-years-out": "Leave-years-out"}
OURS = "YieldRank (ours)"
TEX = {"GaussianNB [6,12]": r"Gaussian NB~\cite{pudumalar2017,elbasi2023}",
       "RandomForest [8,21]": r"Random Forest~\cite{kulkarni2018,breiman2001}",
       "XGBoost [11,22]": r"XGBoost~\cite{dey2024,chen2016}", "MLP [13]": r"MLP~\cite{musanase2023}",
       "Crop prior": "Crop prior (train mean)", "Persistence": "Persistence (last year)",
       "LGBM pointwise": "LightGBM pointwise (ablation)", OURS: r"\textbf{YieldRank (ours)}"}


def kaggle_reference():
    """The literature's setting: Kaggle crop set [31], random 80/20 split."""
    df = pd.read_csv(ROOT.parent / "backend/data/Crop_recommendation.csv")
    X, y = df.drop(columns="label"), df.label
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, stratify=y, random_state=0)
    return {n: float((m.fit(Xtr, ytr).predict(Xte) == yte).mean())
            for n, m in [("RandomForest", RandomForestClassifier(300, random_state=0)), ("GaussianNB", GaussianNB())]}


def fp(p):
    """p-value as LaTeX math relation, e.g. '=3.1\\times10^{-5}' or '<10^{-300}'."""
    if p == 0:
        return "<10^{-300}"
    m, e = f"{p:.1e}".split("e")
    return f"={m}\\times10^{{{int(e)}}}"


def pm(rec, k, pct=False):
    f = 100 if pct else 1
    m, s = rec["mean"][k] * f, rec["std"][k] * f
    return f"{m:.1f}$\\pm${s:.1f}" if pct else f"{m:.3f}$\\pm${s:.3f}"


def star(rec, k):
    w = rec.get(f"wilcoxon_vs_ours_{k}")
    return "" if w is None or w["p"] >= 0.05 else ("$^{*}$" if w["p"] >= 0.001 else "$^{**}$")


def conf_mean(rec, cal, key, field):
    return float(np.mean([f[cal][key][field] for f in rec["folds"]]))


def main():
    M = json.load(open(RES / f"metrics_{TAG}.json"))
    meta, met = M["meta"], M["metrics"]
    models = list(next(iter(met.values())).keys())
    (PAPER / "tables").mkdir(parents=True, exist_ok=True)
    (PAPER / "figures").mkdir(parents=True, exist_ok=True)

    # ---- Table: ranking results
    rows = []
    for m in models:
        cells = []
        for p in PROTO:
            r = met[p][m]
            cells += [pm(r, "ndcg@3") + star(r, "ndcg@3"), pm(r, "hit@1", True) + star(r, "hit@1"), pm(r, "hit@3", True)]
        rows.append(TEX.get(m, m) + " & " + " & ".join(cells) + r" \\")
        if m == "MLP [13]":
            rows.append(r"\midrule")
    head = " & ".join(rf"\multicolumn{{3}}{{c}}{{{v}}}" for v in PROTO.values())
    (PAPER / "tables/ranking.tex").write_text("\n".join([
        r"\begin{tabular}{l" + "ccc" * 3 + "}", r"\toprule",
        "Model & " + head + r" \\", r"\cmidrule(lr){2-4}\cmidrule(lr){5-7}\cmidrule(lr){8-10}",
        " & " + " & ".join(["NDCG@3", "Hit@1 (\\%)", "Hit@3 (\\%)"] * 3) + r" \\", r"\midrule", *rows,
        r"\bottomrule", r"\end{tabular}"]) + "\n")

    # ---- Table: conformal coverage / size at 90%
    out = []
    for p in PROTO:
        out.append(rf"\multicolumn{{9}}{{l}}{{\emph{{{PROTO[p]}}}}} \\")
        for m in [m for m in models if m in ("RandomForest [8,21]", "XGBoost [11,22]", "Persistence", OURS)]:
            c = [f"{100*conf_mean(met[p][m], cal, meth+'@0.9', 'coverage'):.1f} & {conf_mean(met[p][m], cal, meth+'@0.9', 'size'):.2f}"
                 for cal in ("conformal_iid_cal", "conformal_group_cal") for meth in ("LAC", "APS")]
            out.append(TEX.get(m, m) + " & " + " & ".join(c) + r" \\")
    (PAPER / "tables/conformal.tex").write_text("\n".join([
        r"\begin{tabular}{lcccccccc}", r"\toprule",
        r" & \multicolumn{4}{c}{i.i.d.\ calibration} & \multicolumn{4}{c}{held-out-group calibration} \\",
        r"\cmidrule(lr){2-5}\cmidrule(lr){6-9}",
        r"Model & \multicolumn{2}{c}{LAC} & \multicolumn{2}{c}{APS} & \multicolumn{2}{c}{LAC} & \multicolumn{2}{c}{APS} \\",
        r" & Cov.\% & Size & Cov.\% & Size & Cov.\% & Size & Cov.\% & Size \\", r"\midrule", *out,
        r"\bottomrule", r"\end{tabular}"]) + "\n")

    # ---- Figure: Hit@1 by protocol
    show = [m for m in models if m not in ("LGBM pointwise",)]
    fig, ax = plt.subplots(figsize=(3.5, 2.3))
    w = 0.8 / len(show)
    cmap = plt.get_cmap("tab10")
    for j, m in enumerate(show):
        mu = [100 * met[p][m]["mean"]["hit@1"] for p in PROTO]
        sd = [100 * met[p][m]["std"]["hit@1"] for p in PROTO]
        ax.bar(np.arange(3) + (j - len(show) / 2 + 0.5) * w, mu, w, yerr=sd, capsize=1.5,
               label=m.split(" [")[0], color="#2e7d32" if m == OURS else cmap(j), edgecolor="black" if m == OURS else "none", lw=0.6)
    ax.set_xticks(range(3), [v.replace("Leave-", "Leave-\n") for v in PROTO.values()], fontsize=7)
    ax.set_ylabel("Hit@1 (%)", fontsize=7)
    ax.tick_params(labelsize=7)
    ax.legend(fontsize=5, ncol=3, loc="upper center", bbox_to_anchor=(0.5, 1.32), frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(PAPER / "figures/hit1_protocols.pdf")

    # ---- Figure + table: per-held-out-state coverage (LSO, ours, LAC 90%)
    C = pd.read_parquet(RES / f"conformal_query_{TAG}.parquet")
    cs = C[(C.protocol == "leave-states-out") & (C.model == OURS)]
    st = cs.groupby("state").agg(n=("qid", "size"), iid=("cov_LAC_iid", "mean"), grp=("cov_LAC_grp", "mean"),
                                 size_iid=("size_LAC_iid", "mean"), size_grp=("size_LAC_grp", "mean"))
    st = st[st.n >= 30].sort_values("n", ascending=False)
    st.to_csv(RES / f"coverage_by_state_{TAG}.csv")
    fig, ax = plt.subplots(figsize=(3.5, 2.2))
    x = np.arange(len(st))
    ax.scatter(x, 100 * st.iid, s=10, label="i.i.d. calibration", color="#c62828")
    ax.scatter(x, 100 * st.grp, s=10, label="held-out-state calibration", color="#2e7d32", marker="s")
    ax.axhline(90, color="grey", ls="--", lw=0.8)
    ax.set_xticks(x, [s[:10] for s in st.index], rotation=90, fontsize=5)
    ax.set_ylabel("Coverage (%)", fontsize=7)
    ax.tick_params(axis="y", labelsize=7)
    ax.legend(fontsize=6, frameon=False, loc="lower left")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(PAPER / "figures/coverage_states.pdf")

    # ---- headline numbers
    kag = kaggle_reference()
    best_base = {p: max((m for m in models if "[" in m), key=lambda m: met[p][m]["mean"]["hit@1"]) for p in PROTO}
    S = {"meta": meta, "kaggle_random_split_accuracy": kag, "best_literature_baseline": best_base,
         "states_below_85pct_cov": {"iid": int((st.iid < 0.85).sum()), "grp": int((st.grp < 0.85).sum()), "of": int(len(st))}}
    for p in PROTO:
        o, b = met[p][OURS], met[p][best_base[p]]
        S[p] = {"ours": o["mean"], "ours_std": o["std"], "best_baseline": b["mean"], "persistence": met[p].get("Persistence", {}).get("mean"),
                "wilcoxon_vs_best": {k: b.get(f"wilcoxon_vs_ours_{k}") for k in ("ndcg@3", "hit@1")},
                "conformal": {cal: {k: {f: conf_mean(o, cal, k, f) for f in ("coverage", "size", "frac", "singleton")}
                                    for k in ("LAC@0.9", "APS@0.9", "LAC@0.8", "APS@0.8")}
                              for cal in ("conformal_iid_cal", "conformal_group_cal")}}
    json.dump(S, open(RES / f"summary_{TAG}.json", "w"), indent=1, default=str)

    # ---- LaTeX macros so the prose never hand-copies a number
    raw = pd.read_parquet(ROOT.parent / "backend/data/large/agromind_india_large.parquet", columns=["state", "district"])
    mac = {"NRows": f"{meta['rows']:,}", "NQueries": f"{meta['queries']:,}", "NCrops": meta["crops"], "NStates": meta["states"],
           "NDistricts": f"{raw.drop_duplicates().shape[0]:,}", "YearA": meta["years"][0], "YearB": meta["years"][1],
           "KaggleRF": f"{100*kag['RandomForest']:.1f}", "KaggleNB": f"{100*kag['GaussianNB']:.1f}",
           "StatesN": len(st), "StatesBelowIID": S["states_below_85pct_cov"]["iid"], "StatesBelowGRP": S["states_below_85pct_cov"]["grp"]}
    for p, ab in zip(PROTO, ("R", "LSO", "LYO")):
        o, b, pe = S[p]["ours"], S[p]["best_baseline"], S[p]["persistence"] or {}
        w = S[p]["wilcoxon_vs_best"]
        c = S[p]["conformal"]
        mac |= {f"OursNDCG{ab}": f"{o['ndcg@3']:.3f}", f"OursHit{ab}": f"{100*o['hit@1']:.1f}", f"OursHitThree{ab}": f"{100*o['hit@3']:.1f}",
                f"BaseNDCG{ab}": f"{b['ndcg@3']:.3f}", f"BaseHit{ab}": f"{100*b['hit@1']:.1f}", f"BaseHitThree{ab}": f"{100*b['hit@3']:.1f}",
                f"BaseName{ab}": best_base[p].split(" [")[0],
                f"GainHit{ab}": f"{100*(o['hit@1']-b['hit@1']):.1f}", f"GainNDCG{ab}": f"{o['ndcg@3']-b['ndcg@3']:.3f}",
                f"PersNDCG{ab}": f"{pe.get('ndcg@3', float('nan')):.3f}", f"PersHit{ab}": f"{100*pe.get('hit@1', float('nan')):.1f}",
                f"PHit{ab}": fp(w['hit@1']['p']) if w['hit@1'] else "--", f"NPaired{ab}": f"{w['hit@1']['n']:,}" if w['hit@1'] else "--",
                f"CovIID{ab}": f"{100*c['conformal_iid_cal']['LAC@0.9']['coverage']:.1f}", f"CovGRP{ab}": f"{100*c['conformal_group_cal']['LAC@0.9']['coverage']:.1f}",
                f"SizeIID{ab}": f"{c['conformal_iid_cal']['LAC@0.9']['size']:.2f}", f"SizeGRP{ab}": f"{c['conformal_group_cal']['LAC@0.9']['size']:.2f}",
                f"APSCovGRP{ab}": f"{100*c['conformal_group_cal']['APS@0.9']['coverage']:.1f}", f"APSSizeGRP{ab}": f"{c['conformal_group_cal']['APS@0.9']['size']:.2f}"}
    # cold start: test queries where some candidate has no last-year record in that district
    import run
    d = run.load()
    cold = d.groupby("qid").lag1_pct.apply(lambda x: x.isna().any())
    P = pd.read_parquet(RES / f"per_query_{TAG}.parquet")
    P["cold"] = P.qid.map(cold)
    for p, ab in zip(PROTO, ("R", "LSO", "LYO")):
        pp = P[P.protocol == p]
        h = pp.groupby(["model", "cold"])["hit@1"].mean().unstack()
        mac |= {f"ColdShare{ab}": f"{100*pp[pp.model == OURS].cold.mean():.1f}",
                f"OursHitCold{ab}": f"{100*h.loc[OURS, True]:.1f}", f"OursHitWarm{ab}": f"{100*h.loc[OURS, False]:.1f}",
                f"BaseHitCold{ab}": f"{100*h.loc[best_base[p], True]:.1f}"}
        if "Persistence" in h.index:
            o = pp[pp.model == OURS].set_index(["fold", "qid"])
            pe_ = pp[pp.model == "Persistence"].set_index(["fold", "qid"]).reindex(o.index)
            from scipy.stats import wilcoxon
            for flag, nm in ((True, "Cold"), (False, "Warm")):
                dd = (o["hit@1"] - pe_["hit@1"])[o.cold == flag]
                mac[f"PersP{nm}{ab}"] = fp(wilcoxon(dd).pvalue)
            mac[f"PersP{ab}"] = fp(met[p]["Persistence"]["wilcoxon_vs_ours_hit@1"]["p"])
            mac |= {f"PersHitCold{ab}": f"{100*h.loc['Persistence', True]:.1f}", f"PersHitWarm{ab}": f"{100*h.loc['Persistence', False]:.1f}"}
        S[p]["hit1_cold_warm"] = h.to_dict()
    rf = met["leave-states-out"]["RandomForest [8,21]"]["folds"]
    for cal, ab in (("conformal_iid_cal", "IID"), ("conformal_group_cal", "GRP")):
        v = [100 * f[cal]["LAC@0.9"]["coverage"] for f in rf]
        mac |= {f"RFCov{ab}Mean": f"{np.mean(v):.1f}", f"RFCov{ab}Min": f"{min(v):.1f}", f"RFCov{ab}Max": f"{max(v):.1f}"}
    pw = met["leave-states-out"]["LGBM pointwise"]
    mac |= {"PointHitLSO": f"{100*pw['mean']['hit@1']:.1f}", "PointNDCGLSO": f"{pw['mean']['ndcg@3']:.3f}",
            "PointPLSO": fp(pw['wilcoxon_vs_ours_hit@1']['p']),
            "WorstState": st.iid.idxmin(), "WorstIID": f"{100*st.iid.min():.1f}", "WorstGRP": f"{100*st.grp.loc[st.iid.idxmin()]:.1f}",
            "MedianStateCovIID": f"{100*st.iid.median():.1f}"}
    for p, ab in zip(PROTO, ("R", "LSO", "LYO")):
        for m, k in (("RandomForest [8,21]", "RF"), ("MLP [13]", "MLP"), ("GaussianNB [6,12]", "NB"), ("XGBoost [11,22]", "XGB")):
            mac[f"{k}Hit{ab}"] = f"{100*met[p][m]['mean']['hit@1']:.1f}"
    for p, ab in zip(PROTO, ("R", "LSO", "LYO")):
        mac[f"PriorHit{ab}"] = f"{100*met[p]['Crop prior']['mean']['hit@1']:.1f}"
    clf = [m for m in models if "[" in m]
    mac["ClfDropMax"] = f"{max(100*(met['random'][m]['mean']['hit@1'] - met['leave-states-out'][m]['mean']['hit@1']) for m in clf):.1f}"
    mac["OursDrop"] = f"{100*(met['random'][OURS]['mean']['hit@1'] - met['leave-states-out'][OURS]['mean']['hit@1']):.1f}"
    nh = RES / "metrics_nohist.json"
    if nh.exists():
        N = json.load(open(nh))["metrics"]
        for p, ab in zip(PROTO, ("R", "LSO", "LYO")):
            bb = max((m for m in N[p] if "[" in m), key=lambda m: N[p][m]["mean"]["hit@1"])
            mac |= {f"NHOursHit{ab}": f"{100*N[p][OURS]['mean']['hit@1']:.1f}", f"NHOursNDCG{ab}": f"{N[p][OURS]['mean']['ndcg@3']:.3f}",
                    f"NHBaseHit{ab}": f"{100*N[p][bb]['mean']['hit@1']:.1f}", f"NHBaseNDCG{ab}": f"{N[p][bb]['mean']['ndcg@3']:.3f}",
                    f"NHBaseName{ab}": bb.split(" [")[0], f"NHCovIID{ab}": f"{100*conf_mean(N[p][OURS], 'conformal_iid_cal', 'LAC@0.9', 'coverage'):.1f}"}
    cc = RES / "crossconf_main.json"
    if cc.exists():
        X = json.load(open(cc))
        for p, ab in zip(PROTO, ("R", "LSO", "LYO")):
            for meth in ("LAC", "APS"):
                mac[f"CC{meth}Cov{ab}"] = f"{100*np.mean([f['conformal_crossgroup'][meth+'@0.9']['coverage'] for f in X[p]]):.1f}"
                mac[f"CC{meth}Size{ab}"] = f"{np.mean([f['conformal_crossgroup'][meth+'@0.9']['size'] for f in X[p]]):.2f}"
            mac[f"CCHit{ab}"] = f"{100*np.mean([f['hit@1'] for f in X[p]]):.1f}"
            for mk_, nm in (("mondrian_ncand", "MN"), ("mondrian_region", "MR")):
                mac[f"CC{nm}Cov{ab}"] = f"{100*np.mean([f[mk_]['coverage'] for f in X[p]]):.1f}"
                mac[f"CC{nm}Size{ab}"] = f"{np.mean([f[mk_]['size'] for f in X[p]]):.2f}"
        Cq = pd.read_parquet(RES / "crossconf_query_main.parquet")
        lso = Cq[Cq.protocol == "leave-states-out"]
        cst = lso.groupby("state")[["cov_LAC", "cov_Mncand", "cov_Mregion", "size_LAC", "size_Mncand"]].mean()
        cst["n"] = lso.groupby("state").size()
        cst = cst[cst.n >= 30]
        for col, nm in (("cov_LAC", "CC"), ("cov_Mncand", "MN"), ("cov_Mregion", "MR")):
            mac |= {f"{nm}StatesBelow": int((cst[col] < 0.85).sum()), f"{nm}WorstCov": f"{100*cst[col].min():.1f}",
                    f"{nm}WorstState": cst[col].idxmin(), f"{nm}TelanganaCov": f"{100*cst[col].get('Telangana', float('nan')):.1f}"}
        cst.to_csv(RES / "crossconf_coverage_by_state_main.csv")
        cs_ = S["leave-states-out"]["conformal"]
        rows_ = [("LAC, i.i.d.\\ calibration", 100 * cs_["conformal_iid_cal"]["LAC@0.9"]["coverage"], cs_["conformal_iid_cal"]["LAC@0.9"]["size"], (st.iid < .85).sum(), 100 * st.iid.min()),
                 ("LAC, 20\\% held-out states", 100 * cs_["conformal_group_cal"]["LAC@0.9"]["coverage"], cs_["conformal_group_cal"]["LAC@0.9"]["size"], (st.grp < .85).sum(), 100 * st.grp.min()),
                 ("LAC, cross-group (all states)", float(mac["CCLACCovLSO"]), float(mac["CCLACSizeLSO"]), mac["CCStatesBelow"], float(mac["CCWorstCov"])),
                 ("Mondrian by \\#candidates", float(mac["CCMNCovLSO"]), float(mac["CCMNSizeLSO"]), mac["MNStatesBelow"], float(mac["MNWorstCov"])),
                 ("Mondrian by region", float(mac["CCMRCovLSO"]), float(mac["CCMRSizeLSO"]), mac["MRStatesBelow"], float(mac["MRWorstCov"]))]
        (PAPER / "tables/conformal_lso.tex").write_text("\n".join([r"\begin{tabular}{lcccc}", r"\toprule",
            r"Calibration & Cov.\% & Size & States $<$85\% & Worst state \\", r"\midrule",
            *[f"{a} & {b:.1f} & {c:.2f} & {d}/{len(cst)} & {e:.1f} \\\\" for a, b, c, d, e in rows_], r"\bottomrule", r"\end{tabular}"]) + "\n")
    json.dump(S, open(RES / f"summary_{TAG}.json", "w"), indent=1, default=str)
    (PAPER / "tables/numbers.tex").write_text("% generated by experiments/report.py -- do not edit\n" +
        "".join(f"\\newcommand{{\\{k}}}{{{v}}}\n" for k, v in mac.items()))
    print(json.dumps(S, indent=1, default=str)[:6000])


if __name__ == "__main__":
    main()
