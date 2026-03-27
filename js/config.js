/* ═══════════════════════════════════════════════════════════
   config.js  —  API keys, endpoints, constants
   EDIT YOUR API KEYS BELOW OR USE THE IN-APP KEY SETUP BANNER
═══════════════════════════════════════════════════════════ */

const CONFIG = {
  // ── Paste your keys here OR use the banner in the app ──
  OPENAQ_KEY: localStorage.getItem('openaq_key') || '',   // explore.openaq.org (free)

  // ── Endpoints ──
  OPEN_METEO_BASE:       'https://api.open-meteo.com/v1',
  OPEN_METEO_GEO_BASE:   'https://geocoding-api.open-meteo.com/v1',
  OPEN_METEO_AIR_BASE:   'https://air-quality-api.open-meteo.com/v1',
  OPENAQ_BASE:    'https://api.openaq.org/v3',

  // ── Refresh ──
  REFRESH_INTERVAL_MS: 15 * 60 * 1000,  // 15 min live refresh
  MAP_CLUSTER_RADIUS:  40,               // px for marker clustering

  // ── OpenAQ v3 limits ──
  OPENAQ_PAGE_LIMIT: 100,
};

// ── AQI colour thresholds (US EPA) ──
const AQI_LEVELS = [
  { max:  50, color:'#00e400', label:'Good',                 bg:'#00e40020' },
  { max: 100, color:'#ffff00', label:'Moderate',             bg:'#ffff0020' },
  { max: 150, color:'#ff7e00', label:'Unhealthy for Sensitive Groups', bg:'#ff7e0020' },
  { max: 200, color:'#ff0000', label:'Unhealthy',            bg:'#ff000020' },
  { max: 300, color:'#8f3f97', label:'Very Unhealthy',       bg:'#8f3f9720' },
  { max: 999, color:'#7e0023', label:'Hazardous',            bg:'#7e002320' },
];

function aqiInfo(val) {
  if (!val && val !== 0) return { color:'#888', label:'No Data', bg:'#88888820' };
  return AQI_LEVELS.find(l => val <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}

// Convert raw PM2.5 µg/m³ → US AQI (simplified breakpoints)
function pm25ToAqi(pm) {
  if (pm === null || pm === undefined || pm < 0) return null;
  const bp = [
    [0,    12,    0,   50],
    [12.1, 35.4,  51,  100],
    [35.5, 55.4,  101, 150],
    [55.5, 150.4, 151, 200],
    [150.5,250.4, 201, 300],
    [250.5,500.4, 301, 500],
  ];
  for (const [lo, hi, aqiLo, aqiHi] of bp) {
    if (pm >= lo && pm <= hi) {
      return Math.round(((aqiHi - aqiLo) / (hi - lo)) * (pm - lo) + aqiLo);
    }
  }
  return 500;
}

// Convert NO₂ µg/m³ → approximate AQI contribution
function no2ToAqi(v) {
  if (!v) return null;
  const ppb = v / 1.88;
  const bp = [[0,53,0,50],[54,100,51,100],[101,360,101,150],[361,649,151,200],[650,1249,201,300],[1250,2049,301,500]];
  for (const [lo,hi,alo,ahi] of bp) {
    if (ppb >= lo && ppb <= hi) return Math.round(((ahi-alo)/(hi-lo))*(ppb-lo)+alo);
  }
  return null;
}

// Wind degrees → compass label
function degreesToCompass(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// Timestamp → "X min ago"
function timeAgo(isoStr) {
  if (!isoStr) return 'unknown';
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// UV index description
function uvLabel(uv) {
  if (uv < 3)  return 'Low';
  if (uv < 6)  return 'Moderate';
  if (uv < 8)  return 'High';
  if (uv < 11) return 'Very High';
  return 'Extreme';
}

// Weather icon emoji (WMO Weather interpretation codes)
function openMeteoIconEmoji(code, pod) {
  if (code === 0) return pod === 'n' ? '🌙' : '☀️';
  if (code === 1) return pod === 'n' ? '🌤️' : '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 55) return '🌧️';
  if (code === 56 || code === 57) return '🌨️';
  if (code >= 61 && code <= 65) return '🌧️';
  if (code === 66 || code === 67) return '🌨️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code === 85 || code === 86) return '❄️';
  if (code === 95 || code === 96 || code === 99) return '⛈️';
  return '🌡️';
}

// Show error toast
function showError(msg) {
  const t = document.createElement('div');
  t.className = 'error-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}
