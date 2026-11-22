"""AgroMind API: district-level crop recommendations on Government of India APY data.

POST /predict serves the final model, AgroMind v4 (YieldRank + 90 % conformal crop sets). The v3
district classifier still backs /options, /district and /dataset, and answers /predict only for a
district-season with no recent crop records (labelled "fallback": "v3"). /v3/* are aliases of the
root paths, kept for clients written against the earlier API.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import V3Request
from .v3_service import UnknownDistrict, V3Service
from .v4_service import NoCandidates, V4Service

v3 = V3Service()
v4 = V4Service()


@asynccontextmanager
async def lifespan(_: FastAPI):
    v3.warm_up()  # both load in the background; requests wait for them if they arrive first
    v4.warm_up()
    yield


app = FastAPI(
    title="AgroMind Crop Recommendation API",
    version="5.0.0",
    description="Crop recommendations for an Indian district and season (AgroMind v4: YieldRank + conformal sets), "
                "learned from Government of India district-wise crop statistics (DES APY, 1997-98 to 2022-23) "
                "with NASA POWER climate and ISRIC SoilGrids soil.",
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
    """Candidate crops ranked by YieldRank, with the 90 % conformal set and expected / historical yield."""
    body = payload.model_dump()
    state, dist, season = body.pop("state"), body.pop("district"), body.pop("season")
    try:
        v3.district_row(state, dist, season)  # 404 for an unknown state / district / season
    except UnknownDistrict as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    try:
        return v4.predict(state, dist, season, body)  # only the values the user edited override the model's defaults
    except NoCandidates:
        out = v3.predict(state, dist, season, overrides=body)
        return {"model": "AgroMind v3", "fallback": "v3",
                "fallback_reason": "no crop with a recorded yield in this district-season, so YieldRank has no candidates",
                **out}


@app.get("/dataset")
@app.get("/v3/dataset")
def dataset(state: str | None = None, district: str | None = None, crop: str | None = None,
            year: int | None = None, page: int = 1, page_size: int = 50) -> dict:
    """Paginated, server-side filtered browse of all rows of the large table."""
    return v3.dataset(state=state, district=district, crop=crop, year=year, page=page, page_size=page_size)


@app.get("/model-info")
def model_info() -> dict:
    """The final model (v4) at the top level; v3 and v1/v2 as history."""
    v3_info, v4_info = v3.info(), v4.info()
    # all APY rows /dataset serves, next to the v4 training subset (rows with a crop slug and yield percentile)
    train = v4_info["data"]
    v4_info["data"] = {"records": v3_info["rows"], "districts": v3_info["districts"], "locations": v3_info["locations"],
                       "states": v3_info["states"], **{k: v for k, v in train.items() if k != "states"},
                       "training_states": train.get("states")}
    return {**v4_info, "history": {"v3": {k: v3_info[k] for k in ("model", "rows", "training_rows", "crops", "states",
                                                                       "districts", "locations", "years", "metrics")},
                                     **v3.history()}}
