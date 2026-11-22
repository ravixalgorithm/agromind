# AgroMind large-scale India dataset (v3 data)

A district × crop-year × season × crop table built only from public, real records:
official Government of India crop statistics joined with satellite/reanalysis climate (NASA POWER)
and gridded soil (ISRIC SoilGrids 2.0) at each district's centroid. No row or value is
synthetic or imputed except where a column says so (`soil_source = state_median`).
Per-source publisher, URL, licence, verification and IEEE citations: [DATA_PROVENANCE.md](DATA_PROVENANCE.md).

Rebuild, verify, and print every count below:

```bash
python backend/scripts/build_large_dataset.py                 # full build, resumable (soil: hours on first run)
python backend/scripts/build_large_dataset.py --no-soil-fetch # minutes, from cache
python backend/scripts/build_large_dataset.py --selftest      # centroid / season-window / matching checks
```

All raw downloads are cached under `backend/data/large/cache/` (gitignored). Boundary files and the
verification mirror are pinned to a git commit and checked by SHA-256; the DES reports are cached
as fetched (`cache/des/`, with the access date in `index.json`).
Every number in this document is in `backend/data/large/stats.json`, written by the script.

---

## 1. Files

| File | What | Size |
|------|------|------|
| `backend/data/large/agromind_india_large.csv.gz` (+ `.parquet`) | full table, one row per state × district × crop year × season × crop | 7.2 MB (parquet 6.0 MB) |
| `backend/data/large/agromind_india_train.csv.gz` | ready-to-train rows in the app's column names (`recommend == 1` rows with climate + soil) | 1.2 MB |
| `backend/data/large/district_match.csv` | every DES (state, district) name → boundary district, method, score, lat/lon | small |
| `backend/data/large/district_centroids.csv` | 791 boundary-district centroids | small |
| `backend/data/large/unmatched_districts.csv` | DES names with no centroid (currently empty) | small |
| `backend/data/large/mirror_check_mismatches.csv.gz` | rows where the Kaggle mirror and DES disagree or don't pair | 0.8 MB |
| `backend/data/large/msp_crop_year.csv` | CACP minimum support price (sugarcane: FRP) per crop × crop year, 2010-11 … 2026-27, joinable on (`crop_slug`, `crop_year`); see DATA_PROVENANCE.md S7 for caveats | small |
| `backend/data/large/stats.json` | all counts, coverage and verification percentages | small |

---

## 2. Sources (summary — details in DATA_PROVENANCE.md)

| Layer | Source | Licence / terms |
|-------|--------|-----------------|
| Crop area / production | **DES, Ministry of Agriculture & Farmers Welfare — APY report**, <https://data.desagri.gov.in/website/crops-apy-report-web>, one report per state × crop year (988), 1997-98 … 2022-23 | DES copyright policy: free reproduction with permission (by e-mail) and prominent acknowledgement |
| Verification only | data.gov.in resource `35be999b-0208-4354-b557-f6ca9a5355de` (500 random rows); Kaggle *pyatakov* compilation (every overlapping row) | GODL-India; CC BY-NC-SA 4.0 |
| District boundaries → centroids | `datta07/INDIAN-SHAPEFILES`, commits `1ebf207` + `7b003e3` (Karnataka) | MIT |
| Climate | NASA POWER monthly point API v2.10.1, `T2M`, `RH2M`, `PRECTOTCORR`, 1997–2023 | NASA open data |
| Soil | ISRIC SoilGrids 2.0 REST, 0–30 cm `phh2o, nitrogen, soc, clay, sand, cec` + WRB group | CC BY 4.0 |

**Verification of the crop rows** (full tables in DATA_PROVENANCE.md): 500 random rows of the official
data.gov.in resource — of the 479 whose crop the DES report carries, 99.37 % are present and 98.54 %
have identical area and production. Every row the Kaggle mirror shares with DES (333,468) — 99.88 %
identical. DES values are used wherever they differ.

**Not used.** ICRISAT District Level Database (every URL timed out, 2026-11-22); Soil Health Card portal
(no bulk district export). The soil fallback is therefore a state median of SoilGrids values — see §5.

---

## 3. Counts

| Measure | Value |
|---------|-------|
| DES reports (states × crop years) | 988 (38 × 26) |
| Rows (non-empty crop × season cells; = rows in the large table) | 400,379 |
| States / UTs (DES spelling) | 37 with data |
| DES district names (state, district pairs) | 748, all matched to a centroid |
| Distinct centroids | 742 |
| Crop years | 26 (1997-98 … 2022-23) |
| Crops (DES names) | 54 |
| Crops with an app slug (rankable / trainable) | 49 |
| Seasons | Kharif 160,368 · Rabi 119,647 · Whole Year 75,890 · Summer 26,820 · Winter 9,618 · Autumn 8,036 |
| District-year-season groups | 58,235 (43,998 contain at least one `recommend = 1` crop) |
| `recommend = 1` rows | 96,411 |
| Train-ready rows / crops | 96,370 / 49 (soil: Loamy 54,215 · Black 28,412 · Red 6,013 · Alluvial 5,470 · Clay 1,425 · Sandy 835) |

Rows per crop year grow from 9,159 (1997-98) to 18,654 (2022-23); 2020-21 has 18,607,
2021-22 18,286. Largest states: Uttar Pradesh 50,460 · Karnataka 32,561 · Madhya Pradesh 32,385 ·
Bihar 26,524 · Tamil Nadu 23,669. Smallest: the merged UT “The Dadra & Nagar Haveli and Daman and Diu” 8 ·
Daman and Diu 14 · Ladakh 32.

### Join coverage (share of rows)

| Join | Coverage |
|------|----------|
| District → centroid | 100 % (exact name 93.48 %, fuzzy 5.08 %, prefix 1.37 %, exact name filed under another state 0.07 %) |
| Climate (all three variables for the full season window) | 100 % |
| Soil from SoilGrids at the district's own point | 99.81 % (737 of 742 centroids have SoilGrids data) |
| Soil from state median (district point masked / not fetched) | 0.16 % (Nagpur, Mumbai, Chennai, Hyderabad: urban pixels masked at all five tries); Delhi's 98 rows (0.02 %) have no soil — its only point is masked and there is no other Delhi district for a median |
| WRB soil group | 99.64 % |

---

## 4. Columns and definitions

Large table (`agromind_india_large.*`):

| Column | Meaning |
|--------|---------|
| `state`, `district` | as spelled in the DES report (DES files a district's whole history under its current state and name, e.g. Jharkhand districts under Jharkhand from 1997, Osmanabad as Dharashiv) |
| `crop_year`, `year` | crop year (“1997-98”, July–June) and its start year (1997) |
| `season` | DES season: Kharif, Rabi, Autumn, Winter, Summer, Whole Year |
| `season_app` | app season: Kharif/Autumn → `kharif`, Rabi/Winter → `rabi`, Summer → `zaid`, Whole Year → `whole_year` (the app has no whole-year option) |
| `crop`, `crop_slug` | DES crop; app slug (`backend/app/india_ref.py` names where one exists, e.g. Arhar/Tur → `pigeonpeas`, Urad → `blackgram`). Null for the “Other …” buckets |
| `area_ha`, `production`, `production_unit` | as published (2 dp); unit from the report header: Tonnes, except Cotton (Bales) and Coconut (Nuts) |
| `yield` | `production / area_ha` (null when area is 0 or production missing) |
| `yield_pct` | percentile (0–1] of this yield among the same `crop_slug` in the same year across all districts. Null when `crop_slug` is null, yield ≤ 0, or area < 100 ha |
| `recommend` | **label**, see below |
| `geo_state`, `geo_district`, `lat`, `lon`, `match_method` | matched boundary district and its centroid |
| `temperature`, `humidity`, `rainfall` | NASA POWER over the season window: mean T2M (°C), mean RH2M (%), total precipitation (mm = Σ mm/day × days in month) |
| `soil_ph`, `soil_n_gkg`, `soil_soc_gkg`, `soil_clay_pct`, `soil_sand_pct`, `soil_cec_cmolkg` | SoilGrids, thickness-weighted mean of 0–5/5–15/15–30 cm, converted to pH, g/kg total N, g/kg organic C, % clay, % sand, cmol(c)/kg |
| `wrb_class` | most probable WRB reference soil group at the point |
| `soil_class` | app soil bucket: Vertisols → Black; Fluvisols/Gleysols → Alluvial; Ferralsols/Plinthosols → Laterite; Acrisols/Lixisols/Nitisols → Red; Arenosols → Sandy; Solonchaks/Solonetz → Saline; any other group (or none) → texture: sand ≥ 70 % Sandy, clay ≥ 40 % Clay, silt ≥ 60 % Silty, else Loamy; `state_median` rows take the most common class among the state's districts that have their own soil; no soil at all → Other |
| `soil_source` | `soilgrids_centroid`, `state_median`, or null |
| `state_group` | `state`, except Jammu and Kashmir + Ladakh and the Dadra & Nagar Haveli / Daman & Diu UTs (old and 2020-merged) are one group each. **Use it, not `state`, for leave-states-out**: Kargil, Leh, Dadra & Nagar Haveli, Daman and Diu appear under two state labels (5 centroids, 668 rows); grouped by `state_group` no centroid is shared (`stats.json → leave_states_out_leak_check`) |

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
  climate and soil), e.g. GroupKFold on `state_group + district`, on `state_group` for unseen states, or by year.

---

## 5. Cleaning steps (in script order)

1. DES reports: one POST per state × crop year with all districts, all 54 crops and all seasons; parsed
   from the report's HTML table (crop / season / unit header rows, one body row per district). Empty
   cells (crop not grown) are skipped; the aggregate “Oilseeds total” is dropped if present (it is not
   in the report's crop list). No duplicate keys occurred.
2. Boundary names: the national GeoJSON has diacritics mangled into `> @ | # \` (Ā Ū Ī ū ī) —
   decoded; Karnataka's names there are truncated (“B”, “H”, “Ch”), so Karnataka polygons come from
   the state file. 28 unnamed features are skipped. Centroid = planar area-weighted polygon centroid.
3. District matching on normalised names (A–Z0–9, `&` → AND): alias table for renames
   (Gurgaon → Gurugram, Allahabad → Prayagraj, Ahilyanagar → Ahmednagar, Sikkim's East/North/South/West
   and Geyzing → Gangtok/Mangan/Namchi/Gyalshing, Konaseema → Dr. B.R. Ambedkar Konaseema, …;
   state-scoped where a name exists twice, e.g. Aurangabad), then exact → unique prefix → `difflib`
   (≥ 0.8) within the state, then exact → prefix → `difflib` (≥ 0.9) anywhere in India. All 748 names
   matched; every non-exact match is listed with its score in `district_match.csv`. Vijayanagara
   (carved from Ballari in 2021) is not in the boundary file and takes Ballari's centroid.
4. Climate: monthly POWER values per centroid aggregated over the season window above; a window
   with any missing month gives null (none occurred).
5. Soil: SoilGrids at the centroid; if the pixel is masked (city, water), retried at ±0.05° (~5 km)
   in four directions; if all five are masked the district gets its state's median of district values
   (`soil_source = state_median`), and districts still unfetched behave the same way.
6. Label, as in §4.
7. Verification (does not change rows): data.gov.in random spot check and full mirror comparison,
   written to `stats.json` (`datagov_check`, `mirror_check`) and `mirror_check_mismatches.csv.gz`.

---

## 6. Known limitations

- **Centroid ≠ field.** Climate and soil describe one point per district (SoilGrids 250 m pixel,
  POWER ~0.5° cell), not the fields that produced the crop. A planar centroid can fall outside a
  strongly concave district.
- **Current names for historical rows.** DES reports a district's whole history under its current
  name and state, and boundaries are current, so early-year rows of districts split after 1997 get the
  centroid of the current (smaller) district with that name.
- **Soil is static.** One soil profile per district for all 26 years; SoilGrids is a model prediction
  with sizeable uncertainty, total N is not plant-available N, and the WRB → Indian soil bucket map
  is a heuristic. State-median rows carry no district-level soil signal.
- **Revealed, not optimal.** `recommend` reflects what farmers grew and how it yielded relative to other
  districts, which is shaped by irrigation, prices, policy and reporting — not soil/climate alone.
  Irrigation status is not in APY.
- **Reporting quality.** Production is missing in 1.24 % of rows and zero in 1,516; some crops are
  reported only in some years; season naming differs by state (Autumn/Winter/Summer mostly in eastern
  states). 392 rows differ from the earlier Kaggle compilation (e.g. sugarcane 2019-20 in Madhya Pradesh
  and Chhattisgarh is one tenth of the compilation's figure); the DES figure is kept as published.
- **Live portal.** DES may revise figures; the cached reports (`cache/des/`, access date in `index.json`)
  are what this build used. Re-fetching later can change numbers.
- **Season windows are national.** The same calendar months are used everywhere; local sowing dates vary.
