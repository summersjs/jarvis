import unittest
from unittest.mock import patch

from backend.services import weather_service


GEOCODE = {"results": [{"name": "Pittsburgh", "admin1": "Pennsylvania", "latitude": 40.44, "longitude": -79.99}]}
FORECAST = {
    "current": {"temperature_2m": 72.4, "apparent_temperature": 71.1, "weather_code": 2, "time": "2026-07-13T12:00"},
    "hourly": {"precipitation_probability": [10]},
    "daily": {"weather_code": [2], "temperature_2m_max": [78.0], "temperature_2m_min": [61.0], "precipitation_probability_max": [20]},
}
WAYNESBORO_GEOCODE = {"results": [{"name": "Waynesboro", "admin1": "Virginia", "latitude": 38.07, "longitude": -78.89}]}


class WeatherServiceTests(unittest.TestCase):
    def setUp(self):
        weather_service.clear_weather_cache()

    @patch("backend.services.weather_service._fetch_json", side_effect=[GEOCODE, FORECAST])
    def test_validated_provider_weather_is_used(self, fetch):
        result = weather_service.get_weather(location="Pittsburgh, PA")
        self.assertTrue(result["available"])
        self.assertEqual(result["provider"], "Open-Meteo")
        self.assertEqual(result["temperature"], 72.4)
        self.assertEqual(result["conditions"], "Partly cloudy")
        self.assertFalse(result["cacheHit"])
        self.assertEqual(fetch.call_count, 2)

    @patch.object(weather_service, "DEFAULT_LOCATION", "Waynesboro, VA")
    @patch("backend.services.weather_service._fetch_json", side_effect=[WAYNESBORO_GEOCODE, FORECAST])
    def test_waynesboro_is_used_when_no_location_is_supplied(self, fetch):
        result = weather_service.get_weather()
        self.assertEqual(result["location"], "Waynesboro, Virginia")
        self.assertIn("name=Waynesboro", fetch.call_args_list[0].args[0])

    @patch("backend.services.weather_service._fetch_json", side_effect=[GEOCODE, FORECAST])
    def test_unexpired_cache_avoids_provider_requests(self, fetch):
        weather_service.get_weather(location="Pittsburgh, PA")
        cached = weather_service.get_weather(location="Pittsburgh, PA")
        self.assertTrue(cached["cacheHit"])
        self.assertEqual(fetch.call_count, 2)

    @patch("backend.services.weather_service._fetch_json", side_effect=[GEOCODE, FORECAST, GEOCODE, FORECAST])
    @patch("backend.services.weather_service.time.monotonic", side_effect=[0, 700, 700, 700])
    def test_expired_cache_refreshes(self, _clock, fetch):
        weather_service.get_weather(location="Pittsburgh, PA")
        weather_service.get_weather(location="Pittsburgh, PA")
        self.assertEqual(fetch.call_count, 4)

    def test_invalid_provider_response_is_rejected(self):
        with self.assertRaises(weather_service.WeatherServiceError):
            weather_service.validate_weather_response({"current": {}}, "Somewhere", "fahrenheit")


if __name__ == "__main__":
    unittest.main()
