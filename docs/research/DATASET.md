# AgroMind large-scale India dataset (v3 data)

A district × crop-year × season × crop table built only from public, real records:
Government of India crop statistics joined with satellite/reanalysis climate (NASA POWER)
and gridded soil (ISRIC SoilGrids 2.0) at each district's centroid. No row or value is
synthetic or imputed except where a column says so (`soil_source = state_median`).

Rebuild, verify, and print every count below:

```bash
python backend/scripts/build_large_dataset.py                 # full build, resumable (soil: hours on first run)
python backend/scripts/build_large_dataset.py --no-soil-fetch # minutes, from cache
python backend/scripts/build_large_dataset.py --selftest      # centroid / season-window / matching checks
```

All raw downloads are cached under `backend/data/large/cache/` (gitignored, ~125 MB). Crop and
boundary files are pinned to a git commit and checked by SHA-256, so a rebuild reads the same bytes.
Every number in this document is in `backend/data/large/stats.json`, written by the script.

---

## 1. Files

| File | What | Size |
|------|------|------|
| `backend/data/large/agromind_india_large.csv.gz` (+ `.parquet`) | full table, one row per state × district × crop year × season × crop | STATS_SIZE_LARGE |
| `backend/data/large/agromind_india_train.csv.gz` | ready-to-train rows in the app's column names (`recommend == 1` rows with climate + soil) | STATS_SIZE_TRAIN |
| `backend/data/large/district_match.csv` | every APY (state, district) name → boundary district, method, score, lat/lon | small |
| `backend/data/large/district_centroids.csv` | 791 boundary-district centroids | small |
| `backend/data/large/unmatched_districts.csv` | APY names with no centroid (currently empty) | small |
| `backend/data/large/stats.json` | all counts and coverage percentages | small |

---

## 2. Sources and licences

| Layer | Source | Access used | Licence |
|-------|--------|-------------|---------|
| Crop area / production | Directorate of Economics & Statistics (DES), Ministry of Agriculture & Farmers Welfare — district-wise, season-wise crop production statistics (APY). Official portal: <https://aps.dac.gov.in/>; the 1997–2014 part is published on Open Government Data as [“District-wise, season-wise crop production statistics from 1997”](https://www.data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997) (API resource `35be999b-0208-4354-b557-f6ca9a5355de`, 246,091 rows) | 1997-98…2020-21 compilation [kaggle.com/datasets/pyatakov/india-agriculture-crop-production](https://www.kaggle.com/datasets/pyatakov/india-agriculture-crop-production) (“Data collected from Ministry of Agriculture and Farmers Welfare of India”, upd 02.2023), fetched from a public GitHub copy pinned to commit `1600ca7` (`akhr1997/India-Crop-Prod-Dashboard/Backend/indiaAgricultureCropProduction.csv`, SHA-256 `7068beec…58b0be`) | Underlying data: Government Open Data Licence – India ([GODL](https://www.data.gov.in/Godl)). The Kaggle compilation is labelled CC BY-NC-SA 4.0 — fine for coursework/research; attribute and don't sell it |
| District boundaries → centroids | `datta07/INDIAN-SHAPEFILES` — `INDIA/INDIA_DISTRICTS.geojson` (820 features, commit `1ebf207`) + `STATES/KARNATAKA/KARNATAKA_DISTRICTS.geojson` (commit `7b003e3`) | raw.githubusercontent.com | MIT |
| Climate | NASA POWER, monthly point API, community `AG`, parameters `T2M` (°C), `RH2M` (%), `PRECTOTCORR` (mm/day), 1997–2021 — <https://power.larc.nasa.gov/> | one call per centroid, raw JSON cached in `cache/power/` | NASA open data, no restrictions; cite POWER (Sparks 2018 for the R client; NASA POWER portal) |
| Soil | ISRIC SoilGrids 2.0 REST — `properties/query` (`phh2o, nitrogen, soc, clay, sand, cec`, depths 0–5, 5–15, 15–30 cm, mean) and `classification/query` (WRB reference group) — <https://rest.isric.org/> | one point per centroid, raw JSON cached in `cache/soil/`, 12.5 s between requests (ISRIC fair use: 5/min) | CC BY 4.0 (Poggio et al. 2021) |

**Mirror check.** The compilation was verified against the official API before use: for example
Punjab / LUDHIANA / Wheat / 2005 / Rabi is 257,000 ha → 1,228,000 t in both, and Kerala /
PALAKKAD / Rice / 2010 has the same three seasons (Autumn 38,647.59 ha, Summer 5,499.34 ha,
Winter 43,364.45 ha) with identical production in both. The data.gov.in API itself was not used
for bulk download because its public sample key returns 10 rows per call (24,600 calls).

**Not used.** ICRISAT District Level Database (needs registration, older 1966-based district
frame); Soil Health Card portal (no bulk district export). The soil fallback is therefore a
state median of SoilGrids values, not Soil Health Card averages — see §5.

---

## 3. Counts

| Measure | Value |
|---------|-------|
| Raw APY rows | 345,405 |
| Rows after cleaning (= rows in the large table) | STATS_ROWS |
| States / UTs (APY spelling) | 36 |
| APY district names (state, district pairs) | 792 |
| …matched to a centroid | 792 (100 %) |
| Distinct centroids | 711 |
| Crop years | 24 (1997-98 … 2020-21; **2020-21 has only 319 rows** — partial year) |
| Crops (raw APY names, after dropping “Oilseeds total”) | 55 |
| Crops with an app slug (rankable / trainable) | 49 |
| Seasons (raw) | Kharif 138,137 · Rabi 100,763 · Whole Year 68,301 · Summer 22,101 · Winter 8,249 · Autumn 6,989 |
| District-year-season groups | 50,301 (38,261 contain at least one `recommend = 1` crop) |
| `recommend = 1` rows | STATS_RECOMMEND |
| Train-ready rows / crops | STATS_TRAIN |

Largest states by rows: Uttar Pradesh 44,726 · Madhya Pradesh 29,906 · Karnataka 27,493 ·
Bihar 24,697 · Rajasthan 20,350. Smallest: Ladakh 1 · Daman and Diu 42 · Chandigarh 124.

### Join coverage (share of rows)

| Join | Coverage |
|------|----------|
| District → centroid | 100 % (exact name 92.08 %, fuzzy 4.58 %, exact name filed under another state 1.74 %, prefix 1.24 %, fuzzy other state 0.37 %) |
| Climate (all three variables for the full season window) | 100 % |
| Soil from SoilGrids at the district's own point | STATS_SOIL_SG |
| Soil from state median (district point masked / not fetched) | STATS_SOIL_MED |
| WRB soil group | STATS_WRB |

---

## 4. Columns and definitions

Large table (`agromind_india_large.*`):

| Column | Meaning |
|--------|---------|
| `state`, `district` | as spelled in APY (state spellings unified: “Andaman and Nicobar ” → “… Islands”, “Laddakh” → “Ladakh”) |
| `crop_year`, `year` | APY crop year (“1997-98”, July–June) and its start year (1997) |
| `season` | raw APY season: Kharif, Rabi, Autumn, Winter, Summer, Whole Year |
| `season_app` | app season: Kharif/Autumn → `kharif`, Rabi/Winter → `rabi`, Summer → `zaid`, Whole Year → `whole_year` (the app has no whole-year option) |
| `crop`, `crop_slug` | raw crop; app slug (`backend/app/india_ref.py` names where one exists, e.g. Arhar/Tur → `pigeonpeas`, Urad → `blackgram`). Null for “Other …” buckets and Dry Ginger |
| `area_ha`, `production`, `production_unit` | as published; unit is Tonnes, except Cotton (Bales) and Coconut (Nuts) |
| `yield` | `production / area_ha` (null when area is 0 or production missing) |
| `yield_pct` | percentile (0–1] of this yield among the same `crop_slug` in the same year across all districts. Null when `crop_slug` is null, yield ≤ 0, or area < 100 ha |
| `recommend` | **label**, see below |
| `geo_state`, `geo_district`, `lat`, `lon`, `match_method` | matched boundary district and its centroid |
| `temperature`, `humidity`, `rainfall` | NASA POWER over the season window: mean T2M (°C), mean RH2M (%), total precipitation (mm = Σ mm/day × days in month) |
| `soil_ph`, `soil_n_gkg`, `soil_soc_gkg`, `soil_clay_pct`, `soil_sand_pct`, `soil_cec_cmolkg` | SoilGrids, thickness-weighted mean of 0–5/5–15/15–30 cm, converted to pH, g/kg total N, g/kg organic C, % clay, % sand, cmol(c)/kg |
| `wrb_class` | most probable WRB reference soil group at the point |
| `soil_class` | app soil bucket: Vertisols → Black; Fluvisols/Gleysols → Alluvial; Ferralsols/Plinthosols → Laterite; Acrisols/Lixisols/Nitisols → Red; Arenosols → Sandy; Solonchaks/Solonetz → Saline; any other group (or none) → texture: sand ≥ 70 % Sandy, clay ≥ 40 % Clay, silt ≥ 60 % Silty, else Loamy; no soil at all → Other |
| `soil_source` | `soilgrids_centroid`, `state_median`, or null |

Season windows (crop year Y = Y-07 … Y+1-06): Kharif Jun–Oct Y · Autumn Apr–Aug Y · Rabi
Nov Y–Mar Y+1 · Winter Oct Y–Jan Y+1 · Summer Mar–Jun Y+1 · Whole Year Jun Y–May Y+1.

### The `recommend` label

Yields of different crops are not comparable (sugarcane t/ha vs pulse t/ha, cotton in bales), so a
crop is scored against **itself elsewhere**: `yield_pct` = rank of its yield among every district
growing it that year. Within each district × year × season, crops are ranked by `yield_pct`;

> `recommend = 1` ⇔ the crop is in the top 3 of its district-year-season by `yield_pct`
> **and** `yield_pct ≥ 0.5` **and** area ≥ 100 ha.

Read it as “this district did comparatively well with this crop this season” — a revealed-performance
label, not an agronomic optimum. Crops a district never grows are never candidates.

### Train-ready variant (`agromind_india_train.csv.gz`)

`recommend = 1` rows that have climate and soil, in the app's column names:
`N, ph, temperature, humidity, rainfall, soil, season, state, crop` plus `district, year,
yield_pct, soil_source` for grouping/weighting.

- `N` is **SoilGrids total nitrogen in g/kg** — a proxy. It is not the available-N (kg/ha-like)
  scale of the Kaggle/Tamil Nadu sets and must not be mixed with v1/v2 rows unscaled.
- There are no `P`, `K` (SoilGrids has neither) and no `water_source`.
- `season` can be `whole_year`, which the app's form does not offer.
- One district-year-season contributes up to 3 rows with identical features and different crops,
  so evaluate with top-k / multi-label metrics and split by district (rows in one district share
  climate and soil), e.g. GroupKFold on `state + district`, or by year.

---

## 5. Cleaning steps (in script order)

1. Strip whitespace; drop the aggregate “Oilseeds total” (sum of other rows), rows with no crop
   or season, one junk district (“S”), and one exact duplicate created by the two Andaman spellings.
2. Boundary names: the national GeoJSON has diacritics mangled into `> @ | # \` (Ā Ū Ī ū ī) —
   decoded; Karnataka's names there are truncated (“B”, “H”, “Ch”), so Karnataka polygons come from
   the state file. 28 unnamed features are skipped. Centroid = planar area-weighted polygon centroid.
3. District matching on normalised names (A–Z0–9, `&` → AND): alias table for renames
   (Gurgaon → Gurugram, Allahabad → Prayagraj, Hoshangabad → Narmadapuram, Sikkim's East/North/South/West
   → Gangtok/Mangan/Namchi/Gyalshing, …; state-scoped where a name exists twice, e.g. Aurangabad),
   then exact → unique prefix → `difflib` (≥ 0.8) within the APY state, then exact → prefix → `difflib`
   (≥ 0.9) anywhere in India (old districts are often filed under the parent state: Jharkhand under
   Bihar, Chhattisgarh under MP, Uttarakhand under UP, Telangana under AP). All 792 names matched;
   every non-exact match is listed with its score in `district_match.csv` for review.
4. Climate: monthly POWER values per centroid aggregated over the season window above; a window
   with any missing month gives null (none occurred).
5. Soil: SoilGrids at the centroid; if the pixel is masked (city, water), retried at ±0.05° (~5 km)
   in four directions; if all five are masked the district gets its state's median of district values
   (`soil_source = state_median`), and districts still unfetched behave the same way.
6. Label, as in §4.

---

## 6. Known limitations

- **Centroid ≠ field.** Climate and soil describe one point per district (SoilGrids 250 m pixel,
  POWER ~0.5° cell), not the fields that produced the crop. A planar centroid can fall outside a
  strongly concave district.
- **Modern boundaries for historical names.** Districts split after 1997 are matched to the current
  district with the old name (e.g. pre-2016 Adilabad → today's smaller Adilabad), so early-year rows
  of split districts get the parent-remnant's centroid. Several APY names can share a centroid (792 → 711).
- **Soil is static.** One soil profile per district for all 24 years; SoilGrids is a model prediction
  with sizeable uncertainty, total N is not plant-available N, and the WRB → Indian soil bucket map
  is a heuristic. State-median rows carry no district-level soil signal.
- **Revealed, not optimal.** `recommend` reflects what farmers grew and how it yielded relative to other
  districts, which is shaped by irrigation, prices, policy and reporting — not soil/climate alone.
  Irrigation status is not in APY.
- **Reporting quality.** APY has missing production (1.4 % of rows), zero-production rows, crops reported
  only in some years, and season naming that differs by state (Autumn/Winter/Summer are used mostly in
  eastern states). 2020-21 is nearly empty.
- **Season windows are national.** The same calendar months are used everywhere; local sowing dates vary.
