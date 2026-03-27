import os
import httpx
import logging
import asyncio
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY", "")

async def fetch_weather(lat: float, lon: float, client: httpx.AsyncClient) -> dict:
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
    try:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()
        return {
            "temp": data["main"]["temp"],
            "humidity": data["main"]["humidity"],
            "wind_speed": data["wind"]["speed"],
        }
    except Exception as e:
        logger.error(f"Error fetching weather data: {e}")
        return {"temp": 0.0, "humidity": 0.0, "wind_speed": 0.0}

async def fetch_pollution(lat: float, lon: float, client: httpx.AsyncClient) -> dict:
    # OpenAQ v2 latest data near coordinates up to 25km radius
    url = f"https://api.openaq.org/v2/latest?coordinates={lat},{lon}&radius=25000"
    headers = {}
    if OPENAQ_API_KEY and OPENAQ_API_KEY.strip() != "":
        headers["X-API-Key"] = OPENAQ_API_KEY

    try:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()

        pm25 = None
        no2 = None
        aqi = None

        if data.get("results") and len(data["results"]) > 0:
            # Aggregate or take the first record measurements
            measurements = data["results"][0].get("measurements", [])
            for m in measurements:
                if m["parameter"] == "pm25":
                    pm25 = m["value"]
                elif m["parameter"] == "no2":
                    no2 = m["value"]
                elif m["parameter"] == "aqi":
                    aqi = m["value"]
        
        return {
            "pm25": pm25,
            "no2": no2,
            "aqi": aqi
        }
    except Exception as e:
        logger.error(f"Error fetching OpenAQ data: {e}")
        return {"pm25": None, "no2": None, "aqi": None}

async def get_world_state(lat: float, lon: float) -> dict:
    """Fetches and fuses weather and pollution datasets."""
    async with httpx.AsyncClient() as client:
        weather_result, pollution_result = await asyncio.gather(
            fetch_weather(lat, lon, client),
            fetch_pollution(lat, lon, client)
        )
    
    return {
        "lat": lat,
        "lon": lon,
        **weather_result,
        **pollution_result
    }
