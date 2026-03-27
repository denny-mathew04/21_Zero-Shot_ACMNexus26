from sqlalchemy import Column, Integer, Float, DateTime
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from database import Base

# SQLAlchemy Model
class WorldStateDB(Base):
    __tablename__ = "world_states"

    id = Column(Integer, primary_key=True, index=True)
    lat = Column(Float, index=True)
    lon = Column(Float, index=True)
    temp = Column(Float)
    humidity = Column(Float)
    wind_speed = Column(Float)
    pm25 = Column(Float, nullable=True)
    no2 = Column(Float, nullable=True)
    aqi = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# Pydantic Schemas
class WeatherData(BaseModel):
    temp: float
    humidity: float
    wind_speed: float

class PollutionData(BaseModel):
    pm25: float | None = None
    no2: float | None = None
    aqi: int | None = None

class EnvironmentData(BaseModel):
    lat: float
    lon: float
    temp: float
    humidity: float
    wind_speed: float
    pm25: float | None = None
    no2: float | None = None
    aqi: int | None = None

class WorldStateResponse(EnvironmentData):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
