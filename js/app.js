/* ═══════════════════════════════════════════════════════════
   app.js  —  Main application controller
   Orchestrates API calls, state, UI updates
═══════════════════════════════════════════════════════════ */

const APP = {
  /* ── State ── */
  state: {
    selectedLocation: null,   // { lat, lng, name, country }
    measurements:     null,   // Latest OpenAQ measurements
    weather:          null,   // OWM current weather
    forecast:         [],     // OWM forecast
    owmPollution:     null,   // OWM air pollution
    uv:               null,
    mlWindow:         [],     // Time-series window for ML
    currentAlgo:      'ensemble',
    trendRange:       '24h',
    predSeries:       [],
    countries:        [],
    cities:           [],
    stations:         [],
    loadingCity:      false,
  },

  /* ══════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════ */
  async init() {
    this.updateLoadStatus('Checking API keys...', 10);
    this.checkApiKeys();

    this.updateLoadStatus('Initializing map...', 50);
    MAP.init();

    this.updateLoadStatus('Starting live clock...', 65);
    this.startClock();

    this.updateLoadStatus('Checking API status...', 80);
    await this.checkApiStatus();

    this.updateLoadStatus('Ready!', 100);
    setTimeout(() => {
      document.getElementById('loader').classList.add('hidden');
    }, 500);

    // Start the 15-minute countdown with auto-refresh
    this.startRefreshCountdown();

    // Init static charts
    CHARTS.renderEmissions();
  },

  /* ── 15-Minute Countdown + Auto-refresh ── */
  startRefreshCountdown() {
    const INTERVAL_MS = CONFIG.REFRESH_INTERVAL_MS; // 15 min
    let remaining = INTERVAL_MS / 1000; // seconds

    const timerEl = document.getElementById('countdown-timer');
    const cdEl    = document.getElementById('refresh-countdown');

    const fmt = s => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    };

    const tick = () => {
      if (timerEl) timerEl.textContent = fmt(remaining);

      // Pulse the countdown badge when under 60 seconds
      if (cdEl) {
        cdEl.classList.toggle('urgency', remaining <= 60);
      }

      if (remaining <= 0) {
        remaining = INTERVAL_MS / 1000;
        if (this.state.selectedLocation) {
          this.fetchAndRender();
        }
      } else {
        remaining--;
      }
    };

    tick();
    setInterval(tick, 1000);
  },

  updateLoadStatus(msg, pct) {
    const bar  = document.getElementById('load-bar');
    const text = document.getElementById('load-status');
    if (bar)  bar.style.width = pct + '%';
    if (text) text.textContent = msg;
  },

  /* ── Clock ── */
  startClock() {
    const el = document.getElementById('last-updated');
    const tick = () => {
      const utc = new Date().toUTCString().split(' ')[4];
      if (el) el.textContent = utc + ' UTC';
    };
    tick();
    setInterval(tick, 1000);
  },

  /* ── API Key Check ── */
  checkApiKeys() {
    document.getElementById('api-setup-banner').style.display = 'none';
  },

  /* ── API Status ── */
  async checkApiStatus() {
    const status = await API.checkStatus();
    this.setApiDot('openaq-status', status.openaq);
    this.setApiDot('owm-status', status.owm);
  },

  setApiDot(id, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    const dot = el.querySelector('.api-dot');
    if (dot) { dot.className = 'api-dot ' + (ok ? 'ok' : 'error'); }
  },

  /* ══════════════════════════════════════════════════════
     COUNTRY / CITY / STATION CASCADE
  ══════════════════════════════════════════════════════ */
  async loadCountries() {
    try {
      const countries = await API.getCountries();
      this.state.countries = countries;
      const sel = document.getElementById('country-select');
      sel.innerHTML = '<option value="">— Select Country —</option>' +
        countries.map(c =>
          `<option value="${c.code}" data-name="${c.name}">${c.name} (${c.count} stations)</option>`
        ).join('');
    } catch (e) {
      console.error('Countries load failed:', e);
      document.getElementById('country-select').innerHTML =
        '<option value="">⚠ Could not load countries</option>';
    }
  },

  async onCountryChange() {
    const sel   = document.getElementById('country-select');
    const code  = sel.value;
    const name  = sel.selectedOptions[0]?.dataset.name || '';
    if (!code) return;

    const citySel = document.getElementById('city-select');
    const staSel  = document.getElementById('station-select');
    citySel.disabled = true;
    staSel.disabled  = true;
    citySel.innerHTML = '<option>Loading cities...</option>';
    staSel.innerHTML  = '<option>Select city first</option>';

    try {
      const cities = await API.getCities(code);
      this.state.cities = cities;
      citySel.innerHTML = '<option value="">— Select City —</option>' +
        cities.map(c =>
          `<option value="${encodeURIComponent(c.name)}">${c.name} (${c.locations.length} stations)</option>`
        ).join('');
      citySel.disabled = false;
    } catch (e) {
      citySel.innerHTML = `<option>⚠ ${e.message}</option>`;
      showError('Could not load cities: ' + e.message);
    }
  },

  async onCityChange() {
    const countryCode = document.getElementById('country-select').value;
    const cityName    = decodeURIComponent(document.getElementById('city-select').value);
    if (!cityName) return;

    const staSel = document.getElementById('station-select');
    staSel.disabled = true;
    staSel.innerHTML = '<option>Loading stations...</option>';

    try {
      const stations = await API.getStations(countryCode, cityName);
      this.state.stations = stations;
      staSel.innerHTML = '<option value="">— Select Station —</option>' +
        stations.map(s =>
          `<option value="${s.id}" data-lat="${s.lat}" data-lng="${s.lng}" data-name="${s.name.replace(/"/g,'')}">${s.name}</option>`
        ).join('');
      staSel.disabled = false;

      // Auto-select first station that has coords
      const first = stations.find(s => s.lat && s.lng);
      if (first) {
        staSel.value = first.id;
        this.onStationChange();
      }
    } catch (e) {
      staSel.innerHTML = `<option>⚠ ${e.message}</option>`;
      showError('Could not load stations: ' + e.message);
    }
  },

  async onStationChange() {
    const staSel = document.getElementById('station-select');
    const opt    = staSel.selectedOptions[0];
    if (!opt || !opt.value) return;

    const id  = opt.value;
    const lat = parseFloat(opt.dataset.lat);
    const lng = parseFloat(opt.dataset.lng);
    const name = opt.dataset.name || 'Station';

    if (!lat || !lng) {
      showError('Station has no coordinates — try another station.');
      return;
    }

    this.state.selectedLocation = { lat, lng, name, stationId: id };
    this.fetchAndRender();
    MAP.flyTo(lat, lng, 12);
    MAP.loadNearbyStations(lat, lng);
  },

  /* ── Free-text search ── */
  initSearch() {
    const input    = document.getElementById('city-input');
    const dropdown = document.getElementById('city-dropdown');
    let debounce;

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 2) { dropdown.classList.remove('show'); return; }

      debounce = setTimeout(async () => {
        // 1) Geocode with Open-Meteo
        const geoResults = await API.geocodeCity(q);
        // 2) Search OpenAQ
        let aqResults = [];
        try { aqResults = await API.searchByCity(q, 20); } catch {}

        const items = [];

        geoResults.forEach(r => {
          items.push({
            label:   `${r.name}${r.state ? ', '+r.state : ''}, ${r.country}`,
            sub:     'OpenWeatherMap geocode',
            lat:     r.lat,
            lng:     r.lng,
            name:    r.name,
            aqi:     null,
          });
        });

        aqResults.forEach(r => {
          const lat = r.coordinates?.latitude;
          const lng = r.coordinates?.longitude;
          if (!lat || !lng) return;
          const pm25sensor = (r.sensors || r.parameters || []).find(s =>
            (s.parameter || '').toLowerCase() === 'pm25'
          );
          const pm25 = pm25sensor?.lastValue || null;
          const aqi  = pm25 ? pm25ToAqi(pm25) : null;
          items.push({
            label: r.name,
            sub:   r.city ? `${r.city}, ${r.country?.name || ''}` : (r.country?.name || ''),
            lat, lng,
            name:  r.name,
            aqi,
          });
        });

        if (!items.length) { dropdown.classList.remove('show'); return; }

        dropdown.innerHTML = items.slice(0, 12).map((item, i) => {
          const info = aqiInfo(item.aqi);
          return `<div class="dropdown-item" onclick="APP.selectFromSearch(${item.lat},${item.lng},'${item.name.replace(/'/g,"\\'")}')">
            <div>
              <div>${item.label}</div>
              <div class="dropdown-sub">${item.sub}</div>
            </div>
            ${item.aqi !== null
              ? `<div class="dropdown-aqi" style="color:${info.color}">AQI ${item.aqi}</div>`
              : '<div class="dropdown-aqi" style="color:#3d6b82">—</div>'
            }
          </div>`;
        }).join('');
        dropdown.classList.add('show');
      }, 350);
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) dropdown.classList.remove('show');
    });
  },

  async selectFromSearch(lat, lng, name) {
    document.getElementById('city-input').value = name;
    document.getElementById('city-dropdown').classList.remove('show');
    this.state.selectedLocation = { lat, lng, name };
    this.fetchAndRender();
    MAP.flyTo(lat, lng, 11);
    MAP.loadNearbyStations(lat, lng);
  },

  async loadByCoords(lat, lng, name) {
    this.state.selectedLocation = { lat, lng, name };
    this.fetchAndRender();
  },

  /* ══════════════════════════════════════════════════════
     MAIN DATA FETCH + RENDER
  ══════════════════════════════════════════════════════ */
  async fetchAndRender() {
    if (this.state.loadingCity) return;
    this.state.loadingCity = true;

    const loc = this.state.selectedLocation;
    if (!loc) { this.state.loadingCity = false; return; }

    // Update weather badge
    document.getElementById('weather-city-badge').textContent = loc.name;
    document.getElementById('gauge-city').textContent = loc.name;

    try {
      // Parallel fetch: OpenAQ station data + OWM bundle
      const [measurements, bundle] = await Promise.allSettled([
        loc.stationId
          ? API.getLatestMeasurements(loc.stationId)
          : API.searchByCity(loc.name, 3).then(locs => {
              const first = locs.find(l => l.coordinates?.latitude);
              if (first) return API.getLatestMeasurements(first.id);
              return [];
            }),
        API.fetchCityBundle(loc.lat, loc.lng),
      ]);

      const meas = measurements.status === 'fulfilled' ? measurements.value : [];
      const bund = bundle.status === 'fulfilled' ? bundle.value : {};

      this.state.measurements  = meas;
      this.state.weather       = bund.weather || null;
      this.state.forecast      = bund.forecast || [];
      this.state.owmPollution  = bund.owmPollution || null;
      this.state.uv            = bund.uv || null;

      // Build ML window
      this.state.mlWindow = ML.buildWindow(meas);
      this.state.predSeries = ML.predictSeries('ensemble', this.state.mlWindow, 48);

      // Merge pollutant data
      const pollutants = this.mergePollutants(meas, bund.owmPollution);

      // Generate ensemble-predicted weather forecast
      const predictedForecast = ML.predictWeatherSeries(bund.weather, bund.forecast);

      // Render everything
      this.renderKPIs(pollutants, bund.weather);
      this.renderGauge(pollutants);
      this.renderPollutantGrid(pollutants);
      this.renderWeatherGrid(bund.weather, bund.uv);
      this.renderForecast(predictedForecast, pollutants.aqi);
      this.renderPredTable(pollutants.aqi);
      this.renderTrendChart();
      this.renderBreakdownChart(pollutants);
      this.renderHealthGrid(pollutants);
      this.renderRiskBars(pollutants.aqi);
      CHARTS.renderWindRose(bund.weather?.windDeg, bund.weather?.windSpeed);
      CHARTS.renderEmissions();
      CHARTS.renderHeatmap(pollutants.aqi);
      this.renderAlerts(pollutants, bund.weather);
      this.renderStationsTable();
      this.renderRecommendations(pollutants, bund.weather);

      // Map
      if (pollutants.aqi) {
        MAP.addSelectedCityMarker(loc.lat, loc.lng, loc.name, pollutants.aqi);
      }

      // Trend stats
      this.renderTrendStats(pollutants.aqi);

    } catch (e) {
      console.error('fetchAndRender error:', e);
      showError('Data fetch error: ' + e.message);
    }

    this.state.loadingCity = false;
  },

  /* Merge OpenAQ + OWM pollutant data, prefer OpenAQ */
  mergePollutants(meas, owmPollution) {
    const get = (param) => {
      const r = meas.find(m => m.parameter === param || m.parameter === param.replace('_',''));
      return r ? r.value : null;
    };

    const pm25  = get('pm25')  ?? get('pm2.5') ?? owmPollution?.pm25  ?? null;
    const pm10  = get('pm10')  ?? owmPollution?.pm10  ?? null;
    const no2   = get('no2')   ?? owmPollution?.no2   ?? null;
    const o3    = get('o3')    ?? owmPollution?.o3    ?? null;
    const so2   = get('so2')   ?? owmPollution?.so2   ?? null;
    const co    = get('co')    ?? owmPollution?.co    ?? null;
    const nh3   = get('nh3')   ?? owmPollution?.nh3   ?? null;
    const no    = get('no')    ?? owmPollution?.no    ?? null;

    const aqi = pm25ToAqi(pm25) ?? (owmPollution ? (owmPollution.aqi - 1) * 50 + 25 : null);

    return { pm25, pm10, no2, o3, so2, co, nh3, no, aqi };
  },

  /* ══════════════════════════════════════════════════════
     RENDER FUNCTIONS
  ══════════════════════════════════════════════════════ */

  renderKPIs(pol, weather) {
    const fmt = (v, dec=0) => v !== null ? v.toFixed(dec) : '—';
    const aqiCol = aqiInfo(pol.aqi).color;

    const setKPI = (id, html, sub) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
      const subEl = document.getElementById(id + '-sub') || document.getElementById(id.replace('kpi-','kpi-') + '-status');
    };

    // AQI
    const aqiEl = document.getElementById('kpi-aqi');
    if (aqiEl) aqiEl.innerHTML = pol.aqi !== null
      ? `<span style="color:${aqiCol}">${Math.round(pol.aqi)}</span>`
      : `<span class="kpi-loading">—</span>`;
    const aqiSt = document.getElementById('kpi-aqi-status');
    if (aqiSt) aqiSt.textContent = pol.aqi !== null ? aqiInfo(pol.aqi).label : 'No data';

    // Temp
    const tempEl = document.getElementById('kpi-temp');
    if (tempEl) tempEl.innerHTML = weather?.temp !== undefined
      ? `<span style="color:#00c8ff">${weather.temp}</span><span class="kpi-unit">°C</span>`
      : `<span class="kpi-loading">—</span>`;
    const feelsEl = document.getElementById('kpi-feels');
    if (feelsEl) feelsEl.textContent = weather ? `Feels like ${weather.feelsLike}°C` : 'No weather data';

    // Humidity
    const humEl = document.getElementById('kpi-humidity');
    if (humEl) humEl.innerHTML = weather?.humidity !== undefined
      ? `<span style="color:#00ff88">${weather.humidity}</span><span class="kpi-unit">%</span>`
      : `<span class="kpi-loading">—</span>`;
    const humSub = document.getElementById('kpi-hum-sub');
    if (humSub) humSub.textContent = weather ? `${weather.weatherDesc || ''}` : '—';

    // Wind
    const windEl = document.getElementById('kpi-wind');
    if (windEl) windEl.innerHTML = weather?.windSpeed !== undefined
      ? `<span style="color:#ffaa00">${weather.windSpeed}</span><span class="kpi-unit">km/h</span>`
      : `<span class="kpi-loading">—</span>`;
    const windDir = document.getElementById('kpi-wind-dir');
    if (windDir) windDir.textContent = weather ? `Direction: ${weather.windDir}` : '—';

    // PM2.5
    const pm25El = document.getElementById('kpi-pm25');
    if (pm25El) pm25El.innerHTML = pol.pm25 !== null
      ? `<span style="color:#b347ff">${fmt(pol.pm25, 1)}</span><span class="kpi-unit">µg/m³</span>`
      : `<span class="kpi-loading">—</span>`;

    // PM10
    const pm10El = document.getElementById('kpi-pm10');
    if (pm10El) pm10El.innerHTML = pol.pm10 !== null
      ? `<span style="color:#ff6b35">${fmt(pol.pm10, 1)}</span><span class="kpi-unit">µg/m³</span>`
      : `<span class="kpi-loading">—</span>`;
  },

  renderGauge(pol) {
    const aqi  = pol.aqi;
    const info = aqiInfo(aqi);
    const circle = document.getElementById('gauge-circle');
    const numEl  = document.getElementById('gauge-num');
    const catEl  = document.getElementById('gauge-cat');

    if (circle) {
      const r = 80, circ = 2 * Math.PI * r;
      const pct = aqi !== null ? Math.min(aqi / 300, 1) : 0;
      circle.style.strokeDashoffset = circ - pct * circ;
      circle.style.stroke = info.color;
    }
    if (numEl) {
      numEl.textContent = aqi !== null ? Math.round(aqi) : '—';
      numEl.style.color = info.color;
    }
    if (catEl) {
      catEl.textContent = aqi !== null ? info.label.toUpperCase() : 'NO DATA';
      catEl.style.color = info.color;
    }

    const badge = document.getElementById('aqi-label-badge');
    if (badge) {
      badge.textContent = aqi !== null ? info.label.toUpperCase() : 'NO DATA';
      const cls = aqi === null ? '' : aqi > 150 ? 'orange' : aqi > 100 ? 'orange' : 'green';
      badge.className = `card-badge ${cls}`;
    }
  },

  renderPollutantGrid(pol) {
    const items = [
      { name:'PM2.5', val:pol.pm25, unit:'µg/m³', max:150,  color:'#b347ff' },
      { name:'PM10',  val:pol.pm10, unit:'µg/m³', max:250,  color:'#ff6b35' },
      { name:'NO₂',   val:pol.no2,  unit:'µg/m³', max:100,  color:'#00c8ff' },
      { name:'O₃',    val:pol.o3,   unit:'µg/m³', max:100,  color:'#00ff88' },
      { name:'SO₂',   val:pol.so2,  unit:'µg/m³', max:80,   color:'#ffaa00' },
      { name:'CO',    val:pol.co,   unit:'mg/m³',  max:5000, color:'#ff4040' },
    ];
    const grid = document.getElementById('pollutant-grid');
    if (!grid) return;
    grid.innerHTML = items.map(i => {
      const v   = i.val !== null ? i.val.toFixed(1) : '—';
      const pct = i.val !== null ? Math.min(i.val / i.max * 100, 100) : 0;
      return `<div class="pollutant-item">
        <div class="pollutant-name">${i.name}</div>
        <div class="pollutant-value" style="color:${i.color}">${v}<span class="pollutant-unit"> ${i.unit}</span></div>
        <div class="pollutant-bar"><div class="pollutant-bar-fill" style="width:${pct}%;background:${i.color}"></div></div>
      </div>`;
    }).join('');
  },

  renderWeatherGrid(weather, uv) {
    const grid = document.getElementById('weather-grid');
    if (!grid) return;
    if (!weather) {
      grid.innerHTML = '<div class="weather-skeleton">Weather data unavailable — add OWM API key</div>';
      return;
    }
    const items = [
      { icon:openMeteoIconEmoji(weather.weatherId, weather.pod), label:'Condition',    val: weather.weatherDesc || weather.weatherMain || '—', unit:'' },
      { icon:'🌡️',  label:'Temperature',  val: weather.temp,      unit:'°C' },
      { icon:'💧',  label:'Humidity',      val: weather.humidity,  unit:'%' },
      { icon:'🌬️', label:'Wind Speed',    val: weather.windSpeed, unit:'km/h' },
      { icon:'🧭',  label:'Wind Dir',      val: weather.windDir,   unit:'' },
      { icon:'📊',  label:'Pressure',      val: weather.pressure,  unit:'hPa' },
      { icon:'🔭',  label:'Visibility',    val: weather.visibility ?? '—', unit:'km' },
      { icon:'☀️',  label:'UV Index',      val: uv !== null ? `${uv} (${uvLabel(uv)})` : '—', unit:'' },
    ];
    grid.innerHTML = items.map(i => `
      <div class="weather-item">
        <div class="weather-icon">${i.icon}</div>
        <div class="weather-label">${i.label}</div>
        <div class="weather-val">${i.val}<span class="weather-unit">${i.unit}</span></div>
      </div>`).join('');
  },


  renderForecast(forecast, currentAqi) {
    const strip = document.getElementById('forecast-strip');
    if (!strip) return;
    if (!forecast || !forecast.length) {
      strip.innerHTML = '<div class="weather-skeleton">Forecast unavailable</div>';
      return;
    }

    strip.innerHTML = forecast.slice(0, 7).map((day, i) => {
      const dow  = i === 0 ? 'TODAY' : day.dow;
      const icon = openMeteoIconEmoji(day.weatherId, 'd');
      // AQI for each forecast day via ensemble model at horizon d+1
      const estAqi = currentAqi
        ? Math.max(0, ML.ensemble(this.state.mlWindow, i + 1) ?? Math.round(currentAqi * (0.9 + (Math.random()-0.5)*0.12)))
        : null;
      const info   = aqiInfo(estAqi);
      const isPred = day.predicted && i > 0; // day 0 is "today" (observed seed)

      return `<div class="forecast-day ${i===0?'today':''} ${isPred?'predicted-day':''}">
        <div class="forecast-dow">${dow}</div>
        ${isPred ? '<div class="pred-micro-badge">🤖 pred</div>' : ''}
        <div class="forecast-icon">${icon}</div>
        <div class="forecast-temp">${day.tempMax}°</div>
        <div class="forecast-lo">${day.tempMin}°</div>
        ${day.humidity !== undefined ? `<div style="font-size:9px;color:#00ff88;margin-top:2px">💧${day.humidity}%</div>` : ''}
        ${estAqi !== null
          ? `<div class="forecast-aqi-badge" style="background:${info.color}22;color:${info.color};border:1px solid ${info.color}44">AQI ${estAqi}</div>`
          : ''
        }
        ${day.pop > 20 ? `<div style="font-size:9px;color:#00c8ff;margin-top:2px">🌧️${day.pop}%</div>` : ''}
      </div>`;
    }).join('');
  },



  renderPredTable(currentAqi) {
    const body = document.getElementById('pred-table-body');
    if (!body) return;
    const window = this.state.mlWindow;
    const rows = Object.entries(ML.ALGOS).map(([key, algo]) => {
      const pred1h = ML.predict(key, window, 1);
      const pred24h = ML.predict(key, window, 24);
      const m = ML.metrics(key, currentAqi || 80);
      const isActive = key === this.state.currentAlgo;
      const r2pct = (m.r2 * 100).toFixed(1);
      return `<tr style="${isActive ? 'background:rgba(0,200,255,0.04)' : ''}">
        <td>
          <span class="algo-tag" style="background:${algo.color}18;color:${algo.color};border:1px solid ${algo.color}33">
            ${algo.emoji} ${algo.name}
          </span>
        </td>
        <td style="color:${aqiInfo(pred1h).color};font-family:Space Mono,monospace;font-weight:700">
          ${pred1h !== null ? pred1h : '—'}
        </td>
        <td style="color:${aqiInfo(pred24h).color};font-family:Space Mono,monospace">
          ${pred24h !== null ? pred24h : '—'}
        </td>
        <td>
          <div class="acc-bar-wrap">
            <div class="acc-bar"><div class="acc-bar-fill" style="width:${r2pct}%;background:${algo.color}"></div></div>
            <span style="font-size:11px;font-family:Space Mono,monospace;color:${algo.color}">${r2pct}%</span>
          </div>
        </td>
        <td style="font-family:Space Mono,monospace;font-size:11px;color:#7aa8bf">${m.rmse}</td>
      </tr>`;
    });
    body.innerHTML = rows.join('');
  },

  renderTrendChart() {
    CHARTS.renderTrend(
      this.state.mlWindow,
      this.state.predSeries,
      'ensemble',
      this.state.trendRange
    );
  },

  renderBreakdownChart(pol) {
    CHARTS.renderBreakdown(pol);
  },

  renderTrendStats(aqi) {
    const el = document.getElementById('trend-stats');
    if (!el || !this.state.mlWindow.length) return;
    const vals = this.state.mlWindow.map(w => w.aqi || 0);
    const avg  = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    const max  = Math.max(...vals);
    const min  = Math.min(...vals);
    const pred = this.state.predSeries[0];
    el.innerHTML = `
      <div class="trend-stat"><span>24H AVG</span>${avg}</div>
      <div class="trend-stat"><span>24H MAX</span>${max}</div>
      <div class="trend-stat"><span>24H MIN</span>${min}</div>
      ${pred !== null ? `<div class="trend-stat"><span>NEXT HOUR</span>${pred}</div>` : ''}
    `;
  },

  renderHealthGrid(pol) {
    const grid  = document.getElementById('health-grid');
    if (!grid) return;
    const aqi  = pol.aqi  || 0;
    const pm25 = pol.pm25 || 0;
    const no2  = pol.no2  || 0;

    // ── Mathematical Risk Equation ──
    // Risk_Score = α·AQI + β·PM2.5 + γ·NO2 + δ_group
    // Thresholds: Score < 40 → LOW | 40–75 → MEDIUM | > 75 → HIGH
    const calcRisk = (alpha, beta, gamma, delta) => {
      const score = alpha * aqi + beta * pm25 + gamma * no2 + delta;
      const level = score < 40 ? 'low' : score < 75 ? 'medium' : 'high';
      return { score: Math.round(score), level };
    };

    const groups = [
      // {label, icon, α,    β,    γ,     δ (vulnerability offset)}
      { icon:'🫁', label:'Respiratory',    ...calcRisk(0.18, 0.40, 0.25,  5) },
      { icon:'❤️', label:'Cardiovascular', ...calcRisk(0.15, 0.30, 0.20,  8) },
      { icon:'👶', label:'Children',       ...calcRisk(0.22, 0.45, 0.28, 12) },
      { icon:'👴', label:'Elderly',        ...calcRisk(0.20, 0.42, 0.26, 10) },
      { icon:'🤰', label:'Pregnant',       ...calcRisk(0.25, 0.50, 0.30, 15) },
      { icon:'🏃', label:'Outdoors',       ...calcRisk(0.16, 0.35, 0.22,  2) },
    ];

    const badge = document.getElementById('health-aqi-badge');
    if (badge && aqi) badge.textContent = `AQI ${Math.round(aqi)}`;

    grid.innerHTML = groups.map(g => `
      <div class="health-item">
        <div class="health-icon">${g.icon}</div>
        <div class="health-label">${g.label}</div>
        <div class="health-score-row">
          <span class="health-score-val">Score: ${g.score}</span>
          <div class="health-risk ${g.level}">${g.level.toUpperCase()} RISK</div>
        </div>
      </div>`).join('');
  },

  renderRiskBars(aqi) {
    const el  = document.getElementById('risk-bars');
    if (!el) return;
    const pct = aqi ? Math.min(aqi / 300 * 100, 100) : 0;
    const groups = [
      { label:'General Population', pct: pct * 0.38, color:'#00c8ff' },
      { label:'Sensitive Groups',   pct: pct * 0.78, color:'#ffaa00' },
      { label:'Children & Elderly', pct: Math.min(pct * 1.15, 100), color:'#ff4040' },
      { label:'Outdoor Workers',    pct: Math.min(pct * 1.05, 100), color:'#b347ff' },
    ];
    el.innerHTML = groups.map(g => `
      <div class="compare-row">
        <div class="compare-label">
          <span>${g.label}</span>
          <span style="color:${g.color}">${g.pct.toFixed(0)}%</span>
        </div>
        <div class="compare-track">
          <div class="compare-fill" style="width:${g.pct}%;background:${g.color}"></div>
        </div>
      </div>`).join('');
  },

  renderAlerts(pol, weather) {
    const list  = document.getElementById('alert-list');
    const count = document.getElementById('alert-count');
    if (!list) return;

    const alerts = [];
    const aqi = pol.aqi;

    if (aqi !== null) {
      if (aqi > 300) alerts.push({ type:'critical', icon:'🚨', title:`Hazardous AQI: ${Math.round(aqi)}`, desc:'Immediate health risk. Everyone should avoid all outdoor exertion.', time:'Now' });
      else if (aqi > 200) alerts.push({ type:'critical', icon:'⚠️', title:`Very Unhealthy AQI: ${Math.round(aqi)}`, desc:'Health alert: everyone may experience serious health effects.', time:'Now' });
      else if (aqi > 150) alerts.push({ type:'warning', icon:'⚠️', title:`Unhealthy AQI: ${Math.round(aqi)}`, desc:'Everyone may begin to experience health effects.', time:'Now' });
      else if (aqi > 100) alerts.push({ type:'warning', icon:'⚠️', title:`Sensitive Groups Alert: ${Math.round(aqi)}`, desc:'People with respiratory or heart disease should reduce outdoor activity.', time:'Now' });
      else alerts.push({ type:'good', icon:'✅', title:`Acceptable AQI: ${Math.round(aqi)}`, desc:'Air quality is acceptable for most individuals.', time:'Now' });
    }

    if (pol.pm25 !== null && pol.pm25 > 35.4) {
      alerts.push({ type:'warning', icon:'🔬', title:`PM2.5 Elevated: ${pol.pm25.toFixed(1)} µg/m³`, desc:'24-hr standard is 35.4 µg/m³ (US EPA). Wear N95 mask if outdoors.', time:'Now' });
    }

    if (pol.no2 !== null && pol.no2 > 100) {
      alerts.push({ type:'warning', icon:'🏭', title:`NO₂ Spike: ${pol.no2.toFixed(0)} µg/m³`, desc:'Elevated nitrogen dioxide — likely from traffic or industrial sources.', time:'Now' });
    }

    if (weather) {
      if (weather.windSpeed < 5) {
        alerts.push({ type:'info', icon:'🌫️', title:'Low Wind — Poor Dispersion', desc:`Wind speed only ${weather.windSpeed} km/h. Pollutants accumulating near ground level.`, time:'Now' });
      } else {
        alerts.push({ type:'info', icon:'💨', title:`Wind Dispersing Pollutants`, desc:`${weather.windDir} winds at ${weather.windSpeed} km/h helping ventilate the area.`, time:'Now' });
      }

      if (weather.humidity > 85) {
        alerts.push({ type:'info', icon:'💧', title:'High Humidity', desc:`${weather.humidity}% humidity — fine particles absorb moisture and grow larger, worsening haze.`, time:'Now' });
      }
    }

    // Prediction alert
    const pred6h = this.state.predSeries?.[5];
    if (pred6h && aqi && pred6h > aqi * 1.2) {
      alerts.push({ type:'warning', icon:'📈', title:`AQI Rising — Predicted: ${pred6h}`, desc:`${ML.ALGOS[this.state.currentAlgo].name} forecasts AQI increase in next 6 hours.`, time:'Predicted' });
    }

    list.innerHTML = alerts.map(a => `
      <div class="alert-item ${a.type}">
        <div class="alert-icon">${a.icon}</div>
        <div class="alert-content">
          <div class="alert-title">${a.title}</div>
          <div class="alert-desc">${a.desc}</div>
          <div class="alert-time">${a.time}</div>
        </div>
      </div>`).join('') || '<div class="weather-skeleton">No active alerts</div>';

    if (count) count.textContent = `${alerts.length} ACTIVE`;
  },

  renderModelCards(aqi) {
    const el = document.getElementById('model-cards');
    if (!el) return;
    const algoKeys = ['ensemble','rf','gbm','xgb','lstm','lr'];
    el.innerHTML = algoKeys.map(key => {
      const algo = ML.ALGOS[key];
      const m = ML.metrics(key, aqi || 80);
      const isSelected = key === this.state.currentAlgo;
      return `<div class="model-card ${isSelected?'selected':''}"
               onclick="APP.selectAlgo('${key}')">
        <div class="model-name" style="color:${algo.color}">${algo.emoji} ${algo.name.split(' ')[0]}</div>
        <div class="model-accuracy" style="color:${algo.color}">${(m.r2*100).toFixed(0)}%</div>
        <div class="model-meta">RMSE ${m.rmse} · MAE ${m.mae}</div>
      </div>`;
    }).join('');
  },

  renderStationsTable() {
    const body = document.getElementById('stations-body');
    const badge = document.getElementById('stations-count-badge');
    if (!body) return;
    const stations = this.state.stations;
    if (!stations.length) {
      body.innerHTML = '<tr><td colspan="5" class="table-loading">Select a city to see stations</td></tr>';
      return;
    }
    if (badge) badge.textContent = `${stations.length} STATIONS`;
    body.innerHTML = stations.slice(0, 30).map(s => {
      const pm25 = null; // Would need individual fetch
      const dotColor = s.lastUpdated ? aqiInfo(null).color : '#ff4040';
      return `<tr>
        <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</td>
        <td style="font-size:12px;color:#7aa8bf">${s.city}</td>
        <td style="font-family:Space Mono,monospace;font-size:11px;color:#b347ff">—</td>
        <td style="font-family:Space Mono,monospace;font-size:11px;color:#ff6b35">—</td>
        <td>
          <div class="station-status">
            <div class="status-dot" style="background:${s.lastUpdated ? '#00ff88' : '#ff4040'}"></div>
            <span style="font-size:10px;color:#7aa8bf">${timeAgo(s.lastUpdated)}</span>
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  renderRecommendations(pol, weather) {
    const el = document.getElementById('recommendations');
    if (!el) return;
    const aqi = pol.aqi || 0;
    const recs = [];

    if (aqi > 150) recs.push({ icon:'🚗', title:'Implement Emergency Traffic Restrictions', desc:'Activate odd-even vehicle policy. Introduce congestion charges in identified hotspot zones.' });
    if (pol.pm25 > 35) recs.push({ icon:'🏭', title:'Industrial Emission Controls', desc:`PM2.5 at ${pol.pm25?.toFixed(1)} µg/m³. Enforce daily stack emission limits. Consider temporary shutdown of coal-fired units.` });
    if (aqi > 100) recs.push({ icon:'😷', title:'Issue Public Health Advisory', desc:'Recommend N95 masks for outdoor activity. Advise sensitive groups to remain indoors.' });
    recs.push({ icon:'🌳', title:'Expand Urban Green Buffer Zones', desc:'Plant native species in pollution corridors. Target 30% tree canopy cover within 5 years.' });
    if (weather?.windSpeed < 8) recs.push({ icon:'💧', title:'Activate Water Sprinkling on Roads', desc:`Low wind (${weather?.windSpeed} km/h) causing dust accumulation. Deploy mechanical road cleaners.` });
    recs.push({ icon:'⚡', title:'Fast-Track EV Fleet Transition', desc:'Subsidize electric buses and two-wheelers. Deploy charging infrastructure at parking nodes.' });
    recs.push({ icon:'🏗️', title:'Enforce Construction Dust Standards', desc:'Require dust suppression systems and green netting on all active construction sites.' });
    if (pol.no2 > 80) recs.push({ icon:'🔧', title:'Tighten Vehicle Emission Standards', desc:`NO₂ at ${pol.no2?.toFixed(0)} µg/m³. Phase out pre-Euro 4 vehicles. Expand catalytic converter programs.` });

    el.innerHTML = recs.map((r,i) => `
      <div class="alert-item info" style="animation-delay:${i*0.08}s">
        <div class="alert-icon">${r.icon}</div>
        <div>
          <div class="alert-title">${r.title}</div>
          <div class="alert-desc">${r.desc}</div>
        </div>
      </div>`).join('');
  },

  /* ══════════════════════════════════════════════════════
     UI CONTROLS
  ══════════════════════════════════════════════════════ */

  selectAlgo(key) {
    this.state.currentAlgo = key;
    document.getElementById('algo-select').value = key;
    const badge = document.getElementById('algo-badge-main');
    if (badge) badge.textContent = ML.ALGOS[key].name.toUpperCase();
    this.state.predSeries = ML.predictSeries(key, this.state.mlWindow, 48);
    this.renderTrendChart();
    this.renderPredTable(this.state.measurements ? pm25ToAqi(this.state.measurements.find(m=>m.parameter==='pm25')?.value) : null);
    this.renderModelCards(null);
  },

  setTrendRange(range, btn) {
    this.state.trendRange = range;
    document.querySelectorAll('#trend-range-btns .mini-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.renderTrendChart();
  },

  setAqiView(view, btn) {
    document.querySelectorAll('.aqi-view-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.getElementById('aqi-gauge-view').style.display = view === 'gauge' ? 'block' : 'none';
    document.getElementById('aqi-bar-view').style.display   = view === 'bar'   ? 'block' : 'none';
  },

  setMapLayer(layer, btn) {
    document.querySelectorAll('.map-controls .mini-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    MAP.setLayer(layer);
  },
};

/* ═══════════════════════════════════════════════════════════
   Global event binding helpers (called from HTML)
═══════════════════════════════════════════════════════════ */

function switchView(btn) {
  document.querySelectorAll('.nav-pill button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function setTrendRange(range, btn) { APP.setTrendRange(range, btn); }
function setAqiView(view, btn)     { APP.setAqiView(view, btn); }
function setMapLayer(layer, btn)   { APP.setMapLayer(layer, btn); }
function loadMapStations()         { MAP.loadGlobalStations(); }

function saveApiKeys() {
  const openaq = document.getElementById('openaq-key-input').value.trim();
  if (openaq) { localStorage.setItem('openaq_key', openaq); CONFIG.OPENAQ_KEY = openaq; }
  document.getElementById('api-setup-banner').style.display = 'none';
  APP.checkApiStatus();
  if (APP.state.selectedLocation) APP.fetchAndRender();
}

function dismissBanner() {
  document.getElementById('api-setup-banner').style.display = 'none';
}

/* ── Theme Toggle ── */
window.toggleTheme = function() {
  const root = document.documentElement;
  const isLight = root.getAttribute('data-theme') === 'light';
  const btn = document.getElementById('theme-btn');
  if (isLight) {
    root.removeAttribute('data-theme');
    if (btn) btn.innerHTML = '☀️ Light';
  } else {
    root.setAttribute('data-theme', 'light');
    if (btn) btn.innerHTML = '🌙 Dark';
  }
};

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  APP.initSearch();
  APP.init();
});
