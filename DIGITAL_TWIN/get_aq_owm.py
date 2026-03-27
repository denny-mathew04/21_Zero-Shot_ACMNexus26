import requests
import datetime
import pandas as pd
import numpy as np

API_KEY = "3c1afad423bd480244484f36abe82ec2"
BASE_URL = "http://api.openweathermap.org/data/2.5/air_pollution"

def get_owm_air_pollution_history(lat, lon, start_date_str, end_date_str):
    """
    Fetches historical air pollution data from OpenWeatherMap.
    Dates should be in 'YYYY-MM-DD' format.
    Returns a dictionary of dataframes for each pollutant.
    """
    try:
        # Convert YYYY-MM-DD to unix timestamp
        start_dt = datetime.datetime.strptime(start_date_str, "%Y-%m-%d")
        end_dt = datetime.datetime.strptime(end_date_str, "%Y-%m-%d")
        # Extend end_dt to end of the day to capture all hours
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
        
        start_unix = int(start_dt.timestamp())
        end_unix = int(end_dt.timestamp())
        
        url = f"{BASE_URL}/history"
        params = {
            "lat": lat,
            "lon": lon,
            "start": start_unix,
            "end": end_unix,
            "appid": API_KEY
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if not data or "list" not in data or len(data["list"]) == 0:
            return {}
            
        # Parse the 'list' array
        records = data["list"]
        
        # Structure we want to return:
        # {
        #    'pm25': DataFrame(datetime, val),
        #    'pm10': DataFrame(datetime, val),
        #    ...
        # }
        pollutant_map = {
            "co": "co",
            "no": "no",
            "no2": "no2",
            "o3": "o3",
            "so2": "so2",
            "pm2_5": "pm25",
            "pm10": "pm10",
            "nh3": "nh3"
        }
        
        # OWM API gives us components per hour
        # Let's collect them into lists first
        collected = {v: [] for v in pollutant_map.values()}
        
        for item in records:
            dt_obj = datetime.datetime.fromtimestamp(item["dt"])
            comps = item.get("components", {})
            for owm_key, app_key in pollutant_map.items():
                if owm_key in comps:
                    collected[app_key].append({'datetime': dt_obj, 'val': comps[owm_key]})
                    
        # Convert to DataFrames
        result_dfs = {}
        for k, v in collected.items():
            if len(v) > 0:
                df = pd.DataFrame(v)
                # Group by hour to ensure uniqueness and calculate mean just in case
                df['datetime'] = df['datetime'].dt.round('H')
                df = df.groupby('datetime')['val'].mean().reset_index()
                result_dfs[k] = df
                
        return result_dfs
        
    except Exception as e:
        print(f"Error fetching OWM Air Pollution History: {e}")
        return {}

def get_owm_air_pollution_current(lat, lon):
    """Gets current air pollution data (fallback mostly)"""
    url = f"{BASE_URL}"
    params = {
        "lat": lat,
        "lon": lon,
        "appid": API_KEY
    }
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        if "list" in data and len(data["list"]) > 0:
            return data["list"][0]
        return None
    except Exception as e:
        print(f"Error fetching OWM Current Air Pollution: {e}")
        return None
