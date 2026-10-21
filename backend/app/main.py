from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .data_loader import NUMERIC, SOURCE_FILES, SOURCE_LABELS
from .model_service import CATEGORICAL, CropModelService
from .schemas import CropRequest, CropResponse

model_service = CropModelService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    model_service.load_or_train()
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
    best_crop, top_recommendations = model_service.predict_top_k(payload.model_dump(), k=3)
    return CropResponse(best_crop=best_crop, top_recommendations=top_recommendations)


@app.get("/metadata")
def metadata() -> dict:
    """Input fields, allowed options and per-crop growing profiles for the UI."""
    return model_service.metadata


@app.get("/model-info")
def model_info() -> dict[str, object]:
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
