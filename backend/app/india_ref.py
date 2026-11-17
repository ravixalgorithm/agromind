"""India state / soil / crop reference used for dataset normalisation, metadata and calendars."""

from __future__ import annotations

STATES = (
    "Andhra Pradesh",
    "Assam",
    "Bihar",
    "Gujarat",
    "Haryana",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Telangana",
    "Uttar Pradesh",
    "West Bengal",
)

# Training rows that carry no state (Kaggle set) collapse into one bucket. The API never
# offers it as a choice, so it can never be selected from the UI.
UNSPECIFIED_STATE = "Unspecified"

# Canonical soil buckets. Free-text soil strings from the Tamil Nadu set are folded into
# these so the model sees a small, learnable category space instead of 34 raw variants.
SOIL_TYPES = ("Alluvial", "Black", "Clay", "Laterite", "Loamy", "Red", "Sandy", "Saline", "Silty", "Other")

# Ordered: first matching rule wins, so "silty Loamy soil" lands in Silty, not Loamy.
_SOIL_RULES = (
    ("alluvial", "Alluvial"),
    ("cotton soil", "Black"),
    ("black", "Black"),
    ("laterit", "Laterite"),
    ("salt", "Saline"),
    ("saline", "Saline"),
    ("silt", "Silty"),
    ("loam", "Loamy"),
    ("clay", "Clay"),
    ("sand", "Sandy"),
    ("red", "Red"),
)

SEASONS = ("kharif", "rabi", "zaid")
WATER_SOURCES = ("irrigated", "rainfed")


def soil_bucket(raw: object) -> str:
    text = str(raw).strip().lower()
    if not text or text == "nan":
        return "Other"
    if text in {s.lower() for s in SOIL_TYPES}:
        return next(s for s in SOIL_TYPES if s.lower() == text)
    for needle, bucket in _SOIL_RULES:
        if needle in text:
            return bucket
    return "Other"


def season_slug(raw: object) -> str:
    text = str(raw).strip().lower()
    return text if text in SEASONS else ""


# raw crop spelling -> canonical slug (keyed by slugified raw name)
_CROP_ALIASES = {
    # Tamil Nadu set
    "annualmoringa": "moringa",
    "moringa": "moringa",
    "ashgourd": "ashgourd",
    "bengalgram": "chickpea",
    "gram": "chickpea",
    "bhendi": "okra",
    "ladysfinger": "okra",
    "bittergourd": "bittergourd",
    "bottlegourd": "bottlegourd",
    "chillies": "chilli",
    "clusterbean": "clusterbean",
    "gingely": "sesame",
    "greengram": "mungbean",
    "pearlmillet": "bajra",
    "redgram": "pigeonpeas",
    "ribbedgourd": "ribbedgourd",
    "smallonion": "onion",
    "sorghum": "jowar",
    "soyabean": "soybean",
    "sweetpotato": "sweetpotato",
    "tapoica": "tapioca",
    "vegetablecowpea": "cowpea",
}

# Crops the starred (India) set already spells correctly, plus Kaggle slugs — identity entries
# are not needed; only genuine spelling variants live above.

# name + type for every crop the combined training set can produce.
CROP_META: dict[str, dict[str, str]] = {
    # ── Cereals & millets ────────────────────────────────────────────────
    "rice": {"name": "Rice", "type": "Cereal"},
    "wheat": {"name": "Wheat", "type": "Cereal"},
    "maize": {"name": "Maize", "type": "Cereal"},
    "barley": {"name": "Barley", "type": "Cereal"},
    "bajra": {"name": "Bajra", "type": "Millet"},
    "jowar": {"name": "Jowar", "type": "Millet"},
    "ragi": {"name": "Ragi", "type": "Millet"},
    "kudiraivali": {"name": "Kudiraivali", "type": "Millet"},
    "panivaragu": {"name": "Panivaragu", "type": "Millet"},
    "samai": {"name": "Samai", "type": "Millet"},
    "thinai": {"name": "Thinai", "type": "Millet"},
    "varagu": {"name": "Varagu", "type": "Millet"},
    # ── Pulses ───────────────────────────────────────────────────────────
    "chickpea": {"name": "Chickpea", "type": "Pulse"},
    "lentil": {"name": "Lentil", "type": "Pulse"},
    "blackgram": {"name": "Black gram", "type": "Pulse"},
    "mungbean": {"name": "Green gram", "type": "Pulse"},
    "pigeonpeas": {"name": "Pigeon pea", "type": "Pulse"},
    "horsegram": {"name": "Horse gram", "type": "Pulse"},
    "cowpea": {"name": "Cowpea", "type": "Pulse"},
    "peas": {"name": "Peas", "type": "Pulse"},
    "kidneybeans": {"name": "Kidney beans", "type": "Pulse"},
    "mothbeans": {"name": "Moth beans", "type": "Pulse"},
    # ── Oilseeds & fibres ────────────────────────────────────────────────
    "groundnut": {"name": "Groundnut", "type": "Oilseed"},
    "soybean": {"name": "Soybean", "type": "Oilseed"},
    "mustard": {"name": "Mustard", "type": "Oilseed"},
    "sesame": {"name": "Sesame", "type": "Oilseed"},
    "sunflower": {"name": "Sunflower", "type": "Oilseed"},
    "castor": {"name": "Castor", "type": "Oilseed"},
    "cotton": {"name": "Cotton", "type": "Fibre crop"},
    "jute": {"name": "Jute", "type": "Fibre crop"},
    # ── Sugar ────────────────────────────────────────────────────────────
    "sugarcane": {"name": "Sugarcane", "type": "Sugar crop"},
    "sugarbeet": {"name": "Sugar beet", "type": "Sugar crop"},
    # ── Spices & cash ────────────────────────────────────────────────────
    "chilli": {"name": "Chilli", "type": "Spice"},
    "turmeric": {"name": "Turmeric", "type": "Spice"},
    "tobacco": {"name": "Tobacco", "type": "Cash crop"},
    # ── Plantation ───────────────────────────────────────────────────────
    "coconut": {"name": "Coconut", "type": "Plantation"},
    "coffee": {"name": "Coffee", "type": "Plantation"},
    "tea": {"name": "Tea", "type": "Plantation"},
    "rubber": {"name": "Rubber", "type": "Plantation"},
    # ── Fruits ───────────────────────────────────────────────────────────
    "banana": {"name": "Banana", "type": "Fruit"},
    "mango": {"name": "Mango", "type": "Fruit"},
    "apple": {"name": "Apple", "type": "Fruit"},
    "grapes": {"name": "Grapes", "type": "Fruit"},
    "orange": {"name": "Orange", "type": "Fruit"},
    "papaya": {"name": "Papaya", "type": "Fruit"},
    "pomegranate": {"name": "Pomegranate", "type": "Fruit"},
    "watermelon": {"name": "Watermelon", "type": "Fruit"},
    "muskmelon": {"name": "Muskmelon", "type": "Fruit"},
    # ── Root & tuber ─────────────────────────────────────────────────────
    "potato": {"name": "Potato", "type": "Vegetable"},
    "sweetpotato": {"name": "Sweet potato", "type": "Root & tuber"},
    "tapioca": {"name": "Tapioca", "type": "Root & tuber"},
    "beetroot": {"name": "Beetroot", "type": "Root & tuber"},
    "carrot": {"name": "Carrot", "type": "Root & tuber"},
    "radish": {"name": "Radish", "type": "Root & tuber"},
    "onion": {"name": "Onion", "type": "Bulb vegetable"},
    "elephantfootyam": {"name": "Elephant foot yam", "type": "Root & tuber"},
    # ── Vegetables ───────────────────────────────────────────────────────
    "tomato": {"name": "Tomato", "type": "Vegetable"},
    "brinjal": {"name": "Brinjal", "type": "Vegetable"},
    "okra": {"name": "Okra (bhendi)", "type": "Vegetable"},
    "cabbage": {"name": "Cabbage", "type": "Vegetable"},
    "cauliflower": {"name": "Cauliflower", "type": "Vegetable"},
    "capsicum": {"name": "Capsicum", "type": "Vegetable"},
    "cucumber": {"name": "Cucumber", "type": "Vegetable"},
    "pumpkin": {"name": "Pumpkin", "type": "Vegetable"},
    "ashgourd": {"name": "Ash gourd", "type": "Vegetable"},
    "bittergourd": {"name": "Bitter gourd", "type": "Vegetable"},
    "bottlegourd": {"name": "Bottle gourd", "type": "Vegetable"},
    "ribbedgourd": {"name": "Ribbed gourd", "type": "Vegetable"},
    "snakegourd": {"name": "Snake gourd", "type": "Vegetable"},
    "chowchow": {"name": "Chow chow", "type": "Vegetable"},
    "tinda": {"name": "Tinda", "type": "Vegetable"},
    "clusterbean": {"name": "Cluster bean", "type": "Vegetable"},
    "frenchbean": {"name": "French bean", "type": "Vegetable"},
    "moringa": {"name": "Moringa", "type": "Vegetable"},
}

# Sowing / harvest months (0 = Jan), season and duration.
# Only crops the data cannot speak for are curated here; everything else is derived from the
# rows themselves (the Tamil Nadu set carries SOWN / HARVESTED / CROPDURATION per record).
CALENDAR: dict[str, dict] = {
    "rice": {"season": "kharif", "sow": [5, 6], "harvest": [9, 10], "days": 120},
    "wheat": {"season": "rabi", "sow": [10, 11], "harvest": [2, 3], "days": 120},
    "maize": {"season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 100},
    "sugarcane": {"season": "kharif", "sow": [1, 2], "harvest": [11, 0], "days": 360},
    "cotton": {"season": "kharif", "sow": [4, 5], "harvest": [9, 10], "days": 160},
    "jute": {"season": "kharif", "sow": [2, 3], "harvest": [6, 7], "days": 120},
    "groundnut": {"season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 110},
    "soybean": {"season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 100},
    "mustard": {"season": "rabi", "sow": [9, 10], "harvest": [1, 2], "days": 110},
    "chickpea": {"season": "rabi", "sow": [9, 10], "harvest": [1, 2], "days": 110},
    "lentil": {"season": "rabi", "sow": [9, 10], "harvest": [1, 2], "days": 110},
    "potato": {"season": "rabi", "sow": [9, 10], "harvest": [0, 1], "days": 90},
    "banana": {"season": "kharif", "sow": [5, 6], "harvest": [11, 0], "days": 300},
    "coconut": {"season": "kharif", "sow": [4, 5], "harvest": [11, 0], "days": 365},
    "coffee": {"season": "kharif", "sow": [5, 6], "harvest": [10, 11], "days": 240},
    "tea": {"season": "kharif", "sow": [2, 3], "harvest": [11, 0], "days": 300},
    "tobacco": {"season": "kharif", "sow": [7, 8], "harvest": [0, 1], "days": 120},
    "chilli": {"season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 120},
    "turmeric": {"season": "kharif", "sow": [4, 5], "harvest": [0, 1], "days": 240},
    "bajra": {"season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 90},
    "jowar": {"season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 110},
    "ragi": {"season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 110},
    "barley": {"season": "rabi", "sow": [9, 10], "harvest": [2, 3], "days": 110},
    "sesame": {"season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 90},
    "rubber": {"season": "kharif", "sow": [4, 5], "harvest": [11, 0], "days": 365},
    # Kaggle-only crops — no calendar columns anywhere in the source data.
    "apple": {"season": "rabi", "sow": [0, 1], "harvest": [8, 9], "days": 300},
    "grapes": {"season": "rabi", "sow": [9, 10], "harvest": [1, 2], "days": 150},
    "mango": {"season": "zaid", "sow": [0, 1], "harvest": [4, 5], "days": 180},
    "orange": {"season": "rabi", "sow": [1, 2], "harvest": [10, 11], "days": 300},
    "papaya": {"season": "kharif", "sow": [5, 6], "harvest": [11, 0], "days": 270},
    "pomegranate": {"season": "kharif", "sow": [1, 2], "harvest": [8, 9], "days": 200},
    "kidneybeans": {"season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 110},
    "mothbeans": {"season": "kharif", "sow": [6, 7], "harvest": [8, 9], "days": 75},
    "mungbean": {"season": "kharif", "sow": [5, 6], "harvest": [7, 8], "days": 70},
    "pigeonpeas": {"season": "kharif", "sow": [5, 6], "harvest": [11, 0], "days": 180},
    "watermelon": {"season": "zaid", "sow": [1, 2], "harvest": [4, 5], "days": 100},
    "muskmelon": {"season": "zaid", "sow": [1, 2], "harvest": [4, 5], "days": 90},
}

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_MONTH_INDEX = {m.lower(): i for i, m in enumerate(MONTHS)}


def crop_slug(raw: object) -> str:
    text = "".join(ch for ch in str(raw).strip().lower() if ch.isalnum())
    return _CROP_ALIASES.get(text, text)


def crop_name(slug: str) -> str:
    meta = CROP_META.get(slug)
    if meta:
        return meta["name"]
    return slug[:1].upper() + slug[1:]


def month_index(label: object) -> int | None:
    return _MONTH_INDEX.get(str(label).strip().lower()[:3])


def month_span(indexes: list[int]) -> str:
    labels = [MONTHS[i] for i in sorted(set(indexes)) if 0 <= i < 12]
    if not labels:
        return "—"
    if len(labels) == 1:
        return labels[0]
    return f"{labels[0]}–{labels[-1]}"
