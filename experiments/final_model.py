"""AgroMind v4 (final): train once, then rank the crops for a district-season with a 90% conformal set.

    art = train()                    # uses backend/data/large/agromind_india_large.parquet
    save(art); art = load()          # backend/models/v4_final.joblib
    predict(art, "Punjab", "LUDHIANA", "Rabi")   # -> {"crops": [...], "set_size", "cold_start", ...}

The configuration in FINAL is what experiments/run.py, crossconf.py and compare.py report as "YieldRank (ours)".
Calibration: out-of-fold scores from rankers that never saw the state (GroupKFold over state_group), then the
state-robust threshold of crossconf.state_robust (per-state 90% thresholds, beta-quantile across states).
"""
from pathlib import Path
import joblib
import numpy as np, pandas as pd
from sklearn.model_selection import GroupKFold
import run

ROOT = Path(__file__).resolve().parents[1]
ART_PATH = ROOT / "backend/models/v4_final.joblib"
FINAL = run.FINAL  # single source of truth for the chosen objective / blend


def _robust_threshold(cal, state, alpha, beta, min_n=30):
    from crossconf import state_robust  # noqa: deferred so importing this module stays light
    res, _, _ = state_robust(cal, cal, state, alpha=alpha, beta=beta, min_n=min_n)
    return res["threshold"], res["n_states"]


def train(df=None, alpha=0.1, beta=0.9):
    df = run.load() if df is None else df
    crops = sorted(df.crop_slug.unique())
    q = df.groupby("qid").first()
    grp = q.get("state_group", q.state)
    # out-of-fold scores: every query scored by a model that never saw its state
    oof = pd.Series(np.nan, index=df.index)
    for tr_q, ho_q in GroupKFold(5).split(q, groups=grp.values):
        tr, ho = df.index[df.qid.isin(q.index[tr_q])], df.index[df.qid.isin(q.index[ho_q])]
        oof.loc[ho] = run.fit_final(df, tr, crops)(ho)
    T = run.fit_T(df.qid, oof.values, df.best.values)
    cal = df[["qid", "best"]].assign(p=run.softmax_by_q(df.qid, oof.values, T))
    qhat, n_states = _robust_threshold(cal, q.state, alpha, beta)
    model = run.fit_final(df, df.index, crops, return_model=True)
    last = df.sort_values("year")
    hist = last.groupby(["state", "district", "season", "crop_slug"]).agg(
        last_year=("year", "max"), years_grown=("year", "nunique"), median_yield=("yield", "median"),
        unit=("production_unit", "last"))
    recent = last[last.year >= last.year.max() - 4]
    crop_median = recent.groupby("crop_slug")["yield"].median()
    return dict(model=model, crops=crops, T=float(T), qhat=float(qhat), alpha=alpha, beta=beta, n_cal_states=n_states,
                hist=hist, crop_median=crop_median, df_cols=list(df.columns), data=df, final=FINAL)


def save(art, path=ART_PATH):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(art, path, compress=3)
    return path


def load(path=ART_PATH):
    return joblib.load(path)


def _query_rows(art, state, district, season, env=None):
    """Candidate rows for next season: crops grown in this district-season in its last 5 recorded years."""
    d = art["data"]
    low = lambda x: str(x).strip().lower()
    m = (d.state.str.lower() == low(state)) & (d.district.str.lower() == low(district)) & \
        ((d.season.str.lower() == low(season)) | (d.season_app == low(season)))
    h = d[m]
    if h.empty:
        raise ValueError(f"no crop records for {state} / {district} / {season}")
    season_raw = h.season.value_counts().index[0]
    h = h[h.season == season_raw]
    y0 = h.year.max()
    h = h[h.year >= y0 - 4]
    latest = h.sort_values("year").groupby("crop_slug").tail(1).set_index("crop_slug")
    rows = latest.copy()
    g = h.sort_values("year").groupby("crop_slug")
    rows["lag1_pct"] = np.where(latest.year == y0, latest.yield_pct, np.nan)     # last year's percentile, if grown then
    rows["mean3_pct"] = g.yield_pct.apply(lambda s: s.tail(3).mean()).reindex(rows.index)
    share = h[h.year == y0].set_index("crop_slug").area_ha
    rows["lag1_share"] = (share / share.sum()).reindex(rows.index)
    clim = h[h.year == y0].iloc[0]
    for c in run.ENV:  # this district-season's latest climate/soil, unless the caller overrides
        rows[c] = (env or {}).get(c, clim[c])
    for s in run.SEASONS:
        rows[f"s_{s}"] = float(clim.season_app == s)
    rows["qid"] = -1
    return rows.reset_index(), season_raw, int(y0)


def predict(art, state, district, season, k=None, env=None):
    rows, season_raw, y0 = _query_rows(art, state, district, season, env)
    X = run.pair_features(rows, art["crops"], True)
    s = run.final_scores(art["model"], X, rows)
    p = np.exp((s - s.max()) / art["T"])
    p /= p.sum()
    order = np.argsort(-s)
    in_set = (1 - p) <= art["qhat"]
    hist = art["hist"]
    out = []
    for r, i in enumerate(order[:k] if k else order, 1):
        c = rows.crop_slug[i]
        key = (rows.state[i], rows.district[i], season_raw, c)
        hrow = hist.loc[key] if key in hist.index else None
        out.append(dict(crop=c, rank=r, score=float(s[i]), probability=float(p[i]), in_set=bool(in_set[i]),
                        median_yield=float(hrow.median_yield) if hrow is not None else float(art["crop_median"].get(c, np.nan)),
                        yield_unit={"Tonnes": "t/ha", "Bales": "bales/ha", "Nuts": "nuts/ha"}.get(hrow.unit if hrow is not None else "Tonnes", "t/ha"),
                        years_grown=int(hrow.years_grown) if hrow is not None else 0,
                        last_year=int(hrow.last_year) if hrow is not None else None,
                        no_history_last_year=bool(np.isnan(rows.lag1_pct[i]))))
    return dict(state=rows.state[0], district=rows.district[0], season=season_raw, based_on_year=y0, crops=out,
                set_size=int(in_set.sum()), cold_start=bool(rows.lag1_pct.isna().any()),
                coverage_target=1 - art["alpha"], model=art["final"]["name"])


def self_check(art):
    r = predict(art, "Punjab", "LUDHIANA", "Rabi")
    assert r["crops"] and r["crops"][0]["rank"] == 1 and 1 <= r["set_size"] <= len(r["crops"]), r
    assert abs(sum(c["probability"] for c in r["crops"]) - 1) < 1e-6
    assert any(c["crop"] == "wheat" for c in r["crops"][:3]), r["crops"][:3]  # Ludhiana rabi: wheat must be near the top
    assert all(c["in_set"] for c in r["crops"][:r["set_size"]])  # the set is a prefix of the ranking
    try:
        predict(art, "Punjab", "NO SUCH DISTRICT", "Rabi")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass
    return r


if __name__ == "__main__":
    import sys
    art = load() if "--load" in sys.argv and ART_PATH.exists() else train()
    if "--load" not in sys.argv:
        print("saved", save(art), "T", round(art["T"], 3), "qhat", round(art["qhat"], 4), "calibration states", art["n_cal_states"])
    r = self_check(art)
    print("self-check passed")
    print({k: v for k, v in r.items() if k != "crops"})
    for c in r["crops"]:
        print(c)
