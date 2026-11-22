from typing import Literal

from pydantic import BaseModel, Field

from .india_ref import SEASONS, SOIL_TYPES, STATES, WATER_SOURCES

STATE_NAMES = STATES

# key -> (dataset column, label, unit, min, max, step)
# Bounds span the union of all three training sources so any slider position is a legal request.
NUMERIC_FIELDS = {
    "N": ("N", "Nitrogen", "", 0, 450, 1),
    "P": ("P", "Phosphorus", "", 0, 150, 1),
    "K": ("K", "Potassium", "", 0, 450, 1),
    "ph": ("ph", "Soil pH", "", 3, 10, 0.1),
    "temperature": ("temperature", "Temperature", "°C", 0, 50, 0.5),
    "humidity": ("humidity", "Humidity", "%", 0, 100, 1),
    "water": ("rainfall", "Seasonal rainfall", "mm", 0, 4000, 10),
}


def _num(key: str):
    _, label, _, lo, hi, _ = NUMERIC_FIELDS[key]
    return Field(..., ge=lo, le=hi, description=label)


class CropRequest(BaseModel):
    N: float = _num("N")
    P: float = _num("P")
    K: float = _num("K")
    ph: float = _num("ph")
    temperature: float = _num("temperature")
    humidity: float = _num("humidity")
    water: float = _num("water")
    soil: Literal[SOIL_TYPES] = Field(..., description="Soil type")
    season: Literal[SEASONS] = Field(..., description="Growing season")
    water_source: Literal[WATER_SOURCES] = Field(..., description="Irrigated or rainfed")
    state: Literal[STATE_NAMES] = Field(..., description="Indian state")


class CropPrediction(BaseModel):
    crop: str
    confidence: float


class CropResponse(BaseModel):
    best_crop: str
    top_recommendations: list[CropPrediction]


class V3Overrides(BaseModel):
    """Optional edits to the district's default climate / soil. Climate feeds the model; soil is context only."""

    temperature: float | None = Field(None, ge=-30, le=50, description="Mean season temperature, °C")
    humidity: float | None = Field(None, ge=0, le=100, description="Mean season relative humidity, %")
    rainfall: float | None = Field(None, ge=0, le=10000, description="Season total rainfall, mm")
    soil_ph: float | None = Field(None, ge=3, le=10)
    soil_n_gkg: float | None = Field(None, ge=0)
    soil_soc_gkg: float | None = Field(None, ge=0)
    soil_clay_pct: float | None = Field(None, ge=0, le=100)
    soil_sand_pct: float | None = Field(None, ge=0, le=100)
    soil_cec_cmolkg: float | None = Field(None, ge=0)


class V3Request(V3Overrides):
    state: str
    district: str
    season: Literal["kharif", "rabi", "zaid", "whole_year"]
