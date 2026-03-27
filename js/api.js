/* ═══════════════════════════════════════════════════════════
   api.js  —  Live data fetching
   OpenAQ v3  +  OpenWeatherMap APIs
═══════════════════════════════════════════════════════════ */

const API = {

  /* ── internal cache ── */
  _cache: {},
  _cacheTTL: 5 * 60 * 1000, // 5 min

  _cacheGet(key) {
    const e = this._cache[key];
    if (!e) return null;
    if (Date.now() - e.ts > this._cacheTTL) { delete this._cache[key]; return null; }
    return e.data;
  },

  _cacheSet(key, data) { this._cache[key] = { ts: Date.now(), data }; },

  /* ── generic fetch with error handling ── */
  async _fetch(url, headers = {}) {
    const cKey = url;
    const hit = this._cacheGet(cKey);
    if (hit) return hit;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    }
    const json = await res.json();
    this._cacheSet(cKey, json);
    return json;
  },

  /* ═══════════════════════════════════════════════════
     OPENAQ v3
  ═══════════════════════════════════════════════════ */

  openaqHeaders() {
    const h = { 'Accept': 'application/json' };
    if (CONFIG.OPENAQ_KEY) h['X-API-Key'] = CONFIG.OPENAQ_KEY;
    return h;
  },

  /* Get all countries */
  async getCountries() {
    const url = `${CONFIG.OPENAQ_BASE}/countries?limit=200&order_by=name`;
    const data = await this._fetch(url, this.openaqHeaders());
    return (data.results || []).map(c => ({
      id:   c.id,
      code: c.code,
      name: c.name,
      count: c.locationsCount || 0,
    }));
  },

  /* Get cities for a country code */
  async getCities(countryCode) {
    const url = `${CONFIG.OPENAQ_BASE}/locations?country=${countryCode}&limit=200&order_by=city&sort=asc`;
    const data = await this._fetch(url, this.openaqHeaders());
    // Extract unique cities
    const cityMap = {};
    (data.results || []).forEach(loc => {
      const city = loc.city || loc.name || 'Unknown';
      if (!cityMap[city]) cityMap[city] = { name: city, locations: [] };
      cityMap[city].locations.push(loc);
    });
    return Object.values(cityMap).sort((a,b) => a.name.localeCompare(b.name));
  },

  /* Get monitoring stations for a city */
  async getStations(countryCode, city) {
    const url = `${CONFIG.OPENAQ_BASE}/locations?country=${countryCode}&city=${encodeURIComponent(city)}&limit=100`;
    const data = await this._fetch(url, this.openaqHeaders());
    return (data.results || []).map(loc => ({
      id:         loc.id,
      name:       loc.name,
      city:       loc.city || city,
      country:    loc.country?.name || '',
      lat:        loc.coordinates?.latitude,
      lng:        loc.coordinates?.longitude,
      parameters: (loc.sensors || loc.parameters || []).map(p => p.parameter || p.displayName || p),
      lastUpdated: loc.datetimeLast?.utc || loc.lastUpdated,
    }));
  },

  /* Get latest measurements for a location id */
  async getLatestMeasurements(locationId) {
    const url = `${CONFIG.OPENAQ_BASE}/locations/${locationId}/latest`;
    const data = await this._fetch(url, this.openaqHeaders());
    return (data.results || []).map(r => ({
      parameter:   r.parameter,
      value:       r.value,
      unit:        r.unit,
      lastUpdated: r.datetime?.utc || r.lastUpdated,
    }));
  },

  /* Search stations by city name (free text) */
  async searchByCity(cityName, limit = 50) {
    const url = `${CONFIG.OPENAQ_BASE}/locations?city=${encodeURIComponent(cityName)}&limit=${limit}&order_by=lastUpdated&sort=desc`;
    const data = await this._fetch(url, this.openaqHeaders());
    return data.results || [];
  },

  /* Search by coordinates (for map) */
  async getNearbyStations(lat, lng, radius = 25000, limit = 50) {
    const url = `${CONFIG.OPENAQ_BASE}/locations?coordinates=${lat},${lng}&radius=${radius}&limit=${limit}`;
    const data = await this._fetch(url, this.openaqHeaders());
    return data.results || [];
  },

  /* Get global locations for map seeding (paginated) */
  async getGlobalSample(page = 1, limit = 100) {
    const url = `${CONFIG.OPENAQ_BASE}/locations?limit=${limit}&page=${page}&order_by=lastUpdated&sort=desc`;
    const data = await this._fetch(url, this.openaqHeaders());
    return data.results || [];
  },

  /* ═══════════════════════════════════════════════════
     OPEN-METEO
  ═══════════════════════════════════════════════════ */

  openMeteoHeaders() {
    return { 'Accept': 'application/json' };
  },

  wmoDescription(code) {
    const map = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      66: 'Light freezing rain', 67: 'Heavy freezing rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      85: 'Slight snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
    };
    return map[code] || 'Unknown';
  },

  /* ── Full data bundle for a station/city ── */
  async fetchCityBundle(lat, lng) {
    const results = { weather: null, owmPollution: null, uv: null, forecast: [] };
    const promises = [];

    // Weather, Forecast, UV
    promises.push((async () => {
      const weatherUrl = `${CONFIG.OPEN_METEO_BASE}/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,wind_speed_10m_max&timezone=auto`;
      const wData = await this._fetch(weatherUrl, this.openMeteoHeaders());

      if (wData.current) {
        results.weather = {
          city:        'Unknown',
          temp:        Math.round(wData.current.temperature_2m * 10) / 10,
          feelsLike:   Math.round(wData.current.apparent_temperature * 10) / 10,
          humidity:    wData.current.relative_humidity_2m,
          pressure:    wData.current.pressure_msl,
          windSpeed:   wData.current.wind_speed_10m,
          windDeg:     wData.current.wind_direction_10m,
          windDir:     degreesToCompass(wData.current.wind_direction_10m),
          clouds:      wData.current.cloud_cover,
          weatherId:   wData.current.weather_code,
          weatherDesc: this.wmoDescription(wData.current.weather_code),
          pod:         wData.current.is_day ? 'd' : 'n',
        };
      }

      if (wData.daily) {
        const d = wData.daily;
        const count = d.time.length;
        for (let i = 0; i < count; i++) {
          const dt = new Date(d.time[i]);
          if (i === 0) results.uv = d.uv_index_max[i] || 0;
          
          results.forecast.push({
            date:       d.time[i],
            dow:        dt.toLocaleDateString('en', { weekday:'short' }),
            tempMax:    Math.round(d.temperature_2m_max[i]),
            tempMin:    Math.round(d.temperature_2m_min[i]),
            weatherId:  d.weather_code[i],
            pop:        d.precipitation_probability_max[i] || 0,
          });
        }
      }
    })().catch(e => console.warn('Meteo Weather:', e.message)));

    // Air Quality
    promises.push((async () => {
      const airUrl = `${CONFIG.OPEN_METEO_AIR_BASE}/air-quality?latitude=${lat}&longitude=${lng}&current=european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,ammonia&timezone=auto`;
      const aData = await this._fetch(airUrl, this.openMeteoHeaders());
      
      if (aData.current) {
        const eu_aqi = aData.current.european_aqi || 20;
        results.owmPollution = {
          aqi:    Math.ceil(eu_aqi / 20), // Map 0-100 to 1-5 EU scale for compat
          co:     aData.current.carbon_monoxide,
          no2:    aData.current.nitrogen_dioxide,
          o3:     aData.current.ozone,
          so2:    aData.current.sulphur_dioxide,
          pm25:   aData.current.pm2_5,
          pm10:   aData.current.pm10,
          nh3:    aData.current.ammonia,
        };
      }
    })().catch(e => console.warn('Meteo AQ:', e.message)));

    await Promise.allSettled(promises);
    return results;
  },

  /* Geo: city name → lat/lng */
  async geocodeCity(cityName) {
    const url = `${CONFIG.OPEN_METEO_GEO_BASE}/search?name=${encodeURIComponent(cityName)}&count=5`;
    try {
      const data = await this._fetch(url, this.openMeteoHeaders());
      return (data.results || []).map(r => ({
        name:    r.name,
        country: r.country_code,
        state:   r.admin1,
        lat:     r.latitude,
        lng:     r.longitude,
      }));
    } catch { return []; }
  },

  /* ── Status ping ── */
  async checkStatus() {
    const results = { openaq: false, owm: false };

    // OpenAQ: try fetching 1 country
    try {
      const url = `${CONFIG.OPENAQ_BASE}/countries?limit=1`;
      const r = await fetch(url, { headers: this.openaqHeaders() });
      results.openaq = r.ok;
    } catch {}

    // Open-Meteo: try geocoding London
    try {
      const url = `${CONFIG.OPEN_METEO_GEO_BASE}/search?name=London&count=1`;
      const r = await fetch(url);
      results.owm = r.ok;
    } catch {}

    return results;
  },
};
