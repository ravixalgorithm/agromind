from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .data_loader import NUMERIC, SOURCE_FILES, SOURCE_LABELS
from .model_service import CATEGORICAL, CropModelService
from .schemas import CropRequest, CropResponse, V3Request
from .v3_service import UnknownDistrict, V3Service

model_service = CropModelService()
v3 = V3Service()


@asynccontextmanager
async def lifespan(_: FastAPI):
    model_service.load_or_train()
    v3.warm_up()  # loads the large table and trains in the background; /v3 requests wait for it if needed
    yield


app = FastAPI(
    title="AgroMind Crop Recommendation API",
    version="3.1.0",
    description="Generalized crop recommendations for Indian fields from soil, climate, season and location.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict", response_model=CropResponse)
def predict_crop(payload: CropRequest) -> CropResponse:
    best_crop, top_recommendations = model_service.predict_top_k(payload.model_dump(), k=None)  # all crops, sorted
    return CropResponse(best_crop=best_crop, top_recommendations=top_recommendations)


@app.get("/metadata")
def metadata() -> dict:
    """Input fields, allowed options and per-crop growing profiles for the UI."""
    return model_service.metadata


@app.get("/model-info")
def model_info() -> dict[str, object]:
    """v2 fields stay at the top level (existing UI); the district-level v3 model is under "v3"."""
    return {**_v2_info(), "mode": "soil-test (N-P-K)", "v3": v3.info()}


def _v2_info() -> dict[str, object]:
    meta = model_service.metadata
    return {
        "model": "RandomForestClassifier (one-hot soil/season/state)",
        "features": NUMERIC + CATEGORICAL,
        "crops": len(meta.get("crops", {})),
        "training_rows": meta.get("rows"),
        "states": len(meta.get("options", {}).get("state", [])),
        "metrics": model_service.metrics,
        "dataset": "Combined Indian crop dataset",
        "sources": [
            {"name": SOURCE_LABELS[key], "rows": rows, "file": f"data/{SOURCE_FILES[key].name}"}
            for key, rows in (meta.get("coverage") or {}).items()
        ],
    }


@app.get("/dataset")
def dataset(limit: int = 80, offset: int = 0, crop: str | None = None) -> dict:
    """Paginated sample of the merged training rows for the raw-data viewer."""
    return model_service.sample_dataset(limit=limit, offset=offset, crop=crop or None)


# ── v3: district-level recommendations from the large real dataset ───────────


@app.get("/v3/options")
def v3_options() -> dict:
    """States -> districts -> seasons with records, plus the crop list."""
    return v3.options()


@app.get("/v3/district")
def v3_district(state: str, district: str, season: str) -> dict:
    """Default climate (season mean across years), soil and recent crop history for one district."""
    try:
        return v3.district(state, district, season)
    except UnknownDistrict as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


@app.post("/v3/predict")
def v3_predict(payload: V3Request) -> dict:
    """Every crop ranked by probability, with its historical median yield in that district."""
    body = payload.model_dump()
    try:
        return v3.predict(body.pop("state"), body.pop("district"), body.pop("season"), overrides=body)
    except UnknownDistrict as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


@app.get("/v3/dataset")
def v3_dataset(state: str | None = None, district: str | None = None, crop: str | None = None,
               year: int | None = None, page: int = 1, page_size: int = 50) -> dict:
    """Paginated, server-side filtered browse of all rows of the large table."""
    return v3.dataset(state=state, district=district, crop=crop, year=year, page=page, page_size=page_size)
