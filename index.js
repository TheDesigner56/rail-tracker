const express = require('express');
const cors = require('cors');
const { findTrains } = require('trainspy/dist/src/index.js');

const app = express();// v4

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Station database ──
const RAW_STATIONS = require('trainspy/dist/src/map/stationCodes.json');
const STATIONS = {};
for (const s of RAW_STATIONS.stations) {
  STATIONS[s['CRS Code']] = s['Station Name'];
}

// ── Operator colours ──
const OP_COLORS = {
  "GW": "#0A5C36", "GWR": "#0A5C36", "HX": "#532B88", "XR": "#6950A8",
  "LM": "#FF8300", "VT": "#E31837", "GR": "#1D3557", "EM": "#6A2C70",
  "XC": "#C41230", "SR": "#003D7A", "TL": "#00AEC7", "GN": "#00AEC7",
  "SN": "#00AEC7", "SE": "#1B4F72", "SW": "#EE7623", "TP": "#00A650",
  "NT": "#00A650", "CH": "#C41230", "GC": "#E31837", "HT": "#E31837",
  "LE": "#1B4F72", "AW": "#00A650", "CC": "#C41230", "IL": "#1B4F72",
  "ME": "#FFD100", "LO": "#F46F2E", "TF": "#00AEC7", "ES": "#E31837",
};

// ── Cache ──
const cache = {};
const CACHE_TTL = 30_000;

function toHuxleyFormat(data) {
  if (!data || !data.departures) {
    return { locationName: data?.name || 'Unknown', crs: data?.code || '', generatedAt: new Date().toISOString(), trainServices: [] };
  }
  const opMap = {
    'G': { code: 'GW', name: 'Great Western Railway' }, 'W': { code: 'GW', name: 'Great Western Railway' },
    'C': { code: 'XR', name: 'Elizabeth Line' }, 'Y': { code: 'GW', name: 'Great Western Railway' },
    'H': { code: 'HX', name: 'Heathrow Express' }, 'L': { code: 'LM', name: 'West Midlands Trains' },
    'V': { code: 'VT', name: 'Avanti West Coast' }, 'N': { code: 'GR', name: 'LNER' },
    'E': { code: 'EM', name: 'East Midlands Railway' }, 'X': { code: 'XC', name: 'CrossCountry' },
    'S': { code: 'SR', name: 'ScotRail' }, 'T': { code: 'TL', name: 'Thameslink' },
    'P': { code: 'TP', name: 'TransPennine Express' }, 'R': { code: 'NT', name: 'Northern' },
    'M': { code: 'ME', name: 'Merseyrail' },
  };
  const services = data.departures.map(t => {
    const std = t.departure?.scheduled || t.arrival?.scheduled || '';
    const etd = t.departure?.actual || t.arrival?.actual || '';
    const isCancelled = t.state?.status === 'Cancelled';
    const platform = t.platform || '';
    const prefix = (t.serviceID || '')[0];
    const op = opMap[prefix] || { code: '??', name: 'Unknown' };
    return {
      std, etd: isCancelled ? 'Cancelled' : (etd || 'On time'),
      platform, operator: op.name, operatorCode: op.code,
      destination: t.destination || 'Unknown', serviceID: t.serviceID || '',
      isCancelled, state: t.state
    };
  });
  return { locationName: data.name || 'Unknown', crs: data.code || '', generatedAt: new Date().toISOString(), trainServices: services };
}

// ── API Routes ──

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', stations: Object.keys(STATIONS).length, version: '1.0.0' });
});

app.get('/api/stations', (req, res) => {
  const list = Object.entries(STATIONS)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, name]) => ({ code, name }));
  res.json(list);
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q || q.length < 1) return res.json([]);
  const results = Object.entries(STATIONS)
    .filter(([code, name]) => {
      const codeMatch = code.toLowerCase().includes(q);
      const nameMatch = name.toLowerCase().includes(q);
      const parts = name.toLowerCase().split(/[\s,()&]+/);
      const partMatch = parts.some(p => p.startsWith(q) || p.includes(q));
      return codeMatch || nameMatch || partMatch;
    })
    .slice(0, 20)
    .map(([code, name]) => ({ code, name }));
  res.json(results);
});

app.get('/api/departures/:crs', async (req, res) => {
  const crs = req.params.crs.toUpperCase().slice(0, 3);
  const now = Date.now();
  if (cache[crs] && (now - cache[crs].timestamp) < CACHE_TTL) {
    return res.json(cache[crs].data);
  }
  try {
    const raw = await findTrains(crs);
    const data = toHuxleyFormat(raw);
    cache[crs] = { data, timestamp: now };
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch data for ${crs}` });
  }
});

app.get('/api/arrivals/:crs', async (req, res) => {
  const crs = req.params.crs.toUpperCase().slice(0, 3);
  const now = Date.now();
  const cacheKey = `arr_${crs}`;
  if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }
  try {
    const raw = await findTrains(crs);
    const name = STATIONS[crs] || '';
    const arrivals = (raw.departures || []).filter(t => {
      const dest = (t.destination || '').toLowerCase();
      const stationName = name.toLowerCase();
      return dest.includes(stationName) || t.state?.station?.name?.toLowerCase() === stationName;
    });
    const data = toHuxleyFormat({ ...raw, departures: arrivals });
    cache[cacheKey] = { data, timestamp: now };
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch arrivals for ${crs}` });
  }
});

// ── HTML Routes ──

app.get('/', (req, res) => {
  res.send(renderIndex());
});

app.get('/station/:crs', async (req, res) => {
  const crs = req.params.crs.toUpperCase().slice(0, 3);
  const name = STATIONS[crs];
  if (!name) {
    return res.status(404).send(render404(crs));
  }
  try {
    const raw = await findTrains(crs);
    const data = toHuxleyFormat(raw);
    res.send(renderStation(crs, name, data, 'departures'));
  } catch (err) {
    res.send(renderStationFallback(crs, name));
  }
});

app.get('/station/:crs/arrivals', async (req, res) => {
  const crs = req.params.crs.toUpperCase().slice(0, 3);
  const name = STATIONS[crs];
  if (!name) {
    return res.status(404).send(render404(crs));
  }
  try {
    const raw = await findTrains(crs);
    const arrivals = (raw.departures || []).filter(t => {
      const dest = (t.destination || '').toLowerCase();
      const stationName = name.toLowerCase();
      return dest.includes(stationName) || t.state?.station?.name?.toLowerCase() === stationName;
    });
    const data = toHuxleyFormat({ ...raw, departures: arrivals });
    res.send(renderStation(crs, name, data, 'arrivals'));
  } catch (err) {
    res.send(renderStationFallback(crs, name));
  }
});

app.get('/about', (req, res) => {
  res.send(renderAbout());
});

app.get('/sitemap.xml', (req, res) => {
  const urls = Object.keys(STATIONS).map(code =>
    `  <url><loc>https://railtracker.uk/station/${code}</loc><changefreq>hourly</changefreq></url>`
  ).join('\n');
  res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://railtracker.uk/</loc><changefreq>hourly</changefreq></url>
${urls}
</urlset>`);
});

// ── Renderers ──

function renderIndex() {
  const stationList = Object.entries(STATIONS)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, name]) =>
      `<a href="/station/${code}" class="station-link" data-code="${code}">
        <span class="station-code">${code}</span>
        <span class="station-name">${name}</span>
        <span class="station-arrow">→</span>
      </a>`
    ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Rail Tracker — Live UK Train Times</title>
<meta name="description" content="Real-time UK train departures and arrivals. Live tracking for every station in Great Britain. Search any station for live times, platforms, delays and cancellations.">
<meta name="theme-color" content="#0B0B0F">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚄</text></svg>">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{font-size:16px;-webkit-text-size-adjust:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif;background:#0B0B0F;color:#E4E4E7;line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh}
  .page{max-width:640px;margin:0 auto;padding:0 12px}
  .topbar{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #1E1E24;position:sticky;top:0;background:#0B0B0F;z-index:100}
  .logo{font-size:1.2rem;font-weight:800;letter-spacing:-0.02em;color:#fff;white-space:nowrap;text-decoration:none}
  .logo span{color:#6366F1}
  .search-wrap{flex:1;position:relative}
  .search-wrap input{width:100%;background:#16161D;border:1px solid #252530;border-radius:10px;padding:10px 14px 10px 36px;font-size:0.95rem;color:#E4E4E7;outline:none;-webkit-appearance:none}
  .search-wrap input:focus{border-color:#6366F1}
  .search-wrap input::placeholder{color:#52525B}
  .search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#52525B;font-size:0.9rem;pointer-events:none}
  .search-results{position:absolute;top:100%;left:0;right:0;background:#121217;border:1px solid #252530;border-radius:10px;margin-top:4px;display:none;z-index:200;max-height:320px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4)}
  .search-results.show{display:block}
  .search-result{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;text-decoration:none;color:#E4E4E7;border-bottom:1px solid #1A1A20}
  .search-result:last-child{border-bottom:none}
  .search-result:hover{background:#1A1A20}
  .search-result .code{font-weight:700;font-size:0.85rem;color:#6366F1;min-width:36px;font-family:'SF Mono','Menlo',monospace}
  .search-result .name{font-size:0.9rem}
  .search-result .arrow{margin-left:auto;color:#52525B;font-size:0.8rem}
  .hero{padding:24px 0 20px}
  .hero h1{font-size:1.5rem;font-weight:800;letter-spacing:-0.02em;color:#fff;margin-bottom:4px}
  .hero p{color:#71717A;font-size:0.9rem}
  .hero-stats{display:flex;gap:16px;margin-top:8px;font-size:0.8rem;color:#52525B}
  .station-grid{display:flex;flex-direction:column;gap:1px;padding-bottom:24px}
  .station-link{display:flex;align-items:center;gap:12px;padding:10px 12px;text-decoration:none;border-radius:8px;transition:background 0.1s}
  .station-link:hover{background:#121217}
  .station-link:active{background:#1A1A20}
  .station-code{font-weight:700;font-size:0.85rem;color:#6366F1;min-width:40px;font-family:'SF Mono','Menlo',monospace}
  .station-name{font-size:0.9rem;color:#D4D4D8;flex:1}
  .station-arrow{color:#252530;font-size:0.8rem}
  .station-link:hover .station-arrow{color:#52525B}
  .footer{border-top:1px solid #1E1E24;padding:20px 0 32px;font-size:0.8rem;color:#52525B;text-align:center}
  .footer a{color:#71717A;text-decoration:none}
  .footer a:hover{color:#A1A1AA}
  .footer-links{display:flex;justify-content:center;gap:20px;margin-bottom:8px}
  .no-results{padding:20px;text-align:center;color:#52525B;font-size:0.9rem}
  @media(max-width:480px){.hero h1{font-size:1.25rem}.station-link{padding:8px 10px}.hero-stats{flex-wrap:wrap;gap:8px}}
</style>
</head>
<body>
<div class="page">
<nav class="topbar">
  <a href="/" class="logo">rail<span>tracker</span></a>
  <div class="search-wrap">
    <span class="search-icon">🔍</span>
    <input type="search" id="search" placeholder="Search stations..." autocomplete="off" aria-label="Search stations">
    <div class="search-results" id="search-results"></div>
  </div>
</nav>
<div class="hero">
  <h1>All Stations</h1>
  <p>Live departures for every station in Great Britain</p>
  <div class="hero-stats">
    <span>${Object.keys(STATIONS).length} stations</span>
    <span>•</span>
    <span>Real-time Darwin data</span>
    <span>•</span>
    <span>Auto-refresh</span>
  </div>
</div>
<div class="station-grid" id="station-grid">
${stationList}
</div>
<footer class="footer">
  <div class="footer-links">
    <a href="/about">About</a>
    <a href="https://github.com/TheDesigner56/rail-tracker">GitHub</a>
  </div>
  <p>Data: National Rail Darwin · Open Government Licence v3.0</p>
</footer>
</div>
<script>
const search=document.getElementById('search'),results=document.getElementById('search-results'),grid=document.getElementById('station-grid');
let timeout,cache={};
// Preload station data when search results appear
function preloadStation(code){
  if(!cache[code]){
    cache[code]=fetch('/api/departures/'+code).then(r=>r.json()).catch(()=>{});
  }
}
// Loading overlay on station link clicks for the full list
document.querySelectorAll('.station-link').forEach(a=>{a.addEventListener('click',()=>{document.body.innerHTML+='<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(11,11,15,0.7);z-index:999;display:flex;align-items:center;justify-content:center"><div style="width:32px;height:32px;border:3px solid #1E1E24;border-top-color:#6366F1;border-radius:50%;animation:spin 0.8s linear infinite"></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'})});
search.addEventListener('input',()=>{
  clearTimeout(timeout);
  const q=search.value.trim();
  if(!q){results.classList.remove('show');grid.style.display='';return}
  timeout=setTimeout(async()=>{
    const r=await fetch('/api/search?q='+encodeURIComponent(q));
    const d=await r.json();
    if(d.length){
      results.innerHTML=d.map(s=>'<a href="/station/'+s.code+'" class="search-result" data-code="'+s.code+'"><span class="code">'+s.code+'</span><span class="name">'+s.name+'</span><span class="arrow">→</span></a>').join('');
      results.classList.add('show');grid.style.display='none';
      // Preload data for the top 3 stations in the background
      d.slice(0,3).forEach(s=>preloadStation(s.code));
    }else{
      results.innerHTML='<div class="no-results">No stations found</div>';
      results.classList.add('show');grid.style.display='none'
    }
  },150)
});
// Preload on hover for search results
results.addEventListener('mouseover',e=>{
  const link=e.target.closest('.search-result');
  if(link&&link.dataset.code)preloadStation(link.dataset.code);
});
document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap')){results.classList.remove('show');grid.style.display=''}});
</script>
</body>
</html>`;
}

function renderStation(crs, name, data, mode = 'departures') {
  const services = data.trainServices || [];
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const total = services.length;
  const cancelled = services.filter(s => s.isCancelled).length;
  const onTime = services.filter(s => !s.isCancelled && s.etd === 'On time').length;
  const delayed = total - cancelled - onTime;
  const onTimePct = total > 0 ? Math.round(onTime / total * 100) : 0;

  const delayMins = services.filter(s => !s.isCancelled && s.etd !== 'On time' && s.std).map(s => {
    try {
      const [sh, sm] = s.std.split(':').map(Number);
      const [eh, em] = s.etd.split(':').map(Number);
      return (eh * 60 + em) - (sh * 60 + sm);
    } catch { return 0; }
  }).filter(d => d > 0);
  const avgDelay = delayMins.length ? Math.round(delayMins.reduce((a, b) => a + b, 0) / delayMins.length) : 0;

  const gaugeClass = onTimePct >= 85 ? 'good' : onTimePct >= 70 ? 'warn' : 'bad';

  const isArrivals = mode === 'arrivals';

  const rows = services.slice(0, 30).map(s => {
    const isLate = !s.isCancelled && s.etd !== 'On time' && s.etd !== s.std;
    const displayTime = s.isCancelled ? 'Cancelled' : (s.etd === 'On time' ? s.std : s.etd);
    const statusClass = s.isCancelled ? 'cancelled' : (isLate ? 'late' : 'on-time');
    const opColor = OP_COLORS[s.operatorCode] || '#52525B';
    const delayNote = isLate ? `<span class="delay">+${Math.round((parseInt(s.etd.split(':')[0])*60+parseInt(s.etd.split(':')[1]) - (parseInt(s.std.split(':')[0])*60+parseInt(s.std.split(':')[1]))))}m</span>` : '';
    return `<tr>
      <td><span class="time ${statusClass}">${displayTime}</span>${delayNote}</td>
      <td><span class="op"><span class="op-dot" style="background:${opColor}"></span>${s.operator}</span></td>
      <td class="dest">${s.destination}</td>
      <td>${s.platform ? `<span class="plat">${s.platform}</span>` : '<span class="plat na">—</span>'}</td>
      <td><span class="badge ${statusClass}">${s.isCancelled ? '✕' : (isLate ? '⚠' : '✓')}</span></td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${crs} · ${name} — Live ${isArrivals ? 'Arrivals' : 'Departures'} & Train Times</title>
<meta name="description" content="Live train times for ${name} (${crs}). Real-time ${isArrivals ? 'arrivals' : 'departures'}, platform numbers, delays and cancellations. Updated every 30 seconds.">
<meta name="theme-color" content="#0B0B0F">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚄</text></svg>">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{font-size:16px;-webkit-text-size-adjust:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif;background:#0B0B0F;color:#E4E4E7;line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh}
  .page{max-width:640px;margin:0 auto;padding:0 12px}
  .topbar{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #1E1E24;position:sticky;top:0;background:#0B0B0F;z-index:100}
  .back{color:#71717A;text-decoration:none;font-size:1.2rem;padding:4px;flex-shrink:0;display:flex;align-items:center;gap:4px}
  .back:hover{color:#E4E4E7}
  .logo{font-size:1.1rem;font-weight:800;letter-spacing:-0.02em;color:#fff;white-space:nowrap;text-decoration:none}
  .logo span{color:#6366F1}
  .hero{padding:20px 0 12px;display:flex;flex-direction:column;gap:2px}
  .hero-code{font-size:clamp(2.5rem,10vw,4rem);font-weight:800;letter-spacing:-0.03em;color:#fff;line-height:1}
  .hero-name{font-size:1.1rem;color:#A1A1AA;font-weight:500}
  .hero-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:0.8rem;color:#52525B;margin-top:4px}
  .hero-meta span{display:flex;align-items:center;gap:4px}
  .tab-bar{display:flex;gap:0;margin-bottom:16px;background:#121217;border-radius:10px;border:1px solid #1E1E24;overflow:hidden}
  .tab{flex:1;text-align:center;padding:10px;font-size:0.85rem;font-weight:600;color:#71717A;text-decoration:none;transition:all 0.15s}
  .tab.active{background:#6366F1;color:#fff}
  .tab:not(.active):hover{background:#1A1A20;color:#D4D4D8}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
  .stat{background:#121217;border:1px solid #1E1E24;border-radius:10px;padding:12px 8px;text-align:center}
  .stat-label{font-size:0.65rem;color:#71717A;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px}
  .stat-value{font-size:1.3rem;font-weight:700;color:#fff}
  .stat-value.good{color:#22C55E}.stat-value.warn{color:#F59E0B}.stat-value.bad{color:#EF4444}
  .stat-sub{font-size:0.7rem;color:#52525B;margin-top:2px}
  .gauge{background:#121217;border:1px solid #1E1E24;border-radius:10px;padding:14px;margin-bottom:16px}
  .gauge-title{font-size:0.75rem;color:#71717A;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px}
  .gauge-bar{height:6px;background:#1E1E24;border-radius:3px;overflow:hidden;margin-bottom:6px}
  .gauge-fill{height:100%;border-radius:3px;transition:width 0.3s}
  .gauge-fill.good{background:#22C55E}.gauge-fill.warn{background:#F59E0B}.gauge-fill.bad{background:#EF4444}
  .gauge-labels{display:flex;justify-content:space-between;font-size:0.8rem}
  .gauge-pct{font-weight:700}.gauge-pct.good{color:#22C55E}.gauge-pct.warn{color:#F59E0B}.gauge-pct.bad{color:#EF4444}
  .gauge-avg{color:#71717A}
  .table-wrap{overflow-x:auto;margin-bottom:20px;border-radius:10px;border:1px solid #1E1E24}
  table{width:100%;border-collapse:collapse;background:#121217;font-size:0.85rem}
  th{text-align:left;padding:8px 10px;font-size:0.7rem;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #1E1E24;background:#0E0E13;white-space:nowrap}
  td{padding:10px;border-bottom:1px solid #1A1A20;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#16161D}
  .time{font-weight:600;display:block;line-height:1.3}
  .time.on-time{color:#22C55E}.time.late{color:#F59E0B}.time.cancelled{color:#EF4444;text-decoration:line-through}
  .delay{font-size:0.7rem;color:#F59E0B;margin-left:4px;font-weight:500}
  .op{display:flex;align-items:center;gap:5px;font-weight:500;font-size:0.8rem;white-space:nowrap}
  .op-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
  .dest{font-size:0.85rem;color:#D4D4D8}
  .plat{display:inline-block;background:#1E1E24;color:#D4D4D8;padding:1px 6px;border-radius:3px;font-weight:600;font-size:0.8rem;min-width:24px;text-align:center}
  .plat.na{color:#52525B;background:transparent}
  .badge{display:inline-block;padding:2px 6px;border-radius:3px;font-size:0.75rem;font-weight:600;min-width:24px;text-align:center}
  .badge.on-time{background:#052E16;color:#22C55E}
  .badge.late{background:#422006;color:#F59E0B}
  .badge.cancelled{background:#3B0A0A;color:#EF4444}
  .refresh-bar{display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 0;font-size:0.75rem;color:#52525B}
  .refresh-bar button{background:#16161D;border:1px solid #252530;color:#A1A1AA;padding:6px 16px;border-radius:8px;font-size:0.8rem;cursor:pointer}
  .refresh-bar button:hover{background:#1E1E24;color:#E4E4E7}
  .refresh-bar .countdown{color:#52525B;min-width:60px;text-align:center}
  .loading-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(11,11,15,0.7);z-index:999;align-items:center;justify-content:center}
  .loading-overlay.show{display:flex}
  .loading-spinner{width:32px;height:32px;border:3px solid #1E1E24;border-top-color:#6366F1;border-radius:50%;animation:spin 0.8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .footer{border-top:1px solid #1E1E24;padding:16px 0 24px;font-size:0.75rem;color:#52525B;text-align:center}
  .footer a{color:#71717A;text-decoration:none}
  .footer a:hover{color:#A1A1AA}
  .footer-links{display:flex;justify-content:center;gap:16px;margin-bottom:6px}
  @media(max-width:480px){
    .stats{grid-template-columns:repeat(2,1fr);gap:6px}
    .stat{padding:10px 6px}
    .stat-value{font-size:1.1rem}
    th,td{padding:6px 8px;font-size:0.8rem}
    th:nth-child(2),td:nth-child(2){display:none}
    .dest{font-size:0.8rem}
  }
  @media(max-width:360px){
    th:nth-child(4),td:nth-child(4){display:none}
  }
</style>
</head>
<body>
<div class="page">
<nav class="topbar">
  <a href="/" class="back">← <span style="font-size:0.8rem;font-weight:500">All</span></a>
  <a href="/" class="logo">rail<span>tracker</span></a>
</nav>
<div class="hero">
  <h1 class="hero-code">${crs}</h1>
  <p class="hero-name">${name}</p>
  <div class="hero-meta">
    <span>🕐 ${timeStr}</span>
    <span>🔄 Auto-refresh</span>
    <span>📡 Live</span>
  </div>
</div>
<div class="tab-bar">
  <a href="/station/${crs}" class="tab ${isArrivals ? '' : 'active'}">Departures</a>
  <a href="/station/${crs}/arrivals" class="tab ${isArrivals ? 'active' : ''}">Arrivals</a>
</div>
<div class="stats">
  <div class="stat"><div class="stat-label">Services</div><div class="stat-value">${total}</div><div class="stat-sub">next 2h</div></div>
  <div class="stat"><div class="stat-label">On Time</div><div class="stat-value ${gaugeClass}">${onTimePct}%</div><div class="stat-sub">${onTime} of ${total}</div></div>
  <div class="stat"><div class="stat-label">Avg Delay</div><div class="stat-value warn">${avgDelay}m</div><div class="stat-sub">${delayed} delayed</div></div>
  <div class="stat"><div class="stat-label">Cancelled</div><div class="stat-value ${cancelled > 0 ? 'bad' : 'good'}">${cancelled}</div><div class="stat-sub">today</div></div>
</div>
<div class="gauge">
  <div class="gauge-title">On-Time Performance</div>
  <div class="gauge-bar"><div class="gauge-fill ${gaugeClass}" style="width:${onTimePct}%"></div></div>
  <div class="gauge-labels"><span class="gauge-pct ${gaugeClass}">${onTimePct}%</span><span class="gauge-avg">Avg delay ${avgDelay} min</span></div>
</div>
<div class="table-wrap">
<table>
<thead><tr><th>Time</th><th>Operator</th><th>${isArrivals ? 'From' : 'Destination'}</th><th>Plat</th><th></th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
<div class="refresh-bar">
  <button onclick="location.reload()">↻ Refresh Now</button>
  <span class="countdown" id="countdown">Refreshing in 30s</span>
</div>
<footer class="footer">
  <div class="footer-links">
    <a href="/">All Stations</a>
    <a href="/about">About</a>
  </div>
  <p>Data: National Rail Darwin · Open Government Licence v3.0</p>
</footer>
</div>
<div class="loading-overlay" id="loading"><div class="loading-spinner"></div></div>
<script>
document.getElementById('loading').classList.add('show');
window.addEventListener('load',()=>{setTimeout(()=>{document.getElementById('loading').classList.remove('show')},300)});
let sec=30;
setInterval(()=>{sec--;if(sec<=0){sec=30;location.reload()}document.getElementById('countdown').textContent='Refreshing in '+sec+'s'},1000);
</script>
</body>
</html>`;
}

function renderStationFallback(crs, name) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${crs} · ${name} — Live Departures</title>
<meta name="description" content="Live train times for ${name} (${crs}).">
<meta name="theme-color" content="#0B0B0F">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{font-size:16px;-webkit-text-size-adjust:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif;background:#0B0B0F;color:#E4E4E7;line-height:1.5;-webkit-font-smoothing:antialiased}
  .page{max-width:640px;margin:0 auto;padding:0 12px}
  .topbar{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #1E1E24;position:sticky;top:0;background:#0B0B0F;z-index:10}
  .back{color:#71717A;text-decoration:none;font-size:1.2rem;padding:4px;flex-shrink:0}
  .back:hover{color:#E4E4E7}
  .logo{font-size:1.1rem;font-weight:800;letter-spacing:-0.02em;color:#fff;text-decoration:none}
  .logo span{color:#6366F1}
  .hero{padding:20px 0 12px}
  .hero-code{font-size:clamp(2.5rem,10vw,4rem);font-weight:800;letter-spacing:-0.03em;color:#fff;line-height:1}
  .hero-name{font-size:1.1rem;color:#A1A1AA;font-weight:500}
  .notice{background:#121217;border:1px solid #1E1E24;border-radius:12px;padding:24px;text-align:center;margin:20px 0}
  .notice-icon{font-size:2rem;margin-bottom:12px}
  .notice h2{font-size:1rem;color:#fff;margin-bottom:8px}
  .notice p{color:#71717A;font-size:0.85rem;line-height:1.6}
  .footer{border-top:1px solid #1E1E24;padding:16px 0 24px;font-size:0.75rem;color:#52525B;text-align:center}
  .footer a{color:#71717A;text-decoration:none}
</style>
</head>
<body>
<div class="page">
<nav class="topbar">
  <a href="/" class="back">←</a>
  <a href="/" class="logo">rail<span>tracker</span></a>
</nav>
<div class="hero">
  <h1 class="hero-code">${crs}</h1>
  <p class="hero-name">${name}</p>
</div>
<div class="notice">
  <div class="notice-icon">🚄</div>
  <h2>Loading live data...</h2>
  <p>Connecting to the National Rail data feed. This page will refresh automatically when data is available.</p>
</div>
<footer class="footer">
  <p><a href="/">All Stations</a></p>
</footer>
</div>
<script>setTimeout(()=>location.reload(),5000);</script>
</body>
</html>`;
}

function renderAbout() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>About — Rail Tracker</title>
<meta name="theme-color" content="#0B0B0F">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{font-size:16px;-webkit-text-size-adjust:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif;background:#0B0B0F;color:#E4E4E7;line-height:1.6;-webkit-font-smoothing:antialiased}
  .page{max-width:640px;margin:0 auto;padding:0 12px}
  .topbar{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #1E1E24}
  .back{color:#71717A;text-decoration:none;font-size:1.2rem;padding:4px}
  .back:hover{color:#E4E4E7}
  .logo{font-size:1.1rem;font-weight:800;letter-spacing:-0.02em;color:#fff;text-decoration:none}
  .logo span{color:#6366F1}
  .content{padding:24px 0}
  .content h1{font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:16px}
  .content h2{font-size:1.1rem;font-weight:600;color:#D4D4D8;margin:24px 0 8px}
  .content p{color:#A1A1AA;font-size:0.9rem;margin-bottom:12px}
  .content a{color:#6366F1;text-decoration:none}
  .content a:hover{text-decoration:underline}
  .content ul{color:#A1A1AA;font-size:0.9rem;padding-left:20px;margin-bottom:12px}
  .content li{margin-bottom:4px}
  .footer{border-top:1px solid #1E1E24;padding:16px 0 24px;font-size:0.75rem;color:#52525B;text-align:center}
  .footer a{color:#71717A;text-decoration:none}
</style>
</head>
<body>
<div class="page">
<nav class="topbar">
  <a href="/" class="back">←</a>
  <a href="/" class="logo">rail<span>tracker</span></a>
</nav>
<div class="content">
  <h1>About Rail Tracker</h1>
  <p>Real-time train departure boards for every station in Great Britain. Inspired by Flighty and built for speed.</p>

  <h2>Data Source</h2>
  <p>All data comes from <strong>National Rail Darwin</strong> — the GB rail industry's official train running information engine. Darwin takes feeds directly from every train operating company's customer information system, combined with train location data from Network Rail.</p>
  <p>This is the same data that powers National Rail's own website, all station departure boards, and services like Google Maps.</p>

  <h2>Features</h2>
  <ul>
    <li>Live departures for 2,500+ stations across Great Britain</li>
    <li>Live arrivals for every station</li>
    <li>Real-time platform numbers, delays, and cancellations</li>
    <li>On-time performance gauges and delay statistics</li>
    <li>Auto-refresh every 30 seconds</li>
    <li>Mobile-first, dark UI</li>
    <li>Search any station by name or code</li>
  </ul>

  <h2>Open Data</h2>
  <p>This data is openly available under the <a href="https://www.nationalrail.co.uk/developers/darwin-data-feeds/">Open Government Licence v3.0</a>. Anyone can register for access via the <a href="https://raildata.org.uk/">Rail Data Marketplace</a>.</p>

  <h2>Technical</h2>
  <p>Built with Node.js, Express, and the trainspy library. Server-rendered HTML for SEO and fast initial loads. Progressive enhancement with client-side search. Auto-refresh for live updates.</p>
  <p>Source code on <a href="https://github.com/TheDesigner56/rail-tracker">GitHub</a>.</p>
</div>
<footer class="footer">
  <p><a href="/">All Stations</a></p>
</footer>
</div>
</body>
</html>`;
}

function render404(crs) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Station not found — Rail Tracker</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif;background:#0B0B0F;color:#E4E4E7;line-height:1.5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{text-align:center;max-width:400px}
  .code{font-size:4rem;font-weight:800;color:#252530;margin-bottom:8px}
  h1{font-size:1.2rem;color:#fff;margin-bottom:8px}
  p{color:#71717A;font-size:0.9rem;margin-bottom:20px}
  a{color:#6366F1;text-decoration:none;font-size:0.9rem}
  a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <div class="code">${crs}</div>
  <h1>Station not found</h1>
  <p>We don't have a station with that code. Try searching from the homepage.</p>
  <a href="/">← All Stations</a>
</div>
</body>
</html>`;
}

// ── Export for Vercel ──
module.exports = app;
