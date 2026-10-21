"""Merge the three source CSVs into one normalised training frame.

Sources
-------
india_crops.csv        multi-state samples (state / soil / season already present)
tamilnadu_crops.csv    Tamil Nadu field records (free-text soil, month names, durations)
Crop_recommendation.csv  the Kaggle agronomy set (numeric readings only)

They are folded into a single schema so the model learns from all of them:
N, P, K, temperature, humidity, ph, rainfall, soil, season, state, crop.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .india_ref import (
    CALENDAR,
    UNSPECIFIED_STATE,
    crop_slug,
    month_index,
    season_slug,
    soil_bucket,
)
from .schemas import NUMERIC_FIELDS

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"

SOURCE_FILES = {
    "india": DATA_DIR / "india_crops.csv",
    "tamilnadu": DATA_DIR / "tamilnadu_crops.csv",
    "kaggle": DATA_DIR / "Crop_recommendation.csv",
}

# dataset column names, in the order the UI walks them
NUMERIC = [col for col, *_ in NUMERIC_FIELDS.values()]

SOURCE_LABELS = {
    "india": "Multi-state",
    "tamilnadu": "Tamil Nadu",
    "kaggle": "Kaggle",
}


def _skeleton(index: pd.Index) -> pd.DataFrame:
    out = pd.DataFrame(index=index)
    for col in NUMERIC:
        out[col] = pd.Series(dtype="float64", index=index)
    # text columns default to "" — pandas 3 keeps NA (not "nan") for object/str columns,
    # so an explicit empty string is the only reliable "unknown" marker here.
    for col in ("soil", "season", "state", "crop", "source"):
        out[col] = ""
    out["water_source"] = None
    out["sow"] = None
    out["harvest"] = None
    out["duration"] = None
    return out


def _load_india() -> pd.DataFrame:
    raw = pd.read_csv(SOURCE_FILES["india"])
    out = _skeleton(raw.index)
    for col in NUMERIC:
        out[col] = pd.to_numeric(raw[col], errors="coerce")
    out["soil"] = raw["soil_type"].map(soil_bucket)
    out["season"] = raw["season"].map(season_slug)
    out["state"] = raw["state"].astype(str).str.strip()
    out["crop"] = raw["crop"].map(crop_slug)
    # seasonal rainfall already expresses irrigation dependence well enough for a soft label
    out["water_source"] = pd.to_numeric(raw["rainfall"], errors="coerce").map(
        lambda r: "rainfed" if r >= 900 else "irrigated"
    )
    out["source"] = "india"
    return out


def _load_tamilnadu() -> pd.DataFrame:
    raw = pd.read_csv(SOURCE_FILES["tamilnadu"])
    out = _skeleton(raw.index)
    out["N"] = pd.to_numeric(raw["N"], errors="coerce")
    out["P"] = pd.to_numeric(raw["P"], errors="coerce")
    out["K"] = pd.to_numeric(raw["K"], errors="coerce")
    out["temperature"] = pd.to_numeric(raw["TEMP"], errors="coerce")
    out["humidity"] = pd.to_numeric(raw["RELATIVE_HUMIDITY"], errors="coerce")
    out["ph"] = pd.to_numeric(raw["SOIL_PH"], errors="coerce")
    out["rainfall"] = pd.to_numeric(raw["WATERREQUIRED"], errors="coerce")
    out["soil"] = raw["SOIL"].map(soil_bucket)
    out["season"] = raw["SEASON"].map(season_slug)
    out["state"] = "Tamil Nadu"
    out["crop"] = raw["CROPS"].map(crop_slug)
    out["water_source"] = raw["WATER_SOURCE"].astype(str).str.strip().str.lower()
    out["source"] = "tamilnadu"
    out["sow"] = raw["SOWN"].map(month_index)
    out["harvest"] = raw["HARVESTED"].map(month_index)
    out["duration"] = pd.to_numeric(raw["CROPDURATION"], errors="coerce")
    return out


def _load_kaggle() -> pd.DataFrame:
    raw = pd.read_csv(SOURCE_FILES["kaggle"])
    out = _skeleton(raw.index)
    for col in NUMERIC:
        out[col] = pd.to_numeric(raw[col], errors="coerce")
    # this set carries no soil / season / location / irrigation columns
    out["soil"] = "Other"
    out["state"] = UNSPECIFIED_STATE
    out["crop"] = raw["label"].map(crop_slug)
    out["source"] = "kaggle"
    return out


_LOADERS = {"india": _load_india, "tamilnadu": _load_tamilnadu, "kaggle": _load_kaggle}


def load_dataset() -> pd.DataFrame:
    """Read every source that exists and return one tidy frame."""
    frames = [loader() for name, loader in _LOADERS.items() if SOURCE_FILES[name].exists()]
    if not frames:
        raise FileNotFoundError(f"No training CSV found in {DATA_DIR}.")

    df = pd.concat(frames, ignore_index=True)
    df = df.dropna(subset=NUMERIC + ["crop"])
    df = df[df["crop"].astype(str).str.len() > 0]

    for col in ("soil", "season", "state", "crop", "source"):
        df[col] = df[col].fillna("").astype(str).str.strip()

    # Fill gaps in season from whichever season dominates that crop elsewhere, then from the
    # curated calendar (Kaggle-only crops such as apple have no season column at all).
    known = df.loc[df["season"] != "", ["crop", "season"]]
    dominant = known.groupby("crop")["season"].agg(lambda s: s.mode().iloc[0]) if not known.empty else pd.Series(dtype="object")
    curated_season = {crop: entry["season"] for crop, entry in CALENDAR.items()}
    fallback = df["crop"].map(dominant).fillna(df["crop"].map(curated_season))
    df["season"] = df["season"].mask(df["season"] == "", fallback).fillna("kharif").astype(str)

    # Kaggle rows genuinely do not say how the field is watered — leave them unknown.
    df["water_source"] = df["water_source"].where(df["water_source"].isin(["irrigated", "rainfed"]))

    return df.reset_index(drop=True)


def calendar_for(df: pd.DataFrame, crop: str) -> dict:
    """Sowing / harvest window, season and duration for one crop.

    Curated values win; otherwise they are read off the records (the Tamil Nadu set
    carries SOWN, HARVESTED and CROPDURATION per row).
    """
    curated = CALENDAR.get(crop)
    if curated:
        return {
            "season": curated["season"],
            "sow_months": list(curated["sow"]),
            "harvest_months": list(curated["harvest"]),
            "duration_days": int(curated["days"]),
        }

    rows = df[df["crop"] == crop]
    sow = sorted({int(m) for m in rows["sow"].dropna().unique()})
    harvest = sorted({int(m) for m in rows["harvest"].dropna().unique()})
    seasons = rows["season"].mode()
    durations = rows["duration"].dropna()

    return {
        "season": seasons.iloc[0] if not seasons.empty else "kharif",
        "sow_months": sow,
        "harvest_months": harvest,
        "duration_days": int(durations.median()) if not durations.empty else 120,
    }
