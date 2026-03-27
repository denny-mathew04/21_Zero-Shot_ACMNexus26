from flask import Flask, render_template, request, jsonify
import get_weather_data as dc
import get_aq_owm as aq_owm
import pandas as pd
import requests
import traceback
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from datetime import datetime, timedelta

app = Flask(__name__)

# --- Fetch Dynamic Weather Data ---
def get_weather_data(lat, lon, start_date, end_date):
    """Fetches historical weather from Open-Meteo API"""
    url = f"https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m"
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        data = response.json()
        df = pd.DataFrame({
            "datetime": pd.to_datetime(data["hourly"]["time"]),
            "temp": data["hourly"]["temperature_2m"],
            "humidity": data["hourly"]["relative_humidity_2m"],
            "wind": data["hourly"]["wind_speed_10m"]
        })
        return df
    return None

# --- Multivariate AI Prediction ---
def predict_aqi_advanced(df_merged, model_name="random_forest", steps=24, forecast_start=None):
    # Drop rows where we don't even have past AQ data or weather features for training
    train = df_merged.dropna(subset=['val', 'temp', 'humidity', 'wind']).copy()
    
    if len(train) < 5: return []

    # Features: Air Quality, Temperature, Humidity, Wind Speed
    features = ['val', 'temp', 'humidity', 'wind']
    
    # Target is the NEXT hour's pollution
    train['target'] = train['val'].shift(-1)
    train_clean = train.dropna(subset=['target'])
    
    if len(train_clean) < 5: return []

    X = train_clean[features].values
    y = train_clean['target'].values
    
    if model_name == "linear_regression":
        model = LinearRegression()
    elif model_name == "gradient_boosting":
        model = GradientBoostingRegressor(n_estimators=50, random_state=42)
    else:
        model = RandomForestRegressor(n_estimators=50, random_state=42)
        
    model.fit(X, y)
    
    # Predict future using recursive forecasting
    predictions = []
    
    last_known_idx = train.index[-1]
    current_val = train.loc[last_known_idx, 'val']
    
    # Future data array
    if forecast_start is not None:
        future_data = df_merged[df_merged['datetime'] > forecast_start]
    else:
        future_data = df_merged.loc[last_known_idx + 1 :]
    
    # Fallback if no future weather
    if future_data.empty:
        last_row = train.loc[last_known_idx]
        for _ in range(steps):
             features_array = [[current_val, last_row['temp'], last_row['humidity'], last_row['wind']]]
             pred = model.predict(features_array)[0]
             predictions.append(round(pred, 2))
             current_val = pred
        return predictions

    for _, row in future_data.head(steps).iterrows():
        temp = row['temp'] if pd.notna(row['temp']) else 25.0
        humidity = row['humidity'] if pd.notna(row['humidity']) else 50.0
        wind = row['wind'] if pd.notna(row['wind']) else 5.0
        
        features_array = [[current_val, temp, humidity, wind]]
        pred = model.predict(features_array)[0]
        predictions.append(round(pred, 2))
        current_val = pred
        
    # If future_data has fewer rows than steps, pad the rest
    while len(predictions) < steps:
        features_array = [[current_val, 25.0, 50.0, 5.0]]
        pred = model.predict(features_array)[0]
        predictions.append(round(pred, 2))
        current_val = pred
        
    return predictions

    return predictions

def calculate_epa_aqi(pollutants):
    """Calculates US-EPA Standard AQI based on multiple pollutants."""
    def piece_wise_linear(c, breakpoints):
        for bp in breakpoints:
            if bp['clo'] <= c <= bp['chi']:
                return ((bp['ihi'] - bp['ilo']) / (bp['chi'] - bp['clo'])) * (c - bp['clo']) + bp['ilo']
        return 500 # Default to max if way out of bounds
    
    # PM2.5 breakpoints (µg/m³)
    pm25_bp = [
        {'clo': 0.0, 'chi': 12.0, 'ilo': 0, 'ihi': 50},
        {'clo': 12.1, 'chi': 35.4, 'ilo': 51, 'ihi': 100},
        {'clo': 35.5, 'chi': 55.4, 'ilo': 101, 'ihi': 150},
        {'clo': 55.5, 'chi': 150.4, 'ilo': 151, 'ihi': 200},
        {'clo': 150.5, 'chi': 250.4, 'ilo': 201, 'ihi': 300},
        {'clo': 250.5, 'chi': 350.4, 'ilo': 301, 'ihi': 400},
        {'clo': 350.5, 'chi': 500.4, 'ilo': 401, 'ihi': 500}
    ]
    # PM10 breakpoints (µg/m³)
    pm10_bp = [
        {'clo': 0, 'chi': 54, 'ilo': 0, 'ihi': 50},
        {'clo': 55, 'chi': 154, 'ilo': 51, 'ihi': 100},
        {'clo': 155, 'chi': 254, 'ilo': 101, 'ihi': 150},
        {'clo': 255, 'chi': 354, 'ilo': 151, 'ihi': 200},
        {'clo': 355, 'chi': 424, 'ilo': 201, 'ihi': 300},
        {'clo': 425, 'chi': 504, 'ilo': 301, 'ihi': 400},
        {'clo': 505, 'chi': 604, 'ilo': 401, 'ihi': 500}
    ]
    
    indices = []
    if 'pm25' in pollutants: indices.append(piece_wise_linear(pollutants['pm25'], pm25_bp))
    if 'pm10' in pollutants: indices.append(piece_wise_linear(pollutants['pm10'], pm10_bp))
    
    return max(indices) if indices else 0

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/get_locations')
def get_locations():
    query = request.args.get('q', 'Delhi')
    lat, lon = dc.get_coordinates(query)
    
    if lat is None: return jsonify([])

    # 1. Fetch OpenAQ locations within 25km radius
    url = f"{dc.BASE_URL}/locations"
    params = {"coordinates": f"{lat},{lon}", "radius": 25000, "limit": 20}
    response = requests.get(url, headers=dc.headers, params=params)
    
    locations = []
    # Always insert a "Virtual Global Station" (OpenWeatherMap) at the start
    locations.insert(0, {
        "id": "custom",
        "name": f"Global Sensor [OWM - {query.title()}]",
        "coordinates": {"latitude": lat, "longitude": lon}
    })
    
    try:
        data = response.json()
        openaq_results = data.get("results", []) if isinstance(data, dict) else []
        locations.extend(openaq_results)
        return jsonify(locations)
    except Exception as e:
        return jsonify(locations)

@app.route('/sync', methods=['POST'])
def sync_twin():
    try:
        data = request.json
        station_id = data.get('station_id')
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        start_date_str = data.get('start_date')
        end_date_str = data.get('end_date')
        model_name = data.get('model', 'random_forest')
        
        aq_start = f"{start_date_str}T00:00:00Z"
        aq_end = f"{end_date_str}T23:59:59Z"

        # --- 1. Fetch Current OWM Snapshot for REAL-TIME grounding ---
        owm_current = aq_owm.get_owm_air_pollution_current(lat, lon)
        current_data_map = owm_current.get("components", {}) if owm_current else {}
        
        # Mapping OWM keys to standard names
        owm_raw_to_app = {"pm2_5": "pm25", "pm10": "pm10", "no2": "no2", "o3": "o3", "co": "co", "so2": "so2", "nh3": "nh3", "no": "no"}

        # --- 2. Fetch Weather Forecasts ---
        try:
            end_date_dt = datetime.strptime(end_date_str, "%Y-%m-%d")
            extended_end_date_str = (end_date_dt + timedelta(days=2)).strftime("%Y-%m-%d")
        except:
            extended_end_date_str = end_date_str
            
        df_weather = get_weather_data(lat, lon, start_date_str, extended_end_date_str)

        # --- 3. Fetch Dual-Source Histories ---
        # Fetch OpenAQ Sensor IDs as primary ground truth
        sensors = dc.get_sensors(station_id) if station_id != "custom" else []
        
        # Fetch OWM History as secondary/baseline feature history
        owm_history_dfs = aq_owm.get_owm_air_pollution_history(lat, lon, start_date_str, end_date_str)
        
        results = {}

        # 4. Process each pollutant detected
        relevant_parameters = set(list(owm_history_dfs.keys()) + [s['parameter']['name'] for s in sensors])
        
        for name in relevant_parameters:
            # Get OpenAQ data if available
            sensor_match = next((s for s in sensors if s['parameter']['name'] == name), None)
            df_aq = pd.DataFrame()
            if sensor_match:
                m_data = dc.get_measurements(sensor_match['id'], aq_start, aq_end)
                if m_data:
                    df_aq = pd.DataFrame([{
                        'datetime': pd.to_datetime(m['period']['datetimeTo']['utc']).tz_localize(None), 
                        'val': m['value']
                    } for m in m_data])
            
            # Get OWM history for this pollutant
            df_owm = owm_history_dfs.get(name, pd.DataFrame())
            
            # Blend / Merge: OWM provides continuous hourly baseline, OpenAQ provides high-fidelity peaks
            if df_aq.empty and df_owm.empty: continue
            
            if not df_aq.empty:
                df_aq['datetime'] = df_aq['datetime'].dt.round('H')
                df_aq = df_aq.groupby('datetime')['val'].mean().reset_index()
            
            # Prefer OpenAQ as primary 'val', but fill gaps with OWM
            if not df_aq.empty and not df_owm.empty:
                df_aq = pd.merge(df_aq, df_owm, on='datetime', how='outer', suffixes=('_aq', '_owm'))
                df_aq['val'] = df_aq['val_aq'].fillna(df_aq['val_owm'])
                df_aq = df_aq.drop(columns=['val_aq', 'val_owm'])
            elif df_aq.empty:
                df_aq = df_owm
            
            # --- MERGE WITH WEATHER & PREDICT ---
            if df_weather is not None and not df_weather.empty:
                df_merged = pd.merge(df_aq, df_weather, on='datetime', how='outer')
                df_merged = df_merged.sort_values('datetime').reset_index(drop=True)
                df_merged['temp'] = df_merged['temp'].ffill().bfill()
                df_merged['humidity'] = df_merged['humidity'].ffill().bfill()
                df_merged['wind'] = df_merged['wind'].ffill().bfill()
            else:
                df_merged = df_aq.copy()
                df_merged['temp'], df_merged['humidity'], df_merged['wind'] = 25.0, 50.0, 5.0
            
            if not df_merged.empty and len(df_merged) >= 5:
                forecast_start_dt = pd.to_datetime(end_date_str + ' 23:59:59')
                predicted_values = predict_aqi_advanced(df_merged, model_name=model_name, steps=24, forecast_start=forecast_start_dt)
                
                df_historical = df_merged.dropna(subset=['val'])
                values = df_historical['val'].tolist()
                timestamps = df_historical['datetime'].astype(str).tolist()

                # Determine the 'True' current value: 
                # Prioritize OWM real-time > OpenAQ latest > Model prediction seed
                owm_key = next((k for k, v in owm_raw_to_app.items() if v == name), None)
                realtime_val = current_data_map.get(owm_key)
                current_display = realtime_val if realtime_val is not None else (values[-1] if values else 0)

                future_timestamps = [(forecast_start_dt + timedelta(hours=i+1)).strftime("%Y-%m-%d %H:%M:%S") for i in range(24)]

                # Determine display unit (prefer OpenAQ sensor unit, fallback to µg/m³)
                display_unit = sensor_match['parameter']['units'] if (sensor_match and 'parameter' in sensor_match) else "µg/m³"

                results[name] = {
                    "current": round(current_display, 2),
                    "predicted_1hr": predicted_values[0] if predicted_values else "N/A",
                    "predicted_24hr": predicted_values,
                    "predicted_labels": future_timestamps,
                    "unit": display_unit,
                    "history": values, 
                    "labels": timestamps
                }
            else:
                results[name] = {
                    "current": 0, "predicted_1hr": "N/A", "predicted_24hr": [], 
                    "predicted_labels": [], "unit": "μg/m³", "history": [], "labels": []
                }
        
        # Calculate Final US-EPA AQI for the overall indicator
        pollutant_currents = {k: v['current'] for k, v in results.items()}
        # Handle 'pm2.5' alias from OpenAQ
        if 'pm2.5' in pollutant_currents: pollutant_currents['pm25'] = pollutant_currents['pm2.5']
        
        results['_overall_aqi'] = round(calculate_epa_aqi(pollutant_currents))
                    
        return jsonify(results)
    except Exception as e:
        print(f"DEBUG CRASH: {traceback.format_exc()}")
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route('/heatmap_data')
def get_heatmap_data():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    if lat is None or lon is None:
        return jsonify([])

    # Generate a grid around the point
    step = 0.05
    grid_points = []
    # 3x3 grid
    for dlat in [-step, 0, step]:
        for dlon in [-step, 0, step]:
            grid_points.append((lat + dlat, lon + dlon))
            
    heatmap_results = []
    for glat, glon in grid_points:
        curr = aq_owm.get_owm_air_pollution_current(glat, glon)
        if curr and "components" in curr:
            aqi = curr.get("main", {}).get("aqi", 1)
            heatmap_results.append({
                "lat": glat,
                "lon": glon,
                "aqi": aqi,
                "components": curr["components"]
            })
            
    return jsonify(heatmap_results)

if __name__ == '__main__':
    app.run(debug=True)