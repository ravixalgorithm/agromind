# Data provenance — AgroMind large India dataset

Every value in `backend/data/large/agromind_india_large.parquet` (and its `.csv.gz` and the
derived `agromind_india_train.csv.gz`) comes from a source in table 1, and every column maps to
a row in table 2. `backend/scripts/build_large_dataset.py` downloads, caches and joins them;
`backend/data/large/stats.json` holds every number quoted here. Methods and cleaning are in
[DATASET.md](DATASET.md).

## 1. Sources

| # | Data | Publisher | Exact URL / resource id | Licence / terms | Accessed | Years | Contributes | How verified |
|---|------|-----------|--------------------------|-----------------|----------|-------|-------------|--------------|
| S1 | District × season × crop area & production (APY) — **primary crop source** | Directorate of Economics & Statistics (DES), Economics, Statistics & Evaluation Division, Dept. of Agriculture & Farmers Welfare, Ministry of Agriculture & Farmers Welfare, Govt. of India | Report page <https://data.desagri.gov.in/website/crops-apy-report-web>; the script POSTs `https://data.desagri.gov.in/report/crop/horizontal_crop_vertical_year` once per state × crop year (all districts, all 54 crops, all seasons) — 38 states × 26 years = 988 reports, cached in `cache/des/` | DES Copyright Policy (<https://desagri.gov.in/website-policies/> §1): “may be reproduced free of charge after taking proper permission by sending a mail to us”; must be reproduced accurately with the source prominently acknowledged. **Permission e-mail: not yet requested — to be sent by the project owner before any public redistribution (record date and reply here).** | 2026-11-22 | 1997-98 … 2022-23 | all 400,379 rows: `state … production_unit` | (a) S2 random spot check, (b) full row-by-row comparison with S3, both below |
| S2 | Same series, Open Government Data copy | Ministry of Agriculture & Farmers Welfare, Dept. of Agriculture & Farmers Welfare, on the Open Government Data Platform India | “District-wise, season-wise crop production statistics from 1997”, <https://www.data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997>, API resource `35be999b-0208-4354-b557-f6ca9a5355de` (246,091 rows) | Government Open Data Licence – India (GODL), <https://www.data.gov.in/Godl> | 2026-11-22 | 1997 … 2014 | **verification only**, no rows | — |
| S3 | Same series, third-party compilation | Kaggle user *pyatakov*, “India Agriculture Crop Production” (upd. 02.2023), compiled from aps.dac.gov.in (DES); fetched from a GitHub copy pinned to commit `1600ca7` (SHA-256 `7068beec…58b0be`) | <https://www.kaggle.com/datasets/pyatakov/india-agriculture-crop-production> | CC BY-NC-SA 4.0 (compilation) | 2026-11-22 | 1997-98 … 2020-21 | **verification only**, no rows (it was the source before v2) | — |
| S4 | Monthly climate at district centroids: `T2M` (°C), `RH2M` (%), `PRECTOTCORR` (mm/day) | NASA Langley Research Center, POWER Project (sources MERRA-2 + POWER) | Monthly & Annual point API v2.10.1, `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,RH2M,PRECTOTCORR&community=AG&start=1997&end=2023`, one call per centroid (742), cached in `cache/power_1997_2023/` | NASA open data, no restrictions; acknowledgement requested | 2026-11-22 | 1997 … 2023 | `temperature`, `humidity`, `rainfall` (100 % of rows) | values used as delivered; season aggregation unit-tested (`--selftest`) |
| S5 | Soil 0–30 cm: `phh2o, nitrogen, soc, clay, sand, cec` + most probable WRB group | ISRIC — World Soil Information, SoilGrids 2.0 (Poggio et al. 2021) | REST `https://rest.isric.org/soilgrids/v2.0/properties/query` and `/classification/query`, one point per centroid, cached in `cache/soil/` | CC BY 4.0 | 2026-11-22 | static | `soil_*`, `wrb_class`, `soil_class` | values used as delivered (unit conversion by the API's `d_factor`) |
| S6 | District boundaries → centroids | `datta07/INDIAN-SHAPEFILES` (GitHub), national file commit `1ebf207` (SHA-256 `8acd68e3…d4ec35c`) + Karnataka state file commit `7b003e3` | <https://github.com/datta07/INDIAN-SHAPEFILES> | MIT | 2026-11-22 | current boundaries | `geo_state`, `geo_district`, `lat`, `lon`, `match_method` | every non-exact name match listed with score in `district_match.csv` |

**Tried, not used.** ICRISAT District Level Database (<http://data.icrisat.org/dld/>): every URL
(http and https, `/dld/`, `/dld/src/crops.html`, `/services/`) timed out on 2026-11-22, so it is
not an independent second source here. Soil Health Card portal: no bulk district export.

### Verification of the crop rows (S1)

**(a) Against the official Open Government Data copy (S2)** — 500 rows drawn uniformly at random
(seed 0, one API call per row, cached in `cache/datagov/`) from the 246,091-row resource
(they fall in 1997-98 … 2015-16). Tolerance ±0.5 because S2 stores whole numbers.

| Measure | Value |
|---------|-------|
| Sampled rows found in S1 / identical area **and** production | 95.2 % / 94.4 % |
| Sampled rows whose crop the DES APY report carries at all | 479 of 500 (the other 21: horticulture and aggregates such as Mango, Cucumber, Dry ginger, “Pulses total”, “Oilseeds total”) |
| …of those, found in S1 / identical | **99.37 % / 98.54 %** (476 found, 472 identical, 4 with different values) |
| …not found | 3 rows (Marigaon Banana 2009-10 Rabi, Tinsukia Ginger 2013-14 Rabi, Jaisalmer Other Rabi pulses 2009-10 Rabi) |

S1 files the whole history of renamed districts under the new name, so the check maps
Bardhaman → Purba Bardhaman, Osmanabad → Dharashiv, Ahmednagar → Ahilyanagar and Sikkim's
North District → Mangan before pairing (10 sampled rows, all identical after the rename).

**(b) Against the compilation (S3), every overlapping row, 1997-98 … 2020-21:**

| Measure | Value |
|---------|-------|
| Rows paired on (state, district, crop year, season, crop) | 333,468 |
| …area **and** production identical (±0.006, S1 prints 2 dp) | 99.88 % (392 rows differ) |
| Further rows paired when the state is ignored (S3 files Jharkhand under Bihar, Telangana under AP, …) | 6,989, 100 % identical |
| 500 random S3 rows found under the same state in S1 / identical | 97.2 % / 97.0 % |
| S3 rows with no S1 counterpart (district renames, e.g. Karnataka) | 4,082 |
| S1 rows with no S3 counterpart | 29,971 − 6,989 paired = 22,982, of which 18,288 are 2020-21 (S3 has only 319 rows that year) |

The 392 differing rows are listed in `backend/data/large/mirror_check_mismatches.csv.gz` (with all
unpaired rows). Neither source documents why they differ; the largest clusters are sugarcane 2019-20 in
Madhya Pradesh (49 rows) and Chhattisgarh (21 rows), where S1 production is exactly one tenth of S3 in every row,
and Urad 2020-21 in Uttarakhand (13 rows). **S1 (official portal) values are used.**

## 2. Column → source

| Column | Source | Notes |
|--------|--------|-------|
| `state`, `district`, `crop_year`, `season`, `crop`, `area_ha`, `production`, `production_unit` | S1 | as published (units from the report header: Hectare; Tonnes, Bales for cotton, Nuts for coconut) |
| `year` | S1 | start year of `crop_year` |
| `season_app`, `crop_slug` | S1 + fixed lookup in the script | mapping tables `SEASONS`, `CROPS` |
| `yield` | S1 | `production / area_ha` |
| `yield_pct`, `recommend` | S1 | derived label, definition in DATASET.md §4 |
| `geo_state`, `geo_district`, `lat`, `lon`, `match_method` | S6 | centroid of the matched boundary polygon |
| `temperature`, `humidity`, `rainfall` | S4 | season-window mean / mean / total |
| `soil_ph`, `soil_n_gkg`, `soil_soc_gkg`, `soil_clay_pct`, `soil_sand_pct`, `soil_cec_cmolkg` | S5 | 0–30 cm thickness-weighted mean; `soil_source = state_median` rows carry the state's median of S5 district values |
| `wrb_class` | S5 | |
| `soil_class` | S5 + fixed lookup | WRB group / texture → app soil bucket |
| `soil_source` | build step | `soilgrids_centroid` or `state_median` |

Train file columns are renames of the above: `N` = `soil_n_gkg`, `ph` = `soil_ph`, `soil` =
`soil_class`, `season` = `season_app`, `crop` = `crop_slug`.

## 3. References (IEEE)

[1] Directorate of Economics and Statistics, Ministry of Agriculture and Farmers Welfare, Government of India, “Area, Production & Yield (APY) statistics — district-wise, season-wise crop report, 1997-98 to 2022-23,” DES Data Portal. [Online]. Available: https://data.desagri.gov.in/website/crops-apy-report-web. Accessed: Nov. 22, 2026.

[2] Ministry of Agriculture and Farmers Welfare, Department of Agriculture and Farmers Welfare, “District-wise, season-wise crop production statistics from 1997,” Open Government Data Platform India, resource 35be999b-0208-4354-b557-f6ca9a5355de, 2021. [Online]. Available: https://www.data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997. Accessed: Nov. 22, 2026.

[3] pyatakov, “India Agriculture Crop Production,” Kaggle, 2023. [Online]. Available: https://www.kaggle.com/datasets/pyatakov/india-agriculture-crop-production. Accessed: Nov. 22, 2026.

[4] NASA Langley Research Center, “Prediction Of Worldwide Energy Resources (POWER) Project, Monthly and Annual API v2.10.1,” 2026. [Online]. Available: https://power.larc.nasa.gov/. Accessed: Nov. 22, 2026. (Data obtained from the NASA Langley Research Center POWER Project funded through the NASA Earth Science Directorate Applied Science Program.)

[5] L. Poggio, L. M. de Sousa, N. H. Batjes, G. B. M. Heuvelink, B. Kempen, E. Ribeiro, and D. Rossiter, “SoilGrids 2.0: producing soil information for the globe with quantified spatial uncertainty,” *SOIL*, vol. 7, no. 1, pp. 217–240, 2021, doi: 10.5194/soil-7-217-2021.

[6] datta07, “INDIAN-SHAPEFILES,” GitHub repository, commit 1ebf2076e8b43eb51739a847c2911127a70f3b59. [Online]. Available: https://github.com/datta07/INDIAN-SHAPEFILES. Accessed: Nov. 22, 2026.
