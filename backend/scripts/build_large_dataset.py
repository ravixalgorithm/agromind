"""Build AgroMind's large, real India dataset (district x year x season x crop).

Joins three public sources:
  crop records  DES / MoA&FW district-wise season-wise crop area & production (APY), 1997-98..2020-21
  climate       NASA POWER monthly point data (T2M, RH2M, PRECTOTCORR) at each district centroid
  soil          ISRIC SoilGrids 2.0 (0-30 cm: phh2o, nitrogen, soc, clay, sand, cec + WRB class)

Every download is cached under backend/data/large/cache/ (gitignored), so re-runs are
fast and an interrupted run resumes where it stopped. SoilGrids is rate-limited (~5 req/min),
so the first full run takes a few hours; `--no-soil-fetch` builds from whatever soil is cached
(missing districts fall back to the state median and are flagged in `soil_source`).

    python backend/scripts/build_large_dataset.py                 # full build (resumable)
    python backend/scripts/build_large_dataset.py --no-soil-fetch # quick build from cache
    python backend/scripts/build_large_dataset.py --soil-only     # just fill the soil cache

Needs pandas (backend/requirements.txt); writes parquet too when pyarrow is installed.
See docs/research/DATASET.md for sources, licences and the label definition.
"""

from __future__ import annotations

import argparse
import calendar
import difflib
import hashlib
import json
import random
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[1] / "data" / "large"
CACHE = OUT / "cache"

# Sources pinned to a commit and checked by sha256 so a rebuild sees the exact same bytes.
APY = {
    # Mirror of kaggle.com/datasets/pyatakov/india-agriculture-crop-production (upd 02.2023),
    # itself compiled from https://aps.dac.gov.in/ (DES, MoA&FW). Overlapping years match the
    # official data.gov.in resource 35be999b-0208-4354-b557-f6ca9a5355de row for row.
    "url": "https://raw.githubusercontent.com/akhr1997/India-Crop-Prod-Dashboard/"
    "1600ca705bcb192b4bcc2ed5f31c32b97ac30b5e/Backend/indiaAgricultureCropProduction.csv",
    "sha256": "7068beec8803f4b1e9dda63bc97ce4cf221885033cd7d5116a569006d658b0be",
    "file": "apy_1997_2021.csv",
}
GEO = {
    "url": "https://raw.githubusercontent.com/datta07/INDIAN-SHAPEFILES/"
    "1ebf2076e8b43eb51739a847c2911127a70f3b59/INDIA/INDIA_DISTRICTS.geojson",
    "sha256": "8acd68e3bd4f35da436a0405606d5554e770f94b021a9ddf62f80c706d4ec35c",
    "file": "india_districts.geojson",
}
# The national file lost most Karnataka names to an encoding bug ("B", "H", "Ch"...);
# the state file has them intact, so Karnataka polygons come from there.
GEO_KA = {
    "url": "https://raw.githubusercontent.com/datta07/INDIAN-SHAPEFILES/"
    "7b003e3e8c35491fadf71ced7f168f18a7423bf3/STATES/KARNATAKA/KARNATAKA_DISTRICTS.geojson",
    "sha256": None,
    "file": "karnataka_districts.geojson",
}
POWER_URL = (
    "https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,RH2M,PRECTOTCORR"
    "&community=AG&longitude={lon}&latitude={lat}&start=1997&end=2021&format=JSON"
)
SOIL_PROPS = ("phh2o", "nitrogen", "soc", "clay", "sand", "cec")
SOIL_URL = (
    "https://rest.isric.org/soilgrids/v2.0/properties/query?lon={lon}&lat={lat}"
    + "".join(f"&property={p}" for p in SOIL_PROPS)
    + "&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean"
)
WRB_URL = "https://rest.isric.org/soilgrids/v2.0/classification/query?lon={lon}&lat={lat}&number_classes=1"
SOIL_GAP_S = 12.5  # ISRIC fair use: 5 requests / minute
# Centroids in cities / water bodies come back null; nudge ~5 km and retry.
SOIL_OFFSETS = ((0, 0), (0.05, 0), (-0.05, 0), (0, 0.05), (0, -0.05))

# APY crop -> app slug (backend/app/india_ref.py where it exists). None = aggregate / unspecific
# bucket: kept in the large file, never ranked or used as a training label.
CROPS = {
    "Arecanut": "arecanut", "Arhar/Tur": "pigeonpeas", "Bajra": "bajra", "Banana": "banana",
    "Barley": "barley", "Black pepper": "blackpepper", "Cardamom": "cardamom",
    "Cashewnut": "cashewnut", "Castor seed": "castor", "Coconut": "coconut",
    "Coriander": "coriander", "Cotton(lint)": "cotton", "Cowpea(Lobia)": "cowpea",
    "Dry chillies": "chilli", "Garlic": "garlic", "Ginger": "ginger", "Gram": "chickpea",
    "Groundnut": "groundnut", "Guar seed": "clusterbean", "Horse-gram": "horsegram",
    "Jowar": "jowar", "Jute": "jute", "Khesari": "khesari", "Linseed": "linseed",
    "Maize": "maize", "Masoor": "lentil", "Mesta": "mesta", "Moong(Green Gram)": "mungbean",
    "Moth": "mothbeans", "Niger seed": "nigerseed", "Onion": "onion",
    "Peas & beans (Pulses)": "peas", "Potato": "potato", "Ragi": "ragi",
    "Rapeseed &Mustard": "mustard", "Rice": "rice", "Safflower": "safflower",
    "Sannhamp": "sunnhemp", "Sesamum": "sesame", "Small millets": "smallmillets",
    "Soyabean": "soybean", "Sugarcane": "sugarcane", "Sunflower": "sunflower",
    "Sweet potato": "sweetpotato", "Tapioca": "tapioca", "Tobacco": "tobacco",
    "Turmeric": "turmeric", "Urad": "blackgram", "Wheat": "wheat",
    "Dry Ginger": None, "Other Cereals": None, "Other Kharif pulses": None,
    "Other Rabi pulses": None, "Other Summer Pulses": None, "other oilseeds": None,
}
DROP_CROPS = {"Oilseeds total"}  # sum of other rows; would double count

# APY season -> (app season, climate window as (month, year offset) start, length in months).
# Crop year "1997-98" starts July 1997; Summer of that crop year falls in 1998.
SEASONS = {
    "Kharif": ("kharif", (6, 0), 5),      # Jun-Oct
    "Autumn": ("kharif", (4, 0), 5),      # Apr-Aug (aus rice)
    "Rabi": ("rabi", (11, 0), 5),         # Nov-Mar
    "Winter": ("rabi", (10, 0), 4),       # Oct-Jan (aman rice harvest, potato, mustard)
    "Summer": ("zaid", (3, 1), 4),        # Mar-Jun
    "Whole Year": ("whole_year", (6, 0), 12),  # Jun-May
}

# Renames / spellings difflib cannot bridge (normalised keys). APY name -> boundary name;
# "STATE:NAME" keys apply only within that APY state (Aurangabad exists in Bihar too).
DISTRICT_ALIASES = {
    "GURGAON": "GURUGRAM", "MEWAT": "NUH", "ALLAHABAD": "PRAYAGRAJ", "FAIZABAD": "AYODHYA",
    "HOSHANGABAD": "NARMADAPURAM", "OSMANABAD": "DHARASHIV", "MAHARASHTRA:AURANGABAD": "CHHATRAPATISAMBHAJINAGAR",
    "MAHARASHTRA:RAIGAD": "RAIGARH", "DOHAD": "DAHOD", "WANAPARTHY": "WANPARTI", "SAHEBGANJ": "SAHIBGANJ",
    "SANTRAVIDASNAGAR": "BHADOHI", "NAWANSHAHR": "SHAHIDBHAGATSINGHNAGAR",
    "MUKTSAR": "SRIMUKTSARSAHIB", "SPSRNELLORE": "SRIPOTTISRIRAMULUNELLORE",
    "KADAPA": "YSRKADAPA", "ANANTAPUR": "ANANTHAPURAMU", "KAMRUP": "KAMRUPRURAL",
    "BANGALORERURAL": "BENGALURURURAL",
    "BENGALURUURBAN": "BANGALORE", "BELGAUM": "BELAGAVI", "BELLARY": "BALLARI",
    "GULBARGA": "KALABURAGI", "MYSORE": "MYSURU", "SHIMOGA": "SHIVAMOGGA", "TUMKUR": "TUMAKURU",
    "CHIKMAGALUR": "CHIKKAMAGALURU", "DAKSHINKANNAD": "DAKSHINAKANNADA",
    "UTTARKANNAD": "UTTARAKANNADA", "YADAGIRI": "YADGIR", "KARNATAKA:BIJAPUR": "VIJAYAPURA",
    "EASTDISTRICT": "GANGTOK", "NORTHDISTRICT": "MANGAN", "SOUTHDISTRICT": "NAMCHI",
    "WESTDISTRICT": "GYALSHING", "LEHLADAKH": "LEH", "24PARAGANASNORTH": "NORTHTWENTYFOURPARGANAS",
    "24PARAGANASSOUTH": "SOUTH24PARGANAS", "MEDINIPUREAST": "PURBAMEDINIPUR",
    "MEDINIPURWEST": "PASCHIMMEDINIPUR", "DINAJPURDAKSHIN": "DAKSHINDINAJPUR",
    "DINAJPURUTTAR": "UTTARDINAJPUR", "COOCHBEHAR": "KOCHBIHAR", "HOWRAH": "HAORA",
    "HOOGHLY": "HUGLI", "DELHI": "NEWDELHI", "DELHITOTAL": "NEWDELHI", "GOA": "NORTHGOA",
    "DAMANANDDIU": "DAMAN", "ANDAMANANDNICOBARISLANDS": "SOUTHANDAMANS",
    "PONDICHERRY": "PUDUCHERRY", "TUTICORIN": "THOOTHUKUDI", "WARANGALURBAN": "HANUMAKONDA",
    "WARANGALRURAL": "WARANGAL", "THEDADRAANDNAGARHAVELIANDDAMANANDDIU": "DADRAANDNAGARHAVELI",
    "KANKER": "UTTARBASTARKANKER", "DANTEWADA": "DAKSHINBASTARDANTEWARA",
    "BALESHWAR": "BALASORE", "SONEPUR": "SUBARNAPUR", "POONCH": "PUNCH",
    "SIVASAGAR": "SIBSAGAR", "BHADRADRI": "BHADRADRIKOTHAGUDEM",
    "KOMARAMBHEEMASIFABAD": "KOMARRAMBHEEM", "JAYASHANKAR": "JAYASHANKARBHUPALPALLI",
}
STATE_ALIASES = {
    "DADRAANDNAGARHAVELI": "DADRAANDNAGARHAVELIANDDAMANANDDIU",
    "DAMANANDDIU": "DADRAANDNAGARHAVELIANDDAMANANDDIU",
    "LADDAKH": "LADAKH",
}

# WRB reference group -> app soil bucket. Groups not listed fall back to texture.
WRB_SOIL = {
    "Vertisols": "Black", "Fluvisols": "Alluvial", "Gleysols": "Alluvial",
    "Ferralsols": "Laterite", "Plinthosols": "Laterite", "Acrisols": "Red", "Lixisols": "Red",
    "Nitisols": "Red", "Arenosols": "Sandy", "Solonchaks": "Saline", "Solonetz": "Saline",
}
MIN_AREA_HA = 100  # tiny plots give noisy yields; never labelled recommend
TOP_K = 3


def log(*a):
    print(*a, flush=True)


# ── downloads ───────────────────────────────────────────────────────────────────────────

def get(url: str, tries: int = 5, timeout: int = 120) -> bytes:
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "agromind-dataset-builder"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            code = getattr(e, "code", None)
            if code and 400 <= code < 500 and code != 429:
                raise
            wait = 30 * (attempt + 1) if code == 429 else 5 * (attempt + 1)
            log(f"  retry {attempt + 1}/{tries} in {wait}s ({e})")
            time.sleep(wait)
    raise RuntimeError(f"giving up on {url}")


def cached_file(src: dict) -> Path:
    path = CACHE / src["file"]
    if not path.exists():
        log(f"download {src['url']}")
        path.write_bytes(get(src["url"], timeout=600))
    if src["sha256"]:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != src["sha256"]:
            raise SystemExit(f"{path} sha256 {digest} != pinned {src['sha256']}; delete it and retry")
    return path


def cached_json(path: Path, url: str):
    if path.exists():
        return json.loads(path.read_text())
    data = json.loads(get(url))
    path.write_text(json.dumps(data))
    return data


# ── districts: centroids + name matching ────────────────────────────────────────────────

_MANGLED = str.maketrans({">": "A", "@": "U", "|": "I", "#": "U", "\\": "I"})


def norm(s) -> str:
    s = str(s).translate(_MANGLED).upper().replace("&", "AND")
    return re.sub(r"[^A-Z0-9]", "", s)


def ring_centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    return a / 2, cx, cy


def centroid(geom):
    # ponytail: planar area-weighted centroid in lon/lat; fine at district scale, may sit
    # outside a strongly concave district (documented limitation).
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    A = X = Y = 0.0
    for poly in polys:
        a, cx, cy = ring_centroid(poly[0])
        A, X, Y = A + a, X + cx, Y + cy
    return X / (6 * A), Y / (6 * A)


def load_centroids() -> pd.DataFrame:
    path = OUT / "district_centroids.csv"
    if path.exists():
        return pd.read_csv(path)
    rows = []
    for feat in json.loads(cached_file(GEO).read_text())["features"]:
        p = feat["properties"]
        if not p.get("district") or p.get("state") == "KARNATAKA":
            continue
        lon, lat = centroid(feat["geometry"])
        rows.append({"geo_state": p["state"], "geo_district": p["district"].translate(_MANGLED), "lat": lat, "lon": lon})
    for feat in json.loads(cached_file(GEO_KA).read_text())["features"]:
        lon, lat = centroid(feat["geometry"])
        rows.append({"geo_state": "KARNATAKA", "geo_district": feat["properties"]["dtname"].upper(), "lat": lat, "lon": lon})
    df = pd.DataFrame(rows).round({"lat": 4, "lon": 4})
    df.to_csv(path, index=False)
    return df


def match_districts(pairs: pd.DataFrame, geo: pd.DataFrame) -> pd.DataFrame:
    """APY (state, district) -> boundary district. Same state first, then anywhere in India
    (old districts were often filed under the parent state, e.g. Uttarakhand under UP)."""
    geo = geo.assign(skey=geo.geo_state.map(norm), dkey=geo.geo_district.map(norm))
    # "KEONJHAR (KENDUJHAR)" answers to either name
    alt = geo.geo_district.str.extract(r"^(.*?)\s*\((.*)\)")
    keys = pd.concat([geo.dkey, alt[0].map(norm, na_action="ignore"), alt[1].map(norm, na_action="ignore")], axis=1)
    by_key = {}
    for i, row in keys.iterrows():
        for k in row.dropna():
            by_key.setdefault(k, []).append(i)

    def pick(cands, skey):
        same = [i for i in cands if geo.at[i, "skey"] == skey]
        return (same or cands)[0], "exact" if same else "exact_other_state"

    out = []
    for state, district in pairs.itertuples(index=False):
        skey = STATE_ALIASES.get(norm(state), norm(state))
        dkey = norm(district)
        dkey = DISTRICT_ALIASES.get(f"{skey}:{dkey}", DISTRICT_ALIASES.get(dkey, dkey))
        hit, method, score = None, "unmatched", 0.0
        if dkey in by_key:
            hit, method = pick(by_key[dkey], skey)
            score = 1.0
        else:
            for scope, label in ((geo[geo.skey == skey], "fuzzy"), (geo, "fuzzy_other_state")):
                pref = scope[scope.dkey.str.startswith(dkey) | scope.dkey.map(lambda k: dkey.startswith(k) and len(k) >= 5)]
                if len(pref) == 1:
                    hit, method, score = pref.index[0], label.replace("fuzzy", "prefix"), 0.9
                    break
                close = difflib.get_close_matches(dkey, scope.dkey.tolist(), n=1, cutoff=0.8 if label == "fuzzy" else 0.9)
                if close:
                    hit = scope.index[scope.dkey == close[0]][0]
                    method, score = label, difflib.SequenceMatcher(None, dkey, close[0]).ratio()
                    break
        rec = {"state": state, "district": district, "match_method": method, "match_score": round(score, 3)}
        if hit is not None:
            rec.update(geo.loc[hit, ["geo_state", "geo_district", "lat", "lon"]].to_dict())
        out.append(rec)
    return pd.DataFrame(out)


# ── climate (NASA POWER) ────────────────────────────────────────────────────────────────

def point_key(lat, lon) -> str:
    return f"{lat:.4f}_{lon:.4f}"


def fetch_power(points) -> dict:
    (CACHE / "power").mkdir(parents=True, exist_ok=True)

    def one(pt):
        lat, lon = pt
        data = cached_json(CACHE / "power" / f"{point_key(lat, lon)}.json", POWER_URL.format(lat=lat, lon=lon))
        return point_key(lat, lon), data["properties"]["parameter"]

    todo = [p for p in points if not (CACHE / "power" / f"{point_key(*p)}.json").exists()]
    log(f"NASA POWER: {len(points)} points, {len(todo)} to fetch")
    with ThreadPoolExecutor(4) as pool:
        return dict(pool.map(one, points))


def season_climate(monthly: dict, year: int, season: str):
    _, (m0, y_off), n = SEASONS[season]
    t, rh, rain = [], [], 0.0
    for k in range(n):
        m = (m0 - 1 + k) % 12 + 1
        y = year + y_off + (m0 - 1 + k) // 12
        key = f"{y}{m:02d}"
        T, H, P = (monthly[v].get(key) for v in ("T2M", "RH2M", "PRECTOTCORR"))
        if None in (T, H, P) or -999 in (T, H, P):
            return None
        t.append(T)
        rh.append(H)
        rain += P * calendar.monthrange(y, m)[1]  # mm/day -> mm
    return round(sum(t) / n, 2), round(sum(rh) / n, 2), round(rain, 1)


# ── soil (SoilGrids) ────────────────────────────────────────────────────────────────────

def soil_path(lat, lon) -> Path:
    return CACHE / "soil" / f"{point_key(lat, lon)}.json"


def parse_soil(js: dict):
    """Thickness-weighted 0-30 cm mean in target units, or None if the pixel is masked."""
    out = {}
    for layer in js["properties"]["layers"]:
        d = layer["unit_measure"]["d_factor"]
        vals = [(dp["range"]["bottom_depth"] - dp["range"]["top_depth"], dp["values"]["mean"]) for dp in layer["depths"]]
        if any(v is None for _, v in vals):
            return None
        out[layer["name"]] = round(sum(w * v for w, v in vals) / sum(w for w, _ in vals) / d, 3)
    return out


def fetch_soil(points):
    (CACHE / "soil").mkdir(parents=True, exist_ok=True)
    todo = [p for p in points if not soil_path(*p).exists()]
    random.Random(0).shuffle(todo)  # spread early coverage over all states (state medians)
    log(f"SoilGrids: {len(points)} points, {len(todo)} to fetch (~{len(todo) * SOIL_GAP_S * 1.4 / 3600:.1f} h)")
    last = 0.0

    def throttled(url):
        nonlocal last
        time.sleep(max(0.0, SOIL_GAP_S - (time.time() - last)))
        last = time.time()
        return json.loads(get(url, timeout=90))

    for n, (lat, lon) in enumerate(todo, 1):
        rec = {"lat": lat, "lon": lon, "props": None, "wrb": None, "at": None}
        for dlon, dlat in SOIL_OFFSETS:
            q_lat, q_lon = round(lat + dlat, 4), round(lon + dlon, 4)
            props = parse_soil(throttled(SOIL_URL.format(lat=q_lat, lon=q_lon)))
            if props:
                rec.update(props=props, at=[q_lat, q_lon])
                rec["wrb"] = throttled(WRB_URL.format(lat=q_lat, lon=q_lon)).get("wrb_class_name")
                break
        soil_path(lat, lon).write_text(json.dumps(rec))
        log(f"  soil {n}/{len(todo)} {lat},{lon} -> {'ok ' + str(rec['wrb']) if rec['props'] else 'no data'}")


def soil_table(points) -> pd.DataFrame:
    rows = []
    for lat, lon in points:
        p = soil_path(lat, lon)
        if not p.exists():
            continue
        rec = json.loads(p.read_text())
        if rec["props"]:
            rows.append({"pkey": point_key(lat, lon), "wrb_class": rec["wrb"], **rec["props"]})
    cols = {"phh2o": "soil_ph", "nitrogen": "soil_n_gkg", "soc": "soil_soc_gkg", "clay": "soil_clay_pct",
            "sand": "soil_sand_pct", "cec": "soil_cec_cmolkg"}
    return pd.DataFrame(rows, columns=["pkey", "wrb_class", *cols]).rename(columns=cols)


def soil_class(wrb, clay, sand) -> str:
    if wrb in WRB_SOIL:
        return WRB_SOIL[wrb]
    if pd.isna(clay) or pd.isna(sand):
        return "Other"
    if sand >= 70:
        return "Sandy"
    if clay >= 40:
        return "Clay"
    if 100 - clay - sand >= 60:
        return "Silty"
    return "Loamy"


# ── assemble ────────────────────────────────────────────────────────────────────────────

def load_apy() -> pd.DataFrame:
    df = pd.read_csv(cached_file(APY))
    raw = len(df)
    df.columns = ["state", "district", "crop", "crop_year", "season", "area_ha", "area_unit",
                  "production", "production_unit", "yield_raw"]
    for c in ("state", "district", "crop", "season"):
        df[c] = df[c].astype("string").str.strip()
    df = df[~df.crop.isin(DROP_CROPS) & df.crop.notna() & df.season.notna()]
    df["state"] = df.state.replace({"Andaman and Nicobar": "Andaman and Nicobar Islands", "Laddakh": "Ladakh"})
    df = df[df.district.str.len() > 1]  # one junk row ("S")
    # the two Andaman spellings carry one identical record twice
    df = df.drop_duplicates(["state", "district", "crop_year", "season", "crop"])
    df["year"] = df.crop_year.str[:4].astype(int)
    df["yield"] = (df.production / df.area_ha).where(df.area_ha > 0)
    df["crop_slug"] = df.crop.map(CROPS)
    df["season_app"] = df.season.map(lambda s: SEASONS[s][0])
    stats = {"apy_rows_raw": raw, "apy_rows_clean": len(df)}
    return df.drop(columns=["area_unit", "yield_raw"]), stats


def label(df: pd.DataFrame) -> pd.DataFrame:
    """recommend = 1 when the crop is in the top-k of its district-season-year by yield
    percentile, where the percentile compares a crop's yield to the same crop's yield in every
    other district that year (so sugarcane tonnes never compete with pulse tonnes)."""
    ok = df.crop_slug.notna() & (df["yield"] > 0) & (df.area_ha >= MIN_AREA_HA)
    df["yield_pct"] = df[ok].groupby(["crop_slug", "year"])["yield"].rank(pct=True).round(4)
    rank = df[ok].groupby(["state", "district", "year", "season"])["yield_pct"].rank(ascending=False, method="first")
    df["recommend"] = ((rank <= TOP_K) & (df.loc[ok, "yield_pct"] >= 0.5)).reindex(df.index, fill_value=False).astype(int)
    return df


def selftest():
    sq = {"type": "Polygon", "coordinates": [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]}
    assert centroid(sq) == (1.0, 1.0)
    assert norm("B>NKURA") == "BANKURA" and norm("Dadra & Nagar") == "DADRAANDNAGAR"
    months = {v: {f"{y}{m:02d}": 1.0 for y in (1997, 1998) for m in range(1, 13)} for v in ("T2M", "RH2M", "PRECTOTCORR")}
    assert season_climate(months, 1997, "Rabi") == (1.0, 1.0, 30 + 31 + 31 + 28 + 31)  # Nov 97 - Mar 98
    assert season_climate(months, 1998, "Rabi") is None  # needs 1999 data
    geo = pd.DataFrame({"geo_state": ["BIHAR", "MAHARASHTRA", "KARNATAKA", "CHHATTISGARH"],
                        "geo_district": ["AURANGABAD", "CHHATRAPATI SAMBHAJINAGAR", "VIJAYAPURA", "BIJAPUR"],
                        "lat": [1, 2, 3, 4], "lon": [1, 2, 3, 4]})
    pairs = pd.DataFrame({"s": ["Bihar", "Maharashtra", "Karnataka", "Chhattisgarh"],
                          "d": ["AURANGABAD", "AURANGABAD", "BIJAPUR", "BIJAPUR"]})
    assert match_districts(pairs, geo).lat.tolist() == [1, 2, 3, 4]
    log("selftest ok")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-soil-fetch", action="store_true", help="use cached soil only")
    ap.add_argument("--soil-only", action="store_true", help="fill the soil cache, then exit")
    ap.add_argument("--selftest", action="store_true", help="check centroid / season / matching logic")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    CACHE.mkdir(parents=True, exist_ok=True)

    apy, stats = load_apy()
    geo = load_centroids()
    match = match_districts(apy[["state", "district"]].drop_duplicates(), geo)
    match.to_csv(OUT / "district_match.csv", index=False)
    unmatched = match[match.match_method == "unmatched"]
    unmatched[["state", "district"]].to_csv(OUT / "unmatched_districts.csv", index=False)
    log(f"districts: {len(match)} APY names, {len(unmatched)} unmatched -> {OUT / 'unmatched_districts.csv'}")

    points = sorted({(r.lat, r.lon) for r in match.dropna(subset=["lat"]).itertuples()})
    if not args.no_soil_fetch:
        fetch_soil(points)
    if args.soil_only:
        return

    df = apy.merge(match, on=["state", "district"], how="left")
    df["pkey"] = [point_key(a, o) if pd.notna(a) else None for a, o in zip(df.lat, df.lon)]

    power = fetch_power(points)
    clim = {}
    for pk, y, s in df[df.pkey.notna()][["pkey", "year", "season"]].drop_duplicates().itertuples(index=False):
        clim[(pk, y, s)] = season_climate(power[pk], y, s)
    vals = [clim.get((pk, y, s)) for pk, y, s in zip(df.pkey, df.year, df.season)]
    df["temperature"], df["humidity"], df["rainfall"] = zip(*[v or (None, None, None) for v in vals])

    soil = soil_table(points)
    df = df.merge(soil, on="pkey", how="left")
    soil_cols = [c for c in soil.columns if c.startswith("soil_")]
    df["soil_source"] = df.soil_ph.notna().map({True: "soilgrids_centroid", False: None})
    medians = df[df.soil_ph.notna()].drop_duplicates("pkey").groupby("state")[soil_cols].median()
    miss = df.soil_ph.isna() & df.state.isin(medians.index)
    for c in soil_cols:
        df.loc[miss, c] = df.loc[miss, "state"].map(medians[c])
    df.loc[miss, "soil_source"] = "state_median"
    df["soil_class"] = [soil_class(w, c, s) for w, c, s in zip(df.wrb_class, df.soil_clay_pct, df.soil_sand_pct)]

    df = label(df)
    cols = ["state", "district", "crop_year", "year", "season", "season_app", "crop", "crop_slug",
            "area_ha", "production", "production_unit", "yield", "yield_pct", "recommend",
            "geo_state", "geo_district", "lat", "lon", "match_method", "temperature", "humidity",
            "rainfall", *soil_cols, "wrb_class", "soil_class", "soil_source"]
    df = df[cols].sort_values(["state", "district", "year", "season", "crop"]).reset_index(drop=True)
    df["yield"] = df["yield"].round(4)
    df.to_csv(OUT / "agromind_india_large.csv.gz", index=False)
    try:
        df.to_parquet(OUT / "agromind_india_large.parquet", index=False)
    except ImportError:
        log("pyarrow not installed: skipped parquet")

    # Train-ready: one row per recommended (district, year, season, crop), app column names.
    # N is SoilGrids total nitrogen (g/kg) - a proxy, not the app's available-N scale.
    train = df[(df.recommend == 1)].dropna(subset=["temperature", "soil_ph"]).rename(
        columns={"soil_n_gkg": "N", "soil_ph": "ph", "crop": "crop_raw"})
    train = train.assign(season=train.season_app, crop=train.crop_slug)[
        ["N", "ph", "temperature", "humidity", "rainfall", "soil_class", "season", "state", "crop",
         "district", "year", "yield_pct", "soil_source"]].rename(columns={"soil_class": "soil"})
    train.to_csv(OUT / "agromind_india_train.csv.gz", index=False)

    has = lambda c: round(100 * df[c].notna().mean(), 2)
    stats.update({
        "rows": len(df), "states": df.state.nunique(), "districts_apy": int(match.shape[0]),
        "districts_matched": int((match.match_method != "unmatched").sum()),
        "geo_points": len(points), "crops_raw": df.crop.nunique(), "crops_labelled": df.crop_slug.nunique(),
        "years": f"{df.crop_year.min()}..{df.crop_year.max()}", "n_years": df.year.nunique(),
        "seasons": df.season.value_counts().to_dict(),
        "match_methods": match.match_method.value_counts().to_dict(),
        "row_coverage_pct": {"centroid": has("lat"), "climate": has("temperature"), "soil_any": has("soil_ph"),
                             "soil_soilgrids": round(100 * (df.soil_source == "soilgrids_centroid").mean(), 2),
                             "soil_state_median": round(100 * (df.soil_source == "state_median").mean(), 2),
                             "wrb_class": has("wrb_class")},
        "soil_points_cached": int(sum(soil_path(*p).exists() for p in points)),
        "soil_points_with_data": len(soil),
        "recommend_rows": int(df.recommend.sum()),
        "train_rows": len(train), "train_crops": train.crop.nunique(),
        "train_soil_classes": train.soil.value_counts().to_dict(),
    })
    (OUT / "stats.json").write_text(json.dumps(stats, indent=2, default=str))
    log(json.dumps(stats, indent=2, default=str))
    for f in sorted(OUT.glob("agromind_india_*")):
        log(f"{f.relative_to(OUT.parents[2])}  {f.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    sys.exit(main())
