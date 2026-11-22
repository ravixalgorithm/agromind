# AgroMind — Research gap analysis

Goal: find a gap in published crop-recommendation work that is (i) real, (ii) testable with
our data in a day, and (iii) gives a measurable improvement. Numbered refs `[n]` match
[`LITERATURE.md`](LITERATURE.md) / `references.bib`. Refs marked `[Ex]` are new and listed in
§5 (BibTeX in [`paper/extra.bib`](../../paper/extra.bib)).

**How papers were checked (2026-11-22).** Candidates came from Firecrawl's paper index (arXiv,
PubMed/PMC) and Semantic Scholar. Every new entry was checked against Crossref (DOI) or the
arXiv API (`experiments/verify_refs.py`); title, authors, year and venue are copied from that
record. The "Data" and "Evaluation" columns come from the paper's full text (PMC / arXiv HTML)
where we could read it, otherwise from the abstract. "Not stated" means we could not find it,
not that the paper did not do it.

---

## 1. What recent papers do and how they evaluate (2019–2026)

### 1.1 Crop recommendation

| Ref | Paper (year) | Data | Method | Evaluation | Headline result |
|-----|--------------|------|--------|-----------|-----------------|
| [9] | Priyadharshini et al. (2021) | Soil, season, location (India) | ML classifiers | Not stated in abstract | No figure in abstract |
| [10] | Akkem et al. (2023) | Soil data | Stacking / ensemble-of-ensembles, Streamlit | Not stated in abstract | No single figure |
| [11] | Dey et al. (2024) | Kaggle crop set [31] | SVM, XGB, RF, k-NN, DT | Random split | XGB 99.09% precision |
| [12] | Elbasi et al. (2023) | Soil–climate (NPK + climate) | 15 classifiers | Random split | 99.59% (Bayes Net) |
| [13] | Musanase et al. (2023) | Rwanda NPK, pH, climate | Neural net + rules | Random split | 97% |
| [14] | Shams et al. (2024) XAI-CROP | Soil, crop history, weather | XAI-CROP vs GB/DT/RF/NB | Not stated in abstract | MSE 0.94 |
| [15] | Turgut et al. (2024) AgroXAI | IoT weather + soil | ML + LIME/SHAP/counterfactuals | Not stated in abstract | No figure in abstract |
| [E1] | Sam & D'Abreo (2025) | Kaggle APY-derived env. data + DES cost of cultivation + MSP; 19 crops, 15 states | RF, SVM | **10-fold CV vs time-series split** vs lag features | RF 99.96% (CV) → **78.55% (time split)** → 83.62% (lags) |
| [E2] | Sindhur et al. (2025) | Kaggle-style NPK/climate + Karnataka price series | RF suitability + LSTM price forecast | 20% random hold-out | RF 98.5%; price MAPE ≈5.8% |
| [E3] | Hasan et al. (2023) | Bangladesh district production, 1969–2021 | KNN-RF-Ridge ensemble regression → threshold | Random 80/20 | R² 0.90–0.99 |
| [E4] | Ahmed et al. (2025) | Kaggle 2,200 rows + FAO 28,242 rows | Stacking / voting of 18 classifiers | Random 80/20 + 10-fold CV | 99.56% (Kaggle), 85.6% (FAO) |
| [E5] | Afzal et al. (2025) | Kaggle 2,200 rows, 22 crops | RF+XGB ensemble (RFXG) | Random 80/20 + 10-fold CV | 98% |
| [E6] | Shastri et al. (2025) | Kaggle 2,200 rows, 22 crops | Supervised ML + XAI | Random 75/25 | 99.27% (GB) |
| [E7] | Singh & Sharma (2025) | Mixed public sources, 3,000 rows | Cloud "TCRM" | Train/test split (ratio not stated) + 5-fold CV | 94.0% (CV 97.67%) |
| [E8] | Mahesh & Soundrapandiyan (2026) | Agro-environmental factors, expert suitability scores | ECA-DE + CatBoost surrogate | Not stated in abstract | R² 0.9975 vs expert scores |
| [E9] | Latha & Kumaresan (2026) | 11 nutrient/climate features, 22 crops | MLP/XGB/TabTransformer + Krill Herd + XAI | Not stated in abstract | 0.99 accuracy |
| [E10] | Reddy N & Gopinath (2026) AgriOptNet | Soil texture images + nutrition | Deep Q-learning + light CNN | Not stated in abstract | 99.87% |
| [E11] | Pandey et al. (2026) AgroSense 2.0 | Kaggle NPK set + soil images + India soil raster (randomly paired, no shared geo id) | Cross-modal transformer | Stratified 80/10/10 | 99.3% (LightGBM tabular 99.1%) |
| [E12] | Piyar & Baulkani (2026) | Kaggle yield (~28k) + Kaggle crop set (2,200) | Spatio-temporal DL + XAI | Random 80/20 + 5-fold CV for tuning | 98.4% accuracy, yield R² 0.94 |

### 1.2 Yield prediction on location-indexed data (shows what honest splits do)

| Ref | Paper (year) | Data | Evaluation | Finding |
|-----|--------------|------|-----------|---------|
| [16] | De Clercq & Mahdi (2024) | 247 Indian rice districts, 20 yrs | Out-of-sample | R² ≤ 0.82 |
| [17] | Nikhil et al. (2024) | South Indian states | Not stated in abstract | Extra Trees R² 0.96 |
| [E13] | Alsaber et al. (2025) | DES pearl-millet yield + NASA POWER, 9 Rajasthan districts | Train/validation | Models that win on calibration lose on validation |
| [E14] | Zhang et al. (2026) | 3,204 rice records, 10 sites, 7 yrs, China | Random CV vs leave-year/site/site-year-out | R² 0.844 (random) → 0.359 (forward year) → 0.290 (leave-site) |
| [E15] | Baatz (2025) | Germany NUTS-3 yields | Spatial split vs temporally independent years | Strong test scores, large drop on unseen years; SHAP still looks credible |
| [E16] | Chakravarty (2025) | CropNet, 1,200+ US counties | Leave-one-region-out, year-ahead | Large, region-dependent OOD degradation |
| [E17] | Asif et al. (2026) | Punjab (Pakistan) Kaggle-derived table | Random vs leave-years-out | R² 0.994 → −0.20; table had 46 real observations duplicated ×9 |

### 1.3 Uncertainty / conformal prediction in agriculture

| Ref | Paper (year) | Task | Uncertainty method |
|-----|--------------|------|--------------------|
| [E18] | Melki et al. (2023) | Crop vs weed image classification | APS conformal sets; group-conditional (by pedo-climatic group) |
| [E19] | Melki et al. (2025) | Precision weeding | Conformal sets with spray decision rules, in- vs near-OOD |
| [E20] | Khan et al. (2026) | Nitrogen rate prescription | Conformal intervals → profit lower bound, abstention; group split |
| [20] | Niculescu-Mizil & Caruana (2005) | (general) | Tree-ensemble probabilities are miscalibrated |

### 1.4 Profit and water

| Ref | Paper (year) | Scope |
|-----|--------------|-------|
| [E1] | Sam & D'Abreo (2025) | MSP + DES cost of cultivation as classifier *inputs* |
| [E2] | Sindhur et al. (2025) | Re-rank RF top-3 by LSTM-forecast price |
| [E21] | Devineni et al. (2022) | Optimisation: shift procurement geography to arrest groundwater depletion and raise farm income |
| [E22] | Dangar & Mishra (2024) | Non-rice cropping patterns for groundwater sustainability (north India) |

---

## 2. Candidate gaps: confirmed or killed

### (a) No spatial / temporal generalisation test on real government data — **CONFIRMED (partly addressed)**

- 12 of the 18 recommendation papers in §1.1 train on the Kaggle crop set or similar
  location-free tables and report 97–99.9% under random splits or k-fold CV ([11], [12], [E2], [E4]–[E6], [E9], [E11], [E12]).
  The Kaggle set is augmented, perfectly balanced, and has no location or year [31].
- **The one exception:** Sam & D'Abreo [E1] use a time-series split on Indian data and
  RF drops from 99.96% to 78.55%. They do **not** hold out regions, and their environmental
  table is a Kaggle compilation, not joined climate reanalysis.
- Yield studies show the same drop under honest splits ([E14], [E15], [E16], [E17]), and
  Roberts et al. [18] / Meyer et al. [19] explain why.
- **No crop-recommendation paper we found evaluates on held-out *states*.** That is the gap.

### (b) Single-label classification; no ranking metrics; yield unused as the target — **CONFIRMED**

- Every recommender in §1.1 reports top-1 accuracy / precision / F1 (or regression error).
  None reports NDCG@k or top-k hit rate, although several output a top-3 list ([E2]).
- Labels are "the crop that was grown here" (Kaggle-style). Yield, the outcome a farmer
  cares about, is either unused or regressed per crop and thresholded ([E3], [E12]).
  Ranking crops *within a location by realised yield* is not done.

### (c) No calibrated uncertainty or prediction sets — **CONFIRMED**

- No crop-recommendation paper in §1.1 reports calibration, coverage, or set-valued output.
- Conformal prediction has reached agriculture only for weed images ([E18], [E19]) and
  nitrogen rates ([E20]); not for crop choice. [E18] also shows marginal coverage can fail
  for sub-groups, which matters when the test state was never seen.

### (d) Profit, risk, water ignored — **PARTLY KILLED**

- Profit is already used: MSP + cost of cultivation as features [E1], price-forecast re-ranking [E2].
- Water-aware crop choice is studied as optimisation ([E21], [E22]), not as ML recommendation.
- Doing this properly needs crop-wise MSP/CACP costs and CGWB block data joined per district-year.
  Not doable well by tomorrow, and the win would be hard to measure without a counterfactual.
  **Kept as future work / optional re-rank only.**

---

## 3. Chosen gaps and how we test them

**G1 (a + b): yield-grounded ranking evaluated out-of-region and out-of-time.**
On the DES district × season × year production table (1997-98 to 2022-23, CC4's
`backend/data/large/`), each query is a district-season-year; the candidates are the crops
actually grown there, and their relevance is realised yield percentile. We compare a
LambdaMART ranker with the literature's classifiers (NB, RF, XGBoost, MLP), plus naive
baselines, under **random**, **leave-states-out** and **leave-years-out** splits, reporting
NDCG@k and hit@k, mean ± std over folds, and a paired Wilcoxon test.

**G2 (c): conformal prediction sets for "which crop is best here?"**
Split-conformal sets (LAC [Sadinle et al.], APS [Romano et al.]) on top of every model.
We test whether the usual i.i.d. calibration holds its 90% coverage on unseen states, and
whether calibrating on *held-out states* (a group-exchangeable calibration set) fixes it.

Why these two: both are confirmed by the literature, both run on data we have today, and both
have a number that can move (NDCG/hit@k vs baselines; coverage vs the nominal level and set size).

**Decision recorded:** profit/water re-ranking is out of scope for the paper's claims.

---

## 4. Threats we already know about

- yield_pct is relative to the same crop's yield across all districts in that year. It answers
  "where is this crop comparatively good", which is the comparative-advantage view of choice,
  not absolute profit.
- Relevance is only observed for crops actually grown (selection bias): we rank among those.
- Soil comes from SoilGrids at district centroids (state medians where not yet fetched);
  climate from NASA POWER at the centroid.

---

## 5. New references (verified 2026-11-22)

- [E1] S. Sam, S. M. D'Abreo, "Crop recommendation with machine learning: leveraging environmental and economic factors for optimal crop selection," arXiv:2505.21201, 2025.
- [E2] N. M. Sindhur, P. C, N. Muchikel, "A hybrid machine learning framework for optimizing crop selection via agronomic and economic forecasting," arXiv:2507.08832, 2025.
- [E3] M. Hasan et al., "Ensemble machine learning-based recommendation system for effective prediction of suitable agricultural crop cultivation," *Front. Plant Sci.*, 14:1234555, 2023, doi:10.3389/fpls.2023.1234555.
- [E4] R. A. Ahmed et al., "High-precision crop recommendation system with stacking ensemble classifiers for optimizing agricultural productivity," *Sci. Rep.*, 15:43377, 2025, doi:10.1038/s41598-025-09640-5.
- [E5] H. Afzal et al., "Incorporating soil information with machine learning for crop recommendation to improve agricultural output," *Sci. Rep.*, 15:8560, 2025, doi:10.1038/s41598-025-88676-z.
- [E6] S. Shastri, S. Kumar, V. Mansotra, R. Salgotra, "Advancing crop recommendation system with supervised machine learning and explainable artificial intelligence," *Sci. Rep.*, 15:25498, 2025, doi:10.1038/s41598-025-07003-8.
- [E7] G. Singh, S. Sharma, "Enhancing precision agriculture through cloud based transformative crop recommendation model," *Sci. Rep.*, 15:9138, 2025, doi:10.1038/s41598-025-93417-3.
- [E8] P. Mahesh, R. Soundrapandiyan, "A crop recommendation using improved expert-guided constraint aware differential evolution and CatBoost surrogate learning," *Front. Plant Sci.*, 17:1884580, 2026, doi:10.3389/fpls.2026.1884580.
- [E9] P. Latha, P. Kumaresan, "Smart crop recommendation: fusing nutrient and climate data with Krill Herd Optimization and explainable AI," *Front. Artif. Intell.*, 9:1910196, 2026, doi:10.3389/frai.2026.1910196.
- [E10] L. Reddy N, M. P. Gopinath, "AgriOptNet: A hybrid optimization and lightweight deep learning framework for soil texture classification and crop recommendation based on nutrition," *PLOS One*, 21:e0350044, 2026, doi:10.1371/journal.pone.0350044.
- [E11] V. Pandey, R. Tewari, R. H. Laskar, "AgroSense 2.0: Cross-modal transformer fusion with geospatial raster integration and interpretable multi-task learning for precision crop recommendation," arXiv:2606.21892, 2026.
- [E12] N. Piyar S, Baulkani S, "An explainable spatio-temporal deep learning framework for crop yield prediction and recommendation," *Sci. Rep.*, 16:24662, 2026, doi:10.1038/s41598-026-54439-7.
- [E13] A. Alsaber et al., "Advancing pearl millet yield forecasting: Comparative analysis of individual and ensemble machine learning approaches over Rajasthan, India," *PLOS ONE*, 20:e0317602, 2025, doi:10.1371/journal.pone.0317602.
- [E14] J. Zhang et al., "Deployment-oriented evaluation of stage-specific information for rice yield prediction across years, sites and site-year environments in southern China," *Front. Plant Sci.*, 17:1915306, 2026, doi:10.3389/fpls.2026.1915306.
- [E15] R. Baatz, "Generalization and feature attribution in machine learning models for crop yield and anomaly prediction in Germany," arXiv:2512.15140, 2025.
- [E16] A. Chakravarty, "Out-of-distribution generalization in climate-aware yield prediction with Earth observation data," arXiv:2510.07350, 2025.
- [E17] A. Asif et al., "Crop yield prediction for Punjab, Pakistan: A tree-ensemble and leaf-health prototype, and what random validation hides," arXiv:2610.07059, 2026.
- [E18] P. Melki et al., "Group-conditional conformal prediction via quantile regression calibration for crop and weed classification," arXiv:2308.15094, 2023.
- [E19] P. Melki et al., "Uncertainty guarantees on automated precision weeding using conformal prediction," arXiv:2501.07185, 2025.
- [E20] A. Khan et al., "Smart sensing-enabled risk-aware nitrogen prescriptions via conformal profit bounds for precision agriculture," *Front. Plant Sci.*, 17:1821003, 2026, doi:10.3389/fpls.2026.1821003.
- [E21] N. Devineni, S. Perveen, U. Lall, "Solving groundwater depletion in India while achieving food security," *Nat. Commun.*, 13:3374, 2022, doi:10.1038/s41467-022-31122-9.
- [E22] S. Dangar, V. Mishra, "Groundwater sustainability in India through nonrice-dominated cropping pattern," *PNAS Nexus*, 3:pgae378, 2024, doi:10.1093/pnasnexus/pgae378.
- Methods: A. N. Angelopoulos, S. Bates, arXiv:2107.07511 (2021); M. Sadinle, J. Lei, L. Wasserman, *JASA* 114:223–234 (2019), doi:10.1080/01621459.2017.1395341; Y. Romano, M. Sesia, E. J. Candès, arXiv:2006.02544 (NeurIPS 2020); G. Ke et al., LightGBM (NeurIPS 2017) [already in references.bib as `ke2017`].

---

## 6. Outcome (see `paper/main.pdf`; canonical numbers in `docs/research/results.json` → `v4.numbers`)

- **G1 confirmed, measurable win.** On held-out states the literature classifiers lose up to ~20 points of Hit@1 compared with random splits (`ClfDropMax`) and end up below a last-year persistence rule. YieldRank is about +16 points over the best classifier (`GainHitLSO`) but only slightly above persistence overall. Its clear gain over persistence is on cold-start queries (`OursHitColdLSO` vs `PersHitColdLSO`).
- **G2: honest partial result.** Marginal 90% coverage holds for YieldRank on unseen states. Classifiers need held-out-state calibration to reach it. Per-state coverage still fails in a few states (`StatesBelowIID`); Mondrian-by-#candidates calibration narrows this but does not close it.
- **New finding:** climate and soil features alone barely transfer across states. District-level soil *raises* random-split scores while *lowering* out-of-state ones (Meyer et al. [19]).
