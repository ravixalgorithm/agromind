"""Method comparison + YieldRank ablation on the v4 benchmark (same queries, folds and calibration
splits as run.py, so YieldRank's numbers here equal the paper's).

    .venv/bin/python compare.py --protocol leave-states-out [--only NAME ...] [--quick]
Writes results/compare_<protocol>.json (per-fold metrics) and results/compare_q_<protocol>.parquet
(per-query Hit@1 / NDCG@3 for the Wilcoxon tests).
"""
import argparse, json, time
import numpy as np, pandas as pd
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.model_selection import GroupShuffleSplit
from catboost import CatBoostClassifier
import run

SEED = run.SEED
PROTOS = ("random", "leave-states-out", "leave-years-out")


def clf(name, est=None, max_q=None):
    return lambda df, tr, c, QX, Qy: run.fit_clf(name, df, tr, c, True, QX, Qy, est=est, max_q=max_q)


def rank(objective, hist=True, target="yield"):
    return lambda df, tr, c, QX, Qy: run.fit_rank(df, tr, c, hist, objective, target)


TREE = "feature importance + SHAP"


from sklearn.base import BaseEstimator, ClassifierMixin


class XGBSafe(ClassifierMixin, BaseEstimator):
    """XGBClassifier that tolerates label gaps (stacking's internal CV folds can miss rare crops)."""
    def __init__(self, params=None):
        self.params = params

    def fit(self, X, y):
        from xgboost import XGBClassifier
        self.classes_ = np.unique(y)
        self.m_ = XGBClassifier(n_jobs=-1, verbosity=0, **(self.params or {})).fit(X, np.searchsorted(self.classes_, y))
        return self

    def predict_proba(self, X):
        return self.m_.predict_proba(X)

    def predict(self, X):
        return self.classes_[self.m_.predict(X)]


class HardVote:
    """Hard (majority) voting exposed as vote shares, so the vote can rank candidate crops. Top-1 = the paper's hard vote."""
    def __init__(self, estimators):
        self.estimators = estimators

    def fit(self, X, y):
        self.k = int(np.max(y)) + 1
        for _, e in self.estimators:
            e.fit(X, y)
        return self

    def predict_proba(self, X):
        P = np.zeros((len(X), self.k))
        for _, e in self.estimators:
            P[np.arange(len(X)), e.predict(X).astype(int)] += 1
        return (P + 1e-3 * P.sum(1, keepdims=True) / self.k) / len(self.estimators)


class CNNLSTM:
    """Abu Bakr et al. 2025 CNN-LSTM: batch 8, 50 epochs, Adam (stated). Layer sizes are NOT stated:
    ours = Conv1d(1->32, k=3) -> LSTM(32) -> Linear, over the min-max-scaled feature vector as a sequence."""
    def __init__(self, epochs=50, batch=8, seed=SEED):
        self.epochs, self.batch, self.seed = epochs, batch, seed

    def fit(self, X, y):
        import torch, torch.nn as nn
        torch.manual_seed(self.seed)
        X = np.asarray(X, dtype=np.float32)
        self.lo, self.hi = X.min(0), X.max(0) + 1e-9
        k = int(np.max(y)) + 1

        class Net(nn.Module):
            def __init__(s):
                super().__init__()
                s.conv, s.lstm, s.out = nn.Conv1d(1, 32, 3, padding=1), nn.LSTM(32, 32, batch_first=True), nn.Linear(32, k)
            def forward(s, x):
                h = torch.relu(s.conv(x.unsqueeze(1))).transpose(1, 2)
                return s.out(s.lstm(h)[0][:, -1])
        self.net, opt = Net(), None
        opt = torch.optim.Adam(self.net.parameters())
        Xt, yt = torch.tensor((X - self.lo) / (self.hi - self.lo)), torch.tensor(np.asarray(y), dtype=torch.long)
        lossf = nn.CrossEntropyLoss()
        for _ in range(self.epochs):
            perm = torch.randperm(len(Xt))
            for i in range(0, len(Xt), self.batch):
                j = perm[i:i + self.batch]
                opt.zero_grad()
                lossf(self.net(Xt[j]), yt[j]).backward()
                opt.step()
        return self

    def predict_proba(self, X):
        import torch
        with torch.no_grad():
            Xt = torch.tensor((np.asarray(X, dtype=np.float32) - self.lo) / (self.hi - self.lo))
            return torch.softmax(self.net(Xt), 1).numpy()


def _paper_methods():
    from sklearn.ensemble import BaggingClassifier, ExtraTreesClassifier, VotingClassifier
    from sklearn.tree import DecisionTreeClassifier
    from sklearn.preprocessing import MinMaxScaler
    from xgboost import XGBClassifier
    xgb = lambda **k: XGBClassifier(n_jobs=-1, verbosity=0, **k)
    return {
        # Dey et al. 2024 (Heliyon), Sec 2.2 / Table 1, exact hyper-parameters; no scaling mentioned.
        "XGBoost (Dey 2024)": ("paper", "dey2024", TREE, "exact Table 1 config", clf("XGB", xgb(
            learning_rate=0.1, max_depth=17, n_estimators=200, subsample=0.5, gamma=0, random_state=50))),
        "Random Forest (Dey 2024)": ("paper", "dey2024", TREE, "exact Table 1 config", clf("RF", RandomForestClassifier(
            max_depth=6, max_features=5, min_samples_split=4, n_estimators=15, random_state=0, n_jobs=-1))),
        "SVM (Dey 2024)": ("paper", "dey2024", "none", "exact config; trained on a random 8,000-query subsample (kernel SVM is O(n^2))",
                           clf("SVM", SVC(C=5, gamma=0.1, kernel="rbf", decision_function_shape="ovr"), max_q=8000)),
        "k-NN (Dey 2024)": ("paper", "dey2024", "nearest past cases", "exact config (k=3, Minkowski)",
                            clf("KNN", KNeighborsClassifier(n_neighbors=3, metric="minkowski", n_jobs=-1))),
        "Decision Tree (Dey 2024)": ("paper", "dey2024", "tree rules", "exact config; max_features='auto' = 'sqrt' in current sklearn",
                                     clf("DT", DecisionTreeClassifier(max_features="sqrt", ccp_alpha=0.001, criterion="entropy", max_depth=5, random_state=2))),
        # Afzal et al. 2025 (Sci. Rep.), Table 4, hard voting RF + XGB ("RFXG").
        "RFXG hard vote (Afzal 2025)": ("paper", "afzal2025", "partial (member importances)", "exact Table 4 config; hard vote exposed as vote shares for ranking",
            clf("VOTE", HardVote([("rf", RandomForestClassifier(max_depth=9, n_estimators=2, min_samples_split=9, random_state=SEED)),
                                  ("xgb", xgb(random_state=0, n_estimators=6, max_depth=2, learning_rate=0.1))]))),
        # Gunasekaran et al. 2025 (Sensors), Table 3 Optuna values, seed 42, MinMax scaling; PINN branch omitted.
        "Stacking RF+ET+XGB (Gunasekaran 2025)": ("paper", "gunasekaran2025", "partial (base-model importances)",
            "Table 3 config, seed 42, MinMax; PINN branch omitted (unspecified); internal stacking cv=3 (unstated; compute)",
            clf("STACK", make_pipeline(MinMaxScaler(), StackingClassifier(
                [("rf", RandomForestClassifier(max_depth=16, min_samples_split=10, n_estimators=116, random_state=42, n_jobs=-1)),
                 ("et", ExtraTreesClassifier(max_depth=16, min_samples_split=5, n_estimators=441, random_state=42, n_jobs=-1)),
                 ("xgb", XGBSafe(dict(learning_rate=0.0640, max_depth=7, n_estimators=465, random_state=42)))],
                final_estimator=LogisticRegression(C=829.97, penalty="l2", max_iter=1000), cv=3)))),
        # Ahmed et al. 2025 (Sci. Rep.): no hyper-parameters stated -> library defaults.
        "Stacking KNN+RF+NB->LR (Ahmed 2025)": ("paper", "ahmed2025", "partial (base-model importances)", "architecture from the paper; library defaults (none stated)",
            clf("STACK", StackingClassifier([("knn", KNeighborsClassifier()), ("rf", RandomForestClassifier(random_state=SEED, n_jobs=-1)),
                                             ("nb", GaussianNB())], final_estimator=LogisticRegression(max_iter=1000)))),
        "Stacking KNN+Bagging+NB->LR (Ahmed 2025)": ("paper", "ahmed2025", "partial (base-model importances)", "architecture from the paper; library defaults (none stated)",
            clf("STACK", StackingClassifier([("knn", KNeighborsClassifier()), ("bag", BaggingClassifier(random_state=SEED, n_jobs=-1)),
                                             ("nb", GaussianNB())], final_estimator=LogisticRegression(max_iter=1000)))),
        "Hard vote LR+XGB+RF+DT+NB (Ahmed 2025)": ("paper", "ahmed2025", "partial (member importances)", "architecture from the paper; library defaults; hard vote exposed as vote shares",
            clf("VOTE", HardVote([("lr", LogisticRegression(max_iter=1000)), ("xgb", xgb(random_state=SEED)),
                                  ("rf", RandomForestClassifier(random_state=SEED, n_jobs=-1)), ("dt", DecisionTreeClassifier(random_state=SEED)),
                                  ("nb", GaussianNB())]))),
        # Mahesh & Soundrapandiyan 2026 (Front. Plant Sci.), Table 3 CatBoost config (they regress a suitability score).
        "CatBoost (Mahesh 2026 config)": ("paper", "mahesh2026", TREE, "Table 3 config; used as a classifier here (paper regresses expert scores)",
            clf("CAT", CatBoostClassifier(iterations=300, depth=6, learning_rate=0.05, loss_function="MultiClass", random_seed=SEED, verbose=0, thread_count=-1))),
        # Abu Bakr et al. 2025 (Information): CNN-LSTM, batch 8, 50 epochs, Adam; layers unstated.
        "CNN-LSTM (Bakr 2025)": ("paper", "bakr2025", "none", "batch 8, 50 epochs, Adam as stated; layer sizes ours (unstated)",
            clf("CNN", CNNLSTM())),
    }


# name: (family, source, interpretable, note, maker). source = "ours" | "baseline" | bib key of the reimplemented paper.
METHODS = {
    "Crop prior": ("naive", "baseline", "lookup table", "mean training yield percentile of each crop",
                   lambda df, tr, c, QX, Qy: run.fit_prior(df, tr)),
    "Persistence": ("naive", "baseline", "rule (last year's ranking)", "repeats the district's last-year yield ranking",
                    lambda df, tr, c, QX, Qy: run.fit_persist(df, tr)),
    "Gaussian NB": ("classifier", "baseline", "class-conditional Gaussians", "as in run.py", clf("NB")),
    "Random Forest": ("classifier", "baseline", TREE, "300 trees, as in run.py", clf("RF")),
    "XGBoost": ("classifier", "baseline", TREE, "200 trees, depth 6, as in run.py", clf("XGB")),
    "MLP": ("classifier", "baseline", "none", "128-64, early stopping, as in run.py", clf("MLP")),
    **_paper_methods(),
    "LightGBM pointwise": ("pair model", "ours", TREE, "same pairs/features as YieldRank, squared-error loss on yield percentile", rank("regression")),
    "LightGBM XE-NDCG ranker": ("pair ranker", "ours", TREE, "same pairs, cross-entropy NDCG loss", rank("xendcg")),
    "XGBoost LambdaMART": ("pair ranker", "ours", TREE, "same pairs, XGBoost rank:ndcg", rank("xgb_rank")),
    "YieldRank (ours)": ("pair ranker", "ours", TREE, "LightGBM LambdaMART on (district-season, crop) pairs, relevance = yield percentile", rank("lambdarank")),
    "YieldRank - history": ("ablation", "ours", TREE, "no district-history features", rank("lambdarank", hist=False)),
    "YieldRank - yield target (area share)": ("ablation", "ours", TREE, "relevance = area share instead of yield", rank("lambdarank", target="share")),
}
OURS = "YieldRank (ours)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--protocol", required=True, choices=PROTOS)
    ap.add_argument("--only", nargs="*", help="subset of method names")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--tag", default="", help="output suffix, so extra method batches merge instead of overwrite")
    args = ap.parse_args()
    df = run.load()
    if args.quick:
        df = df[df.qid.isin(df.qid.drop_duplicates().sample(6000, random_state=SEED))].reset_index(drop=True)
    crops = sorted(df.crop_slug.unique())
    QX, Qy, Q = run.query_table(df, crops, True)
    cold = df.groupby("qid").lag1_pct.apply(lambda x: x.isna().any())
    names = args.only or list(METHODS)
    idx = lambda qs: df.index[df.qid.isin(qs)]
    rng = np.random.default_rng(SEED)  # consumed exactly as in run.py so calibration sets match the paper
    folds, perq = [], []
    for protocol in PROTOS:
        for f, (trq, teq, groups) in enumerate(run.folds(df, protocol)):
            a, b = next(GroupShuffleSplit(1, test_size=0.2, random_state=SEED + f).split(trq, groups=groups.loc[trq].values))
            iid_cal = rng.choice(trq[a], size=len(trq[b]), replace=False)
            if protocol != args.protocol or (args.quick and f >= 2):
                continue
            fit_i, te_i, ic_i = idx(np.setdiff1d(trq[a], iid_cal)), idx(teq), idx(iid_cal)
            for name in names:
                family, source, interp, note, maker = METHODS[name]
                t0 = time.time()
                score = maker(df, fit_i, crops, QX, Qy)
                train_s = time.time() - t0
                t0 = time.time()
                s_te = score(te_i)
                infer_ms = 1000 * (time.time() - t0) / len(teq)
                pq = run.per_query(df.loc[te_i], s_te)
                pq["cold"] = cold.reindex(pq.index).values
                s_ic = score(ic_i)
                T = run.fit_T(df.loc[ic_i, "qid"], s_ic, df.loc[ic_i, "best"].values)
                mk = lambda i, s: df.loc[i, ["qid", "best"]].assign(p=run.softmax_by_q(df.loc[i, "qid"], s, T))
                conf, _ = run.conformal(mk(ic_i, s_ic), mk(te_i, s_te))
                rec = dict(fold=f, method=name, family=family, source=source, interpretable=interp, note=note,
                           hit1=100 * pq["hit@1"].mean(), hit3=100 * pq["hit@3"].mean(), ndcg3=pq["ndcg@3"].mean(),
                           hit1_cold=100 * pq.loc[pq.cold, "hit@1"].mean(), hit1_warm=100 * pq.loc[~pq.cold, "hit@1"].mean(),
                           train_s=train_s, infer_ms=infer_ms,
                           conf_cov=100 * conf["LAC@0.9"]["coverage"], conf_size=conf["LAC@0.9"]["size"])
                folds.append(rec)
                perq.append(pq[["hit@1", "ndcg@3", "cold"]].assign(method=name, fold=f).reset_index())
                print(f"{args.protocol} f{f} {name:38s} Hit@1 {rec['hit1']:5.1f}%  Hit@3 {rec['hit3']:5.1f}%  NDCG@3 {rec['ndcg3']:.3f}  "
                      f"cold {rec['hit1_cold']:5.1f}%  cov90 {rec['conf_cov']:5.1f}% size {rec['conf_size']:.2f}  "
                      f"train {train_s:6.1f}s  infer {infer_ms:.3f} ms/q", flush=True)
    tag = f"{args.protocol}{'_quick' if args.quick else ''}{'_' + args.tag if args.tag else ''}"
    json.dump(folds, open(run.OUT / f"compare_{tag}.json", "w"), indent=1)
    pd.concat(perq, ignore_index=True).to_parquet(run.OUT / f"compare_q_{tag}.parquet")
    print("wrote", run.OUT / f"compare_{tag}.json")


if __name__ == "__main__":
    main()
