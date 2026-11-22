"""v4 (final): YieldRank + 90 % split-conformal crop sets, served by POST /predict.

Method (paper / notebooks/AgroMind_v4_Novel_Method.ipynb, experiments/run.py): a query is one
district x season x year; its candidates are the crops grown there; LightGBM LambdaMART ranks them by
yield percentile from season climate, SoilGrids soil, season and the district's own crop history.
A softmax with a fitted temperature turns scores into probabilities of being the best-yielding crop,
and a split-conformal (LAC) threshold gives a set that contains that crop with ~90 % probability.

Serving: the query is the district's next season (last recorded year + 1). Candidates are the crops
grown in that district-season in its last 5 recorded years; history features come from those records.
Fitting / scoring live in `fit()` / `_score()`; swap them for experiments/final_model.py when frozen.
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from .india_ref import crop_name

BASE_DIR = Path(__file__).resolve().parents[1]
PARQUET = BASE_DIR / "data" / "large" / "agromind_india_large.parquet"
MODEL_DIR = BASE_DIR / "models"
ARTIFACT = MODEL_DIR / "v4_yieldrank.txt"
META = MODEL_DIR / "v4_yieldrank.json"
RESULTS = BASE_DIR.parent / "docs" / "research" / "results.json"

CLIMATE = ["temperature", "humidity", "rainfall"]
SOIL = ["soil_ph", "soil_n_gkg", "soil_soc_gkg", "soil_clay_pct", "soil_sand_pct", "soil_cec_cmolkg"]
ENV = CLIMATE + SOIL
SEASONS = ["kharif", "rabi", "zaid", "whole_year"]
HIST = ["lag1_pct", "mean3_pct", "lag1_share"]
ALPHA = 0.1  # 90 % sets
RECENT_YEARS = 5
SEED = 0
PARAMS = dict(n_estimators=400, learning_rate=0.05, num_leaves=63, min_child_samples=40, subsample=0.8,
              subsample_freq=1, colsample_bytree=0.8, random_state=SEED, verbose=-1)


class NoCandidates(LookupError):
    pass


# ── data ──────────────────────────────────────────────────────────────────


def base_table(raw: pd.DataFrame) -> pd.DataFrame:
    """Rows with a crop slug and yield percentile, one per (district, season, year, crop), with area share."""
    df = raw[raw.crop_slug.notna() & raw.yield_pct.notna()].copy()
    for c in ("state", "district", "season", "season_app", "crop_slug", "production_unit"):
        df[c] = df[c].astype(str)
    key = ["state", "district", "season", "year", "crop_slug"]
    df = df.sort_values("area_ha").groupby(key, as_index=False).last()
    df["share"] = df.area_ha / df.groupby(["state", "district", "season", "year"]).area_ha.transform("sum")
    return df


def training_table(base: pd.DataFrame) -> pd.DataFrame:
    """experiments/run.load(): strictly-earlier district history, queries with >= 2 candidates, best crop."""
    df = base.sort_values("year").copy()
    g = df.groupby(["state", "district", "season", "crop_slug"])
    prev_year = g.year.shift(1)
    df["lag1_pct"] = g.yield_pct.shift(1).where(prev_year == df.year - 1)
    df["lag1_share"] = g.share.shift(1).where(prev_year == df.year - 1)
    df["mean3_pct"] = g.yield_pct.transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    df["qid"] = df.groupby(["state", "district", "season", "year"]).ngroup()
    df = df[df.groupby("qid").crop_slug.transform("size") >= 2]
    df = df.sort_values(["qid", "crop_slug"]).reset_index(drop=True)
    best = df.groupby("qid").yield_pct.transform("max") == df.yield_pct
    df["best"] = 0
    df.loc[df[best].groupby("qid").head(1).index, "best"] = 1
    return df


def features(d: pd.DataFrame, crops: list[str]) -> pd.DataFrame:
    X = d[ENV].astype(float).copy()
    for s in SEASONS:
        X[f"s_{s}"] = (d.season_app == s).astype(float).values
    X[HIST] = d[HIST].astype(float).values
    X["crop"] = pd.Categorical(d.crop_slug, categories=crops)
    return X


def softmax(qid: np.ndarray, s: np.ndarray, T: float) -> np.ndarray:
    z = pd.Series(s / T)
    e = np.exp(z.values - z.groupby(qid).transform("max").values)
    return e / pd.Series(e).groupby(qid).transform("sum").values


# ── model ─────────────────────────────────────────────────────────────────


def fit(train: pd.DataFrame) -> dict:
    """Split queries 70 / 15 / 15: fit the ranker, fit the softmax temperature, set the conformal threshold."""
    crops = sorted(train.crop_slug.unique())
    q = train.qid.values
    a, cal = next(GroupShuffleSplit(1, test_size=0.15, random_state=SEED).split(train, groups=q))
    fit_i, tmp = next(GroupShuffleSplit(1, test_size=0.15 / 0.85, random_state=SEED + 1).split(a, groups=q[a]))
    fit_i, t_i = a[fit_i], a[tmp]
    d = train.iloc[fit_i]
    rel = np.clip(np.floor(d.yield_pct * 10), 0, 9).astype(int)
    ranker = lgb.LGBMRanker(objective="lambdarank", label_gain=list(range(10)), lambdarank_truncation_level=10, **PARAMS)
    ranker.fit(features(d, crops), rel, group=d.groupby("qid", sort=False).size().values)
    booster = ranker.booster_

    def scores(idx):
        return booster.predict(features(train.iloc[idx], crops))

    s_t, best_t = scores(t_i), train.best.values[t_i] == 1
    grid = np.exp(np.linspace(np.log(0.02), np.log(50), 60))
    T = float(grid[int(np.argmin([-np.log(softmax(q[t_i], s_t, T)[best_t] + 1e-12).mean() for T in grid]))])
    p_cal = softmax(q[cal], scores(cal), T)
    nonconf = 1 - p_cal[train.best.values[cal] == 1]
    n = len(nonconf)
    qhat = float(np.quantile(nonconf, min(1.0, np.ceil((n + 1) * (1 - ALPHA)) / n), method="higher"))
    # held-out check on the calibration queries (not used to fit the ranker or T)
    c = train.iloc[cal].assign(p=p_cal)
    top = c.loc[c.groupby("qid").p.idxmax()]
    inset = c[(1 - c.p) <= qhat]
    check = {"hit1": float(top.best.mean()),
             "coverage": float(c[c.best == 1].pipe(lambda b: ((1 - b.p) <= qhat).mean())),
             "set_size": float(inset.groupby("qid").size().reindex(c.qid.unique(), fill_value=0).mean()),
             "queries": int(c.qid.nunique())}
    return {"booster": booster, "crops": crops, "T": T, "qhat": qhat, "check": check,
            "rows": int(len(train)), "queries": int(train.qid.nunique())}


class V4Service:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model: dict | None = None
        self._base: pd.DataFrame | None = None
        self.source: str | None = None  # "artifact" or "trained"

    @property
    def base(self) -> pd.DataFrame:
        if self._base is None:
            self._base = base_table(pd.read_parquet(PARQUET))
        return self._base

    @property
    def model(self) -> dict:
        with self._lock:
            if self._model is None:
                self._model = self._load() or self.train(save=True)
            return self._model

    def _load(self) -> dict | None:
        if not (ARTIFACT.exists() and META.exists()):
            return None
        meta = json.loads(META.read_text())
        if meta.get("base_rows") != len(self.base):  # artifact belongs to another build of the data
            return None
        self.source = "artifact"
        return {**meta, "booster": lgb.Booster(model_file=str(ARTIFACT))}

    def train(self, save: bool = True) -> dict:
        t = time.time()
        m = fit(training_table(self.base))
        m["train_seconds"] = round(time.time() - t, 1)
        m["base_rows"] = int(len(self.base))
        if save:
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            m["booster"].save_model(str(ARTIFACT))
            META.write_text(json.dumps({k: v for k, v in m.items() if k != "booster"}, indent=1))
        self.source = "trained"
        return m

    def warm_up(self) -> None:
        threading.Thread(target=lambda: self.model, daemon=True).start()

    # ── prediction ────────────────────────────────────────────────────────

    def _query(self, state: str, district: str, season: str) -> tuple[pd.DataFrame, str, int, int]:
        b = self.base
        rows = b[(b.state == state) & (b.district == district) & (b.season_app == season)]
        if rows.empty:
            raise NoCandidates(f"No crop records for {district}, {state} in season '{season}'.")
        raw_season = rows.season.value_counts().idxmax()  # e.g. Kharif over Autumn for "kharif"
        rows = rows[rows.season == raw_season].sort_values("year")
        target = int(rows.year.max()) + 1
        recent = rows[rows.year >= target - RECENT_YEARS]
        cands = []
        for crop, g in rows[rows.crop_slug.isin(recent.crop_slug.unique())].groupby("crop_slug"):
            last = g[g.year == target - 1]
            cands.append({
                "crop_slug": crop,
                "lag1_pct": float(last.yield_pct.iloc[0]) if len(last) else np.nan,
                "lag1_share": float(last.share.iloc[0]) if len(last) else np.nan,
                "mean3_pct": float(g.yield_pct.tail(3).mean()),
                "expected_yield": float(g[g.year >= target - RECENT_YEARS]["yield"].median()),
                "historical_median_yield": float(g["yield"].median()),
                "yield_unit": f"{unit}/ha" if (unit := g.production_unit.iloc[-1]) not in ("nan", "None") else None,
                "years_grown": int(g.year.nunique()),
                "last_year": int(g.year.max()),
            })
        return pd.DataFrame(cands), raw_season, target, int(rows.year.nunique())

    def predict(self, state: str, district: str, season: str, env: dict) -> dict:
        """env: climate + soil values for the query (district defaults, possibly overridden)."""
        m = self.model
        cands, raw_season, target, history_years = self._query(state, district, season)
        d = cands.assign(season_app=season, **{k: env.get(k, np.nan) for k in ENV})
        s = m["booster"].predict(features(d, m["crops"]))
        p = softmax(np.zeros(len(d), dtype=int), s, m["T"])
        d = d.assign(score=s, p=p, in_set=(1 - p) <= m["qhat"]).sort_values("score", ascending=False)
        empty_set = not d.in_set.any()
        if empty_set:  # LAC can return an empty set; keep the top crop so the answer is never empty
            d.loc[d.index[0], "in_set"] = True
        d["rank"] = np.arange(1, len(d) + 1)
        num = lambda v, nd=3: None if v is None or pd.isna(v) else round(float(v), nd)
        recs = [{
            "rank": int(r["rank"]), "crop": r.crop_slug, "name": crop_name(r.crop_slug),
            "rank_score": num(r.score, 4), "probability_best": num(r.p, 4), "in_set": bool(r.in_set),
            "expected_yield": num(r.expected_yield), "historical_median_yield": num(r.historical_median_yield),
            "yield_unit": r.yield_unit, "years_grown": int(r.years_grown), "last_year": int(r.last_year),
            "cold_start": bool(pd.isna(r.lag1_pct)),
        } for _, r in d.iterrows()]
        return {
            "model": "AgroMind v4", "method": "YieldRank (LightGBM LambdaMART) + 90% split-conformal set",
            "fallback": None, "state": state, "district": district, "season": season,
            "apy_season": raw_season, "target_year": target,
            "inputs": {k: num(env.get(k), 2) for k in ENV},
            "coverage_target": 1 - ALPHA, "set_size": int(d.in_set.sum()), "set_was_empty": bool(empty_set),
            "candidates": len(recs),
            "history_years": history_years,
            "best_crop": recs[0]["crop"],
            "recommendations": recs,
        }

    def info(self) -> dict:
        m = self.model
        v4 = json.loads(RESULTS.read_text()).get("v4", {}) if RESULTS.exists() else {}
        n = v4.get("numbers", {})
        pct = lambda k: float(n[k]) / 100 if k in n else None
        flt = lambda k: float(n[k]) if k in n else None
        proto = lambda tag: {
            "hit1": pct(f"OursHit{tag}"), "hit3": pct(f"OursHitThree{tag}"), "ndcg3": flt(f"OursNDCG{tag}"),
            "best_baseline": n.get(f"BaseName{tag}"), "baseline_hit1": pct(f"BaseHit{tag}"),
            "baseline_ndcg3": flt(f"BaseNDCG{tag}"), "persistence_hit1": pct(f"PersHit{tag}"),
            "conformal90_coverage": pct(f"CovGRP{tag}"), "conformal90_set_size": flt(f"SizeGRP{tag}")}
        return {
            "model": "AgroMind v4: YieldRank (LightGBM LambdaMART) + 90% split-conformal crop sets",
            "features": ENV + ["season (one-hot)"] + HIST + ["crop"],
            "candidates": f"crops grown in the district-season in its last {RECENT_YEARS} recorded years",
            "label": "relevance = the crop's yield percentile among all districts that grew it that year; "
                     "the set targets the best-yielding candidate",
            "artifact": self.source, "train_seconds": m.get("train_seconds"),
            "training_rows": m["rows"], "training_queries": m["queries"], "crops": len(m["crops"]),
            "temperature": round(m["T"], 4), "conformal_qhat": round(m["qhat"], 4),
            "holdout_check": m["check"],
            "metrics": {"leave_states_out": proto("LSO"), "leave_years_out": proto("LYO"), "random": proto("R"),
                        "source": "docs/research/results.json v4.numbers (experiments/run.py, paper)",
                        "note": "hit1 = top-ranked candidate is the best-yielding crop of that district-season-year; "
                                "conformal = held-out-group calibration, 90% target."},
            "data": {k: v4.get("meta", {}).get(k) for k in ("rows", "queries", "crops", "states", "years")},
        }
