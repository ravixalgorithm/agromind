# Recent work (2024–2026) on crop recommendation

Fifteen crop-recommendation / crop-selection papers published 2024–2026, read in full text, compared with AgroMind. Machine-readable version: [`related_work.json`](related_work.json). Reference numbers `[n]` match [`LITERATURE.md`](LITERATURE.md) and [`references.bib`](references.bib).

**How this was checked (2026-11-23).** Every DOI was looked up in Crossref and every arXiv id in the arXiv API; titles, authors and venues come from those records. Each paper was read in full from the publisher HTML (nature.com, MDPI, Frontiers, PLOS, Springer), Europe PMC, or arXiv. Every number, hyper-parameter and protocol detail below is quoted from the paper, with its section or table, and each quote was matched against the saved full text. Where a paper does not state something, we say so. Considered but left out: Shams et al. 2024 [14] (full text behind a bot wall), Turgut et al. 2024 [15] (no text available), Sindhur et al. 2025 (arXiv:2507.08832; no dataset size, and its ranking compares price per kg across crops).

## 1. Comparison table

Gap codes: **K** KAGGLE_ONLY (only the Kaggle 2,200-row set) · **R** RANDOM_SPLIT_ONLY (no spatial/temporal hold-out) · **Y** NO_YIELD (never checks the crop's realised yield) · **U** NO_UNCERTAINTY (no prediction sets or per-prediction confidence) · **S** SINGLE_REGION · **T** NO_STAT_TEST · **L** LEAKAGE (information leaks between train and test, shown by the paper's own text) · **P** NOT_REPRODUCIBLE (no code or no data released).

| Ref | Paper | Venue | Data (rows) | Method | Reported | Protocol | Gaps |
|-----|-------|-------|-------------|--------|----------|----------|------|
| [11] | Dey et al. (2024) | Heliyon 10(3), e25112 | Kaggle crop set (paper: 2,100 points, 11 agricultural + 10 horticultural crops; N, P, K, pH, rainfall, temperature, humidity) (2,100) | XGBoost, SVM, RF, KNN, DT; separate models for agricultural, horticultural and combined crops | 99.09% (XGBoost); 99.3% horticultural, 98.51% combined | single random 70/30 split; under-sampling (order vs split not stated) | K R Y U T P |
| [39] | Senapaty et al. (2024) | Agriculture (MDPI) 14(8), 1256 | own records from agriculture offices + farmer interviews, three Odisha districts (Koraput, Gajapati, Rayagada) (1,480) | 13 classifiers (LR, DT, KNN, SVC, RF, GB, Bagging, XGB, AdaBoost, CatBoost, HGB, SGD, MNB) before and after SMOTE | 1.0 (SGD classifier after SMOTE; SVC 1.0 before SMOTE) | single random 80/20 split after SMOTE | R U S T P |
| [37] | Sam & D'Abreo (2025) | arXiv:2505.21201 | Kaggle crop-yield table (vihith12) merged with DES cost of cultivation and MSP; 19 crops, 15 states, 2011-14 (12,749) | Random Forest and SVM in R; 10-fold CV vs chronological split vs lag features (lags: Year 5, Season 7) | RF 99.96% (10-fold CV) -> 78.55% (time-series split) -> 83.62% (lag variables) | random 10-fold CV and an 80/20 chronological split; no spatial hold-out | Y U T P |
| [40] | Ahmed et al. (2025) | Scientific Reports 15, 43377 | Kaggle crop set (2,200 rows, 22 crops); second set FAO (28,242 rows) (2,200) | two stacking ensembles (KNN+RF+NB -> LR; KNN+Bagging+NB -> LR) and a hard-voting ensemble (LR, XGB, RF, DT, GNB); PCA+MI+RFE feature fusion | up to 99.56% (abstract); Table 2: 99.54% second stacking, 99.09% voting; FAO set 85.6% | random 80/20 split, plus 10-fold CV | K R Y U T P |
| [41] | Afzal et al. (2025) | Scientific Reports 15, 8560 | Kaggle crop set, 2,200 rows, 22 crops (authors attribute it to Islamabad stations) (2,200) | RFXG: hard voting of RF and XGBoost; baselines ETC, MLP, DT, LR | 98% (RFXG); RF alone 96% precision/recall/F1 | random 80/20 split (sklearn train_test_split) + 10-fold CV | K R Y U T P |
| [42] | Shastri et al. (2025) | Scientific Reports 15, 25498 | Kaggle crop set (atharvaingle), 2,200 rows, 22 crops (2,200) | 10 classifiers (GB, KNN, NN, LDA, DT, RF, NB, SVM, LR, QDA) + LIME | 99.27% (Gradient Boosting) | single 75/25 split | K R Y U T P |
| [43] | Singh & Sharma (2025) | Scientific Reports 15, 9138 | unnamed table, 3,000 rows x 8 columns (N, P, K, temperature, humidity, pH, rainfall, crop) (3,000) | TCRM: RF + Extra Trees fused with a Keras network (dense, normalisation, multi-head attention) | 94% (5-fold CV 97.67%) | train/test split (ratio not stated) + 5-fold CV; parameters tuned on all folds | R Y U T L P |
| [44] | Gunasekaran et al. (2025) | Sensors (MDPI) 25(19), 6243 | Kaggle crop set (atharvaingle), 2,200 rows, 22 crops (2,200) | stacking (RF, Extra Trees, XGBoost -> LR) tuned by GridSearch/RandomSearch/Optuna, plus a physics-informed NN penalising implausible temperature/pH | 0.9950 +/- 0.0017 | 80/20 split + stratified 5-fold CV | K R Y U T P |
| [45] | Bakr et al. (2025) | Information (MDPI) 16(8), 632 | Kaggle crop set, 2,200 rows, 22 crops (2,200) | ML (KNN, RF, DT, SVM, NB, MLP), DL (LSTM, BiLSTM, CNN-LSTM) and LLMs (GPT-2, BERT) on rows written as sentences | 99.55% (GPT-2); NB 99.54%; CNN-LSTM 97.95% | single random 80/20 split | K R Y U T P |
| [46] | Piyar S & Baulkani S (2026) | Scientific Reports 16, 24662 | Kaggle crop set (2,200 rows) + Kaggle FAO yield table (1990-2016, multi-country), merged (2,200) | PO-STX-GTNET (conv + Transformer encoder + BiGRU + attention, tuned by a PantheraCobra optimiser); HK-ELM-A for yield | 98.4% (ROC-AUC 0.991); yield R2 0.94 | random 80/20 split; 5-fold CV for tuning; preprocessing and feature selection on the merged data first | K R Y U L P |
| [47] | Mahesh & Soundrapandiyan (2026) | Frontiers in Plant Science 17, 1884580 | Mendeley Tamil Nadu district crop-suitability table (3,437 rows, 37 districts, 105 crops), expanded to 381,507 scenario rows (3,437) | expert suitability score optimised by improved differential evolution; CatBoost regressor as surrogate | 0.9975 | random 80/20 split of generated rows + 5-fold CV | R Y U S T P |
| [48] | Latha & Kumaresan (2026) | Frontiers in Artificial Intelligence 9, 1910196 | Kaggle 'crop recommender dataset with soil nutrients', 2,200 rows, 11 features (adds Cu, Fe, Mg, S) (2,200) | MLP, XGBoost, TabTransformer; Krill Herd Optimisation for tuning; SHAP and LIME | 99% (TabTransformer); MLP 96.49%, XGBoost 95.61% | single stratified 80/20 split after imputation, scaling and feature selection | K R Y U T L P |
| [49] | Reddy N & Gopinath (2026) | PLOS One 21(7), e0350044 | USDA soil-texture raster (250 m) fused with the Kaggle soil-nutrient crop set (not stated) | SailDragon feature selection + SoilCropNet light CNN + modified deep Q-learning (MDQL-RA) | 99.87% headline (random 5-fold); 98.24% under 250 m spatial-block CV | random 5-fold (headline), nested, spatial-block and leave-location-out CV | U L |
| [50] | Sharma (2026) | Discover Plants 3, 317 | 'Kaggle Crop Recommendation Dataset' described as 10,000 South-Asian records, 36 features, 10 crops (does not match the cited 2,200-row set) (10,000) | RF, GB, XGBoost, LightGBM, CatBoost, LR, SVM; RFE to 10 features; SMOTE inside folds; SHAP | 79.8% [79.0-80.6%] (RF); macro-F1 0.474 | stratified 80/20 + 5- and 10-fold stratified CV; Friedman + Nadeau-Bengio corrected t-tests | R Y U |
| [51] | Pandey et al. (2026) | arXiv:2606.21892 | Kaggle-style 7-feature, 22-crop table + soil images + India soil raster (not geo-paired) (not stated) | EfficientNet-B0 + tabular encoder fused by 8-head cross-attention, multi-task (crop + soil); LightGBM baseline | 99.3% (LightGBM tabular-only 99.1%) | stratified random 80/10/10; 5 seeds, paired t-test | K R Y U P |

**Gap counts (of 15):** KAGGLE_ONLY 9, RANDOM_SPLIT_ONLY 13, NO_YIELD 13, NO_UNCERTAINTY 15, SINGLE_REGION 2, NO_STAT_TEST 11, LEAKAGE 4, NOT_REPRODUCIBLE 13.

## 2. What the recent literature shows

- **The benchmark is saturated.** 9 of 15 papers report their headline on the Kaggle 2,200-row table (or a copy of it), where scores cluster at 98–99.6% whatever the model: a 2-tree Random Forest [41], Naive Bayes and GPT-2 [45], a cross-modal transformer [51]. A plain Random Forest scores 99.5% on it in our own run (`results.json` → `v4.numbers.KaggleRF`).
- **Almost nobody tests on unseen places or years.** 13 of 15 use only random splits. Sam & D'Abreo [37] are the only ones with a time-ordered test (RF 99.96% → 78.55%), and every state is still in both train and test. Reddy N & Gopinath [49] add spatial-block CV, but over 250 m blocks, not unseen regions.
- **Yield is rarely the target.** 13 of 15 never check whether the recommended crop actually yields well. The exceptions use production to build the label [39] or a historical-yield reward [49].
- **No paper gives prediction sets.** 15 of 15 report no per-prediction uncertainty. [49] reports an ECE for its logging policy only; [50] gives confidence intervals on metrics, not on recommendations.
- **Leakage and reproducibility.** 4 papers fit preprocessing, feature selection or tuning on data that later serves as test data, in their own words ([43], [46], [48], [49]); 13 release no code, and several keep the data 'on request'. Only [49] links code.

**Where AgroMind stands.** Our v4 evaluation (`results.json` → `v4.numbers`) holds out whole Indian states on 259,181 official DES records (43,443 district–season–years, 36 states):
- The classifiers these papers use drop sharply: Random Forest 57.5% → 36.3% and XGBoost 57.5% → 38.2% hit@1 (random split → unseen states; keys `RFHitR`, `RFHitLSO`, `XGBHitR`, `XGBHitLSO`).
- YieldRank reaches 55.6% on unseen states, +17.0 points over the best classifier (MLP, 38.5%), but only slightly above repeating last year's crop (54.5%). Its clear gain is on cold-start cases (39.7% of queries): 47.2% vs 42.6%.
- 90% conformal shortlists cover 90.1% on unseen states with 2.87 crops on average, falling to 74.9% in the worst state (Telangana).
- Hit@1 here means the top-ranked crop is *the* best-yielding one in that district-season-year; it is a different and harder target than the 22-class accuracy the papers report, so the numbers are not directly comparable.

## 3. Methods to reimplement

Chosen because each paper states enough configuration to rebuild the model; fidelity is labelled. The suggestion is to run each under our random, leave-states-out and leave-years-out protocols.

| Ref | Name | Fidelity | Exact configuration (from the paper) | Where |
|-----|------|----------|--------------------------------------|-------|
| [11] | Dey2024-XGB (+SVM/RF/KNN/DT) | full | `XGBClassifier(learning_rate=0.1, max_depth=17, n_estimators=200, subsample=0.5, gamma=0, random_state=50); SVC(C=5, gamma=0.1, kernel='rbf'); RandomForestClassifier(max_depth=6, max_features=5, min_samples_split=4, n_estimators=15, random_state=0); KNeighborsClassifier(n_neighbors=3, metric='minkowski'); DecisionTreeClassifier(max_features='sqrt' (paper: 'auto'), ccp_alpha=0.001, criterion='entropy', max_depth=5, random_state=2)` | Sec 2.2.1-2.2.5 |
| [40] | Ahmed2025-Stack2 and -Voting | architecture only (library defaults) | `StackingClassifier([KNeighborsClassifier(), BaggingClassifier(), GaussianNB()], final_estimator=LogisticRegression()); VotingClassifier([LogisticRegression(), XGBClassifier(), RandomForestClassifier(), DecisionTreeClassifier(), GaussianNB()], voting='hard')` | Experimental study; Figs 4-6 |
| [41] | Afzal2025-RFXG | full (seeds for split and RF not stated) | `VotingClassifier([('rf', RandomForestClassifier(max_depth=9, n_estimators=2, min_samples_split=9)), ('xgb', XGBClassifier(random_state=0, n_estimators=6, max_depth=2, learning_rate=0.1))], voting='hard')` | Table 4; Phase 8 |
| [44] | Gunasekaran2025-Stack (Optuna) | full except meta-learner settings and PINN branch | `StackingClassifier([('rf', RandomForestClassifier(max_depth=16, min_samples_split=10, n_estimators=116)), ('et', ExtraTreesClassifier(max_depth=16, min_samples_split=5, n_estimators=441)), ('xgb', XGBClassifier(learning_rate=0.0640, max_depth=7, n_estimators=465))], final_estimator=LogisticRegression(C=829.97, penalty='l2'), cv=StratifiedKFold(5)); MinMaxScaler; random_state=42` | Table 3 (Optuna column); Sec 3.3 |
| [45] | Bakr2025-CNN-LSTM | partial (training settings only; architecture ours) | `CNN-LSTM classifier, Adam, batch_size=8, epochs=50; layer sizes not stated in the paper` | Sec 4.2 |
| [47] | Mahesh2026-CatBoost config | config only (paper task is regression of an expert score) | `CatBoostClassifier/Ranker(iterations=300, depth=6, learning_rate=0.05)` | Table 3 |

Not reimplementable from the text: [43] (only hyper-parameter ranges), [46] (only ranges; preprocessing before split), [48] (no values), [49] (values only in image tables; code at github.com/phd-latha/soil-name-and-crop-recommendation), [37], [39], [42], [50] (model settings not stated), [51] (settings stated, but it needs soil images paired with each row, which our data does not have).

## 4. Per-paper notes

### [11] Machine learning based recommendation of agricultural and horticultural crop farming in India under the regime of NPK, soil pH and three climatic variables (2024)

*Biplob Dey, Jannatul Ferdous, Romel Ahmed.* Heliyon 10(3), e25112. https://doi.org/10.1016/j.heliyon.2024.e25112 — read from Europe PMC full text PMC10844259.

- **Data:** Kaggle crop set (paper: 2,100 points, 11 agricultural + 10 horticultural crops; N, P, K, pH, rainfall, temperature, humidity); rows: 2100; India: yes (India (no state/district)).
- **Method:** XGBoost, SVM, RF, KNN, DT; separate models for agricultural, horticultural and combined crops. Quote: “the learning rate was set to 0.1, max depth to 17, n estimators to 200, subsample rate was set to 0.5, gamma value was set to 0, and the seed was set to 50 (Sec 2.2.2)”
- **Reported:** test accuracy (agricultural crops) = 99.09% (XGBoost); 99.3% horticultural, 98.51% combined. Quote: “XGBoost demonstrated the highest test accuracy of 99.09 % and KNN demonstrated the lowest test accuracy of 94.45 % for agricultural crops. (Sec 3.2, Table 1)”
- **Protocol:** single random 70/30 split; under-sampling (order vs split not stated). Quote: “The training dataset consisted of 70 % of the available data, while the remaining 30 % was reserved for testing purposes. (Sec 2.3)”
- **Code/data:** Data will be made available on request.
- **Gaps:** KAGGLE_ONLY, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** One random split of the Kaggle table with no location or year, so 99% says nothing about a new state. What we do instead: on the Kaggle 2,200-row set a plain Random Forest already scores 99.5% on a random split (v4.numbers KaggleRF); our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [39] A Decision Support System for Crop Recommendation Using Machine Learning Classification Algorithms (2024)

*Murali Krishna Senapaty, Abhishek Ray, Neelamadhab Padhy.* Agriculture (MDPI) 14(8), 1256. https://doi.org/10.3390/agriculture14081256 — read from MDPI HTML.

- **Data:** own records from agriculture offices + farmer interviews, three Odisha districts (Koraput, Gajapati, Rayagada); rows: 1480; India: yes (Odisha (3 districts)).
- **Method:** 13 classifiers (LR, DT, KNN, SVC, RF, GB, Bagging, XGB, AdaBoost, CatBoost, HGB, SGD, MNB) before and after SMOTE. Quote: “we have applied 13 different methods such as logistic regression, decision tree, K-Neighbors, SVC, random forest, Gradient Boosting, bagging tree, XGB Classifier, Ada Boost Classifier, Cat Boost, HGB, SGDC, and MNB. (Sec 3.17.2) -- no hyper-parameters stated”
- **Reported:** test accuracy = 1.0 (SGD classifier after SMOTE; SVC 1.0 before SMOTE). Quote: “after the SMOTE ... the accuracy of the SVC is reduced to 0.74 and XGBoost to 0.97, and the SGDC is improved to 1.0. (Conclusion; Tables 3-6)”
- **Protocol:** single random 80/20 split after SMOTE. Quote: “we trained for 80% of the dataset using these classifiers and tested for 20% of the data.”
- **Code/data:** available from the corresponding author upon reasonable request
- **Gaps:** SINGLE_REGION, RANDOM_SPLIT_ONLY, NO_UNCERTAINTY, NO_STAT_TEST, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** Real Indian records, but three districts, one random split, and accuracy of 1.0 that cannot be checked because data and settings are not public. What we do instead: our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [37] Crop recommendation with machine learning: leveraging environmental and economic factors for optimal crop selection (2025)

*Steven Sam, Silima Marshal D'Abreo.* arXiv:2505.21201. https://arxiv.org/abs/2505.21201 — read from arXiv PDF.

- **Data:** Kaggle crop-yield table (vihith12) merged with DES cost of cultivation and MSP; 19 crops, 15 states, 2011-14; rows: 12749; India: yes (15 Indian states).
- **Method:** Random Forest and SVM in R; 10-fold CV vs chronological split vs lag features (lags: Year 5, Season 7). Quote: “the number of lags for the variable Year was set to 5 while the number of lags for the variable Season was set to 7 (Sec 3.2.3) -- RF/SVM settings not stated”
- **Reported:** accuracy = RF 99.96% (10-fold CV) -> 78.55% (time-series split) -> 83.62% (lag variables). Quote: “10-fold cross validation approach produced exceptionally high accuracy (RF: 99.96%, SVM: 94.71%) ... reduces the model performance (RF: 78.55%, SVM: 71.18%) in the Time-series Split approach (Abstract)”
- **Protocol:** random 10-fold CV and an 80/20 chronological split; no spatial hold-out. Quote: “the developed models were trained using the data from past years (2011-14) and the test data mostly included instances from the year 2014.”
- **Code/data:** data from Kaggle, DES and Farmer's Portal (links given); no code
- **Gaps:** NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** The only paper with a time-ordered test, but every state is in both train and test and yield was dropped as a variable. What we do instead: our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [40] High-precision crop recommendation system with stacking ensemble classifiers for optimizing agricultural productivity (2025)

*Rania A. Ahmed, Walid El-Shafai, Zeinab A. Ahmed, El-Sayed M. El-Rabaie, Fathi E. Abd El-Samie.* Scientific Reports 15, 43377. https://doi.org/10.1038/s41598-025-09640-5 — read from nature.com HTML + table pages.

- **Data:** Kaggle crop set (2,200 rows, 22 crops); second set FAO (28,242 rows); rows: 2200; India: no (none (Kaggle); FAO multi-country).
- **Method:** two stacking ensembles (KNN+RF+NB -> LR; KNN+Bagging+NB -> LR) and a hard-voting ensemble (LR, XGB, RF, DT, GNB); PCA+MI+RFE feature fusion. Quote: “three foundational models, KNN, Bagging, and NB, are combined at the primary level. Similarly, the LR model is employed at the second level (Experimental study) -- base-learner hyper-parameters not stated”
- **Reported:** test accuracy (Kaggle set) = up to 99.56% (abstract); Table 2: 99.54% second stacking, 99.09% voting; FAO set 85.6%. Quote: “the voting ensemble classifier proved to be the most effective, when applied to the first small dataset, achieving an impressive accuracy up to 99.56%. (Abstract)”
- **Protocol:** random 80/20 split, plus 10-fold CV. Quote: “allocating 80% of the dataset for training and the remaining 20% for testing.”
- **Code/data:** All data are available upon request from the corresponding author.
- **Gaps:** KAGGLE_ONLY, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** Abstract, text and Table 2 give three different headline accuracies (99.56 / 99.53 / 99.09%) for the same Kaggle task. What we do instead: on the Kaggle 2,200-row set a plain Random Forest already scores 99.5% on a random split (v4.numbers KaggleRF); our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [41] Incorporating soil information with machine learning for crop recommendation to improve agricultural output (2025)

*Hadeeqa Afzal, Madiha Amjad, Ali Raza, Kashif Munir, Santos Gracia Villar, Luis Alonso Dzul Lopez, Imran Ashraf.* Scientific Reports 15, 8560. https://doi.org/10.1038/s41598-025-88676-z — read from nature.com HTML + Table 4 page.

- **Data:** Kaggle crop set, 2,200 rows, 22 crops (authors attribute it to Islamabad stations); rows: 2200; India: no (Pakistan (authors' attribution)).
- **Method:** RFXG: hard voting of RF and XGBoost; baselines ETC, MLP, DT, LR. Quote: “RF | max_depth=9, n_estimators=2, min_samples_split=9 | ... | XGB | random_state=0, n_estimators=6, max_depth=2, learning_rate=0.1 (Table 4); hard-voting (Phase 8)”
- **Reported:** test accuracy = 98% (RFXG); RF alone 96% precision/recall/F1. Quote: “RFXG concept achieves 98% accuracy, precision, recall, and F1 scoring.”
- **Protocol:** random 80/20 split (sklearn train_test_split) + 10-fold CV. Quote: “The data is divided into 2 segments for testing and training using the train-test-split function of the sklearn library in Python, with an 80:20 ratio.”
- **Code/data:** The datasets can be requested from Hadeeqa Afzal.
- **Gaps:** KAGGLE_ONLY, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** A Random Forest with only 2 trees already reaches 96% precision, recall and F1 ('RF achieves 96% precision, 96% recall, and 96% F1'), which shows how easy the Kaggle task is. What we do instead: on the Kaggle 2,200-row set a plain Random Forest already scores 99.5% on a random split (v4.numbers KaggleRF); our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [42] Advancing crop recommendation system with supervised machine learning and explainable artificial intelligence (2025)

*Sourabh Shastri, Sachin Kumar, Vibhakar Mansotra, Rohit Salgotra.* Scientific Reports 15, 25498. https://doi.org/10.1038/s41598-025-07003-8 — read from nature.com HTML + table pages.

- **Data:** Kaggle crop set (atharvaingle), 2,200 rows, 22 crops; rows: 2200; India: no (none).
- **Method:** 10 classifiers (GB, KNN, NN, LDA, DT, RF, NB, SVM, LR, QDA) + LIME. Quote: “Several supervised ML algorithms are trained on the training set ... Gradient Boosting (GB), K-Nearest Neighbors (KNN), Neural Network (NN) ... -- no hyper-parameters stated”
- **Reported:** test accuracy = 99.27% (Gradient Boosting). Quote: “Gradient Boosting, with a testing accuracy of 99.27% and a training accuracy of 100%, performs the best out of these ten classifiers.”
- **Protocol:** single 75/25 split. Quote: “a 75-25% split of the dataset is made into training and test sets, yielding 1,650 rows for training and 550 rows for testing.”
- **Code/data:** public Kaggle dataset; no code
- **Gaps:** KAGGLE_ONLY, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** Single 75/25 split with no hyper-parameters, seed or code; four models tie at 0.99. What we do instead: on the Kaggle 2,200-row set a plain Random Forest already scores 99.5% on a random split (v4.numbers KaggleRF); our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [43] Enhancing precision agriculture through cloud based transformative crop recommendation model (2025)

*Gurpreet Singh, Sandeep Sharma.* Scientific Reports 15, 9138. https://doi.org/10.1038/s41598-025-93417-3 — read from nature.com HTML.

- **Data:** unnamed table, 3,000 rows x 8 columns (N, P, K, temperature, humidity, pH, rainfall, crop); rows: 3000; India: yes (Punjab framing; data source not named).
- **Method:** TCRM: RF + Extra Trees fused with a Keras network (dense, normalisation, multi-head attention). Quote: “the number of estimators (trees) in a model is commonly between 100 and 500 ... In attention-based models, you can mention the number of heads, e.g., 4 or 8. -- only ranges, final values not stated”
- **Reported:** test accuracy = 94% (5-fold CV 97.67%). Quote: “The proposed transformative crop recommendation model (TCRM) achieved the highest accuracy among all compared classifiers, reaching an accuracy rate of 94%.”
- **Protocol:** train/test split (ratio not stated) + 5-fold CV; parameters tuned on all folds. Quote: “All the parameters are tuned using all the folds of TCRM, which gets better performance and best accuracy for our model.”
- **Code/data:** available from the corresponding author on reasonable request
- **Gaps:** RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, LEAKAGE, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** Parameters are tuned on the same folds the CV score is reported on, and the AdaBoost baseline at 11.5% looks broken. What we do instead: our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [44] Physics-Aware Ensemble Learning for Superior Crop Recommendation in Smart Agriculture (2025)

*Hemalatha Gunasekaran, Krishnamoorthi Ramalakshmi, Saswati Debnath, Deepa Kanmani Swaminathan.* Sensors (MDPI) 25(19), 6243. https://doi.org/10.3390/s25196243 — read from MDPI HTML (Table 3 via publisher page).

- **Data:** Kaggle crop set (atharvaingle), 2,200 rows, 22 crops; rows: 2200; India: no (none (authors in India)).
- **Method:** stacking (RF, Extra Trees, XGBoost -> LR) tuned by GridSearch/RandomSearch/Optuna, plus a physics-informed NN penalising implausible temperature/pH. Quote: “Table 3 (Optuna): RF max_depth: 16, min_samples_split: 10, n_estimators: 116 | Extra Tree max_depth: 16, min_samples_split: 5, n_estimators: 441 | XGBoost learning_rate: 0.0640, max_depth: 7, n_estimators: 465 | LR C: 829.97, penalty: l2; Sec 3.3: fixed random seed (42), 5-fold stratified CV”
- **Reported:** accuracy (5-fold stratified CV) = 0.9950 +/- 0.0017. Quote: “achieving an accuracy of 0.9950 ± 0.0017, precision of 0.9952 ± 0.0016, and recall of 0.9950 ± 0.0017 across five-fold cross-validation (Sec 6)”
- **Protocol:** 80/20 split + stratified 5-fold CV. Quote: “The preprocessed data is then divided into training and testing datasets of 80% and 20%, respectively ... we then used 5-fold stratified cross-validation. (Sec 3.3)”
- **Code/data:** public Kaggle dataset; no code
- **Gaps:** KAGGLE_ONLY, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** Best-documented Kaggle stack, but the physics penalty uses each crop's ideal temperature and pH, which is close to the label itself. What we do instead: on the Kaggle 2,200-row set a plain Random Forest already scores 99.5% on a random split (v4.numbers KaggleRF); our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [45] Evaluation of Learning-Based Models for Crop Recommendation in Smart Agriculture (2025)

*Muhammad Abu Bakr, Ahmad Jaffar Khan, Sultan Daud Khan, Mohammad Haseeb Zafar, Mohib Ullah, Habib Ullah.* Information (MDPI) 16(8), 632. https://doi.org/10.3390/info16080632 — read from MDPI HTML.

- **Data:** Kaggle crop set, 2,200 rows, 22 crops; rows: 2200; India: no (none).
- **Method:** ML (KNN, RF, DT, SVM, NB, MLP), DL (LSTM, BiLSTM, CNN-LSTM) and LLMs (GPT-2, BERT) on rows written as sentences. Quote: “The batch size and epoch were 8 and 50, respectively, with Adam as the training optimizer. (Sec 4.2) -- layer sizes not stated”
- **Reported:** test accuracy = 99.55% (GPT-2); NB 99.54%; CNN-LSTM 97.95%. Quote: “GPT-2 output 99.55% accuracy, 99.58% precision, 99.55% recall, and a 99.57% F1-score”
- **Protocol:** single random 80/20 split. Quote: “During experimentation, at random, 80% and 20% of the dataset were separated into the training and test sets.”
- **Code/data:** public Kaggle dataset; no code
- **Gaps:** KAGGLE_ONLY, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** A fine-tuned GPT-2 and Naive Bayes tie at 99.5%, so the benchmark cannot separate methods. What we do instead: on the Kaggle 2,200-row set a plain Random Forest already scores 99.5% on a random split (v4.numbers KaggleRF); our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [46] An explainable spatio-temporal deep learning framework for crop yield prediction and recommendation (2026)

*Nifasath Piyar S, Baulkani S.* Scientific Reports 16, 24662. https://doi.org/10.1038/s41598-026-54439-7 — read from nature.com HTML.

- **Data:** Kaggle crop set (2,200 rows) + Kaggle FAO yield table (1990-2016, multi-country), merged; rows: 2200; India: no (global / none).
- **Method:** PO-STX-GTNET (conv + Transformer encoder + BiGRU + attention, tuned by a PantheraCobra optimiser); HK-ELM-A for yield. Quote: “trained using the Adam optimizer with an initial learning rate of 0.001 ... batch sizes ranging from 32 to 128 ... epochs varies between 50 and 200 -- final values not stated”
- **Reported:** test accuracy (recommendation) = 98.4% (ROC-AUC 0.991); yield R2 0.94. Quote: “It achieves the highest accuracy of 98.4%, with precision, recall, and F1-score above 97%, alongside an ROC-AUC of 0.991”
- **Protocol:** random 80/20 split; 5-fold CV for tuning; preprocessing and feature selection on the merged data first. Quote: “After preprocessing, the datasets are merged into a unified structured feature matrix used for feature selection and subsequent modeling stages.”
- **Code/data:** data on Kaggle (links given); no code statement
- **Gaps:** KAGGLE_ONLY, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, LEAKAGE, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** Two Kaggle tables with no shared key are merged, and scaling and feature selection run before the split; yield enters only as a predicted input. What we do instead: on the Kaggle 2,200-row set a plain Random Forest already scores 99.5% on a random split (v4.numbers KaggleRF); our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [47] A crop recommendation using improved expert-guided constraint aware differential evolution and CatBoost surrogate learning (2026)

*Pavithra Mahesh, Rajkumar Soundrapandiyan.* Frontiers in Plant Science 17, 1884580. https://doi.org/10.3389/fpls.2026.1884580 — read from frontiersin.org HTML.

- **Data:** Mendeley Tamil Nadu district crop-suitability table (3,437 rows, 37 districts, 105 crops), expanded to 381,507 scenario rows; rows: 3437; India: yes (Tamil Nadu).
- **Method:** expert suitability score optimised by improved differential evolution; CatBoost regressor as surrogate. Quote: “| CatBoost iterations | 300 | CatBoost tree depth | 6 | CatBoost learning rate | 0.05 | (Table 3)”
- **Reported:** R2 of surrogate vs expert score = 0.9975. Quote: “coefficient of determination (R 2) = 0.9975, Mean Absolute Error (MAE) = 0.0043, and Root Mean Square Error (RMSE) = 0.0056”
- **Protocol:** random 80/20 split of generated rows + 5-fold CV. Quote: “The created surrogate dataset was divided in the ratio of 80:20 for training and testing purposes”
- **Code/data:** data on Mendeley (link given); no code
- **Gaps:** SINGLE_REGION, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** The model imitates a hand-made scoring formula ('trained to mimic the deterministic expert-defined suitability scoring function'), so R2 0.9975 is fidelity to a formula, not to farm outcomes. What we do instead: our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [48] Smart crop recommendation: fusing nutrient and climate data with Krill Herd Optimization and explainable AI (2026)

*P. Latha, P. Kumaresan.* Frontiers in Artificial Intelligence 9, 1910196. https://doi.org/10.3389/frai.2026.1910196 — read from frontiersin.org HTML.

- **Data:** Kaggle 'crop recommender dataset with soil nutrients', 2,200 rows, 11 features (adds Cu, Fe, Mg, S); rows: 2200; India: no (not stated).
- **Method:** MLP, XGBoost, TabTransformer; Krill Herd Optimisation for tuning; SHAP and LIME. Quote: “For machine learning models, parameters included number of estimators, tree depth ... (Sec 4.3.6) -- no values stated”
- **Reported:** test accuracy = 99% (TabTransformer); MLP 96.49%, XGBoost 95.61%. Quote: “MLP achieved an accuracy of 96.49%, while XGBoost obtained 95.61% ... The Tab Transformer achieved the highest performance with 99% accuracy”
- **Protocol:** single stratified 80/20 split after imputation, scaling and feature selection. Quote: “The pre-processed data was split into an 80:20 training and testing set (Sec 4.3.5)”
- **Code/data:** public Kaggle dataset; no code
- **Gaps:** KAGGLE_ONLY, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NO_STAT_TEST, LEAKAGE, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** Preprocessing and feature selection are fitted before the split, and the reported 96.49% / 95.61% equal 110/114 and 109/114, which does not match a 440-row test set. What we do instead: on the Kaggle 2,200-row set a plain Random Forest already scores 99.5% on a random split (v4.numbers KaggleRF); our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [49] AgriOptNet: A hybrid optimization and lightweight deep learning framework for soil texture classification and crop recommendation based on nutrition (2026)

*Latha Reddy N, Gopinath M.P.* PLOS One 21(7), e0350044. https://doi.org/10.1371/journal.pone.0350044 — read from journals.plos.org HTML.

- **Data:** USDA soil-texture raster (250 m) fused with the Kaggle soil-nutrient crop set; rows: not stated; India: no (not stated).
- **Method:** SailDragon feature selection + SoilCropNet light CNN + modified deep Q-learning (MDQL-RA). Quote: “SoilCropNet with a compound based on MobileNetV2, EfficientNetV2, and ShuffleNetV2 ... -- hyper-parameters only in image tables”
- **Reported:** accuracy = 99.87% headline (random 5-fold); 98.24% under 250 m spatial-block CV. Quote: “The system performance decreases to Accuracy 0.9824 and F1 0.9723 when 250 m spatial blocks (SB-CV) spatial structure becomes the basis”
- **Protocol:** random 5-fold (headline), nested, spatial-block and leave-location-out CV. Quote: “preprocessing, feature selection, and hyperparameter tuning were done on the whole dataset, unknowingly mixing the information from the test folds.”
- **Code/data:** code: github.com/phd-latha/soil-name-and-crop-recommendation
- **Gaps:** LEAKAGE, NO_UNCERTAINTY
- **Where it falls short / what we do:** The most careful 2026 paper (spatial CV, McNemar, code), yet its headline 99.87% comes from the pipeline the authors say leaked; spatial blocks are 250 m, not unseen regions. What we do instead: our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [50] Explainable machine learning for crop recommendation using statistical validation and SHAP interpretability in South Asian agricultural data (2026)

*Samrat Kumar Dev Sharma.* Discover Plants 3, 317. https://doi.org/10.1007/s44372-026-00795-7 — read from link.springer.com HTML.

- **Data:** 'Kaggle Crop Recommendation Dataset' described as 10,000 South-Asian records, 36 features, 10 crops (does not match the cited 2,200-row set); rows: 10000; India: no (South Asia (unspecified)).
- **Method:** RF, GB, XGBoost, LightGBM, CatBoost, LR, SVM; RFE to 10 features; SMOTE inside folds; SHAP. Quote: “is the prediction of the b-th tree and B=200 (Sec 3.4, RF); where v=0.1 is the learning rate (Sec 3.4, GB); Stochastic operations were locked with a global seed (random_state = 42) -- other values 'optimized through preliminary grid search', not stated”
- **Reported:** accuracy (5-fold stratified CV, 95% CI) = 79.8% [79.0-80.6%] (RF); macro-F1 0.474. Quote: “Random Forest yielded the highest overall predictive profile with a mean global accuracy of 79.8% [95% CI 79.0%–80.6%]”
- **Protocol:** stratified 80/20 + 5- and 10-fold stratified CV; Friedman + Nadeau-Bengio corrected t-tests. Quote: “SMOTE was executed strictly inside individual cross-validation folds.”
- **Code/data:** public Kaggle link given; workflow said to be archived (ref 16, not checked)
- **Gaps:** RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY
- **Where it falls short / what we do:** Best statistics in the set (CIs, corrected tests), but the dataset does not match its citation and all splits are random. What we do instead: our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

### [51] AgroSense 2.0: Cross-Modal Transformer Fusion with Geospatial Raster Integration and Interpretable Multi-Task Learning for Precision Crop Recommendation (2026)

*Vishal Pandey, Rishav Tewari, Ruzina Haque Laskar.* arXiv:2606.21892. https://arxiv.org/abs/2606.21892 — read from arXiv HTML.

- **Data:** Kaggle-style 7-feature, 22-crop table + soil images + India soil raster (not geo-paired); rows: not stated; India: yes (India raster; tabular rows have no location).
- **Method:** EfficientNet-B0 + tabular encoder fused by 8-head cross-attention, multi-task (crop + soil); LightGBM baseline. Quote: “We use AdamW with weight decay η = 0.01 and initial learning rate α0 = 3 × 10^-4 ... Training proceeds for 15 epochs with batch size 32. (Sec 3.3)”
- **Reported:** test accuracy = 99.3% (LightGBM tabular-only 99.1%). Quote: “The full AgroSense 2.0 model achieves 99.3% test accuracy with macro F1 of 99.1%, outperforming all baselines including the strong tabular-only LightGBM.”
- **Protocol:** stratified random 80/10/10; 5 seeds, paired t-test. Quote: “The dataset is partitioned using stratified sampling at an 80/10/10 train/validation/test ratio”
- **Code/data:** no code or data link found
- **Gaps:** KAGGLE_ONLY, RANDOM_SPLIT_ONLY, NO_YIELD, NO_UNCERTAINTY, NOT_REPRODUCIBLE
- **Where it falls short / what we do:** Images are paired with table rows by index ('tab_idx = i mod |D_tab|'), not by place, and the 0.2-point gain over LightGBM sits on a saturated benchmark. What we do instead: on the Kaggle 2,200-row set a plain Random Forest already scores 99.5% on a random split (v4.numbers KaggleRF); our v4 test holds out whole Indian states (43,443 DES district-season-years): literature classifiers fall to 36.3% (RF) / 38.2% (XGBoost) hit@1 for the best-yielding crop, versus 57.5% / 57.5% on a random split; YieldRank reaches 55.6% (v4.numbers RFHitLSO, XGBHitLSO, RFHitR, XGBHitR, OursHitLSO); we give 90% conformal crop shortlists that cover 90.1% on unseen states with 2.87 crops on average (v4.numbers CovIIDLSO, SizeIIDLSO).

