from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List

from database import engine, Base, get_db
from models import WorldStateDB, WorldStateResponse, EnvironmentData
from services.etl import get_world_state

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Environmental Digital Twin API")

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
