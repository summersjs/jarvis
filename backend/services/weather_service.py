import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
CACHE_TTL_SECONDS = int(os.getenv("JARVIS_WEATHER_CACHE_SECONDS", "600"))
DEFAULT_LOCATION = os.getenv("JARVIS_WEATHER_LOCATION", "").strip()
_cache: dict[str, tuple[float, dict]] = {}
_cache_lock = threading.Lock()

WEATHER_CODES = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Rain showers", 81: "Rain showers", 82: "Heavy rain showers", 85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorms", 96: "Thunderstorms with hail", 99: "Severe thunderstorms with hail",
}
US_STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
}


class WeatherServiceError(Exception):
    pass


def get_weather(*, location: str = "", latitude: float | None = None, longitude: float | None = None, unit: str = "fahrenheit") -> dict:
    if unit not in {"fahrenheit", "celsius"}:
        raise WeatherServiceError("Weather unit must be fahrenheit or celsius.")
    requested_location = (location or DEFAULT_LOCATION).strip()
    requested_cache_key = f"location:{requested_location.lower()}:{unit}" if requested_location and (latitude is None or longitude is None) else ""
    if requested_cache_key:
        with _cache_lock:
            cached = _cache.get(requested_cache_key)
            if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
                return {**cached[1], "cacheHit": True}
    if latitude is None or longitude is None:
        if not requested_location:
            raise WeatherServiceError("Set a city and state or allow location access to load live weather.")
        latitude, longitude, resolved_name = resolve_location(requested_location)
    else:
        latitude, longitude = validate_coordinates(latitude, longitude)
        resolved_name = requested_location or "Current location"

    cache_key = f"{latitude:.3f}:{longitude:.3f}:{unit}"
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
            return {**cached[1], "cacheHit": True}

    query = urllib.parse.urlencode({
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,apparent_temperature,weather_code",
        "hourly": "precipitation_probability",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "temperature_unit": unit,
        "timezone": "auto",
        "forecast_days": 2,
    })
    payload = _fetch_json(f"{FORECAST_URL}?{query}")
    result = validate_weather_response(payload, resolved_name, unit, latitude, longitude)
    with _cache_lock:
        _cache[cache_key] = (time.monotonic(), result)
        if requested_cache_key:
            _cache[requested_cache_key] = _cache[cache_key]
    return {**result, "cacheHit": False}


def resolve_location(location: str) -> tuple[float, float, str]:
    parts = [part.strip() for part in location.split(",", 1)]
    city = parts[0]
    requested_region = parts[1] if len(parts) > 1 else ""
    requested_region = US_STATE_NAMES.get(requested_region.upper(), requested_region)
    query = urllib.parse.urlencode({"name": city, "count": 10, "language": "en", "format": "json"})
    payload = _fetch_json(f"{GEOCODING_URL}?{query}")
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        raise WeatherServiceError("That weather location could not be found.")
    item = next((candidate for candidate in results if requested_region and str(candidate.get("admin1", "")).lower() == requested_region.lower()), results[0])
    latitude, longitude = validate_coordinates(item.get("latitude"), item.get("longitude"))
    label = ", ".join(str(value) for value in [item.get("name"), item.get("admin1")] if value)
    return latitude, longitude, label or location


def validate_coordinates(latitude, longitude) -> tuple[float, float]:
    try:
        latitude, longitude = float(latitude), float(longitude)
    except (TypeError, ValueError) as exc:
        raise WeatherServiceError("Weather coordinates are invalid.") from exc
    if not math.isfinite(latitude) or not math.isfinite(longitude) or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise WeatherServiceError("Weather coordinates are outside the valid range.")
    return latitude, longitude


def validate_weather_response(payload: dict, location: str, unit: str, latitude: float | None = None, longitude: float | None = None) -> dict:
    current, daily, hourly = payload.get("current"), payload.get("daily"), payload.get("hourly")
    if not all(isinstance(value, dict) for value in [current, daily, hourly]):
        raise WeatherServiceError("The weather provider returned an incomplete response.")
    try:
        temperature = float(current["temperature_2m"])
        apparent = float(current["apparent_temperature"])
        weather_code = int(current["weather_code"])
        provider_time = str(current["time"])
        precipitation = int(daily["precipitation_probability_max"][0])
        high = float(daily["temperature_2m_max"][0])
        low = float(daily["temperature_2m_min"][0])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise WeatherServiceError("The weather provider response failed validation.") from exc
    numbers = [temperature, apparent, precipitation, high, low]
    if not all(math.isfinite(value) for value in numbers) or not 0 <= precipitation <= 100:
        raise WeatherServiceError("The weather provider returned invalid measurements.")
    fetched_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "available": True,
        "provider": "Open-Meteo",
        "location": location,
        "_coordinates": {"latitude": latitude, "longitude": longitude},
        "temperature": temperature,
        "apparentTemperature": apparent,
        "conditions": WEATHER_CODES.get(weather_code, "Unknown conditions"),
        "weatherCode": weather_code,
        "precipitationProbability": precipitation,
        "forecast": f"High {round(high)}°, low {round(low)}°. Precipitation chance {precipitation}%.",
        "unit": unit,
        "providerTimestamp": provider_time,
        "fetchedAt": fetched_at,
    }


def _fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "Jarvis/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise WeatherServiceError("Live weather is unavailable right now.") from exc
    if not isinstance(payload, dict):
        raise WeatherServiceError("The weather provider returned invalid data.")
    return payload


def clear_weather_cache():
    with _cache_lock:
        _cache.clear()
