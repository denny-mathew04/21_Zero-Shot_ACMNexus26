import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

def generate_synthetic_data(n_samples=1000):
    """
    Generate a synthetic dataset for the Environmental Digital Twin.
    Features: 'temperature', 'humidity', 'wind_speed', 'wind_direction', 'traffic_density', 'industrial_activity_index'
    Target: 'PM2.5_level'
    """
    np.random.seed(42)
    
    # Feature generation
    temperature = np.random.uniform(-10, 40, n_samples)
    humidity = np.random.uniform(20, 100, n_samples)
    wind_speed = np.random.uniform(0, 20, n_samples)
    wind_direction = np.random.uniform(0, 360, n_samples)
    traffic_density = np.random.uniform(0, 100, n_samples)
    industrial_activity_index = np.random.uniform(0, 100, n_samples)
    precipitation = np.random.uniform(0, 50, n_samples) # mm of rain
    greenery_index = np.random.uniform(0, 100, n_samples) # % of green coverage
    time_of_day = np.random.randint(0, 24, n_samples) # Hour of day 0-23
    is_weekend = np.random.choice([0, 1], p=[0.71, 0.29], size=n_samples) # 2/7 days = ~0.29
    
    # Target generation (PM2.5) with synthetic correlation to features
    # Traffic/Industry increases PM2.5. Wind/Rain/Greenery reduces it.
    rush_hour_penalty = np.where((time_of_day == 8) | (time_of_day == 18), 15, 0)
    weekend_discount = np.where(is_weekend == 1, -10, 0)
    
    pm25 = (
        10 
        + 0.5 * traffic_density 
        + 0.8 * industrial_activity_index 
        - 1.5 * wind_speed 
        - 0.5 * precipitation
        - 0.3 * greenery_index
        + 0.2 * temperature 
        + rush_hour_penalty
        + weekend_discount
        + np.random.normal(0, 5, n_samples)
    )
    pm25 = np.clip(pm25, 0, 500) # Ensure no negative values
    
    data = pd.DataFrame({
        'temperature': temperature,
        'humidity': humidity,
        'wind_speed': wind_speed,
        'wind_direction': wind_direction,
        'traffic_density': traffic_density,
        'industrial_activity_index': industrial_activity_index,
        'precipitation': precipitation,
        'greenery_index': greenery_index,
        'time_of_day': time_of_day,
        'is_weekend': is_weekend,
        'PM2.5_level': pm25
    })
    return data

def train_and_export_model():
    """
    Data pre-processing, model training, evaluation, and exporting.
    """
    print("1. DATA: Generating synthetic data...")
    df = generate_synthetic_data(2000)
    
    # 2. PRE-PROCESSING
    print("2. PRE-PROCESSING: Scaling and splitting data...")
    X = df.drop(columns=['PM2.5_level'])
    y = df['PM2.5_level']
    
    # 80/20 train-test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Scaling using StandardScaler
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # 3. MODEL
    print("3. MODEL: Training RandomForestRegressor (100 estimators)...")
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train_scaled, y_train)
    
    # 4. EVALUATION
    y_pred = model.predict(X_test_scaled)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    print(f"4. EVALUATION -> Component MAE: {mae:.2f}, R-squared: {r2:.4f}")
    
    # 5. EXPORT
    print("5. EXPORT: Saving model and scaler...")
    joblib.dump(model, 'environmental_risk_model.pkl')
    joblib.dump(scaler, 'scaler.pkl')
    print("   -> Export complete.")

def predict_risk(data):
    """
    6. INFERENCE FUNCTION
    Takes a dictionary of features and returns a predicted 'Risk Level'
    based on WHO AQI thresholds for PM2.5.
    """
    # Load model and scaler
    model = joblib.load('environmental_risk_model.pkl')
    scaler = joblib.load('scaler.pkl')
    
    # Expected feature order
    features = ['temperature', 'humidity', 'wind_speed', 'wind_direction', 
                'traffic_density', 'industrial_activity_index',
                'precipitation', 'greenery_index', 'time_of_day', 'is_weekend']
    
    try:
        # Convert input dictionary to a DataFrame for prediction to match the features during fit
        input_data = pd.DataFrame([data], columns=features)
    except Exception as e:
        return f"Error: Issue with input data format -> {e}"
        
    # Scale and predict
    scaled_data = scaler.transform(input_data)
    pred_pm25 = model.predict(scaled_data)[0]
    
    # Determine Risk Level based on WHO Guidelines for PM2.5
    # Low: 0-12, Moderate: 12.1-35.4, High: 35.5-55.4, Hazardous: > 55.4
    if pred_pm25 <= 12.0:
        risk_level = "Low"
    elif pred_pm25 <= 35.4:
        risk_level = "Moderate"
    elif pred_pm25 <= 55.4:
        risk_level = "High"
    else:
        risk_level = "Hazardous"
        
    return {
        "Predicted_PM2.5": round(pred_pm25, 2),
        "Risk_Level": risk_level
    }

if __name__ == "__main__":
    # Execute training workflow
    train_and_export_model()
    
    # Example Inference execution
    print("\n--- INFERENCE EXAMPLE ---")
    sample_data = {
        'temperature': 28.5,
        'humidity': 65.0,
        'wind_speed': 2.0,             # Low wind speed
        'wind_direction': 180,
        'traffic_density': 95.0,       # High traffic
        'industrial_activity_index': 90.0, # High industrial activity
        'precipitation': 0.0,          # Dry day
        'greenery_index': 10.0,        # Low greenery (urban core)
        'time_of_day': 18,             # Evening rush hour
        'is_weekend': 0                # Weekday
    }
    result = predict_risk(sample_data)
    print(f"Input Data: {sample_data}")
    print(f"Prediction Result: {result}")
