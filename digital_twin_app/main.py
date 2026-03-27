from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List

from database import engine, Base, get_db
from models import WorldStateDB, WorldStateResponse, EnvironmentData
from services.etl import get_world_state

import sys
import os
# Add root directory to sys.path to import environmental_twin
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
try:
    from environmental_twin import predict_risk
except ImportError:
    # Fallback if imported from elsewhere
    from ..environmental_twin import predict_risk

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Environmental Digital Twin API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", include_in_schema=False)
def root():
    """Redirect to the API documentation."""
    return RedirectResponse(url="/docs")

@app.get("/live", response_model=EnvironmentData)
async def get_live_data(lat: float, lon: float):
    """
    Returns current weather + pollution for a specific lat/long.
    """
    fused_data = await get_world_state(lat, lon)
    return fused_data

@app.get("/history", response_model=List[WorldStateResponse])
def get_history(lat: float, lon: float, db: Session = Depends(get_db)):
    """
    Returns the last 24 hours of data for trend analysis.
    """
    twenty_four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    eps = 0.05 # Allow margin for lat/lon matching
    
    results = db.query(WorldStateDB).filter(
        WorldStateDB.timestamp >= twenty_four_hours_ago,
        WorldStateDB.lat >= lat - eps,
        WorldStateDB.lat <= lat + eps,
        WorldStateDB.lon >= lon - eps,
        WorldStateDB.lon <= lon + eps
    ).order_by(WorldStateDB.timestamp.desc()).all()
    
    return results

@app.post("/sync", response_model=WorldStateResponse)
async def sync_data(lat: float, lon: float, db: Session = Depends(get_db)):
    """
    A manual trigger to refresh data from external APIs and store it in SQLite.
    """
    fused_data = await get_world_state(lat, lon)
    
    db_state = WorldStateDB(
        lat=fused_data["lat"],
        lon=fused_data["lon"],
        temp=fused_data["temp"],
        humidity=fused_data["humidity"],
        wind_speed=fused_data["wind_speed"],
        pm25=fused_data["pm25"],
        no2=fused_data["no2"],
        aqi=fused_data["aqi"],
        timestamp=datetime.now(timezone.utc)
    )
    
    db.add(db_state)
    db.commit()
    db.refresh(db_state)
    
    return db_state
@app.post("/predict")
async def predict(data: dict):
    """
    Predicts PM2.5 and risk level using the Random Forest model.
    Expected data: {
        'temperature': float,
        'humidity': float,
        'wind_speed': float,
        'wind_direction': float,
        'traffic_density': float,
        'industrial_activity_index': float,
        'precipitation': float,
        'greenery_index': float,
        'time_of_day': int,
        'is_weekend': int
    }
    """
    try:
        # The predict_risk function handles model loading internally
        # We need to ensure the working directory is root or use full paths in environmental_twin.py
        # For now, let's assume it works if called from root or we adjust the paths in environmental_twin.py
        result = predict_risk(data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
