/* ═══════════════════════════════════════════════════════════
   charts.js  —  All Chart.js visualizations
═══════════════════════════════════════════════════════════ */

const CHARTS = {
  _instances: {},

  destroy(key) {
    if (this._instances[key]) {
      this._instances[key].destroy();
      delete this._instances[key];
    }
  },

  destroyAll() {
    Object.keys(this._instances).forEach(k => this.destroy(k));
  },

  _base(ctx, config) {
    // Apply global dark-theme defaults
    Chart.defaults.color = '#3d6b82';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.04)';
    Chart.defaults.font.family = "'DM Sans', sans-serif";
    return new Chart(ctx, config);
  },

  /* ── AQI TREND + PREDICTION ── */
  renderTrend(historicalData, predSeries, algoKey, range) {
    this.destroy('trend');
    const algo = ML.ALGOS[algoKey] || ML.ALGOS.ensemble;
    const canvas = document.getElementById('trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Build labels
    let labels, actData, predData;
    const now = new Date();

    if (range === '24h') {
      labels = Array.from({length:24}, (_,i) => {
        const h = (now.getHours() - 23 + i + 24) % 24;
        return `${h}:00`;
      });
      actData  = historicalData.slice(-24).map(d => d.aqi);
      if (actData.length === 0) actData = [50];
      predData = [...Array(actData.length - 1).fill(null), actData[actData.length-1], ...(predSeries||[]).slice(0,6)];
      labels   = [...labels, ...['now+1h','now+2h','now+3h','now+4h','now+5h','now+6h']];
    } else if (range === '7d') {
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      labels   = Array.from({length:7}, (_,i) => days[(now.getDay() - 6 + i + 7) % 7]);
      actData  = historicalData.slice(-7*8).reduce((acc, d, i) => {
        const bucket = Math.floor(i / 8);
        if (!acc[bucket]) acc[bucket] = [];
        acc[bucket].push(d.aqi || 0);
        return acc;
      }, []).map(arr => Math.round(arr.reduce((a,b)=>a+b,0)/arr.length));
      while (actData.length < 7) actData.unshift(actData[0] || 50);
      predData = [...actData.slice(0,-1).fill(null), actData[actData.length-1], (predSeries||[])[23]];
    } else { // 30d
      labels = Array.from({length:30}, (_,i) => `D-${29-i}`);
      actData = Array.from({length:30}, (_,i) => {
        const base = historicalData[0]?.aqi || 80;
        return Math.max(0, Math.round(base * (0.7 + Math.sin(i/7)*0.2 + (Math.random()-0.5)*0.3)));
      });
      predData = [...Array(28).fill(null), actData[29], (predSeries||[])[23] || actData[29]];
    }

    // Confidence interval bands
    const metrics = ML.metrics(algoKey, actData[actData.length-1] || 80);
    const upperBand = predData.map(v => v !== null ? v + metrics.ci * 2 : null);
    const lowerBand = predData.map(v => v !== null ? Math.max(0, v - metrics.ci * 2) : null);

    this._instances.trend = this._base(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Observed AQI',
            data: actData,
            borderColor: '#00c8ff',
            backgroundColor: 'rgba(0,200,255,0.06)',
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.4,
            order: 2,
          },
          {
            label: `${algo.name} Forecast`,
            data: predData,
            borderColor: algo.color,
            backgroundColor: algo.color + '18',
            borderWidth: 2,
            borderDash: [6, 3],
            pointRadius: 3,
            fill: false,
            tension: 0.4,
            order: 1,
          },
          {
            label: 'Upper CI',
            data: upperBand,
            borderColor: algo.color + '40',
            backgroundColor: algo.color + '10',
            borderWidth: 1,
            borderDash: [2, 4],
            pointRadius: 0,
            fill: '+1',
            tension: 0.4,
            order: 3,
          },
          {
            label: 'Lower CI',
            data: lowerBand,
            borderColor: algo.color + '40',
            backgroundColor: algo.color + '10',
            borderWidth: 1,
            borderDash: [2, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.4,
            order: 3,
          },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#7aa8bf', font: { size: 11 }, boxWidth: 12 },
            onClick: () => {},
          },
          tooltip: {
            backgroundColor: 'rgba(10,21,32,0.95)',
            borderColor: 'rgba(0,200,255,0.3)',
            borderWidth: 1,
            callbacks: {
              label: ctx => {
                if (ctx.parsed.y === null) return null;
                const info = aqiInfo(ctx.parsed.y);
                return ` ${ctx.dataset.label}: ${Math.round(ctx.parsed.y)} — ${info.label}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#3d6b82', font: { size: 10 }, maxTicksLimit: 10 },
            grid:  { color: 'rgba(255,255,255,0.03)' },
          },
          y: {
            ticks: { color: '#3d6b82', font: { size: 10 } },
            grid:  { color: 'rgba(255,255,255,0.03)' },
            title: { display: true, text: 'AQI', color: '#3d6b82', font: { size: 11 } },
          }
        }
      }
    });
  },

  /* ── AQI BREAKDOWN BAR CHART ── */
  renderBreakdown(pollutants) {
    this.destroy('breakdown');
    const canvas = document.getElementById('aqi-breakdown-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const labels = ['PM2.5','PM10','NO₂','O₃','CO×10','SO₂','NH₃'];
    const vals   = [
      pollutants.pm25  || 0,
      pollutants.pm10  || 0,
      pollutants.no2   || 0,
      pollutants.o3    || 0,
      (pollutants.co   || 0) * 10,
      pollutants.so2   || 0,
      pollutants.nh3   || 0,
    ];
    const colors = ['#b347ff','#ff6b35','#00c8ff','#00ff88','#ffaa00','#ff4040','#4ecdc4'];

    this._instances.breakdown = this._base(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Concentration',
          data: vals,
          backgroundColor: colors.map(c => c + '66'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#7aa8bf', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
          y: { ticks: { color: '#3d6b82', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
        }
      }
    });
  },

  /* ── EMISSIONS DOUGHNUT ── */
  renderEmissions() {
    this.destroy('emissions');
    const canvas = document.getElementById('emissions-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    this._instances.emissions = this._base(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Transport','Industry','Residential','Agriculture','Power Plants','Waste','Shipping'],
        datasets: [{
          data: [27, 22, 18, 13, 10, 6, 4],
          backgroundColor: ['#00c8ff66','#b347ff66','#ff6b3566','#00ff8866','#ff404066','#ffaa0066','#4ecdc466'],
          borderColor:     ['#00c8ff','#b347ff','#ff6b35','#00ff88','#ff4040','#ffaa00','#4ecdc4'],
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#7aa8bf', font: { size: 11 }, padding: 8, boxWidth: 12 }
          }
        }
      }
    });
  },

  /* ── SCATTER CORRELATION ── */
  renderCorrelation(weather, readings) {
    this.destroy('correlation');
    const canvas = document.getElementById('correlation-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const baseTemp = weather?.temp || 25;
    const baseAqi  = readings ? pm25ToAqi(readings.pm25 || 0) || 80 : 80;

    // Generate correlated scatter points
    const pts = Array.from({length:35}, () => {
      const t = baseTemp + (Math.random() - 0.5) * 15;
      const aqiShift = (t - baseTemp) * 1.8 + (Math.random() - 0.5) * 30;
      return { x: +t.toFixed(1), y: Math.max(0, Math.round(baseAqi + aqiShift)) };
    });

    const regLine = [
      { x: baseTemp - 10, y: Math.max(0, baseAqi - 18) },
      { x: baseTemp + 10, y: baseAqi + 18 }
    ];

    this._instances.correlation = this._base(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Temp vs AQI (stations)',
            data: pts,
            backgroundColor: 'rgba(0,200,255,0.45)',
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Linear Trend',
            data: regLine,
            type: 'line',
            borderColor: '#ff4040',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#7aa8bf', font: { size: 11 } } } },
        scales: {
          x: {
            title: { display: true, text: 'Temperature (°C)', color: '#3d6b82' },
            ticks: { color: '#3d6b82' },
            grid:  { color: 'rgba(255,255,255,0.03)' },
          },
          y: {
            title: { display: true, text: 'AQI', color: '#3d6b82' },
            ticks: { color: '#3d6b82' },
            grid:  { color: 'rgba(255,255,255,0.03)' },
          }
        }
      }
    });
  },

  /* ── HEATMAP CANVAS ── */
  renderHeatmap(aqi) {
    const canvas = document.getElementById('heatmap-canvas');
    if (!canvas) return;
    const W = canvas.offsetWidth || 420;
    const H = canvas.offsetHeight || 190;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const days  = 7;
    const hours = 24;
    const cellW = W / hours;
    const cellH = H / days;
    const dayLabels = ['M','T','W','T','F','S','S'];
    const basePct = Math.min((aqi || 80) / 300, 1);

    for (let row = 0; row < days; row++) {
      for (let col = 0; col < hours; col++) {
        const rush = (col >= 7 && col <= 10) || (col >= 17 && col <= 20);
        const night = col < 5 || col > 22;
        let pct = basePct * (rush ? 1.35 : night ? 0.55 : 0.9);
        pct = Math.max(0, Math.min(1, pct + (Math.random() - 0.5) * 0.2));
        ctx.fillStyle = this._heatColor(pct);
        ctx.fillRect(col * cellW + 0.5, row * cellH + 0.5, cellW - 1, cellH - 1);
      }
      // Day label
      ctx.fillStyle = 'rgba(200,230,255,0.5)';
      ctx.font = '9px Space Mono, monospace';
      ctx.fillText(dayLabels[row], 3, row * cellH + cellH * 0.68);
    }
  },

  _heatColor(v) {
    const stops = [
      [0,    [0,228,64]],
      [0.2,  [255,255,0]],
      [0.45, [255,126,0]],
      [0.65, [255,0,0]],
      [0.83, [143,63,151]],
      [1,    [126,0,35]],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, c0] = stops[i];
      const [t1, c1] = stops[i+1];
      if (v >= t0 && v <= t1) {
        const f = (v - t0) / (t1 - t0);
        const r = Math.round(c0[0] + f * (c1[0] - c0[0]));
        const g = Math.round(c0[1] + f * (c1[1] - c0[1]));
        const b = Math.round(c0[2] + f * (c1[2] - c0[2]));
        return `rgba(${r},${g},${b},0.88)`;
      }
    }
    return '#7e0023';
  },

  /* ── WIND ROSE ── */
  renderWindRose(windDeg, windSpeed) {
    const canvas = document.getElementById('wind-rose');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W/2, cy = H/2;
    const R  = Math.min(W,H)/2 - 22;

    ctx.clearRect(0, 0, W, H);

    // Grid rings
    [0.25, 0.5, 0.75, 1].forEach(f => {
      ctx.beginPath();
      ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,200,255,0.08)';
      ctx.stroke();
    });

    // Spokes
    const dirs8 = ['N','NE','E','SE','S','SW','W','NW'];
    dirs8.forEach((dir, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.strokeStyle = 'rgba(0,200,255,0.07)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(122,168,191,0.65)';
      ctx.font = '10px Space Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dir, cx + (R + 13) * Math.cos(a), cy + (R + 13) * Math.sin(a));
    });

    // Rose petals (simulated frequency)
    const speeds = [0.3, 0.5, 0.75, 0.55, 0.35, 0.65, 0.85, 0.45];
    speeds.forEach((s, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r2 = R * s;
      const half = Math.PI / 8;
      const grad = ctx.createLinearGradient(cx, cy, cx + r2 * Math.cos(a), cy + r2 * Math.sin(a));
      grad.addColorStop(0, 'rgba(0,200,255,0.5)');
      grad.addColorStop(1, 'rgba(0,200,255,0.04)');
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r2, a - half, a + half);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    });

    // Current wind direction arrow
    if (windDeg !== undefined && windDeg !== null) {
      const wRad = (windDeg + 180) * Math.PI / 180 - Math.PI / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(wRad);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.82);
      ctx.lineTo(-6, -R * 0.6);
      ctx.lineTo(6, -R * 0.6);
      ctx.closePath();
      ctx.fillStyle = '#ffaa00';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();

      // Speed label
      ctx.fillStyle = 'rgba(255,170,0,0.8)';
      ctx.font = '10px Space Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${windSpeed || 0} km/h`, cx, cy + R + 10);
    }

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00c8ff';
    ctx.shadowColor = '#00c8ff';
    ctx.shadowBlur = 10;
    ctx.fill();
  },
};
