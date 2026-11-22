"""AgroMind API: one mode, district-level crop recommendations on Government of India APY data.

The /v3/* paths are aliases of the root paths, kept for clients written against the earlier
two-mode API.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import V3Request
from .v3_service import UnknownDistrict, V3Service

v3 = V3Service()


@asynccontextmanager
async def lifespan(_: FastAPI):
    v3.warm_up()  # loads the large table and trains in the background; /predict waits for it if needed
    yield


app = FastAPI(
    title="AgroMind Crop Recommendation API",
    version="4.0.0",
    description="Crop recommendations for an Indian district and season, learned from Government of India "
                "district-wise crop statistics (DES APY, 1997-98 to 2022-23) with NASA POWER climate.",
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


@app.get("/options")
@app.get("/v3/options")
def options() -> dict:
    """States -> districts -> seasons with records, plus the crop list."""
    return v3.options()


@app.get("/district")
@app.get("/v3/district")
def district(state: str, district: str, season: str) -> dict:
    """Default climate (season mean across years), soil and recent crop history for one district."""
    try:
        return v3.district(state, district, season)
    except UnknownDistrict as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


@app.post("/predict")
@app.post("/v3/predict")
def predict(payload: V3Request) -> dict:
    """Every crop ranked by probability, with its historical median yield in that district."""
    body = payload.model_dump()
    try:
        return v3.predict(body.pop("state"), body.pop("district"), body.pop("season"), overrides=body)
    except UnknownDistrict as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


@app.get("/dataset")
@app.get("/v3/dataset")
def dataset(state: str | None = None, district: str | None = None, crop: str | None = None,
            year: int | None = None, page: int = 1, page_size: int = 50) -> dict:
    """Paginated, server-side filtered browse of all rows of the large table."""
    return v3.dataset(state=state, district=district, crop=crop, year=year, page=page, page_size=page_size)


@app.get("/model-info")
def model_info() -> dict:
    """The served model, plus v1/v2 headline numbers from results.json as research history."""
    return {**v3.info(), "history": v3.history()}
