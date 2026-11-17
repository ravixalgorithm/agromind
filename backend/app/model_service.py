from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, top_k_accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder

from .data_loader import NUMERIC, SOURCE_LABELS, calendar_for, load_dataset
from .india_ref import UNSPECIFIED_STATE, crop_name, month_span
from .schemas import NUMERIC_FIELDS

BASE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE_DIR / "models"
MODEL_PATH = MODELS_DIR / "crop_model_v2.joblib"

CATEGORICAL = ["soil", "season", "state"]
TARGET = "crop"


def build_metadata(df: pd.DataFrame) -> dict:
    fields = [
        {"key": key, "label": label, "unit": unit, "min": lo, "max": hi, "step": step}
        for key, (_, label, unit, lo, hi, step) in NUMERIC_FIELDS.items()
    ]

    # one pass for every crop/field quantile instead of one pass per crop
    quantiles = df.groupby(TARGET)[NUMERIC].quantile([0.1, 0.5, 0.9])

    crops = {}
    for crop, g in df.groupby(TARGET):
        q = quantiles.loc[crop]
        calendar = calendar_for(df, crop)
        soils = g["soil"].value_counts(normalize=True)
        soils = soils.loc[soils >= 0.08].index.tolist()
        watered = g["water_source"].dropna()
        states = g.loc[g["state"] != UNSPECIFIED_STATE, "state"].value_counts().head(8)
        sources = g["source"].value_counts()
        count = int(len(g))

        crops[crop] = {
            "name": crop_name(crop),
            "type": _type_for(crop),
            "season": calendar["season"],
            "duration_days": calendar["duration_days"],
            "sown": month_span(calendar["sow_months"]),
            "harvested": month_span(calendar["harvest_months"]),
            "sow_months": calendar["sow_months"],
            "harvest_months": calendar["harvest_months"],
            "soils": soils or ["Other"],
            "water_source": watered.mode().iloc[0] if not watered.empty else "irrigated",
            "states": states.index.tolist(),
            "rows": count,
            "sources": [SOURCE_LABELS.get(s, s) for s in sources.index.tolist()],
            "profile": {key: [round(float(q.loc[p, col]), 1) for p in (0.1, 0.5, 0.9)] for key, (col, *_) in NUMERIC_FIELDS.items()},
        }

    coverage = {
        name: int((df["source"] == name).sum()) for name in SOURCE_LABELS if (df["source"] == name).any()
    }

    return {
        "fields": fields,
        "options": {
            "soil": list(_soil_options(df)),
            "season": sorted(df["season"].unique().tolist()),
            "water_source": ["irrigated", "rainfed"],
            "state": sorted(df.loc[df["state"] != UNSPECIFIED_STATE, "state"].unique().tolist()),
        },
        "crops": crops,
        "rows": int(len(df)),
        "coverage": coverage,
        "sources": [SOURCE_LABELS[name] for name in SOURCE_LABELS if (df["source"] == name).any()],
    }


def _type_for(crop: str) -> str:
    from .india_ref import CROP_META

    return CROP_META.get(crop, {}).get("type", "Crop")


def _soil_options(df: pd.DataFrame) -> list[str]:
    from .india_ref import SOIL_TYPES

    present = set(df["soil"].unique())
    return [s for s in SOIL_TYPES if s in present]


class CropModelService:
    def __init__(self) -> None:
        self.model = None
        self.metrics: dict[str, float] = {}
        self.metadata: dict = {}
        self.df: pd.DataFrame | None = None

    def load_or_train(self) -> None:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)

        df = load_dataset()
        self.df = df
        self.metadata = build_metadata(df)

        if MODEL_PATH.exists():
            bundle = joblib.load(MODEL_PATH)
            # a cached model is only valid for the dataset that produced it
            if bundle.get("rows") == len(df) and bundle.get("crops") == len(self.metadata["crops"]):
                self.model, self.metrics = bundle["model"], bundle["metrics"]
                return

        self.train()

    def train(self) -> dict[str, float]:
        df = self.df if self.df is not None else load_dataset()
        self.df = df

        x = df[NUMERIC + CATEGORICAL]
        y = df[TARGET]
        x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42, stratify=y)

        model = make_pipeline(
            ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL)], remainder="passthrough"),
            RandomForestClassifier(n_estimators=300, min_samples_leaf=2, random_state=42, n_jobs=-1),
        )
        model.fit(x_train, y_train)

        probabilities = model.predict_proba(x_test)
        self.metrics = {
            "accuracy": round(float(accuracy_score(y_test, model.predict(x_test))), 4),
            "top3_accuracy": round(
                float(top_k_accuracy_score(y_test, probabilities, k=3, labels=model.classes_)), 4
            ),
            "test_rows": int(len(x_test)),
            "train_rows": int(len(x_train)),
            "crops": int(y.nunique()),
        }
        joblib.dump(
            {"model": model, "metrics": self.metrics, "rows": len(df), "crops": len(self.metadata["crops"])},
            MODEL_PATH,
            compress=3,
        )
        self.model = model
        return self.metrics

    # ── read APIs ────────────────────────────────────────────────────────

    def sample_dataset(self, *, limit: int = 80, offset: int = 0, crop: str | None = None) -> dict:
        if self.df is None:
            self.load_or_train()

        view = self.df
        if crop:
            from .india_ref import crop_slug

            view = view[view[TARGET] == crop_slug(crop)]

        total = len(view)
        limit = max(1, min(limit, 200))
        offset = max(0, min(offset, max(total - 1, 0)))
        page = view.iloc[offset : offset + limit]

        columns = [
            ("crop", "crop"),
            ("source", "source"),
            ("state", "state"),
            ("soil", "soil"),
            ("season", "season"),
            ("water_source", "water"),
            ("N", "N"),
            ("P", "P"),
            ("K", "K"),
            ("ph", "pH"),
            ("temperature", "temp"),
            ("humidity", "RH"),
            ("rainfall", "rain_mm"),
        ]

        rows = []
        for _, record in page.iterrows():
            item = {}
            for col, key in columns:
                val = record[col]
                if key == "crop":
                    item[key] = crop_name(str(val))
                elif key == "source":
                    item[key] = SOURCE_LABELS.get(str(val), str(val))
                elif key == "water":
                    item[key] = str(val) if isinstance(val, str) else "—"
                elif isinstance(val, (int, float)) and not isinstance(val, bool):
                    item[key] = round(float(val), 1)
                else:
                    item[key] = str(val)
            rows.append(item)

        return {
            "columns": [key for _, key in columns],
            "rows": rows,
            "total": int(total),
            "limit": limit,
            "offset": offset,
            "crop": crop,
        }

    def predict_top_k(self, payload: dict, k: int = 3) -> tuple[str, list[dict[str, float | str]]]:
        if self.model is None:
            self.load_or_train()

        row = {col: [payload[key]] for key, (col, *_) in NUMERIC_FIELDS.items()}
        row.update({c: [payload[c]] for c in CATEGORICAL})
        probabilities = self.model.predict_proba(pd.DataFrame(row))[0]

        top = sorted(zip(self.model.classes_, probabilities), key=lambda pair: pair[1], reverse=True)[:k]
        results = [{"crop": str(c), "confidence": round(float(p), 4)} for c, p in top]
        return results[0]["crop"], results
