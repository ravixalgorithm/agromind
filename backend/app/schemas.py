from typing import Literal

from pydantic import BaseModel, Field

# key -> (dataset column, label, unit, min, max, step). Used by data_loader.py for the v2 research notebook.
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
