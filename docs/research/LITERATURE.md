# AgroMind — Literature Review

Related work for AgroMind, a state-aware Random Forest crop recommender for Indian fields.
References are numbered [1]–[38] in IEEE style; [`references.bib`](references.bib) lists the same
entries in the same order.

**How citations were checked (2026-11-22).** Every DOI was looked up in Crossref (DataCite for the
arXiv entry). Titles, authors and venues were copied from that record, and each DOI was confirmed
to resolve at `https://doi.org/`. Web resources returned HTTP 200 on that date. Accuracy figures in
the comparison table come from the papers' published abstracts. Where an abstract gives no
number, the table says so instead of guessing. Candidates that could not be verified this way
were dropped.

---

## 1. Background

### 1.1 Surveys

Liakos et al. [1] review ML across crop, livestock, water and soil management and find crop
management (yield, disease, weeds, quality) to be the largest application area. Sharma et al. [2],
an Indian group writing in *IEEE Access*, survey ML for precision agriculture across the crop
life-cycle, from soil and seed choice before planting through to harvest. Van Klompenburg et al.
[3] narrow 567 crop-yield studies down to 50. Temperature, rainfall and soil type are the most used
features, and neural networks are the most used models. Patel and Patel [4] survey recommender
systems in agriculture by technique (content-based, collaborative, knowledge-based, hybrid).

### 1.2 Crop recommendation in India

Indian work on crop recommendation goes back at least to Kumar et al. [5], who treated crop
selection as maximising net yield rate over a season. Most later systems are classifiers that map
soil and climate readings to a crop label:

- Pudumalar et al. [6] (Tamil Nadu) combine Random Tree, CHAID, k-NN and Naive Bayes by majority vote.
- Doshi et al. [7] (*AgroConsultant*) add sowing season and the farm's geographical location to the soil and weather inputs.
- Kulkarni et al. [8] combine Random Forest, Naive Bayes and linear SVM by majority vote to predict Kharif/Rabi crop types and report 99.91% accuracy.
- Priyadharshini et al. [9] select crops from sowing season, soil and location.
- Akkem et al. [10] (*Indian Journal of Science and Technology*) review stacking, ensembles of ensembles and federated learning for crop recommendation, and deploy one of them as a Streamlit app.

### 1.3 The Kaggle Crop Recommendation dataset

Much recent work uses the public Kaggle dataset [31]: 2,200 rows of N, P, K, temperature, humidity,
pH and rainfall, labelled with 22 crops. Its Kaggle page says it "was build by augmenting datasets
of rainfall, climate and fertilizer data available for India". It has exactly 100 rows per crop
and no location, season, soil type or year. Dey et al. [11] use it to recommend agricultural and
horticultural crops in India and report 99.09% precision for XGBoost [22]. Elbasi et al. [12]
compare 15 classifiers on soil and climate crop data and report 99.59% accuracy (Bayes Net).
Musanase et al. [13] apply the same NPK + pH + climate formulation to Rwandan crops with a neural
network (97%) and add rule-based fertiliser advice.

### 1.4 Explainable AI

Shams et al. [14] (*XAI-CROP*) attach explanations to a crop recommender and compare it with GB,
DT, RF and Naive Bayes. They report regression errors (MSE 0.9412, MAE 0.9874). Turgut et al. [15]
(*AgroXAI*) run a recommender on edge devices with LIME, SHAP [23] and ELI5 explanations, and use
counterfactuals to suggest alternative crops for a region.

### 1.5 District-level work with Indian government data

Yield studies on real, location-indexed Indian data report much lower skill. De Clercq and Mahdi
[16] train 19 models on 20 years of climate-reanalysis, satellite and rice-yield data for 247
Indian districts. Their best out-of-sample R² is 0.82 (MAPE 0.16), far from the ~99% reported on
the Kaggle classification task. Nikhil et al. [17] predict production and yield of rice, sorghum,
cotton and sugarcane in South Indian states. Extra Trees does best (R² 0.9615), and tree models
beat linear and nearest-neighbour ones.

### 1.6 Evaluation methodology

Sam and D'Abreo [37] give the clearest crop-recommendation example: on 19 crops across 15 Indian states, Random Forest scores 99.96% under 10-fold cross-validation but 78.55% when the split respects time order (83.62% with lag variables). Roberts et al. [18] show more generally that random cross-validation overstates accuracy when data have spatial,
temporal or grouped structure, and recommend blocked (grouped) validation instead. Meyer et al.
[19] show the same for spatial ML: features that encode *where* a sample came from can raise
random-split scores while hurting prediction at new locations. Niculescu-Mizil and Caruana [20]
show that Random Forests [21] and boosted trees [22] give systematically distorted class
probabilities, and that Platt scaling or isotonic regression corrects them. SHAP [23] is the
standard way to attribute a tree model's prediction to its input features. Guo et al. [33] popularised Expected Calibration Error (ECE) as a summary of miscalibration, and McNemar's test, recommended by Dietterich [32], compares two classifiers on the same test set. Experiments use scikit-learn [34], with XGBoost [22] and LightGBM [35] as gradient-boosting baselines.

### 1.7 Indian data infrastructure

The Soil Health Card scheme tests farm soils for parameters including N, P, K and pH and issues
cards with nutrient advice. MANAGE's impact study [24] evaluates the scheme, and the national portal
[25] publishes the cards. IMD's 0.25° gridded daily rainfall for India (from 1901) is described by
Pai et al. [26]. SoilGrids 2.0 [27] maps global soil properties at 250 m with uncertainty. NASA
POWER [29] provides daily climate for any location, for example through the `nasapower` client
[28]. District-wise crop production statistics from the Directorate of Economics and Statistics
(MoA&FW) are published on India's Open Government Data platform [30]; the DES APY report portal [38] covers 1997–98 to 2022–23, and a community-compiled Kaggle copy [36] serves as a cross-check.

---

## 2. Comparison of crop-recommendation and related studies

| Ref | Paper | Year | Dataset | Method | Reported result | Limitation (for our purpose) |
|-----|-------|------|---------|--------|-----------------|------------------------------|
| [5] | Kumar et al. | 2015 | Seasonal crop yield-rate data | Crop Selection Method (net-yield maximisation) | No accuracy in abstract | Optimisation framing, not a soil–climate classifier |
| [6] | Pudumalar et al. | 2017 | Site-specific soil data, Tamil Nadu | Majority-vote ensemble (RT, CHAID, k-NN, NB) | No figure in abstract ("high accuracy") | One region; random split |
| [7] | Doshi et al. (AgroConsultant) | 2018 | Indian soil, weather, location, season | ML classifiers + big-data analytics | No figure in abstract | Uses location, but no test on unseen regions |
| [8] | Kulkarni et al. | 2018 | Soil physical/chemical + rainfall, temperature | Ensemble (RF, NB, linear SVM), majority vote | 99.91% accuracy | Near-perfect random-split score; Kharif/Rabi labels only |
| [9] | Priyadharshini et al. | 2021 | Soil, season, location (India) | ML classifiers | No figure in abstract | No calibration or out-of-source test |
| [10] | Akkem et al. | 2023 | Soil data for crop recommendation | Stacking, ensemble of ensembles, federated learning; Streamlit | Claims gain over baselines; no single figure | Generalisation across datasets not tested |
| [11] | Dey et al. | 2024 | Kaggle Crop Recommendation [31] | SVM, XGBoost, RF, k-NN, DT | XGBoost 99.09% (agri), 99.3% (horti), 98.51% (combined) precision | No location or season; ~99% reflects an augmented, well-separated set |
| [12] | Elbasi et al. | 2023 | Soil–climate crop data (NPK, climate) | 15 classifiers + feature-combination scheme | 99.59% (Bayes Net) | Same ~99% ceiling; no out-of-distribution test |
| [13] | Musanase et al. | 2023 | Rwandan crops: N, P, K, pH, climate | Neural network + rule-based fertiliser model | 97% accuracy | Not Indian; random split |
| [14] | Shams et al. (XAI-CROP) | 2024 | Soil, crop history, weather | XAI-CROP vs GB, DT, RF, GNB, MNB | MSE 0.9412, MAE 0.9874 | Regression metrics for a recommendation task; no calibration |
| [15] | Turgut et al. (AgroXAI) | 2024 | Weather + soil (IoT / edge) | ML + LIME, SHAP, ELI5, counterfactuals | No figure in abstract | Explains predictions, but probabilities are not calibrated |
| [16] | De Clercq & Mahdi | 2024 | 247 Indian rice districts, 20 yrs; reanalysis + satellite | 19 models (CatBoost, LightGBM, Extra Trees, …) | Out-of-sample R² ≤ 0.82, MAPE 0.16 | Yield regression for one crop; shows the real-data ceiling |
| [17] | Nikhil et al. | 2024 | South Indian states: weather, soil, crop | Regressors (Extra Trees, RF, LGBM, …) | Extra Trees R² 0.9615 | Yield, not recommendation; state level only |
| [37] | Sam & D'Abreo | 2025 | 19 crops, 15 Indian states; environmental + economic factors | RF, SVM; 10-fold CV vs time-series split vs lag variables | RF 99.96% (10-fold) → 78.55% (time-series split); 83.62% with lags | Holds out time, not states; top-1 only |

**What the table shows.** Classifiers trained on curated soil–climate tables, especially the
Kaggle set [11], [12] and similar data [8], cluster at 97–99.9% accuracy under a random train/test
split. Studies on real, location-indexed Indian data [16] report much lower out-of-sample skill, and the one crop-recommendation study with a temporal split [37] loses about 21 points of accuracy.
By its own description the Kaggle set was *augmented*. It is perfectly balanced (100 rows per crop)
and has no location, season or year. Near-perfect scores on it show how separable its feature bands
are, not how a model would do in a new district. We treat those numbers as an upper bound, not a
benchmark to beat.

---

## 3. Research gaps and how AgroMind addresses them

| Gap | Evidence | AgroMind's response |
|-----|----------|---------------------|
| **G1. Location-blind models.** Most Kaggle-based recommenders use only N, P, K, pH, temperature, humidity and rainfall, so a reading gets the same answer in Punjab and in Kerala. | [11]–[13]; location appears in only a few systems [7], [9] | **State-aware features.** State, season and soil type are one-hot model inputs, not just UI labels. |
| **G2. Single-source, near-synthetic training data.** Results come from one dataset, often the augmented Kaggle set. | [11], [12], [31] | **Multi-source merge.** Kaggle (2,200 rows), the India multi-state set (8,000) and Tamil Nadu field records (57,000) are normalised into one schema: 67,200 rows, 74 crops, 16 states. A v3 dataset joins district-season-year production statistics [30], [38] with NASA POWER climate [29] and SoilGrids soil [27]. |
| **G3. Random splits overstate accuracy.** Random cross-validation on grouped data leaks structure between train and test. | [18], [19], [37]; none of [6]–[15] report a grouped test, and [37] holds out time but not states | **Leave-one-source-out (LOSO) test.** Train on two sources, test on the third, and report the drop next to the random-split score. |
| **G4. Uncalibrated confidence.** Recommenders show a "confidence %", but tree-ensemble probabilities are distorted. | [20]; no calibration reported in [8]–[15] | **Calibration.** Reliability diagrams and Expected Calibration Error for the Random Forest [21], with isotonic or sigmoid calibration. |
| **G5. Top-1 accuracy only.** Farmers choose among several viable crops, and a single label hides the alternatives. | [6]–[13] report top-1 only | **Ranked output.** Top-3 accuracy, plus same-season alternatives in the UI. |
| **G6. Weak link to Indian government data.** Few recommenders connect to Soil Health Card readings or official district statistics. | [24]–[26], [30] | **Inputs match Soil Health Card fields** (N, P, K, pH), so a card can be typed in directly. v3 trains on official DES production data. |
| **G7. Explanations without stated limits.** XAI papers explain predictions but rarely state the limits of their data. | [14], [15] | **Honesty checklist** in `docs/PROJECT.md`: data provenance, synthetic-set caveats, and live metrics quoted from `/model-info`. |

---

## 4. References

[1] K. G. Liakos, P. Busato, D. Moshou, S. Pearson, and D. Bochtis, "Machine learning in agriculture: A review," *Sensors*, vol. 18, no. 8, p. 2674, 2018, doi: 10.3390/s18082674.

[2] A. Sharma, A. Jain, P. Gupta, and V. Chowdary, "Machine learning applications for precision agriculture: A comprehensive review," *IEEE Access*, vol. 9, pp. 4843–4873, 2021, doi: 10.1109/ACCESS.2020.3048415.

[3] T. van Klompenburg, A. Kassahun, and C. Catal, "Crop yield prediction using machine learning: A systematic literature review," *Comput. Electron. Agric.*, vol. 177, p. 105709, 2020, doi: 10.1016/j.compag.2020.105709.

[4] K. Patel and H. B. Patel, "A state-of-the-art survey on recommendation system and prospective extensions," *Comput. Electron. Agric.*, vol. 178, p. 105779, 2020, doi: 10.1016/j.compag.2020.105779.

[5] R. Kumar, M. P. Singh, P. Kumar, and J. P. Singh, "Crop selection method to maximize crop yield rate using machine learning technique," in *Proc. Int. Conf. Smart Technol. Manage. Comput., Commun., Controls, Energy Mater. (ICSTM)*, 2015, pp. 138–145, doi: 10.1109/ICSTM.2015.7225403.

[6] S. Pudumalar, E. Ramanujam, R. H. Rajashree, C. Kavya, T. Kiruthika, and J. Nisha, "Crop recommendation system for precision agriculture," in *Proc. 8th Int. Conf. Advanced Computing (ICoAC)*, 2017, pp. 32–36, doi: 10.1109/ICoAC.2017.7951740.

[7] Z. Doshi, S. Nadkarni, R. Agrawal, and N. Shah, "AgroConsultant: Intelligent crop recommendation system using machine learning algorithms," in *Proc. 4th Int. Conf. Computing Communication Control and Automation (ICCUBEA)*, 2018, pp. 1–6, doi: 10.1109/ICCUBEA.2018.8697349.

[8] N. H. Kulkarni, G. N. Srinivasan, B. M. Sagar, and N. K. Cauvery, "Improving crop productivity through a crop recommendation system using ensembling technique," in *Proc. 3rd Int. Conf. Computational Systems and Information Technology for Sustainable Solutions (CSITSS)*, 2018, pp. 114–119, doi: 10.1109/CSITSS.2018.8768790.

[9] A. Priyadharshini, S. Chakraborty, A. Kumar, and O. R. Pooniwala, "Intelligent crop recommendation system using machine learning," in *Proc. 5th Int. Conf. Computing Methodologies and Communication (ICCMC)*, 2021, pp. 843–848, doi: 10.1109/ICCMC51019.2021.9418375.

[10] Y. Akkem, S. K. Biswas, and A. Varanasi, "Streamlit application for advanced ensemble learning methods in crop recommendation systems – A review and implementation," *Indian J. Sci. Technol.*, vol. 16, no. 48, pp. 4688–4702, 2023, doi: 10.17485/IJST/v16i48.2850.

[11] B. Dey, J. Ferdous, and R. Ahmed, "Machine learning based recommendation of agricultural and horticultural crop farming in India under the regime of NPK, soil pH and three climatic variables," *Heliyon*, vol. 10, no. 3, p. e25112, 2024, doi: 10.1016/j.heliyon.2024.e25112.

[12] E. Elbasi et al., "Crop prediction model using machine learning algorithms," *Appl. Sci.*, vol. 13, no. 16, p. 9288, 2023, doi: 10.3390/app13169288.

[13] C. Musanase, A. Vodacek, D. Hanyurwimfura, A. Uwitonze, and I. Kabandana, "Data-driven analysis and machine learning-based crop and fertilizer recommendation system for revolutionizing farming practices," *Agriculture*, vol. 13, no. 11, p. 2141, 2023, doi: 10.3390/agriculture13112141.

[14] M. Y. Shams, S. A. Gamel, and F. M. Talaat, "Enhancing crop recommendation systems with explainable artificial intelligence: A study on agricultural decision-making," *Neural Comput. Appl.*, vol. 36, no. 11, pp. 5695–5714, 2024, doi: 10.1007/s00521-023-09391-2.

[15] Ö. Turgut, İ. Kök, and S. Özdemir, "AgroXAI: Explainable AI-driven crop recommendation system for Agriculture 4.0," in *Proc. IEEE Int. Conf. Big Data (BigData)*, 2024, pp. 7208–7217, doi: 10.1109/BigData62323.2024.10825771.

[16] D. De Clercq and A. Mahdi, "Feasibility of machine learning-based rice yield prediction in India at the district level using climate reanalysis and remote sensing data," *Agric. Syst.*, vol. 220, p. 104099, 2024, doi: 10.1016/j.agsy.2024.104099.

[17] U. Nikhil, A. Pandiyan, S. Raja, and Z. Stamenkovic, "Machine learning-based crop yield prediction in South India: Performance analysis of various models," *Computers*, vol. 13, no. 6, p. 137, 2024, doi: 10.3390/computers13060137.

[18] D. R. Roberts et al., "Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure," *Ecography*, vol. 40, no. 8, pp. 913–929, 2017, doi: 10.1111/ecog.02881.

[19] H. Meyer, C. Reudenbach, S. Wöllauer, and T. Nauss, "Importance of spatial predictor variable selection in machine learning applications – Moving from data reproduction to spatial prediction," *Ecol. Model.*, vol. 411, p. 108815, 2019, doi: 10.1016/j.ecolmodel.2019.108815.

[20] A. Niculescu-Mizil and R. Caruana, "Predicting good probabilities with supervised learning," in *Proc. 22nd Int. Conf. Machine Learning (ICML)*, 2005, pp. 625–632, doi: 10.1145/1102351.1102430.

[21] L. Breiman, "Random forests," *Mach. Learn.*, vol. 45, no. 1, pp. 5–32, 2001, doi: 10.1023/A:1010933404324.

[22] T. Chen and C. Guestrin, "XGBoost: A scalable tree boosting system," in *Proc. 22nd ACM SIGKDD Int. Conf. Knowledge Discovery and Data Mining*, 2016, pp. 785–794, doi: 10.1145/2939672.2939785.

[23] S. Lundberg and S.-I. Lee, "A unified approach to interpreting model predictions," in *Advances in Neural Information Processing Systems 30 (NeurIPS)*, 2017; arXiv:1705.07874, doi: 10.48550/arXiv.1705.07874.

[24] A. A. Reddy, "Impact study of Soil Health Card scheme," National Institute of Agricultural Extension Management (MANAGE), Hyderabad, India, 2020, doi: 10.31220/osf.io/n3d2m.

[25] Department of Agriculture and Farmers Welfare, Government of India, "Soil Health Card portal." [Online]. Available: https://soilhealth.dac.gov.in/ (accessed Nov. 22, 2026).

[26] D. S. Pai, M. Rajeevan, O. P. Sreejith, B. Mukhopadhyay, and N. S. Satbha, "Development of a new high spatial resolution (0.25° × 0.25°) long period (1901–2010) daily gridded rainfall data set over India and its comparison with existing data sets over the region," *MAUSAM*, vol. 65, no. 1, pp. 1–18, 2014, doi: 10.54302/mausam.v65i1.851.

[27] L. Poggio et al., "SoilGrids 2.0: Producing soil information for the globe with quantified spatial uncertainty," *SOIL*, vol. 7, no. 1, pp. 217–240, 2021, doi: 10.5194/soil-7-217-2021.

[28] A. H. Sparks, "nasapower: A NASA POWER global meteorology, surface solar energy and climatology data client for R," *J. Open Source Softw.*, vol. 3, no. 30, p. 1035, 2018, doi: 10.21105/joss.01035.

[29] NASA Langley Research Center, "POWER: Prediction Of Worldwide Energy Resources." [Online]. Available: https://power.larc.nasa.gov/ (accessed Nov. 22, 2026).

[30] Directorate of Economics and Statistics, MoA&FW, Government of India, "District-wise, season-wise crop production statistics from 1997," Open Government Data (OGD) Platform India. [Online]. Available: https://www.data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997 (accessed Nov. 22, 2026).

[31] A. Ingle, "Crop Recommendation Dataset," Kaggle, 2020. [Online]. Available: https://www.kaggle.com/datasets/atharvaingle/crop-recommendation-dataset (accessed Nov. 22, 2026).

[32] T. G. Dietterich, "Approximate statistical tests for comparing supervised classification learning algorithms," *Neural Comput.*, vol. 10, no. 7, pp. 1895–1923, 1998, doi: 10.1162/089976698300017197.

[33] C. Guo, G. Pleiss, Y. Sun, and K. Q. Weinberger, "On calibration of modern neural networks," in *Proc. 34th Int. Conf. Machine Learning (ICML)*, 2017; arXiv:1706.04599, doi: 10.48550/arXiv.1706.04599.

[34] F. Pedregosa et al., "Scikit-learn: Machine learning in Python," *J. Mach. Learn. Res.*, vol. 12, no. 85, pp. 2825–2830, 2011. [Online]. Available: https://www.jmlr.org/papers/v12/pedregosa11a.html

[35] G. Ke et al., "LightGBM: A highly efficient gradient boosting decision tree," in *Advances in Neural Information Processing Systems 30 (NIPS)*, 2017. [Online]. Available: https://papers.nips.cc/paper/2017/hash/6449f44a102fde848669bdd9eb6b76fa-Abstract.html

[36] pyatakov, "India Agriculture Crop Production: District-wise crop area and production 1997–2021 (updated Feb. 2023)," Kaggle. [Online]. Available: https://www.kaggle.com/datasets/pyatakov/india-agriculture-crop-production (accessed Nov. 22, 2026).

[37] S. Sam and S. M. D'Abreo, "Crop recommendation with machine learning: Leveraging environmental and economic factors for optimal crop selection," arXiv:2505.21201, 2025, doi: 10.48550/arXiv.2505.21201.

[38] Directorate of Economics and Statistics, MoA&FW, Government of India, "Area, Production & Yield (APY) – Reports." [Online]. Available: https://data.desagri.gov.in/website/crops-apy-report-web (accessed Nov. 22, 2026).
