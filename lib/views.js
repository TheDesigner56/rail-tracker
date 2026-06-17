// ── HTML rendering ───────────────────────────────────────────────────────
// Server-rendered, dark "Flighty"-style UI. A shared shell keeps the chrome
// (nav + search + footer + base CSS) consistent across every page.

const rail = require('./rail');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px;-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif;background:#0B0B0F;color:#E4E4E7;line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh}
a{color:inherit}
.page{max-width:720px;margin:0 auto;padding:0 12px}
.topbar{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #1E1E24;position:sticky;top:0;background:rgba(11,11,15,.92);backdrop-filter:blur(8px);z-index:100}
.logo{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;color:#fff;white-space:nowrap;text-decoration:none}
.logo span{color:#6366F1}
.back{color:#71717A;text-decoration:none;font-size:1.1rem;padding:4px;flex-shrink:0;display:flex;align-items:center;gap:4px}
.back:hover{color:#E4E4E7}
.search-wrap{flex:1;position:relative;min-width:0}
.search-wrap input{width:100%;background:#16161D;border:1px solid #252530;border-radius:10px;padding:9px 14px 9px 34px;font-size:.92rem;color:#E4E4E7;outline:none;-webkit-appearance:none}
.search-wrap input:focus{border-color:#6366F1}
.search-wrap input::placeholder{color:#52525B}
.search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#52525B;font-size:.85rem;pointer-events:none}
.search-results{position:absolute;top:100%;left:0;right:0;background:#121217;border:1px solid #252530;border-radius:10px;margin-top:4px;display:none;z-index:200;max-height:340px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.search-results.show{display:block}
.search-result{display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;text-decoration:none;color:#E4E4E7;border-bottom:1px solid #1A1A20}
.search-result:last-child{border-bottom:none}
.search-result:hover,.search-result.sel{background:#1A1A20}
.search-result .code{font-weight:700;font-size:.82rem;color:#6366F1;min-width:34px;font-family:'SF Mono','Menlo',monospace}
.search-result .arrow{margin-left:auto;color:#52525B}
.no-results{padding:18px;text-align:center;color:#52525B;font-size:.9rem}
.footer{border-top:1px solid #1E1E24;padding:20px 0 36px;font-size:.78rem;color:#52525B;text-align:center;margin-top:24px}
.footer a{color:#71717A;text-decoration:none}.footer a:hover{color:#A1A1AA}
.footer-links{display:flex;justify-content:center;flex-wrap:wrap;gap:18px;margin-bottom:8px}
.op-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:inline-block}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#16161D;border:1px solid #252530;font-size:.8rem;color:#D4D4D8;text-decoration:none}
.chip:hover{background:#1E1E24}
.muted{color:#71717A}
.late{color:#F59E0B}.ontime{color:#22C55E}.bad{color:#EF4444}
`;

const SEARCH_JS = `
(function(){
 var s=document.getElementById('search'),r=document.getElementById('search-results');
 if(!s)return;var t,idx=-1,items=[];
 function go(c){location.href='/station/'+c}
 s.addEventListener('input',function(){clearTimeout(t);var q=s.value.trim();if(!q){r.classList.remove('show');return}
  t=setTimeout(function(){fetch('/api/search?q='+encodeURIComponent(q)).then(x=>x.json()).then(function(d){idx=-1;
   if(d.length){r.innerHTML=d.map(function(x){return '<a href="/station/'+x.code+'" class="search-result"><span class="code">'+x.code+'</span><span class="name">'+x.name+'</span><span class="arrow">→</span></a>'}).join('');r.classList.add('show');items=r.querySelectorAll('.search-result')}
   else{r.innerHTML='<div class="no-results">No stations found</div>';r.classList.add('show');items=[]}})},140)});
 s.addEventListener('keydown',function(e){if(!r.classList.contains('show'))return;
  if(e.key==='ArrowDown'){e.preventDefault();idx=Math.min(idx+1,items.length-1)}
  else if(e.key==='ArrowUp'){e.preventDefault();idx=Math.max(idx-1,0)}
  else if(e.key==='Enter'){if(idx>=0&&items[idx]){e.preventDefault();items[idx].click()}return}
  else return;
  items.forEach(function(el,i){el.classList.toggle('sel',i===idx)})});
 document.addEventListener('click',function(e){if(!e.target.closest('.search-wrap'))r.classList.remove('show')});
})();`;

function topbar({ back } = {}) {
  return `<nav class="topbar">
  ${back ? `<a href="${esc(back)}" class="back">←</a>` : ''}
  <a href="/" class="logo">rail<span>tracker</span></a>
  <div class="search-wrap">
    <span class="search-icon">🔍</span>
    <input type="search" id="search" placeholder="Search stations…" autocomplete="off" aria-label="Search stations">
    <div class="search-results" id="search-results"></div>
  </div>
</nav>`;
}

function footer() {
  return `<footer class="footer">
  <div class="footer-links">
    <a href="/">Stations</a><a href="/map">Map</a><a href="/operators">Operators</a><a href="/about">About</a>
    <a href="https://github.com/TheDesigner56/rail-tracker">GitHub</a>
  </div>
  <p>Live data from National Rail / Network Rail via Realtime Trains. Not affiliated with any rail operator.</p>
</footer>`;
}

function shell({ title, desc, head = '', body, script = '', fullHeight = false }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc || '')}">
<meta name="theme-color" content="#0B0B0F">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc || '')}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚄</text></svg>">
<style>${BASE_CSS}${head}</style>
</head>
<body${fullHeight ? ' style="height:100vh;overflow:hidden"' : ''}>
${body}
<script>${SEARCH_JS}${script}</script>
</body>
</html>`;
}

// helpers
function delayLabel(n, cancelled) {
  if (cancelled) return '<span class="bad">Cancelled</span>';
  if (n > 0) return `<span class="late">+${n} min</span>`;
  if (n < 0) return `<span class="ontime">${n} min</span>`;
  return '<span class="ontime">On time</span>';
}
function opChip(code, name) {
  return `<span class="op"><span class="op-dot" style="background:${rail.operatorColor(code)}"></span>${esc(name)}</span>`;
}

// ── Home ───────────────────────────────────────────────────────────────────
const POPULAR = ['PAD', 'KGX', 'EUS', 'VIC', 'WAT', 'LST', 'LBG', 'MAN', 'BHM', 'LDS', 'LIV', 'EDB', 'GLC', 'BRI', 'YRK', 'NCL', 'SHF', 'NOT', 'RDG', 'CDF'];

function renderHome() {
  const stations = rail.allStations();
  const popular = POPULAR.filter((c) => rail.stationName(c)).map((c) =>
    `<a href="/station/${c}" class="chip"><span class="code" style="font-weight:700;color:#6366F1;font-family:'SF Mono',monospace">${c}</span> ${esc(rail.stationName(c))}</a>`).join('');
  const list = stations.map(({ code, name }) =>
    `<a href="/station/${code}" class="srow"><span class="srow-code">${code}</span><span class="srow-name">${esc(name)}</span><span class="srow-arr">→</span></a>`).join('');

  const head = `
.hero{padding:26px 0 14px}
.hero h1{font-size:1.6rem;font-weight:800;letter-spacing:-.02em;color:#fff;margin-bottom:4px}
.hero p{color:#71717A;font-size:.92rem}
.hero-stats{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px;font-size:.78rem;color:#52525B}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
.btn{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border-radius:10px;background:#16161D;border:1px solid #252530;color:#E4E4E7;text-decoration:none;font-size:.88rem;font-weight:500;cursor:pointer}
.btn:hover{background:#1E1E24}
.btn.primary{background:#6366F1;border-color:#6366F1;color:#fff}.btn.primary:hover{background:#5457e0}
.sect{margin:22px 0 10px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#71717A}
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip .code{margin-right:2px}
#nearby{display:none;flex-direction:column;gap:1px;margin-top:6px}
#nearby.show{display:flex}
.station-grid{display:flex;flex-direction:column;gap:1px;padding-bottom:8px}
.srow{display:flex;align-items:center;gap:12px;padding:10px 12px;text-decoration:none;border-radius:8px}
.srow:hover{background:#121217}
.srow-code{font-weight:700;font-size:.82rem;color:#6366F1;min-width:40px;font-family:'SF Mono','Menlo',monospace}
.srow-name{font-size:.9rem;color:#D4D4D8;flex:1}
.srow-arr{color:#252530}
.srow:hover .srow-arr{color:#52525B}`;

  const body = `<div class="page">
${topbar()}
<div class="hero">
  <h1>UK Live Train Times</h1>
  <p>Real-time departures, arrivals & live train tracking for every station in Great Britain.</p>
  <div class="hero-stats"><span>${stations.length.toLocaleString()} stations</span><span>•</span><span>Live Network Rail data</span><span>•</span><span>Full route tracking</span></div>
</div>
<div class="actions">
  <button class="btn primary" id="near-btn">📍 Stations near me</button>
  <a class="btn" href="/map">🗺 Network map</a>
  <a class="btn" href="/operators">🚆 Operators</a>
</div>
<div id="nearby"></div>
<div class="sect">Popular stations</div>
<div class="chips">${popular}</div>
<div class="sect">All stations</div>
<div class="station-grid">${list}</div>
${footer()}
</div>`;

  const script = `
var nb=document.getElementById('near-btn'),box=document.getElementById('nearby');
nb.addEventListener('click',function(){
 if(!navigator.geolocation){box.innerHTML='<p class="muted" style="padding:8px">Location not supported on this device.</p>';box.classList.add('show');return}
 nb.textContent='📍 Locating…';
 navigator.geolocation.getCurrentPosition(function(p){
  fetch('/api/nearby?lat='+p.coords.latitude+'&lon='+p.coords.longitude).then(r=>r.json()).then(function(d){
   nb.textContent='📍 Stations near me';
   box.innerHTML=d.map(function(s){return '<a href="/station/'+s.code+'" class="srow"><span class="srow-code">'+s.code+'</span><span class="srow-name">'+s.name+'</span><span class="muted" style="font-size:.78rem">'+s.distKm.toFixed(1)+' km</span></a>'}).join('');
   box.classList.add('show');
  })
 },function(){nb.textContent='📍 Stations near me';box.innerHTML='<p class="muted" style="padding:8px">Couldn\\'t get your location.</p>';box.classList.add('show')})
});`;

  return shell({
    title: 'Rail Tracker — Live UK Train Times, Departures & Tracking',
    desc: 'Real-time UK train departures, arrivals and live train tracking for every station in Great Britain. Platforms, delays, cancellations and full route maps.',
    head, body, script,
  });
}

// ── Station board ──────────────────────────────────────────────────────────
function renderStation(board) {
  const { crs, name, mode, services, loc } = board;
  const arr = mode === 'arrivals';
  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const total = services.length;
  const cancelled = services.filter((s) => s.cancelled).length;
  const delayed = services.filter((s) => !s.cancelled && s.delay > 0).length;
  const onTime = Math.max(0, total - cancelled - delayed);
  const pct = total ? Math.round((onTime / total) * 100) : 100;
  const delays = services.filter((s) => !s.cancelled && s.delay > 0).map((s) => s.delay);
  const avg = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
  const cls = pct >= 85 ? 'good' : pct >= 70 ? 'warn' : 'bad';

  const rows = services.slice(0, 60).map((s) => {
    const stcls = s.cancelled ? 'c-cancel' : s.delay > 0 ? 'c-late' : 'c-ontime';
    const time = s.cancelled ? `<span class="t-sched strike">${esc(s.scheduled)}</span>`
      : s.delay > 0 ? `<span class="t-sched strike">${esc(s.scheduled)}</span> <span class="t-exp late">${esc(s.expected)}</span>`
      : `<span class="t-exp ontime">${esc(s.scheduled)}</span>`;
    return `<a class="brow ${stcls}" href="/service/${s.id}">
      <span class="b-time">${time}</span>
      <span class="b-dest">${esc(s.place)}<span class="b-op"><span class="op-dot" style="background:${s.color}"></span>${esc(s.operator)}${s.headcode ? ` · ${esc(s.headcode)}` : ''}${s.cars ? ` · ${s.cars} cars` : ''}</span></span>
      <span class="b-plat">${s.platform ? `<span class="plat">${esc(s.platform)}</span>` : '<span class="plat na">—</span>'}</span>
      <span class="b-go">›</span>
    </a>`;
  }).join('');

  const head = `
.hero{padding:18px 0 10px}
.hero-code{font-size:clamp(2.2rem,9vw,3.4rem);font-weight:800;letter-spacing:-.03em;color:#fff;line-height:1}
.hero-name{font-size:1.05rem;color:#A1A1AA;font-weight:500}
.hero-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:.78rem;color:#52525B;margin-top:6px}
.tab-bar{display:flex;margin:14px 0;background:#121217;border-radius:10px;border:1px solid #1E1E24;overflow:hidden}
.tab{flex:1;text-align:center;padding:10px;font-size:.85rem;font-weight:600;color:#71717A;text-decoration:none}
.tab.active{background:#6366F1;color:#fff}.tab:not(.active):hover{background:#1A1A20;color:#D4D4D8}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.stat{background:#121217;border:1px solid #1E1E24;border-radius:10px;padding:11px 8px;text-align:center}
.stat-l{font-size:.62rem;color:#71717A;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
.stat-v{font-size:1.25rem;font-weight:700;color:#fff}
.stat-v.good{color:#22C55E}.stat-v.warn{color:#F59E0B}.stat-v.bad{color:#EF4444}
.stat-s{font-size:.66rem;color:#52525B;margin-top:1px}
.board{display:flex;flex-direction:column;border:1px solid #1E1E24;border-radius:12px;overflow:hidden;background:#121217}
.brow{display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid #1A1A20;text-decoration:none;color:#E4E4E7}
.brow:last-child{border-bottom:none}.brow:hover{background:#16161D}
.b-time{min-width:84px;font-weight:600;font-size:.92rem;display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
.t-sched{font-size:.92rem}.strike{text-decoration:line-through;color:#52525B;font-weight:500}
.t-exp{font-weight:700}
.b-dest{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.b-dest>span:first-child{font-size:.95rem;color:#fff;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b-op{display:flex;align-items:center;gap:5px;font-size:.74rem;color:#71717A;font-weight:400}
.b-plat{min-width:40px;text-align:center}
.plat{display:inline-block;background:#1E1E24;color:#D4D4D8;padding:2px 7px;border-radius:4px;font-weight:700;font-size:.8rem}
.plat.na{color:#52525B;background:transparent}
.b-go{color:#3F3F46;font-size:1.1rem}
.brow:hover .b-go{color:#6366F1}
.empty{padding:40px 16px;text-align:center;color:#71717A}
.refresh-bar{display:flex;align-items:center;justify-content:center;gap:14px;padding:14px 0;font-size:.76rem;color:#52525B}
.refresh-bar button{background:#16161D;border:1px solid #252530;color:#A1A1AA;padding:7px 16px;border-radius:8px;font-size:.8rem;cursor:pointer}
.refresh-bar button:hover{background:#1E1E24;color:#E4E4E7}
@media(max-width:480px){.stats{grid-template-columns:repeat(2,1fr)}.b-time{min-width:74px}}`;

  const body = `<div class="page">
${topbar({ back: '/' })}
<div class="hero">
  <div class="hero-code">${crs}</div>
  <div class="hero-name">${esc(name)}</div>
  <div class="hero-meta"><span>🕐 ${now}</span><span>📡 Live</span>${loc ? `<a href="/map?focus=${crs}" style="color:#71717A;text-decoration:none">🗺 Map</a>` : ''}</div>
</div>
<div class="tab-bar">
  <a href="/station/${crs}" class="tab ${arr ? '' : 'active'}">Departures</a>
  <a href="/station/${crs}/arrivals" class="tab ${arr ? 'active' : ''}">Arrivals</a>
</div>
<div class="stats">
  <div class="stat"><div class="stat-l">${arr ? 'Arrivals' : 'Departures'}</div><div class="stat-v">${total}</div><div class="stat-s">listed</div></div>
  <div class="stat"><div class="stat-l">On time</div><div class="stat-v ${cls}">${pct}%</div><div class="stat-s">${onTime} of ${total}</div></div>
  <div class="stat"><div class="stat-l">Avg delay</div><div class="stat-v ${avg > 0 ? 'warn' : 'good'}">${avg}m</div><div class="stat-s">${delayed} delayed</div></div>
  <div class="stat"><div class="stat-l">Cancelled</div><div class="stat-v ${cancelled ? 'bad' : 'good'}">${cancelled}</div><div class="stat-s">services</div></div>
</div>
<div class="board">${rows || `<div class="empty">No ${arr ? 'arrivals' : 'departures'} in the next couple of hours.</div>`}</div>
<div class="refresh-bar"><button onclick="location.reload()">↻ Refresh</button><span id="cd">auto-refresh 60s</span></div>
${footer()}
</div>`;

  const script = `var sec=60;setInterval(function(){sec--;if(sec<=0)location.reload();document.getElementById('cd').textContent='auto-refresh '+sec+'s'},1000);`;

  return shell({
    title: `${crs} · ${esc(name)} — Live ${arr ? 'Arrivals' : 'Departures'}`,
    desc: `Live train ${arr ? 'arrivals' : 'departures'} for ${name} (${crs}): real-time platforms, delays, cancellations and full route tracking. Updated every minute.`,
    head, body, script,
  });
}

// ── Service detail (the "trip" page) ───────────────────────────────────────
function renderService(svc) {
  const colorOf = (st) => st === 'past' || st === 'departed' ? '#52525B' : st === 'current' ? svc.color : '#6366F1';
  const stopRows = svc.stops.map((r) => {
    const dotCls = r.state === 'current' ? 'cur' : (r.state === 'past' || r.state === 'departed') ? 'past' : 'fut';
    const arrShown = r.realArr || r.schedArr;
    const depShown = r.realDep || r.schedDep;
    const arrLate = r.realArr && r.schedArr && r.realArr !== r.schedArr;
    const depLate = r.realDep && r.schedDep && r.realDep !== r.schedDep;
    const dl = r.delay > 0 ? `<span class="late">+${r.delay}</span>` : r.delay < 0 ? `<span class="ontime">${r.delay}</span>` : '';
    return `<div class="stop ${dotCls}" data-name="${esc(r.name)}">
      <div class="stop-dot"></div>
      <div class="stop-main">
        <div class="stop-name">${r.code ? `<a href="/station/${r.code}">${esc(r.name)}</a>` : esc(r.name)} ${dl}</div>
        <div class="stop-times">
          ${r.schedArr ? `<span>arr <b class="${arrLate ? 'late' : 'ontime'}">${esc(arrShown)}</b>${arrLate ? ` <s>${esc(r.schedArr)}</s>` : ''}</span>` : ''}
          ${r.schedDep ? `<span>dep <b class="${depLate ? 'late' : 'ontime'}">${esc(depShown)}</b>${depLate ? ` <s>${esc(r.schedDep)}</s>` : ''}</span>` : ''}
        </div>
      </div>
      ${r.platform ? `<div class="stop-plat"><span class="plat">${esc(r.platform)}</span></div>` : ''}
    </div>`;
  }).join('');

  const statusCls = /cancel/i.test(svc.status) ? 'bad' : svc.currentDelay > 0 ? 'late' : 'ontime';
  const facts = [];
  if (svc.headcode) facts.push(`Headcode <b>${esc(svc.headcode)}</b>`);
  if (svc.formation) facts.push(`Units <b>${esc(svc.formation)}</b>`);
  if (svc.pathInfo) facts.push(esc(svc.pathInfo));
  svc.tags.forEach((t) => facts.push(esc(t)));

  const head = `
.svc-hero{padding:16px 0 12px}
.svc-route{font-size:1.3rem;font-weight:800;color:#fff;letter-spacing:-.02em;line-height:1.25}
.svc-route .to{color:#52525B;font-weight:600;margin:0 6px}
.svc-sub{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:.85rem;color:#A1A1AA}
.svc-status{padding:3px 10px;border-radius:999px;font-weight:600;font-size:.8rem;background:#16161D;border:1px solid #252530}
.svc-status.late{color:#F59E0B}.svc-status.ontime{color:#22C55E}.svc-status.bad{color:#EF4444}
.op{display:inline-flex;align-items:center;gap:6px;font-weight:600}
#map{height:280px;width:100%;border-radius:12px;overflow:hidden;border:1px solid #1E1E24;margin:8px 0 14px;background:#0B0B0F}
.leaflet-container{background:#0B0B0F!important;font-family:inherit}
.facts{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px}
.fact{background:#121217;border:1px solid #1E1E24;border-radius:8px;padding:6px 10px;font-size:.76rem;color:#A1A1AA}
.fact b{color:#E4E4E7;font-weight:600}
.sect{margin:6px 0 10px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#71717A}
.timeline{position:relative;padding-left:6px}
.stop{position:relative;display:flex;align-items:flex-start;gap:12px;padding:9px 0 9px 22px}
.stop::before{content:'';position:absolute;left:5px;top:0;bottom:0;width:2px;background:#1E1E24}
.stop:first-child::before{top:14px}.stop:last-child::before{bottom:calc(100% - 14px)}
.stop-dot{position:absolute;left:0;top:11px;width:12px;height:12px;border-radius:50%;background:#1E1E24;border:2px solid #0B0B0F;z-index:1}
.stop.past .stop-dot{background:#3F3F46}
.stop.cur .stop-dot{background:#6366F1;box-shadow:0 0 0 4px rgba(99,102,241,.25);animation:pulse 1.8s infinite}
.stop.fut .stop-dot{background:#52525B}
@keyframes pulse{0%,100%{box-shadow:0 0 0 4px rgba(99,102,241,.25)}50%{box-shadow:0 0 0 7px rgba(99,102,241,.12)}}
.stop-main{flex:1;min-width:0}
.stop-name{font-size:.95rem;font-weight:600;color:#E4E4E7}
.stop-name a{text-decoration:none}.stop-name a:hover{color:#6366F1}
.stop.past .stop-name{color:#71717A}
.stop.cur .stop-name{color:#fff}
.stop-times{font-size:.78rem;color:#71717A;display:flex;gap:14px;margin-top:2px;flex-wrap:wrap}
.stop-times b{font-weight:600}.stop-times s{color:#52525B}
.stop-plat .plat{display:inline-block;background:#1E1E24;color:#D4D4D8;padding:2px 7px;border-radius:4px;font-weight:700;font-size:.78rem}
.late{color:#F59E0B}.ontime{color:#22C55E}.bad{color:#EF4444}`;

  const body = `<div class="page">
${topbar({ back: 'javascript:history.length>1?history.back():location.assign("/")' })}
<div class="svc-hero">
  <div class="svc-route">${esc(svc.origin || '?')}<span class="to">→</span>${esc(svc.destination || '?')}</div>
  <div class="svc-sub">
    <span class="op"><span class="op-dot" style="background:${svc.color}"></span>${esc(svc.operator || 'Unknown operator')}</span>
    <span class="svc-status ${statusCls}" id="status">${esc(svc.status)}${svc.currentStation ? ` · ${esc(svc.currentStation)}` : ''}</span>
  </div>
</div>
<div id="map"></div>
${facts.length ? `<div class="facts">${facts.map((f) => `<span class="fact">${f}</span>`).join('')}</div>` : ''}
<div class="sect">Calling points</div>
<div class="timeline" id="timeline">${stopRows}</div>
${footer()}
</div>`;

  const mapData = JSON.stringify({ points: svc.routePoints, pos: svc.currentPosition, color: svc.color });
  const script = `
var L_CSS='${LEAFLET_CSS}';var lk=document.createElement('link');lk.rel='stylesheet';lk.href=L_CSS;document.head.appendChild(lk);
var sc=document.createElement('script');sc.src='${LEAFLET_JS}';sc.onload=initMap;document.body.appendChild(sc);
var D=${mapData};var map,line,trainM,oM,dM;
function initMap(){
 map=L.map('map',{zoomControl:false,attributionControl:false,preferCanvas:true});
 L.tileLayer('${DARK_TILES}',{maxZoom:18}).addTo(map);
 if(D.points&&D.points.length){line=L.polyline(D.points,{color:D.color,weight:3,opacity:.65}).addTo(map);
  oM=L.circleMarker(D.points[0],{radius:5,color:'#fff',fillColor:D.color,fillOpacity:1,weight:2}).addTo(map);
  dM=L.circleMarker(D.points[D.points.length-1],{radius:5,color:'#fff',fillColor:'#6366F1',fillOpacity:1,weight:2}).addTo(map);
  map.fitBounds(line.getBounds().pad(.15))}
 drawTrain(D.pos);
 setInterval(poll,20000);
}
function drawTrain(pos){if(!pos)return;if(trainM)trainM.setLatLng(pos);else trainM=L.circleMarker(pos,{radius:8,color:'#fff',fillColor:D.color,fillOpacity:1,weight:3}).addTo(map).bindTooltip('Train',{permanent:false})}
function poll(){fetch('/api/service/${esc(svc.id)}?date=${esc(svc.date)}').then(r=>r.json()).then(function(d){
 if(d.status){var s=document.getElementById('status');s.textContent=d.status+(d.currentStation?' · '+d.currentStation:'')}
 if(d.currentPosition)drawTrain(d.currentPosition);
 if(d.stops){var tl=document.getElementById('timeline');d.stops.forEach(function(st){var el=tl.querySelector('[data-name="'+(st.name||'').replace(/"/g,'')+'"]');if(el){el.classList.remove('past','cur','fut');el.classList.add(st.state==='current'?'cur':(st.state==='past'||st.state==='departed')?'past':'fut')}})}
}).catch(function(){})}`;

  return shell({
    title: `${esc(svc.origin || '')} → ${esc(svc.destination || '')}${svc.headcode ? ` (${esc(svc.headcode)})` : ''} — Live Tracking`,
    desc: `Live tracking for the ${svc.operator || ''} service from ${svc.origin || ''} to ${svc.destination || ''}. Full calling points, real-time delays and current position on a map.`,
    head, body, script,
  });
}

// ── All-stations map ─────────────────────────────────────────────────────
function renderMap() {
  const head = `
#map{position:fixed;top:54px;left:0;right:0;bottom:0;background:#0B0B0F}
.leaflet-container{background:#0B0B0F!important;font-family:inherit}
.leaflet-popup-content-wrapper,.leaflet-popup-tip{background:#16161D;color:#E4E4E7;border:1px solid #252530}
.leaflet-popup-content a{color:#6366F1;text-decoration:none;font-weight:600}
.topbar{position:fixed;left:0;right:0;top:0;padding:8px 12px}`;
  const body = `<div class="page">${topbar({ back: '/' })}</div><div id="map"></div>`;
  const script = `
var lk=document.createElement('link');lk.rel='stylesheet';lk.href='${LEAFLET_CSS}';document.head.appendChild(lk);
var sc=document.createElement('script');sc.src='${LEAFLET_JS}';sc.onload=init;document.body.appendChild(sc);
function init(){
 var params=new URLSearchParams(location.search),focus=params.get('focus');
 var map=L.map('map',{zoomControl:true,attributionControl:false,preferCanvas:true}).setView([54.5,-3],6);
 L.tileLayer('${DARK_TILES}',{maxZoom:18}).addTo(map);
 fetch('/api/locations').then(r=>r.json()).then(function(list){
  var fm=null;
  list.forEach(function(s){
   var m=L.circleMarker([s.lat,s.lon],{radius:3,color:'#6366F1',fillColor:'#818CF8',fillOpacity:.8,weight:1});
   m.bindPopup('<b>'+s.name+'</b> ('+s.code+')<br><a href="/station/'+s.code+'">Live times →</a>');
   m.addTo(map);
   if(focus&&s.code===focus)fm=s;
  });
  if(fm){map.setView([fm.lat,fm.lon],13)}
 });
}`;
  return shell({
    title: 'Network Map — Rail Tracker',
    desc: 'Interactive map of every railway station in Great Britain. Tap any station for live departures and arrivals.',
    head, body, script, fullHeight: true,
  });
}

// ── Operators ──────────────────────────────────────────────────────────────
function renderOperators(list) {
  const head = `
.hero{padding:24px 0 10px}.hero h1{font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:4px}.hero p{color:#71717A;font-size:.9rem}
.op-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:8px 0 16px}
.op-card{display:flex;align-items:center;gap:10px;padding:14px;border-radius:12px;background:#121217;border:1px solid #1E1E24;text-decoration:none;color:#E4E4E7}
.op-card:hover{background:#16161D}
.op-bar{width:6px;align-self:stretch;border-radius:3px;min-height:34px}
.op-card .nm{font-size:.9rem;font-weight:600}.op-card .cd{font-size:.72rem;color:#71717A;font-family:'SF Mono',monospace}`;
  const cards = list.map((o) =>
    `<a class="op-card" href="/operator/${o.code}"><span class="op-bar" style="background:${o.color}"></span><span><span class="nm">${esc(o.name)}</span><br><span class="cd">${o.code}</span></span></a>`).join('');
  const body = `<div class="page">${topbar({ back: '/' })}
<div class="hero"><h1>Train Operators</h1><p>Passenger train operating companies across Great Britain.</p></div>
<div class="op-grid">${cards}</div>
${footer()}</div>`;
  return shell({ title: 'Train Operators — Rail Tracker', desc: 'All UK passenger train operating companies (TOCs), their codes and brand colours.', head, body });
}

function renderOperator(code, info, sampleStations) {
  const head = `
.op-head{padding:20px 0;display:flex;align-items:center;gap:14px}
.op-swatch{width:14px;align-self:stretch;min-height:56px;border-radius:7px}
.op-head h1{font-size:1.5rem;font-weight:800;color:#fff}.op-head .cd{color:#71717A;font-family:'SF Mono',monospace;font-size:.85rem}
.note{background:#121217;border:1px solid #1E1E24;border-radius:12px;padding:16px;color:#A1A1AA;font-size:.9rem;line-height:1.6}
.sect{margin:20px 0 8px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#71717A}
.chips{display:flex;flex-wrap:wrap;gap:7px}`;
  const chips = sampleStations.map((c) => `<a class="chip" href="/station/${c}"><span style="font-weight:700;color:#6366F1;font-family:'SF Mono',monospace">${c}</span> ${esc(rail.stationName(c))}</a>`).join('');
  const body = `<div class="page">${topbar({ back: '/operators' })}
<div class="op-head"><span class="op-swatch" style="background:${info.color}"></span><div><h1>${esc(info.name)}</h1><div class="cd">Operator code ${code}</div></div></div>
<div class="note">Live running information for ${esc(info.name)} services appears on every station's departure and arrival boards, colour-coded with this operator's brand. Open a station below to see ${esc(info.name)} trains in real time, then tap any service to track its full route.</div>
<div class="sect">Major stations</div>
<div class="chips">${chips}</div>
${footer()}</div>`;
  return shell({ title: `${esc(info.name)} — Rail Tracker`, desc: `Live ${info.name} train running information across Great Britain.`, head, body });
}

// ── About / 404 / loading fallback ─────────────────────────────────────────
function renderAbout() {
  const head = `
.content{padding:24px 0}.content h1{font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:14px}
.content h2{font-size:1.05rem;font-weight:600;color:#D4D4D8;margin:22px 0 8px}
.content p{color:#A1A1AA;font-size:.92rem;margin-bottom:12px;line-height:1.65}
.content a{color:#6366F1;text-decoration:none}.content a:hover{text-decoration:underline}
.content ul{color:#A1A1AA;font-size:.92rem;padding-left:20px;margin-bottom:12px}.content li{margin-bottom:5px}`;
  const body = `<div class="page">${topbar({ back: '/' })}
<div class="content">
  <h1>About Rail Tracker</h1>
  <p>A fast, mobile-first live train tracker for Great Britain — departures and arrivals for every station, plus full route tracking for individual services.</p>
  <h2>What you can do</h2>
  <ul>
    <li><b>Live boards</b> — real-time departures &amp; arrivals with platforms, delays, cancellations, operator and headcode.</li>
    <li><b>Track any train</b> — tap a service to see every calling point, scheduled vs expected times, and the train's live position on a map.</li>
    <li><b>Stations near you</b> — find the closest stations using your location.</li>
    <li><b>Network map</b> — browse all 2,500+ stations on an interactive map.</li>
    <li><b>Operators</b> — every train operating company, colour-coded across the app.</li>
  </ul>
  <h2>Data</h2>
  <p>Live running information comes from Network Rail's train describer and timetable feeds, surfaced via <a href="https://www.realtimetrains.co.uk/">Realtime Trains</a>. This is the same underlying data that powers station departure boards.</p>
  <p>Rail Tracker is an independent project and is not affiliated with, or endorsed by, National Rail, Network Rail or any train operating company.</p>
  <h2>Source</h2>
  <p>Open source on <a href="https://github.com/TheDesigner56/rail-tracker">GitHub</a>.</p>
</div>
${footer()}</div>`;
  return shell({ title: 'About — Rail Tracker', desc: 'About Rail Tracker — live UK train times, tracking and station information.', head, body });
}

function render404(crs) {
  const head = `.c404{min-height:70vh;display:flex;align-items:center;justify-content:center;text-align:center}
.c404 .big{font-size:3.5rem;font-weight:800;color:#252530}.c404 h1{font-size:1.2rem;color:#fff;margin:8px 0}.c404 p{color:#71717A;font-size:.9rem;margin-bottom:18px}.c404 a{color:#6366F1;text-decoration:none}`;
  const body = `<div class="page">${topbar({ back: '/' })}<div class="c404"><div><div class="big">${esc(crs || '404')}</div><h1>Station not found</h1><p>We don't have a station with that code.</p><a href="/">← All stations</a></div></div></div>`;
  return shell({ title: 'Not found — Rail Tracker', desc: 'Station not found.', head, body });
}

function renderError(title, message) {
  const head = `.c404{min-height:60vh;display:flex;align-items:center;justify-content:center;text-align:center}.c404 h1{font-size:1.2rem;color:#fff;margin:8px 0}.c404 p{color:#71717A;font-size:.9rem;margin-bottom:18px;max-width:340px}.c404 button{background:#6366F1;border:none;color:#fff;padding:9px 18px;border-radius:8px;cursor:pointer}`;
  const body = `<div class="page">${topbar({ back: '/' })}<div class="c404"><div><div style="font-size:2.4rem">🚧</div><h1>${esc(title)}</h1><p>${esc(message)}</p><button onclick="location.reload()">Try again</button></div></div></div>`;
  return shell({ title: `${esc(title)} — Rail Tracker`, desc: message, head, body });
}

module.exports = {
  renderHome, renderStation, renderService, renderMap,
  renderOperators, renderOperator, renderAbout, render404, renderError,
};
