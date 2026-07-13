import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from backend.core.security import verify_api_key
from backend.services.weather_service import WeatherServiceError, get_weather

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/weather/current")
def current_weather(
    location: str = Query(default="", max_length=160),
    latitude: float | None = None,
    longitude: float | None = None,
    unit: str = Query(default="fahrenheit", pattern="^(fahrenheit|celsius)$"),
):
    started = time.monotonic()
    try:
        result = get_weather(location=location, latitude=latitude, longitude=longitude, unit=unit)
        coordinates = result.pop("_coordinates", None)
        if os.getenv("ENVIRONMENT", "development").lower() in {"development", "dev", "local"}:
            fetched_at = result.get("fetchedAt")
            try:
                response_age = max(0, round((datetime.now(timezone.utc) - datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))).total_seconds()))
            except (AttributeError, TypeError, ValueError):
                response_age = None
            result["diagnostics"] = {
                "provider": result["provider"],
                "requestedLocation": location or ("browser coordinates" if latitude is not None else "configured default"),
                "cache": "hit" if result["cacheHit"] else "miss",
                "fetchMilliseconds": round((time.monotonic() - started) * 1000),
                "responseAgeSeconds": response_age,
                "resolvedCoordinates": coordinates,
            }
        return result
    except WeatherServiceError as exc:
        return {"available": False, "reason": str(exc), "provider": "Open-Meteo", "fetchedAt": None}
