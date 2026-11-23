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


NICE = {"GaussianNB [6,12]": "Gaussian NB", "RandomForest [8,21]": "Random Forest", "XGBoost [11,22]": "XGBoost", "MLP [13]": "MLP"}


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
    ABBR = {"Uttar Pradesh": "UP", "Madhya Pradesh": "MP", "Andhra Pradesh": "AP", "Himachal Pradesh": "HP", "Arunachal Pradesh": "Arunachal",
            "West Bengal": "W Bengal", "Tamil Nadu": "TN", "Jammu and Kashmir": "J&K", "Dadra and Nagar Haveli": "DNH",
            "Andaman and Nicobar Islands": "A&N Islands", "Chhattisgarh": "Chhattisgarh", "Uttarakhand": "Uttarakhand"}
    ax.set_xticks(x, [ABBR.get(s, s) for s in st.index], rotation=90, fontsize=5)
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
                f"BaseName{ab}": NICE[best_base[p]],
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
    nc = d.groupby("qid").size()
    qs = d.groupby("qid")[["state", "year"]].first()
    ws = st.iid.idxmin()  # worst-covered state under leave-states-out
    mac |= {"MedianCand": f"{nc.median():.0f}", "MaxCand": f"{nc.max()}", "MeanCand": f"{nc.mean():.1f}",
            "WorstFirstYear": f"{qs[qs.state == ws].year.min()}", "WorstCand": f"{nc[qs.state == ws].mean():.1f}"}
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
    for m, k in (("RandomForest [8,21]", "RF"), ("XGBoost [11,22]", "XGB")):
        mac[f"{k}SizeGRPLSO"] = f"{conf_mean(met['leave-states-out'][m], 'conformal_group_cal', 'LAC@0.9', 'size'):.2f}"
    for p_, ab in zip(PROTO, ("R", "LSO", "LYO")):
        for m, k in (("LGBM pointwise", "Point"), ("LambdaMART (v4 listwise)", "List")):
            if m in met[p_]:
                mac[f"{k}Hit{ab}"] = f"{100*met[p_][m]['mean']['hit@1']:.1f}"
                mac[f"{k}P{ab}"] = fp(met[p_][m]["wilcoxon_vs_ours_hit@1"]["p"])
    pw = met["leave-states-out"]["LGBM pointwise"]
    mac |= {"PointHitLSO": f"{100*pw['mean']['hit@1']:.1f}", "PointNDCGLSO": f"{pw['mean']['ndcg@3']:.3f}",
            "PointPLSO": fp(pw['wilcoxon_vs_ours_hit@1']['p']),
            "WorstState": st.iid.idxmin(), "WorstIID": f"{100*st.iid.min():.1f}", "WorstGRP": f"{100*st.grp.loc[st.iid.idxmin()]:.1f}",
            "MedianStateCovIID": f"{100*st.iid.median():.1f}"}
    for p, ab in zip(PROTO, ("R", "LSO", "LYO")):
        for m, k in (("RandomForest [8,21]", "RF"), ("MLP [13]", "MLP"), ("GaussianNB [6,12]", "NB"), ("XGBoost [11,22]", "XGB")):
            mac[f"{k}Hit{ab}"] = f"{100*met[p][m]['mean']['hit@1']:.1f}"
    sc = meta["soil_coverage"]
    tot = sum(sc.values())
    mac["SoilOwnPct"] = f"{100*sc.get('soilgrids_centroid', 0)/tot:.1f}"
    mac["SoilMedPct"] = f"{100*sc.get('state_median', 0)/tot:.1f}"
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
                    f"NHBaseName{ab}": NICE[bb], f"NHCovIID{ab}": f"{100*conf_mean(N[p][OURS], 'conformal_iid_cal', 'LAC@0.9', 'coverage'):.1f}"}
    ns = RES / "metrics_nosoil.json"
    if ns.exists():
        N = json.load(open(ns))["metrics"]
        for p, ab in zip(PROTO, ("R", "LSO", "LYO")):
            for m, k in (("RandomForest [8,21]", "RF"), ("XGBoost [11,22]", "XGB"), (OURS, "Ours")):
                mac[f"NS{k}Hit{ab}"] = f"{100*N[p][m]['mean']['hit@1']:.1f}"
    if nh.exists():
        N = json.load(open(nh))["metrics"]
        mac["NHRFHitR"], mac["NHRFHitLSO"] = (f"{100*N[p]['RandomForest [8,21]']['mean']['hit@1']:.1f}" for p in ("random", "leave-states-out"))
        mac["NHPriorHitLSO"] = f"{100*N['leave-states-out']['Crop prior']['mean']['hit@1']:.1f}"
    cc = RES / "crossconf_main.json"
    if cc.exists():
        X = json.load(open(cc))
        for p, ab in zip(PROTO, ("R", "LSO", "LYO")):
            for meth in ("LAC", "APS"):
                mac[f"CC{meth}Cov{ab}"] = f"{100*np.mean([f['conformal_crossgroup'][meth+'@0.9']['coverage'] for f in X[p]]):.1f}"
                mac[f"CC{meth}Size{ab}"] = f"{np.mean([f['conformal_crossgroup'][meth+'@0.9']['size'] for f in X[p]]):.2f}"
            mac[f"CCHit{ab}"] = f"{100*np.mean([f['hit@1'] for f in X[p]]):.1f}"
            for mk_, nm in (("mondrian_ncand", "MN"), ("mondrian_region", "MR"), ("state_robust", "SR")):
                mac[f"CC{nm}Cov{ab}"] = f"{100*np.mean([f[mk_]['coverage'] for f in X[p]]):.1f}"
                mac[f"CC{nm}Size{ab}"] = f"{np.mean([f[mk_]['size'] for f in X[p]]):.2f}"
        Cq = pd.read_parquet(RES / "crossconf_query_main.parquet")
        lso = Cq[Cq.protocol == "leave-states-out"]
        cst = lso.groupby("state")[["cov_LAC", "cov_Mncand", "cov_Mregion", "cov_SR", "size_LAC", "size_Mncand", "size_SR"]].mean()
        cst["n"] = lso.groupby("state").size()
        cst = cst[cst.n >= 30]
        for col, nm in (("cov_LAC", "CC"), ("cov_Mncand", "MN"), ("cov_Mregion", "MR"), ("cov_SR", "SR")):
            mac |= {f"{nm}StatesBelow": int((cst[col] < 0.85).sum()), f"{nm}WorstCov": f"{100*cst[col].min():.1f}",
                    f"{nm}MedianCov": f"{100*cst[col].median():.1f}", f"{nm}StatesBelowNinety": int((cst[col] < 0.9).sum()),
                    f"{nm}WorstState": cst[col].idxmin(), f"{nm}TelanganaCov": f"{100*cst[col].get('Telangana', float('nan')):.1f}"}
        mac["MNAtCCWorst"] = f"{100*cst.loc[cst.cov_LAC.idxmin(), 'cov_Mncand']:.1f}"
        cst.to_csv(RES / "crossconf_coverage_by_state_main.csv")
        cs_ = S["leave-states-out"]["conformal"]
        rows_ = [("LAC, i.i.d.\\ calibration", 100 * cs_["conformal_iid_cal"]["LAC@0.9"]["coverage"], cs_["conformal_iid_cal"]["LAC@0.9"]["size"], (st.iid < .85).sum(), 100 * st.iid.min()),
                 ("LAC, 20\\% held-out states", 100 * cs_["conformal_group_cal"]["LAC@0.9"]["coverage"], cs_["conformal_group_cal"]["LAC@0.9"]["size"], (st.grp < .85).sum(), 100 * st.grp.min()),
                 ("LAC, cross-group (all states)", float(mac["CCLACCovLSO"]), float(mac["CCLACSizeLSO"]), mac["CCStatesBelow"], float(mac["CCWorstCov"])),
                 ("Mondrian by \\#candidates", float(mac["CCMNCovLSO"]), float(mac["CCMNSizeLSO"]), mac["MNStatesBelow"], float(mac["MNWorstCov"])),
                 ("Mondrian by region", float(mac["CCMRCovLSO"]), float(mac["CCMRSizeLSO"]), mac["MRStatesBelow"], float(mac["MRWorstCov"])),
                 ("\\textbf{State-robust (final)}", float(mac["CCSRCovLSO"]), float(mac["CCSRSizeLSO"]), mac["SRStatesBelow"], float(mac["SRWorstCov"]))]
        (PAPER / "tables/conformal_lso.tex").write_text("\n".join([r"\begin{tabular}{lcccc}", r"\toprule",
            r"Calibration & Cov.\% & Size & States $<$85\% & Worst state \\", r"\midrule",
            *[f"{a} & {b:.1f} & {c:.2f} & {d}/{len(cst)} & {e:.1f} \\\\" for a, b, c, d, e in rows_], r"\bottomrule", r"\end{tabular}"]) + "\n")
    json.dump(S, open(RES / f"summary_{TAG}.json", "w"), indent=1, default=str)
    (PAPER / "tables/numbers.tex").write_text("% generated by experiments/report.py -- do not edit\n" +
        "".join(f"\\newcommand{{\\{k}}}{{{v}}}\n" for k, v in mac.items()))
    mc = method_comparison(mac)
    (PAPER / "tables/numbers.tex").write_text("% generated by experiments/report.py -- do not edit\n" +
        "".join(f"\\newcommand{{\\{k}}}{{{v}}}\n" for k, v in mac.items()))
    export_v4(mac, S, mc)
    print(json.dumps(S, indent=1, default=str)[:6000])


def export_v4(mac, S, mc=None):
    """Write the canonical numbers into docs/research/results.json["v4"] (other keys untouched)."""
    path = ROOT.parent / "docs/research/results.json"
    R = json.loads(path.read_text())
    strip = lambda M: {p: {m: {"mean": r["mean"], "std": r["std"], **{k: v for k, v in r.items() if k.startswith("wilcoxon")}}
                           for m, r in ms.items()} for p, ms in M.items()}
    cs = pd.read_csv(RES / "crossconf_coverage_by_state_main.csv", index_col=0).round(4)
    R["v4"] = {
        "_doc": "CC5 novel method: yield-grounded crop ranking (YieldRank, LightGBM LambdaMART) + split-conformal sets on DES "
                "district x season x year data. Written by experiments/report.py. v4.numbers holds exactly the values of "
                "paper/tables/numbers.tex (same names, as printed in the paper); use them for any displayed figure. "
                "v4.conformal = YieldRank 90%/80% sets per protocol and calibration (fractions). Hit@1 = top-ranked crop is the best-yielding one.",
        "meta": S["meta"],
        "numbers": {k: str(v) for k, v in mac.items()},
        "conformal": {p: S[p]["conformal"] for p in PROTO},
        "kaggle_random_split_accuracy": S["kaggle_random_split_accuracy"],
        "metrics": {t: strip(json.load(open(RES / f"metrics_{t}.json"))["metrics"]) for t in ("main", "nohist", "nosoil")
                    if (RES / f"metrics_{t}.json").exists()},
        "crossconf": json.load(open(RES / "crossconf_main.json")),
        "coverage_by_state_leave_states_out": json.loads(cs.to_json(orient="index")),
    }
    n = {k: str(v) for k, v in mac.items()}
    H = lambda label, key, unit, split: dict(label=label, value=n.get(key, "--"), unit=unit, split=split)
    R["final"] = dict(
        version="v4", name="AgroMind v4 (final)", model="YieldRank v4 (final)",
        method="Blend, per district-season, of a listwise ranker (XGBoost rank:ndcg) and a pointwise yield-percentile regressor "
               "(LightGBM) on (district-season, crop) pairs, plus 0.25 x last-year persistence; chosen on held-out training "
               "states/years. Recommendations carry a 90% conformal set with a state-robust threshold.",
        headline=[H("Best crop ranked first, unseen states", "OursHitLSO", "%", "leave-states-out"),
                  H("Best literature classifier, unseen states", "BaseHitLSO", "%", "leave-states-out"),
                  H("Last-year persistence, unseen states", "PersHitLSO", "%", "leave-states-out"),
                  H("Best crop ranked first, unseen years", "OursHitLYO", "%", "leave-years-out"),
                  H("Best crop ranked first, random split", "OursHitR", "%", "random"),
                  H("NDCG@3, unseen states", "OursNDCGLSO", "", "leave-states-out"),
                  H(f"Cold-start cases, unseen states (persistence {n.get('PersHitColdLSO', '--')}%)", "OursHitColdLSO", "%", "leave-states-out"),
                  H("90% set coverage, unseen states (state-robust)", "CCSRCovLSO", "%", "leave-states-out"),
                  H("90% set size, unseen states (state-robust)", "CCSRSizeLSO", "crops", "leave-states-out"),
                  H("Worst state coverage (state-robust)", "SRWorstCov", "%", "leave-states-out")],
        numbers=n,
        note="Numbers are generated by experiments/report.py (same strings as paper/tables/numbers.tex). Data: DES APY 1997-98..2022-23, "
             "NASA POWER, SoilGrids (India only).")
    if mc:
        R["method_comparison"] = mc
    rw = ROOT.parent / "docs/research/related_work.json"
    if rw.exists():
        R["related_work"] = json.loads(rw.read_text())
        R["related_work_ours"] = dict(gaps=[], note=(
            "Real Government APY data (not Kaggle); leave-states-out and leave-years-out splits; best-yielding crop as target; "
            "90% conformal sets; paired Wilcoxon tests; no leakage (history uses strictly earlier years, state_group grouping); "
            "code in experiments/. Caveat: one country (India), no field trial."))
    path.write_text(json.dumps(R, indent=2) + "\n")


# ---------------------------------------------------------------- method comparison (compare.py)
SPLIT_LABEL = {"random": "Random split", "leave-states-out": "Unseen states", "leave-years-out": "Unseen years"}
NOTES = {
    "SVM (RBF)": "kernel SVM trained on a random 8,000-query subsample (O(n^2) cost)",
    "Stacking KNN+RF+NB->LR": "Ahmed et al. 2025, first proposed stacking model (KNN, RF, NB -> logistic regression)",
    "Persistence": "repeats the district's last-year yield ranking; needs history for every crop",
    "LightGBM pointwise": "same pairs and features as YieldRank, squared-error loss on yield percentile",
    "YieldRank (ours)": "LightGBM LambdaMART on (district-season, crop) pairs, relevance = yield percentile",
}


def method_comparison(mac):
    """Merge results/compare_<split>*.json into the results.json method_comparison block; write paper tables."""
    from scipy.stats import wilcoxon
    recs, pq = [], []
    for p in PROTO:
        for f in sorted(RES.glob(f"compare_{p}*.json")):
            if "quick" not in f.name:
                recs += [r | {"split": p} for r in json.load(open(f))]
        for f in sorted(RES.glob(f"compare_q_{p}*.parquet")):
            if "quick" not in f.name:
                pq.append(pd.read_parquet(f).assign(split=p))
    if not recs:
        return None
    F, P = pd.DataFrame(recs), pd.concat(pq, ignore_index=True)
    ours = "YieldRank (ours)"
    agg = F.groupby(["method", "split"])[["hit1", "hit3", "ndcg3", "hit1_cold", "hit1_warm", "conf_cov", "conf_size", "train_s", "infer_ms"]].mean()
    sd = F.groupby(["method", "split"])["hit1"].std()
    pv = {}
    for p in PROTO:
        o = P[(P.split == p) & (P.method == ours)].set_index(["fold", "qid"])["hit@1"]
        for m in P.method.unique():
            if m == ours:
                continue
            x = P[(P.split == p) & (P.method == m)].set_index(["fold", "qid"])["hit@1"].reindex(o.index)
            d = (o - x).dropna()
            pv[(m, p)] = float(wilcoxon(d).pvalue) if (d != 0).any() else 1.0
    # cold-start Hit@1 pooled over test queries (same definition as the paper's OursHitCold* macros)
    pooled_cold = P[P.cold].groupby(["method", "split"])["hit@1"].mean() * 100
    pooled_warm = P[~P.cold].groupby(["method", "split"])["hit@1"].mean() * 100
    for (m_, p_), v in pooled_cold.items():
        if (m_, p_) in agg.index:
            agg.loc[(m_, p_), "hit1_cold"] = v
    for (m_, p_), v in pooled_warm.items():
        if (m_, p_) in agg.index:
            agg.loc[(m_, p_), "hit1_warm"] = v
    meta = F.drop_duplicates("method").set_index("method")
    order = list(dict.fromkeys(F.method))
    methods, ablation = [], []
    for m in order:
        if (m, "leave-states-out") not in agg.index:
            continue
        g = lambda k, nd=1: {p: round(float(agg.loc[(m, p), k]), nd) for p in PROTO if (m, p) in agg.index}
        row = dict(name=m, family=meta.loc[m, "family"], source=meta.loc[m, "source"],
                   hit1=g("hit1"), hit1_std={p: round(float(sd.loc[(m, p)]), 1) for p in PROTO if (m, p) in sd.index},
                   hit3=g("hit3"), ndcg3=g("ndcg3", 3), hit1_cold=g("hit1_cold"), hit1_warm=g("hit1_warm"),
                   p_vs_ours=None if m == ours else {p: pv.get((m, p)) for p in PROTO},
                   train_s=round(float(agg.loc[m, "train_s"].mean()), 2), infer_ms=round(float(agg.loc[m, "infer_ms"].mean()), 4),
                   conformal={"cov": round(float(agg.loc[(m, "leave-states-out"), "conf_cov"]), 1),
                              "size": round(float(agg.loc[(m, "leave-states-out"), "conf_size"]), 2), "split": "leave-states-out",
                              "calibration": "i.i.d. LAC 90%"},
                   interpretable=meta.loc[m, "interpretable"], note=NOTES.get(m, ""))
        (ablation if row["family"] == "ablation" else methods).append(row)
    by = {r["name"]: r for r in methods + ablation}
    o = by[ours]
    # ablation table: what each component buys (unseen-state numbers are the headline)
    full = dict(name="YieldRank (full)", removed="nothing", hit1=o["hit1"], ndcg3=o["ndcg3"], conformal=o["conformal"],
                note="history + yield target + LambdaMART + conformal sets")
    abl = [full]
    for r, rem, note in ((by.get("YieldRank - history"), "district history features", "climate + soil + season only"),
                         (by.get("YieldRank - yield target (area share)"), "yield target", "relevance = current area share (what is grown most) instead of yield percentile"),
                         (by.get("YieldRank - persistence term"), "persistence term", "listwise + pointwise blend only"),
                         (by.get("LightGBM pointwise"), "listwise ranker + persistence", "pointwise regression on yield percentile alone")):
        if r:
            abl.append(dict(name=r["name"], removed=rem, hit1=r["hit1"], ndcg3=r["ndcg3"], conformal=r["conformal"], note=note))
    abl.append(dict(name="YieldRank top-1 only", removed="conformal step", hit1=o["hit1"], ndcg3=o["ndcg3"],
                    conformal={"cov": o["hit1"]["leave-states-out"], "size": 1.0, "split": "leave-states-out", "calibration": "none (fixed top-1)"},
                    note="a single recommendation is right only Hit@1 of the time and carries no coverage guarantee"))
    abl.append(dict(name="YieldRank fixed top-3", removed="conformal step", hit1=o["hit1"], ndcg3=o["ndcg3"],
                    conformal={"cov": o["hit3"]["leave-states-out"], "size": 3.0, "split": "leave-states-out", "calibration": "none (fixed top-3)"},
                    note="fixed-size list: coverage is whatever Hit@3 happens to be; sets do not adapt to hard cases"))
    lso = "leave-states-out"
    base = [r for r in methods if r["source"] != "ours" and r["family"] != "naive"]
    best = max(base, key=lambda r: r["hit1"][lso])
    pers = by["Persistence"]
    rivals = [r for r in methods if r["source"] == "ours" and r["name"] != ours]
    top_rival = max(rivals, key=lambda r: r["hit1"][lso]) if rivals else None
    def sig(p):
        return "p<10^-300" if p == 0 else f"p={p:.1e}"
    why = [f"On unseen states YieldRank picks the best-yielding crop {o['hit1'][lso]}% of the time vs {best['hit1'][lso]}% for the best "
           f"classifier from the literature ({best['name']}), +{o['hit1'][lso]-best['hit1'][lso]:.1f} points ({sig(best['p_vs_ours'][lso])}).",
           f"Random splits hide this: that classifier scores {best['hit1']['random']}% on a random split, "
           f"{best['hit1']['random']-best['hit1'][lso]:.1f} points more than on unseen states; YieldRank loses {o['hit1']['random']-o['hit1'][lso]:.1f}.",
           f"Yield grounding is the key ingredient: the same ranker trained to reproduce what farmers grow (area share) gets only "
           f"{by['YieldRank - yield target (area share)']['hit1'][lso]}% on unseen states." if "YieldRank - yield target (area share)" in by else None,
           f"District history matters: without it YieldRank falls to {by['YieldRank - history']['hit1'][lso]}%." if "YieldRank - history" in by else None,
           f"Persistence (repeat last year's ranking) is close overall ({pers['hit1'][lso]}% vs {o['hit1'][lso]}%, {sig(pers['p_vs_ours'][lso])}) "
           f"but cannot rank crops without last-year history: on those cold-start cases YieldRank gets {o['hit1_cold'][lso]}% vs {pers['hit1_cold'][lso]}%."]
    if top_rival:
        d = top_rival["hit1"][lso] - o["hit1"][lso]
        pr = top_rival["p_vs_ours"][lso]
        if d > 0:
            why.append(f"{top_rival['name']} on the same pairs is {d:.1f} points higher on unseen states ({sig(pr)}); "
                       + ("the difference is not significant, so we keep LambdaMART, whose NDCG-optimising loss matches the ranking task." if pr >= 0.05 else
                          "it is a variant of the same yield-grounded pair formulation, which is where the gain over the literature comes from."))
        else:
            why.append(f"Every single objective on the same pairs ({', '.join(r['name'] for r in rivals)}) is below the final blend on unseen states, "
                       f"by at most {max(abs(r['hit1'][lso]-o['hit1'][lso]) for r in rivals):.1f} points: the pair formulation does most of the work, "
                       f"and the blend (chosen on validation, not test) adds the rest.")
    why.append(f"With the same i.i.d. calibration its 90% sets cover {o['conformal']['cov']}% on unseen states with {o['conformal']['size']} crops, "
               f"vs {best['conformal']['cov']}% with {best['conformal']['size']} crops for {best['name']}; the served state-robust sets cover "
               f"{mac.get('CCSRCovLSO', '--')}% with {mac.get('CCSRSizeLSO', '--')} crops (worst state {mac.get('SRWorstCov', '--')}%).")
    why.append(f"It is cheap: {o['train_s']:.0f} s to train and {o['infer_ms']:.3f} ms per query, with tree feature importances/SHAP for explanations.")
    mc = dict(splits=list(PROTO), split_labels=SPLIT_LABEL, primary_split=lso, methods=methods, ablation=abl, chosen="YieldRank",
              why=[w for w in why if w], _doc="Written by experiments/report.py from experiments/compare.py. Same queries, folds and "
              "calibration sets as v4. hit1/hit3/hit1_cold in percent; ndcg3 0-1; conformal cov in percent, size in crops; "
              "p_vs_ours = paired Wilcoxon on per-query Hit@1 vs YieldRank, pooled over 5 folds.")
    # paper table: one row per method, unseen-state focus
    rows = []
    for r in methods:
        src = {"ours": "", "baseline": ""}.get(r["source"], f"~\\cite{{{r['source']}}}")
        p = r["p_vs_ours"][lso] if r["p_vs_ours"] else None
        star = "" if p is None or p >= 0.05 else ("$^{**}$" if p < 0.001 else "$^{*}$")
        nm = r["name"].replace("->", r"$\to$").replace("+", "+")
        nm = rf"\textbf{{{nm}}}" if r["name"] == ours else nm
        rows.append(f"{nm}{src} & {r['hit1']['random']:.1f} & {r['hit1'][lso]:.1f}{star} & {r['hit1']['leave-years-out']:.1f} & "
                    f"{r['ndcg3'][lso]:.3f} & {r['hit1_cold'][lso]:.1f} & {r['conformal']['cov']:.1f}/{r['conformal']['size']:.2f} & "
                    f"{r['train_s']:.1f} \\\\")
    (PAPER / "tables/methods.tex").write_text("\n".join([r"\begin{tabular}{lccccccc}", r"\toprule",
        r"Method & \multicolumn{3}{c}{Hit@1 (\%)} & NDCG@3 & Cold Hit@1 & 90\% set & Train \\",
        r"\cmidrule(lr){2-4}", r" & Random & States & Years & States & States & cov.\%/size & (s) \\", r"\midrule", *rows,
        r"\bottomrule", r"\end{tabular}"]) + "\n")
    arows = [f"{a['removed'] if a['removed'] != 'nothing' else 'Full YieldRank'} & {a['hit1'][lso]:.1f} & {a['ndcg3'][lso]:.3f} & "
             f"{a['conformal']['cov']:.1f} & {a['conformal']['size']:.2f} \\\\" for a in abl]
    arows = [("-- " + r if not r.startswith("Full") else r) for r in arows]
    (PAPER / "tables/ablation.tex").write_text("\n".join([r"\begin{tabular}{lcccc}", r"\toprule",
        r"Component removed & Hit@1 & NDCG@3 & Cover.\% & Size \\", r"\midrule", *arows, r"\bottomrule", r"\end{tabular}"]) + "\n")
    paper_rows = [r for r in methods if r["source"] not in ("ours", "baseline")]
    bp = max(paper_rows, key=lambda r: r["hit1"][lso]) if paper_rows else best
    abl_hit = {a["removed"]: a["hit1"][lso] for a in abl}
    mac |= {"MCBestPaperName": bp["name"], "MCBestPaperHit": f"{bp['hit1'][lso]:.1f}", "MCBestPaperHitR": f"{bp['hit1']['random']:.1f}",
            "MCNPaperMethods": len(paper_rows), "MCNPapers": len({r["source"] for r in paper_rows}),
            "MCAblNoHist": f"{abl_hit.get('district history features', float('nan')):.1f}",
            "MCAblNoYield": f"{abl_hit.get('yield target', float('nan')):.1f}",
            "MCAblNoPers": f"{by['YieldRank - persistence term']['hit1'][lso]:.1f}" if "YieldRank - persistence term" in by else "--",
            "MCOursTrain": f"{o['train_s']:.0f}", "MCOursInfer": f"{o['infer_ms']:.3f}"}
    mac |= {"MCBestName": best["name"], "MCBestHit": f"{best['hit1'][lso]:.1f}", "MCNMethods": len(methods),
            "MCNoYieldHit": f"{by['YieldRank - yield target (area share)']['hit1'][lso]:.1f}" if "YieldRank - yield target (area share)" in by else "--",
            "MCTopRival": top_rival["name"] if top_rival else "--",
            "MCTopRivalHit": f"{top_rival['hit1'][lso]:.1f}" if top_rival else "--"}
    return mc


if __name__ == "__main__":
    main()
