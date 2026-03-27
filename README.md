# AetherTwin — Climate Digital Twin
### Hackathon Edition · Pollution Control Problem Statement

---

## 🚀 Quick Start

### 1. Get API Keys (both free)

| Service | URL | Notes |
|---|---|---|
| **OpenWeatherMap** | https://openweathermap.org/api | Free tier: 1000 calls/day |
| **OpenAQ** | https://explore.openaq.org | Free, no key needed for basic use |

### 2. Open the app
Open `index.html` in any modern browser — no server needed.

### 3. Enter your keys
A banner at the top will prompt you. Paste your OpenWeatherMap key.
Keys are saved to `localStorage` — enter once, they persist.

---

## 📁 File Structure

```
aethertwin/
├── index.html          ← Main app entry point
├── css/
│   └── style.css       ← All styles
├── js/
│   ├── config.js       ← API keys, AQI constants, helpers
│   ├── ml.js           ← All ML algorithms (pure JS)
│   ├── api.js          ← OpenAQ v3 + OpenWeatherMap fetch layer
│   ├── charts.js       ← Chart.js visualizations
│   ├── map.js          ← Leaflet map + station markers
│   └── app.js          ← Main controller / orchestrator
```

---

## 🤖 ML Algorithms Available

| Algorithm | Key | Strengths |
|---|---|---|
| **Ensemble (Best)** | `ensemble` | Weighted average of all, lowest RMSE |
| **Random Forest** | `rf` | Handles non-linearity, robust to outliers |
| **Gradient Boosting** | `gbm` | Sequential error correction |
| **XGBoost** | `xgb` | Regularized boosting, fast |
| **LSTM Neural Net** | `lstm` | Temporal patterns, diurnal cycles |
| **Linear Regression** | `lr` | Interpretable baseline |
| **SVR (RBF kernel)** | `svr` | Good with small datasets |
| **ARIMA (2,1,1)** | `arima` | Statistical time-series |

Switch algorithms via the dropdown or by clicking model cards.

---

## 🌍 Data Sources

- **OpenAQ v3 API** — 10,000+ monitoring stations worldwide. Real-time PM2.5, PM10, NO₂, O₃, SO₂, CO.
- **OpenWeatherMap** — Current weather + 5-day forecast + UV index + OWM air pollution component.

### Cascade Selector Flow
```
Country → City → Station → Live Data
```
Every station in the OpenAQ network is accessible.

---

## 🗺️ Features

- **Global interactive map** — live color-coded markers from OpenAQ (green→hazardous)
- **Free-text city search** — searches both OpenAQ and OWM geocoder simultaneously
- **7-day weather forecast** with AQI estimates per day
- **24h / 7d / 30d trend chart** with actual vs predicted overlay + confidence interval
- **Hourly pollution heatmap** (day × hour)
- **Wind rose diagram** with current wind direction arrow
- **Health impact assessment** by population group (6 categories)
- **AI policy recommendations** — adapts to current AQI and pollutant levels
- **Multi-algorithm prediction table** — all 8 algorithms compared simultaneously
- **Station table** — all stations for selected city with last-update timestamps
- **Emission sources doughnut chart**
- **Temp vs AQI scatter correlation** with regression line
- **Live alerts** — auto-generated from real data thresholds

---

## ⚠️ CORS Note

OpenAQ v3 supports CORS from browsers. OWM also supports CORS.
If you hit CORS errors, serve via a local HTTP server:

```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .
```

Then open: `http://localhost:8080`

---

## 📊 AQI Scale (US EPA)

| Range | Category | Color |
|---|---|---|
| 0–50 | Good | 🟢 Green |
| 51–100 | Moderate | 🟡 Yellow |
| 101–150 | Unhealthy for Sensitive Groups | 🟠 Orange |
| 151–200 | Unhealthy | 🔴 Red |
| 201–300 | Very Unhealthy | 🟣 Purple |
| 301+ | Hazardous | 🟤 Maroon |

PM2.5 → US AQI conversion uses official EPA breakpoints.

---

Built for Climate Hackathon · Pollution Control Problem Statement
