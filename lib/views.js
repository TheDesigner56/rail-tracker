// ── HTML rendering — light "Flighty"-style dashboard ───────────────────────
// Shared shell (nav + search + footer + design system) keeps every page
// consistent. Light theme, card-based, big bold numbers, semantic colours.

const rail = require('./rail');
const STOCK = require('./stock');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MAPTILER_KEY = process.env.MAPTILER_KEY || 'LXODzF55q3o3IO6led2f';
const MAP_STYLE = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#fff;--card:#F2F2F4;--soft:#F5F5F7;--soft2:#FAFAFA;--inset:#fff;--track:#E5E5E9;--line:#E6E6E9;--ink:#16181D;--ink2:#6B7280;--ink3:#9AA0AA;--blue:#2563EB;--green:#16A34A;--amber:#F59E0B;--red:#EF4444}
html{font-size:16px;-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.45;-webkit-font-smoothing:antialiased;min-height:100vh}
a{color:inherit;text-decoration:none}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
/* nav */
.nav{position:sticky;top:0;z-index:500;display:flex;align-items:center;gap:16px;padding:11px 20px;background:rgba(255,255,255,.86);backdrop-filter:saturate(180%) blur(12px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:1.05rem;white-space:nowrap}
.brand .mark{width:30px;height:30px;border-radius:9px;background:var(--ink);color:#fff;display:grid;place-items:center;font-size:.95rem}
.brand .sub{color:var(--ink3);font-weight:600}
.search{flex:1;max-width:520px;margin:0 auto;position:relative}
.search input{width:100%;background:var(--card);border:1px solid transparent;border-radius:999px;padding:9px 16px 9px 38px;font-size:.92rem;color:var(--ink);outline:none}
.search input:focus{background:#fff;border-color:var(--line);box-shadow:0 1px 8px rgba(0,0,0,.06)}
.search input::placeholder{color:var(--ink3)}
.search .ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--ink3)}
.search .kbd{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:.7rem;color:var(--ink3);border:1px solid var(--line);border-radius:6px;padding:1px 6px;background:#fff}
.results{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:14px;display:none;z-index:600;max-height:360px;overflow-y:auto;box-shadow:0 12px 32px rgba(0,0,0,.12);padding:5px}
.results.show{display:block}
.res{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;cursor:pointer}
.res:hover,.res.sel{background:var(--soft)}
.res .code{font-weight:700;font-size:.8rem;color:var(--blue);min-width:34px;font-family:'SF Mono','Menlo',monospace}
.res .arrow{margin-left:auto;color:var(--ink3)}
.no-res{padding:16px;text-align:center;color:var(--ink3);font-size:.9rem}
.tv{display:flex;align-items:center;gap:7px;background:var(--ink);color:#fff;border:none;border-radius:999px;padding:8px 15px;font-size:.85rem;font-weight:600;cursor:pointer;white-space:nowrap}
/* generic */
.card{background:var(--card);border:none;border-radius:18px;padding:22px}
.card.plain{background:#fff;border:1px solid var(--line)}
.inset{background:var(--inset);border-radius:13px}
.seg{display:inline-flex;background:var(--track);border-radius:999px;padding:3px;flex-shrink:0}
.seg span{padding:5px 12px;border-radius:999px;font-size:.78rem;font-weight:600;color:var(--ink2);cursor:pointer;white-space:nowrap;transition:color .12s}
.seg span.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.16)}
.seg span.dis{opacity:.45;cursor:default}
.grid{display:grid;gap:16px}
.g3{grid-template-columns:repeat(3,1fr)}
.g2{grid-template-columns:1fr 1fr}
.g2w{grid-template-columns:1fr 1.25fr}
.sect-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3)}
.muted{color:var(--ink2)}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex-shrink:0}
.oplogo{display:inline-grid;place-items:center;min-width:26px;height:20px;padding:0 5px;border-radius:6px;color:#fff;font-size:.66rem;font-weight:800;font-family:'SF Mono',monospace;letter-spacing:.02em}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:var(--soft);font-size:.82rem;font-weight:600;color:var(--ink)}
.btn{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:10px;background:#fff;border:1px solid var(--line);color:var(--ink);font-size:.85rem;font-weight:600;cursor:pointer}
.btn:hover{background:var(--soft)}
.btn.blue{background:var(--blue);border-color:var(--blue);color:#fff}
.btn.blue:hover{filter:brightness(.95)}
.stacked{display:flex;height:8px;border-radius:5px;overflow:hidden;background:var(--track);margin-top:10px}
.stacked>span{display:block;height:100%}
.green{color:var(--green)}.amber{color:var(--amber)}.red{color:var(--red)}.blue{color:var(--blue)}
.bg-green{background:var(--green)}.bg-amber{background:var(--amber)}.bg-red{background:var(--red)}
.footer{border-top:1px solid var(--line);margin-top:36px;padding:26px 20px 44px;color:var(--ink3);font-size:.8rem;text-align:center}
.footer a{color:var(--ink2)}.footer a:hover{color:var(--ink)}
.footer .fl{display:flex;justify-content:center;flex-wrap:wrap;gap:18px;margin-bottom:9px}
@media(max-width:900px){.g3,.g2,.g2w{grid-template-columns:1fr}}
`;

const SEARCH_JS = `
(function(){var s=document.getElementById('search'),r=document.getElementById('results');if(!s)return;var t,idx=-1,items=[];
 document.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();s.focus()}});
 s.addEventListener('input',function(){clearTimeout(t);var q=s.value.trim();if(!q){r.classList.remove('show');return}
  t=setTimeout(function(){fetch('/api/search?q='+encodeURIComponent(q)).then(x=>x.json()).then(function(d){idx=-1;
   if(d.length){r.innerHTML=d.map(function(x){return '<a href="/station/'+x.code+'" class="res"><span class="code">'+x.code+'</span><span>'+x.name+'</span><span class="arrow">→</span></a>'}).join('');r.classList.add('show');items=r.querySelectorAll('.res')}
   else{r.innerHTML='<div class="no-res">No stations found</div>';r.classList.add('show');items=[]}})},130)});
 s.addEventListener('keydown',function(e){if(!r.classList.contains('show'))return;if(e.key==='ArrowDown'){e.preventDefault();idx=Math.min(idx+1,items.length-1)}else if(e.key==='ArrowUp'){e.preventDefault();idx=Math.max(idx-1,0)}else if(e.key==='Enter'){if(idx>=0&&items[idx]){e.preventDefault();items[idx].click()}return}else return;items.forEach(function(el,i){el.classList.toggle('sel',i===idx)})});
 document.addEventListener('click',function(e){if(!e.target.closest('.search'))r.classList.remove('show')});
})();
function tvMode(){var d=document.documentElement;if(!document.fullscreenElement){(d.requestFullscreen||function(){}).call(d)}else{document.exitFullscreen&&document.exitFullscreen()}}`;

function nav() {
  return `<nav class="nav">
  <a href="/" class="brand"><span class="mark">🚆</span>Rail<span class="sub">Tracker</span></a>
  <div class="search"><span class="ic">🔍</span><input id="search" type="search" placeholder="Search stations…" autocomplete="off" aria-label="Search stations"><span class="kbd">⌘K</span><div class="results" id="results"></div></div>
  <button class="tv" onclick="tvMode()">🖥 TV Mode</button>
</nav>`;
}
function footer() {
  return `<footer class="footer"><div class="fl"><a href="/">Stations</a><a href="/map">Map</a><a href="/operators">Operators</a><a href="/about">About</a><a href="https://github.com/TheDesigner56/rail-tracker">GitHub</a></div>
<p>Live data from National Rail / Network Rail via Realtime Trains. Independent project — not affiliated with any rail operator.</p></footer>`;
}
function shell({ title, desc, head = '', body, script = '', fullHeight = false }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title><meta name="description" content="${esc(desc || '')}"><meta name="theme-color" content="#ffffff">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc || '')}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚆</text></svg>">
<style>${BASE_CSS}${head}</style></head>
<body${fullHeight ? ' style="height:100vh;overflow:hidden"' : ''}>${body}<script>${SEARCH_JS}${script}</script></body></html>`;
}

// shared helpers
const fmtDur = (m) => { m = Math.round(m || 0); if (m <= 0) return '0m'; const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h ${mm}m` : `${mm}m`; };
const opLogo = (code, color) => `<span class="oplogo" style="background:${color || rail.operatorColor(code)}">${esc(code || '??')}</span>`;
function stacked(st) {
  const t = st.total || 1;
  return `<div class="stacked"><span class="bg-green" style="width:${(st.onTime / t) * 100}%"></span><span class="bg-amber" style="width:${(st.delayed / t) * 100}%"></span><span class="bg-red" style="width:${(st.cancelled / t) * 100}%"></span></div>`;
}
function delayChart(tl, label) {
  if (!tl || !tl.buckets.length) return '';
  const scale = Math.max(20, tl.peak);
  const dot = tl.live > 15 ? 'bg-red' : tl.live > 5 ? 'bg-amber' : 'bg-green';
  const bars = tl.buckets.map((b) => {
    const h = Math.max(4, Math.min(100, (b.avg / scale) * 100));
    const col = b.avg > 15 ? 'var(--red)' : b.avg > 5 ? 'var(--amber)' : 'var(--green)';
    return `<div style="flex:1;height:${h}%;background:${col};border-radius:2px;opacity:${b.n ? 1 : 0.2}"></div>`;
  }).join('');
  return `<div style="margin-top:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:.78rem;color:var(--ink2)">${label}</span>
      <span style="font-size:.8rem;font-weight:700"><span class="dot ${dot}"></span> ${tl.live}m</span></div>
    <div style="display:flex;align-items:flex-end;gap:2px;height:56px">${bars}</div>
    <div style="display:flex;justify-content:space-between;font-size:.64rem;color:var(--ink3);margin-top:5px"><span>Now</span><span>+2h</span></div>
  </div>`;
}
function delayCard(title, icon, st, timeline, chartLabel) {
  const cells = [['On time', st.onTimePct, st.onTime, 'bg-green'], ['Delayed', st.delayedPct, st.delayed, 'bg-amber'], ['Canceled', st.cancelPct, st.cancelled, 'bg-red']];
  return `<div class="card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><span style="font-size:1.05rem">${icon}</span><b style="font-size:1rem">${title}</b></div>
    <div style="display:flex;gap:8px">
      ${cells.map(([l, p, n, c]) => `<div style="flex:1"><div style="font-size:.74rem;color:var(--ink2);display:flex;align-items:center;gap:5px"><span class="dot ${c}"></span>${l}</div><div style="font-size:1.7rem;font-weight:800;line-height:1.1;margin-top:3px">${p}%</div><div style="font-size:.78rem;color:var(--ink3)">${n}</div></div>`).join('')}
    </div>${stacked(st)}${delayChart(timeline, chartLabel)}</div>`;
}
function barList(items, max) {
  const m = max || Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => `<div style="display:flex;align-items:center;gap:10px;margin:9px 0">
    <div style="min-width:84px"><div style="font-weight:700;font-size:.82rem">${esc(i.code || i.label)}</div>${i.sub ? `<div style="font-size:.7rem;color:var(--ink3)">${esc(i.sub)}</div>` : ''}</div>
    <div style="flex:1;height:9px;border-radius:5px;background:var(--track);overflow:hidden"><span style="display:block;height:100%;width:${(i.value / m) * 100}%;background:${i.color || 'var(--red)'};border-radius:5px"></span></div>
    <div style="min-width:24px;text-align:right;font-weight:700;font-size:.85rem">${i.value}</div></div>`).join('');
}

// ── Boards: a single Flighty-style flight row ──────────────────────────────
function boardRow(s, arr) {
  const changed = s.expected && s.scheduled && s.expected !== s.scheduled;
  const timeCls = s.cancelled ? 'red' : s.delay > 5 ? 'red' : s.delay > 0 ? 'amber' : 'green';
  let status;
  if (s.cancelled) status = '<span class="red">Cancelled</span>';
  else if (s.delay > 0) status = `<span class="${s.delay > 5 ? 'red' : 'amber'}">${fmtDur(s.delay)} late</span>`;
  else status = '<span class="green">On time</span>';
  return `<a class="frow" href="/service/${s.id}">
    <div class="f-time">${changed ? `<span class="f-sched">${esc(s.scheduled)}</span>` : ''}<span class="f-new ${timeCls}">${esc(s.expected || s.scheduled)}</span></div>
    <div class="f-place"><div class="f-dest">${esc(s.place)}</div><div class="f-status">${status}</div></div>
    <div class="f-meta">${opLogo(s.operatorCode, s.color)}<span class="f-num">${esc(s.headcode || '')}</span>${s.platform ? `<span class="f-plat">Plat ${esc(s.platform)}</span>` : ''}</div>
  </a>`;
}
const BOARD_CSS = `
.frow{display:flex;align-items:center;gap:14px;padding:13px 6px;border-bottom:1px solid var(--line)}
.frow:last-child{border-bottom:none}.frow:hover{background:var(--soft2)}
.f-time{min-width:74px;display:flex;flex-direction:column}
.f-sched{font-size:.78rem;color:var(--ink3);text-decoration:line-through}
.f-new{font-size:1.05rem;font-weight:700}
.f-place{flex:1;min-width:0}.f-dest{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f-status{font-size:.8rem;font-weight:600;margin-top:1px}
.f-meta{display:flex;align-items:center;gap:8px;flex-shrink:0}
.f-num{font-size:.82rem;color:var(--ink2);font-family:'SF Mono',monospace}
.f-plat{font-size:.74rem;color:var(--ink2);background:var(--soft);padding:2px 7px;border-radius:6px;font-weight:600}
@media(max-width:560px){.f-num{display:none}}`;

// ── Landing: Major Stations & Disruptions ──────────────────────────────────
function renderDisruptions() {
  const head = `
.land{position:relative}
#map{height:58vh;min-height:440px;width:100%;background:#e9eef0;position:relative;z-index:1}
.maplibregl-canvas{outline:none}
.land-nav{position:absolute;top:0;left:0;right:0;z-index:20;display:flex;align-items:center;gap:16px;padding:14px 22px;pointer-events:none}
.land-nav>*{pointer-events:auto}
.land-nav .brand .sub{color:#5b6270}
.land-search{flex:1;max-width:480px;margin:0 auto}
.land-search input{background:#fff;border:none;box-shadow:0 6px 20px rgba(0,0,0,.18)}
.panel{position:relative;z-index:5;background:#fff;border-radius:26px 26px 0 0;margin-top:-40px;padding:34px 0 8px;box-shadow:0 -10px 30px rgba(0,0,0,.07)}
.panel-inner{max-width:1180px;margin:0 auto;padding:0 22px}
.panel h1{font-size:1.7rem;font-weight:800;letter-spacing:-.02em}
.panel-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.region{font-size:1rem;font-weight:700;color:var(--ink2);margin-top:2px}
.darkbtn{display:inline-flex;align-items:center;gap:7px;background:var(--ink);color:#fff;border-radius:10px;padding:9px 14px;font-size:.85rem;font-weight:600}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);font-weight:700;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:13px 12px;border-bottom:1px solid var(--line);font-size:.9rem;vertical-align:middle}
tr:hover td{background:var(--soft2)}
.d-code{display:flex;align-items:center;gap:9px;font-weight:800}
.d-metric{display:flex;align-items:center;gap:11px}
.d-metric .big{font-weight:700;min-width:46px}
.d-metric .sub{display:flex;align-items:center;gap:5px;color:var(--ink2);font-size:.82rem}
.bdg{display:inline-grid;place-items:center;width:17px;height:17px;border-radius:50%;font-size:.6rem;background:var(--track);color:var(--ink2)}
.d-alerts{color:var(--red);font-weight:600;font-size:.82rem}
.loading{padding:50px;text-align:center;color:var(--ink3)}
.maplibregl-popup{max-width:260px!important}
.maplibregl-popup-content{border-radius:13px;box-shadow:0 8px 26px rgba(0,0,0,.22);padding:11px 13px;font-family:inherit;font-size:.8rem;color:var(--ink)}
.maplibregl-popup-anchor-bottom .maplibregl-popup-tip{border-top-color:#fff}.maplibregl-popup-anchor-top .maplibregl-popup-tip{border-bottom-color:#fff}
.poc .sc-h{display:flex;align-items:center;gap:7px;font-weight:700;margin-bottom:7px;font-size:.86rem}
.poc .sc-h .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.poc .sc-row{display:flex;justify-content:space-between;gap:12px;margin:3px 0}.poc .sc-row .muted{color:var(--ink2)}
.poc .sc-alert{color:var(--red);font-weight:600;margin-top:6px;font-size:.76rem}
.poc .sc-go{color:var(--blue);font-weight:600;margin-top:6px;font-size:.76rem}
@media(max-width:760px){th.opt,td.opt{display:none}.panel{border-radius:18px 18px 0 0}.land-nav .brand{display:none}}`;
  const body = `<div class="land">
  <div id="map"></div>
  <header class="land-nav">
    <a href="/" class="brand"><span class="mark">🚆</span>Rail<span class="sub">Tracker</span></a>
    <div class="search land-search"><span class="ic">🔍</span><input id="search" type="search" placeholder="Search stations…" autocomplete="off" aria-label="Search stations"><span class="kbd">⌘K</span><div class="results" id="results"></div></div>
    <button class="tv" onclick="tvMode()">🖥 TV Mode</button>
  </header>
  <div class="panel"><div class="panel-inner">
    <div class="panel-top">
      <div><h1>Major Stations &amp; Disruptions</h1><div class="region">Great Britain ▾</div></div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="seg"><span class="on">● Live</span><span class="dis">Today</span></div>
        <a class="darkbtn" href="/map">🗺 Full map</a>
      </div>
    </div>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Station</th><th class="opt">City</th><th>🕐 Departure delays</th><th class="opt">🕐 Arrival delays</th><th>⚠ Alerts</th></tr></thead>
      <tbody id="rows"><tr><td colspan="5" class="loading">Loading live disruptions…</td></tr></tbody>
    </table></div>
  </div></div>
  ${footer()}
</div>`;
  const script = `
var lk=document.createElement('link');lk.rel='stylesheet';lk.href='${MAPLIBRE_CSS}';document.head.appendChild(lk);
var sc=document.createElement('script');sc.src='${MAPLIBRE_JS}';sc.onload=load;document.body.appendChild(sc);
function fmt(m){return m>=60?(Math.floor(m/60)+'h '+(m%60)+'m'):m+'m'}
function metric(m){return '<div class="d-metric"><span class="big">'+fmt(m.avgDelay)+'</span><span class="sub"><span class="bdg">✓</span>'+m.onTimePct+'%</span><span class="sub"><span class="bdg">✕</span>'+m.cancelPct+'%</span></div>'}
function majCard(p){return '<div class="poc"><div class="sc-h"><span class="dot" style="background:'+p.color+'"></span><b>'+p.code+'</b> '+p.name+'</div><div class="sc-row"><span>🚆 Departures</span><span><b>'+fmt(+p.depAvg)+'</b> <span class="muted">'+p.depOt+'% on time</span></span></div><div class="sc-row"><span>🚉 Arrivals</span><span><b>'+fmt(+p.arrAvg)+'</b> <span class="muted">'+p.arrOt+'% on time</span></span></div>'+(p.alerts?'<div class="sc-alert">⚠ '+p.alerts+'</div>':'<div class="sc-go">View live board →</div>')+'</div>'}
function secCard(p){return '<div class="poc"><div class="sc-h" style="margin-bottom:3px"><b>'+p.code+'</b> '+p.name+'</div><div class="sc-go">View live times →</div></div>'}
function load(){
 var map=new maplibregl.Map({container:'map',style:'${MAP_STYLE}',center:[-2.6,54.3],zoom:5.1,attributionControl:false,cooperativeGestures:true});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
 map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
 var popup=new maplibregl.Popup({closeButton:false,closeOnClick:false,offset:14});
 Promise.all([fetch('/api/disruptions').then(function(r){return r.json()}),fetch('/api/locations').then(function(r){return r.json()})]).then(function(res){
  var majors=res[0]||[],all=res[1]||[],majorCodes={};majors.forEach(function(s){majorCodes[s.code]=1});
  document.getElementById('rows').innerHTML=majors.map(function(s){return '<tr onclick="location.href=\\'/station/'+s.code+'\\'" style="cursor:pointer">'+
   '<td><span class="d-code"><span style="width:9px;height:9px;border-radius:50%;background:'+s.color+'"></span>'+s.code+'</span></td>'+
   '<td class="opt muted">'+(s.city||'')+'</td><td>'+metric(s.dep)+'</td><td class="opt">'+metric(s.arr)+'</td>'+
   '<td class="d-alerts">'+(s.alerts&&s.alerts.length?s.alerts.join(' • '):'<span class="muted" style="font-weight:400">No alerts</span>')+'</td></tr>'}).join('');
  var majFC={type:'FeatureCollection',features:majors.filter(function(s){return s.lat!=null}).map(function(s){return {type:'Feature',geometry:{type:'Point',coordinates:[s.lon,s.lat]},properties:{code:s.code,name:s.name,color:s.color,depAvg:s.dep.avgDelay,depOt:s.dep.onTimePct,arrAvg:s.arr.avgDelay,arrOt:s.arr.onTimePct,alerts:(s.alerts||[]).join(' • '),sev:s.status==='major'?0:s.status==='minor'?1:2}}})};
  var secFC={type:'FeatureCollection',features:all.filter(function(s){return !majorCodes[s.code]}).map(function(s){return {type:'Feature',geometry:{type:'Point',coordinates:[s.lon,s.lat]},properties:{code:s.code,name:s.name}}})};
  function build(){
   map.addSource('sec',{type:'geojson',data:secFC});map.addSource('maj',{type:'geojson',data:majFC});
   map.addLayer({id:'sec-c',type:'circle',source:'sec',minzoom:7.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],8,2.5,12,5],'circle-color':'#5B6472','circle-stroke-color':'#fff','circle-stroke-width':1.2,'circle-opacity':0.96}});
   map.addLayer({id:'sec-l',type:'symbol',source:'sec',minzoom:10.5,layout:{'text-field':['get','code'],'text-font':['Noto Sans Bold'],'text-size':11,'text-offset':[0,0.9],'text-anchor':'top'},paint:{'text-color':'#3a4150','text-halo-color':'#fff','text-halo-width':1.4}});
   map.addLayer({id:'maj-halo',type:'circle',source:'maj',paint:{'circle-radius':16,'circle-color':['get','color'],'circle-opacity':0.16}});
   map.addLayer({id:'maj-c',type:'circle',source:'maj',paint:{'circle-radius':7,'circle-color':['get','color'],'circle-stroke-color':'#fff','circle-stroke-width':2.5}});
   map.addLayer({id:'maj-l',type:'symbol',source:'maj',layout:{'text-field':['get','code'],'text-font':['Noto Sans Bold'],'text-size':12.5,'text-offset':[0,1.1],'text-anchor':'top','symbol-sort-key':['get','sev']},paint:{'text-color':'#16181d','text-halo-color':'#fff','text-halo-width':1.6}});
   ['maj-c','sec-c'].forEach(function(layer){
    map.on('mouseenter',layer,function(e){map.getCanvas().style.cursor='pointer';var f=e.features[0];popup.setLngLat(f.geometry.coordinates).setHTML(layer==='maj-c'?majCard(f.properties):secCard(f.properties)).addTo(map)});
    map.on('mouseleave',layer,function(){map.getCanvas().style.cursor='';popup.remove()});
    map.on('click',layer,function(e){location.href='/station/'+e.features[0].properties.code});
   });
   var b=new maplibregl.LngLatBounds();majFC.features.forEach(function(f){b.extend(f.geometry.coordinates)});if(majFC.features.length)map.fitBounds(b,{padding:64,maxZoom:8.5,duration:0});
   var t0=performance.now();(function pulse(t){if(map.getLayer('maj-halo')){var k=(Math.sin((t-t0)/700)+1)/2;map.setPaintProperty('maj-halo','circle-radius',14+k*9);map.setPaintProperty('maj-halo','circle-opacity',0.22-k*0.12)}requestAnimationFrame(pulse)})(t0);
  }
  if(map.isStyleLoaded())build();else map.once('load',build);
 }).catch(function(){document.getElementById('rows').innerHTML='<tr><td colspan="5" class="loading">Couldn\\'t load live data. Please refresh.</td></tr>'});
}`;
  return shell({ title: 'Rail Tracker — Live UK Train Times, Delays & Disruptions', desc: 'Live departures, arrivals, delays and disruptions for every railway station in Great Britain, on an interactive map.', head, body, script });
}

// ── Station Overview dashboard ─────────────────────────────────────────────
function renderOverview(o) {
  const st = o.status;
  const statusLabel = st.level === 'major' ? 'Major Disruption' : st.level === 'minor' ? 'Minor Disruption' : 'Normal Operations';
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  const tz = new Date().toLocaleTimeString('en-GB', { timeZoneName: 'short', timeZone: 'Europe/London' }).split(' ').pop();

  const routes = o.disruptedRoutes.length ? o.disruptedRoutes : o.busiestRoutes;
  const ops = o.disruptedOperators.length ? o.disruptedOperators : o.busiestOperators;

  // Departures / Arrivals / Totals data for the Daily Performance toggle.
  const D = o.depStats, A = o.arrStats;
  const T = { total: D.total + A.total, onTime: D.onTime + A.onTime, delayed: D.delayed + A.delayed, cancelled: D.cancelled + A.cancelled };
  T.onTimePct = T.total ? Math.round((T.onTime / T.total) * 100) : 100;
  T.delayedPct = T.total ? Math.round((T.delayed / T.total) * 100) : 0;
  T.cancelPct = T.total ? Math.round((T.cancelled / T.total) * 100) : 0;
  const pickStat = (s) => ({ total: s.total, onTime: s.onTime, onTimePct: s.onTimePct, delayed: s.delayed, delayedPct: s.delayedPct, cancelled: s.cancelled, cancelPct: s.cancelPct });
  const perfData = JSON.stringify({ dep: pickStat(D), arr: pickStat(A), tot: pickStat(T) });

  const weatherCard = o.weather ? `<div class="card" id="wx">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><b style="font-size:1rem">🌡 Current Weather</b>
      <span class="seg"><span data-u="i">Imperial</span><span data-u="m" class="on">Metric</span></span></div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div><div id="wx-temp" style="font-size:2.8rem;font-weight:800;line-height:1" data-c="${o.weather.tempC}">${o.weather.tempC}°C</div>
        <div class="muted" style="margin-top:2px">${esc(o.weather.desc)}</div></div>
      <div style="font-size:3rem">${o.weather.icon}</div></div>
    <div style="display:flex;gap:10px;margin-top:18px">
      <div class="inset" style="flex:1;padding:11px"><div style="font-size:.72rem;color:var(--ink2)">💨 Wind</div><div id="wx-wind" style="font-size:1.15rem;font-weight:700" data-k="${o.weather.windKmh}">${o.weather.windKmh} km/h</div></div>
      <div class="inset" style="flex:1;padding:11px"><div style="font-size:.72rem;color:var(--ink2)">🌬 Gusts</div><div id="wx-gust" style="font-size:1.15rem;font-weight:700" data-k="${o.weather.gustKmh}">${o.weather.gustKmh} km/h</div></div>
    </div></div>`
    : `<div class="card"><b style="font-size:1rem">📍 Station Info</b>
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;justify-content:space-between"><span class="muted">Local time</span><b>${time} ${tz}</b></div>
        <div style="display:flex;justify-content:space-between"><span class="muted">Operators today</span><b>${o.operatorsServed}</b></div>
        <div style="display:flex;justify-content:space-between"><span class="muted">Destinations today</span><b>${o.destinationsServed}</b></div>
        ${o.loc ? `<div style="display:flex;justify-content:space-between"><span class="muted">Location</span><b>${o.loc.lat.toFixed(3)}, ${o.loc.lon.toFixed(3)}</b></div>` : ''}
      </div></div>`;

  const head = `${BOARD_CSS}
.hero{padding:26px 0 14px;display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap}
.hero .code{font-size:clamp(2.4rem,7vw,3.4rem);font-weight:800;letter-spacing:-.03em;line-height:.95}
.hero .nm{font-size:1.15rem;font-weight:700}
.hero .meta{color:var(--ink2);font-size:.92rem;margin-top:3px}
.tabs{display:flex;gap:22px;border-bottom:1px solid var(--line);margin-bottom:20px}
.tabs a{padding:11px 0;font-weight:600;color:var(--ink3);border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs a.on{color:var(--ink);border-color:var(--ink)}
.acts{display:flex;gap:9px;flex-wrap:wrap;margin-left:auto}
.status-card{border-radius:18px;padding:20px;border:1px solid}
.status-card .hd{display:flex;align-items:center;gap:9px;font-size:1.1rem;font-weight:800}
.status-card .ln{display:flex;gap:9px;margin-top:14px}.status-card .ln b{display:block;font-size:.92rem}.status-card .ln .d{color:var(--ink2);font-size:.84rem}
.big-num{font-size:2.4rem;font-weight:800;line-height:1}
.kv{display:flex;align-items:center;justify-content:space-between;margin:7px 0;font-size:.9rem}
.kv .lab{display:flex;align-items:center;gap:7px;color:var(--ink2)}
.view-all{color:var(--blue);font-weight:600;font-size:.85rem}`;

  const statusTint = st.level === 'major' ? '#FEF2F2' : st.level === 'minor' ? '#FFFBEB' : '#F0FDF4';
  const statusBorder = st.level === 'major' ? '#FECACA' : st.level === 'minor' ? '#FDE68A' : '#BBF7D0';

  const body = `${nav()}<div class="wrap">
<div class="hero">
  <div class="code">${o.crs}</div>
  <div><div class="nm">${esc(o.name)}</div><div class="meta">${esc(o.city)}, United Kingdom · ${time} ${tz}${o.weather ? ` · ${o.weather.icon} ${o.weather.tempC}°C` : ''}</div></div>
</div>
<div class="tabs"><a href="/station/${o.crs}" class="on">Overview</a><a href="/station/${o.crs}/departures">Departures</a><a href="/station/${o.crs}/arrivals">Arrivals</a>
  <span class="acts"><button class="btn" onclick="this.textContent='🔔 Coming soon'" title="Email alerts coming soon">🔔 Email Alerts</button><button class="btn blue" onclick="navigator.share?navigator.share({title:'${esc(o.name)}',url:location.href}):navigator.clipboard.writeText(location.href)">⤴ Share</button></span></div>

<div class="grid g3" style="margin-bottom:16px">
  <div class="status-card" style="background:${statusTint};border-color:${statusBorder}">
    <div class="hd"><span class="dot" style="background:${st.color}"></span>${statusLabel}</div>
    <div class="ln"><span>🚆</span><span><b>Arrivals &amp; Departures</b><span class="d">${st.alerts.length ? st.alerts.join(' · ') : 'No operational issues reported.'}</span></span></div>
    <div class="ln"><span>${o.weather ? o.weather.icon : '🌤'}</span><span><b>Weather</b><span class="d">${o.weather ? esc(o.weather.desc) + ', ' + o.weather.tempC + '°C' : 'Conditions unavailable.'}</span></span></div>
    <a href="/station/${o.crs}/departures" style="display:inline-block;margin-top:16px;font-weight:600;font-size:.85rem;color:${st.color}">View full board →</a>
  </div>
  ${delayCard('Departures', '🚆', o.depStats, o.depTimeline, 'Live departure delay')}
  ${delayCard('Arrivals', '🚉', o.arrStats, o.arrTimeline, 'Live arrival delay')}
</div>

<div class="grid g2w" style="margin-bottom:16px">
  ${weatherCard}
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px"><span>📊</span><b style="font-size:1rem">Daily Performance</b></div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="seg" id="perfseg"><span data-m="dep" class="on">Departures</span><span data-m="arr">Arrivals</span><span data-m="tot">Totals</span></span><span class="pill" style="background:#fff;border:1px solid var(--line);font-size:.76rem;padding:6px 11px">Today ▾</span></div>
    </div>
    <div style="display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap">
      <div><div class="big-num" id="pf-total">${D.total}</div><div class="muted" id="pf-lab" style="font-size:.82rem">Departures</div></div>
      <div style="flex:1;min-width:160px">
        <div class="kv"><span class="lab"><span class="dot bg-green"></span>On time</span><span><b id="pf-ot">${D.onTimePct}%</b> <span class="muted" id="pf-otn">${D.onTime}</span></span></div>
        <div class="kv"><span class="lab"><span class="dot bg-amber"></span>Delayed</span><span><b id="pf-dl">${D.delayedPct}%</b> <span class="muted" id="pf-dln">${D.delayed}</span></span></div>
        <div class="kv"><span class="lab"><span class="dot bg-red"></span>Canceled</span><span><b id="pf-cx">${D.cancelPct}%</b> <span class="muted" id="pf-cxn">${D.cancelled}</span></span></div>
      </div>
    </div><div id="pf-bar">${stacked(D)}</div>
    <div class="grid g2" style="margin-top:18px;gap:22px">
      <div><div class="sect-title" style="margin-bottom:6px">Most ${o.disruptedRoutes.length ? 'disrupted' : 'busy'} routes</div>
        ${barList(routes.map((r) => ({ code: r.label, value: o.disruptedRoutes.length ? r.disrupted : r.total, color: 'var(--red)' })))}</div>
      <div><div class="sect-title" style="margin-bottom:6px">Most ${o.disruptedOperators.length ? 'disrupted' : 'busy'} operators</div>
        ${barList(ops.map((r) => ({ code: r.key, sub: r.label, value: o.disruptedOperators.length ? r.disrupted : r.total, color: r.color })))}</div>
    </div>
  </div>
</div>

<div class="grid g2" style="margin-bottom:16px">
  <div class="card plain"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:1.05rem">Departures Board</b><a class="view-all" href="/station/${o.crs}/departures">View all →</a></div>
    ${o.dep.services.slice(0, 7).map((s) => boardRow(s, false)).join('') || '<div class="muted" style="padding:18px 0">No departures.</div>'}</div>
  <div class="card plain"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:1.05rem">Arrivals Board</b><a class="view-all" href="/station/${o.crs}/arrivals">View all →</a></div>
    ${o.arr.services.slice(0, 7).map((s) => boardRow(s, true)).join('') || '<div class="muted" style="padding:18px 0">No arrivals.</div>'}</div>
</div>

<div class="grid g2">
  <div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px"><span>🧭</span><b style="font-size:1rem">Station Stats</b></div><span class="seg"><span class="on">Today</span><span class="dis">Next 7 Days</span></span></div>
    <div style="display:flex;gap:22px;align-items:flex-end;margin-bottom:6px"><div><div class="big-num">${o.depStats.total}</div><div class="muted" style="font-size:.82rem">Departures</div></div>
      <div style="font-size:.9rem"><div><b>${o.operatorsServed}</b> <span class="muted">operators</span></div><div><b>${o.destinationsServed}</b> <span class="muted">destinations</span></div></div></div>
    <div class="sect-title" style="margin:14px 0 4px">Busiest routes</div>
    ${o.busiestRoutes.slice(0, 5).map((r) => `<div class="kv"><span>${esc(r.label)}</span><span class="muted">${r.total} trains</span></div>`).join('')}
  </div>
  <div class="card plain" style="display:flex;flex-direction:column;justify-content:center;align-items:flex-start">
    <b style="font-size:1.3rem">Track any train</b>
    <p class="muted" style="margin:8px 0 16px;font-size:.92rem">Tap any service on a board to see its full route, live position on the map, and every calling point.</p>
    <a class="btn blue" href="/station/${o.crs}/departures">View departures →</a>
  </div>
</div>
${footer()}</div>`;

  const script = `(function(){var tg=document.querySelectorAll('#wx .seg span');if(tg.length){
    function conv(u){var t=document.getElementById('wx-temp'),w=document.getElementById('wx-wind'),g=document.getElementById('wx-gust');
     var c=+t.dataset.c,wk=+w.dataset.k,gk=+g.dataset.k;
     if(u==='i'){t.textContent=Math.round(c*9/5+32)+'°F';w.textContent=Math.round(wk*0.621)+' mph';g.textContent=Math.round(gk*0.621)+' mph'}
     else{t.textContent=c+'°C';w.textContent=wk+' km/h';g.textContent=gk+' km/h'}
     tg.forEach(function(x){x.classList.toggle('on',x.dataset.u===u)})}
    tg.forEach(function(x){x.addEventListener('click',function(){conv(x.dataset.u)})})}})();
   (function(){var seg=document.getElementById('perfseg');if(!seg)return;var P=${perfData},LBL={dep:'Departures',arr:'Arrivals',tot:'Total movements'};
    function set(m){var s=P[m],t=s.total||1,$=function(i){return document.getElementById(i)};
     $('pf-total').textContent=s.total;$('pf-lab').textContent=LBL[m];
     $('pf-ot').textContent=s.onTimePct+'%';$('pf-otn').textContent=s.onTime;
     $('pf-dl').textContent=s.delayedPct+'%';$('pf-dln').textContent=s.delayed;
     $('pf-cx').textContent=s.cancelPct+'%';$('pf-cxn').textContent=s.cancelled;
     $('pf-bar').innerHTML='<div class="stacked"><span class="bg-green" style="width:'+(s.onTime/t*100)+'%"></span><span class="bg-amber" style="width:'+(s.delayed/t*100)+'%"></span><span class="bg-red" style="width:'+(s.cancelled/t*100)+'%"></span></div>';
     seg.querySelectorAll('span').forEach(function(x){x.classList.toggle('on',x.dataset.m===m)})}
    seg.querySelectorAll('span').forEach(function(x){x.addEventListener('click',function(){set(x.dataset.m)})})})();
   setTimeout(function(){location.reload()},90000);`;

  return shell({
    title: `${o.crs} · ${esc(o.name)} — Live Departures, Arrivals & Delays`,
    desc: `Live performance for ${o.name} (${o.crs}): on-time departures and arrivals, delays, cancellations, disrupted routes and operators. Updated continuously.`,
    head, body, script,
  });
}

// ── Full board page (departures / arrivals) ────────────────────────────────
function renderBoard(board) {
  const { crs, name, mode, services } = board;
  const arr = mode === 'arrivals';
  const st = rail.summarizeBoard(board);
  const head = `${BOARD_CSS}
.hero{padding:22px 0 12px}.hero .code{font-size:clamp(2rem,6vw,3rem);font-weight:800;letter-spacing:-.03em;line-height:1}
.hero .nm{font-size:1.05rem;color:var(--ink2)}
.tabs{display:flex;gap:22px;border-bottom:1px solid var(--line);margin-bottom:14px}
.tabs a{padding:11px 0;font-weight:600;color:var(--ink3);border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs a.on{color:var(--ink);border-color:var(--ink)}
.summary{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px;font-size:.86rem;color:var(--ink2)}
.summary b{color:var(--ink)}
.colhead{display:flex;gap:14px;padding:0 6px 8px;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);font-weight:700;border-bottom:1px solid var(--line)}
.colhead .f-time{min-width:74px}.colhead .f-place{flex:1}`;
  const body = `${nav()}<div class="wrap">
<div class="hero"><div class="code">${crs}</div><div class="nm">${esc(name)}</div></div>
<div class="tabs"><a href="/station/${crs}">Overview</a><a href="/station/${crs}/departures" class="${arr ? '' : 'on'}">Departures</a><a href="/station/${crs}/arrivals" class="${arr ? 'on' : ''}">Arrivals</a></div>
<div class="summary"><span><b>${st.total}</b> ${arr ? 'arrivals' : 'departures'}</span><span class="green"><b>${st.onTimePct}%</b> on time</span><span class="amber"><b>${st.delayed}</b> delayed</span><span class="red"><b>${st.cancelled}</b> cancelled</span></div>
<div class="card plain" style="padding:8px 14px">
  <div class="colhead"><span class="f-time">${arr ? 'Arr' : 'Dep'}</span><span class="f-place">${arr ? 'From' : 'Destination'}</span><span>Service</span></div>
  ${services.map((s) => boardRow(s, arr)).join('') || '<div class="muted" style="padding:30px;text-align:center">No services in the next couple of hours.</div>'}
</div>${footer()}</div>`;
  const script = `setTimeout(function(){location.reload()},60000);`;
  return shell({ title: `${crs} · ${esc(name)} — Live ${arr ? 'Arrivals' : 'Departures'}`, desc: `Live ${arr ? 'arrivals' : 'departures'} for ${name} (${crs}) with platforms, operators and delays.`, head, body, script });
}

// ── Service trip page (light) ──────────────────────────────────────────────
function renderService(svc) {
  const stopRows = svc.stops.map((r) => {
    const dotCls = r.state === 'current' ? 'cur' : r.state === 'past' ? 'past' : 'fut';
    const arrLate = r.realArr && r.schedArr && r.realArr !== r.schedArr;
    const depLate = r.realDep && r.schedDep && r.realDep !== r.schedDep;
    const dl = r.delay > 5 ? `<span class="red">+${r.delay}m</span>` : r.delay > 0 ? `<span class="amber">+${r.delay}m</span>` : '';
    return `<div class="stop ${dotCls}" data-name="${esc(r.name)}"><div class="sdot"></div>
      <div style="flex:1;min-width:0"><div class="sname">${r.code ? `<a href="/station/${r.code}">${esc(r.name)}</a>` : esc(r.name)} ${dl}</div>
      <div class="stimes">${r.schedArr ? `<span>arr <b class="${arrLate ? 'amber' : 'green'}">${esc(r.realArr || r.schedArr)}</b>${arrLate ? ` <s>${esc(r.schedArr)}</s>` : ''}</span>` : ''}${r.schedDep ? `<span>dep <b class="${depLate ? 'amber' : 'green'}">${esc(r.realDep || r.schedDep)}</b>${depLate ? ` <s>${esc(r.schedDep)}</s>` : ''}</span>` : ''}</div></div>
      ${r.platform ? `<span class="f-plat">Plat ${esc(r.platform)}</span>` : ''}</div>`;
  }).join('');
  const statusCls = /cancel/i.test(svc.status) ? 'red' : svc.currentDelay > 5 ? 'red' : svc.currentDelay > 0 ? 'amber' : 'green';
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const tr = svc.train || {};
  const facts = [];
  if (tr.trainClass) facts.push(`Class <b>${esc(tr.trainClass)}</b>`);
  if (tr.cars) facts.push(`<b>${esc(tr.cars)}</b> coaches`);
  if (tr.formation) facts.push(`Unit <b>${esc(tr.formation)}</b>`);
  if (tr.power) facts.push(`<b>${esc(cap(tr.power))}</b>`);
  if (tr.maxSpeed) facts.push(`<b>${esc(tr.maxSpeed)} mph</b>`);
  if (tr.seating) facts.push(esc(tr.seating));
  if (tr.reservations) facts.push(esc(cap(tr.reservations)));
  if (svc.headcode) facts.push(`Headcode <b>${esc(svc.headcode)}</b>`);
  svc.tags.forEach((t) => facts.push(esc(t)));

  const plan = STOCK.layout(tr.trainClass, tr.cars, (svc.tags && svc.tags[0]) || '');
  const formationHtml = plan.coaches.length ? `
<div class="sect-title" style="margin:20px 0 10px">Formation${plan.name ? ` · <span style="color:var(--ink2);font-weight:600">${esc(plan.name)}</span>` : ''}</div>
<div class="formation">${plan.coaches.map((c, i) => `<div class="coach${c.first ? ' first' : ''}"><span class="c-no">${i + 1}</span><span class="c-cls">${c.first ? '1st' : 'Std'}</span><span class="c-ic">${[c.access ? '♿' : '', c.bike ? '🚲' : '', c.lug ? '🧳' : '', c.cater ? '🍴' : ''].join('')}</span></div>`).join('')}</div>
<div class="f-legend">${plan.amenities.map((a) => `<span>${STOCK.amenityIcon(a)} ${esc(a)}</span>`).join('')}</div>
<p class="f-note">Representative layout for this train type — coach order &amp; facilities can vary by service and direction.</p>` : '';

  const head = `
.svc-hero{padding:22px 0 10px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.svc-hero-main{min-width:0;flex:1}
.svc-route{font-size:1.5rem;font-weight:800;letter-spacing:-.02em}
.svc-route .to{color:var(--ink3);margin:0 7px}
.svc-sub{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:9px}
.svc-status{padding:4px 11px;border-radius:999px;font-weight:700;font-size:.82rem;background:var(--soft)}
.svc-actions{display:flex;gap:9px;flex-wrap:wrap;flex-shrink:0}
.alert-panel{display:none;margin-top:12px;background:var(--card);border-radius:14px;padding:16px}
.alert-panel.show{display:block}
.ap-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap}
.ap-row label{font-size:.88rem;font-weight:600}
.alert-panel select{background:#fff;border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:.85rem;color:var(--ink);min-width:170px}
.ap-actions{display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap}
.ap-note{font-size:.76rem;color:var(--ink3);margin-top:10px;line-height:1.5}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:var(--ink);color:#fff;padding:10px 18px;border-radius:10px;font-size:.85rem;opacity:0;transition:.25s;z-index:9999;pointer-events:none;max-width:90vw;text-align:center}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#map{height:320px;border-radius:18px;overflow:hidden;border:1px solid var(--line);margin:6px 0 16px;background:#e9eef0}
.maplibregl-canvas{outline:none}
.trainmk{position:relative;width:28px;height:28px;display:grid;place-items:center}
.tm-pulse{position:absolute;left:50%;top:50%;width:24px;height:24px;border-radius:50%;background:var(--c);transform:translate(-50%,-50%);opacity:.5;animation:tmpulse 1.6s ease-out infinite}
.tm-dot{position:relative;z-index:2;width:24px;height:24px;border-radius:50%;background:var(--c);border:2.5px solid #fff;display:grid;place-items:center;font-size:12px;box-shadow:0 2px 7px rgba(0,0,0,.45)}
@keyframes tmpulse{0%{opacity:.5;width:22px;height:22px}100%{opacity:0;width:56px;height:56px}}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
.fact{background:var(--soft);border-radius:9px;padding:6px 11px;font-size:.8rem;color:var(--ink2)}.fact b{color:var(--ink)}
.formation{display:flex;gap:5px;overflow-x:auto;padding:4px 0 6px}
.coach{flex:1 0 52px;min-width:52px;height:56px;border:1.5px solid var(--line);border-radius:7px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.coach.first{background:#FBF6E7;border-color:#E7D7A4}
.coach:first-child{border-top-left-radius:20px;border-bottom-left-radius:20px}
.coach:last-child{border-top-right-radius:20px;border-bottom-right-radius:20px}
.c-no{font-size:.62rem;color:var(--ink3);font-weight:700}
.c-cls{font-size:.6rem;color:var(--ink2);font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.coach.first .c-cls{color:#9A7B1F}
.c-ic{font-size:.8rem;line-height:1;min-height:13px}
.f-legend{display:flex;flex-wrap:wrap;gap:7px 14px;margin-top:6px;font-size:.78rem;color:var(--ink2)}
.f-note{font-size:.73rem;color:var(--ink3);margin-top:8px;margin-bottom:18px}
.timeline{position:relative;padding-left:4px}
.stop{position:relative;display:flex;align-items:flex-start;gap:13px;padding:10px 0 10px 24px}
.stop::before{content:'';position:absolute;left:6px;top:0;bottom:0;width:2px;background:var(--line)}
.stop:first-child::before{top:16px}.stop:last-child::before{bottom:calc(100% - 16px)}
.sdot{position:absolute;left:0;top:13px;width:13px;height:13px;border-radius:50%;background:#fff;border:2px solid var(--ink3);z-index:1}
.stop.past .sdot{background:var(--ink3);border-color:var(--ink3)}
.stop.cur .sdot{background:var(--blue);border-color:var(--blue);box-shadow:0 0 0 4px rgba(37,99,235,.18)}
.sname{font-weight:700}.sname a:hover{color:var(--blue)}
.stop.past .sname{color:var(--ink3);font-weight:600}
.stimes{font-size:.8rem;color:var(--ink2);display:flex;gap:14px;margin-top:2px}.stimes s{color:var(--ink3)}
.f-plat{font-size:.74rem;color:var(--ink2);background:var(--soft);padding:3px 8px;border-radius:6px;font-weight:600}
.sect-title{margin:4px 0 8px}`;
  const body = `${nav()}<div class="wrap">
<div class="svc-hero">
  <div class="svc-hero-main"><div class="svc-route">${esc(svc.origin || '?')}<span class="to">→</span>${esc(svc.destination || '?')}</div>
  <div class="svc-sub">${opLogo(svc.operatorCode, svc.color)}<b>${esc(svc.operator || 'Unknown operator')}</b><span class="svc-status ${statusCls}" id="status">${esc(svc.status)}${svc.currentStation ? ` · ${esc(svc.currentStation)}` : ''}</span></div></div>
  <div class="svc-actions"><button class="btn" id="alertBtn">🔔 Set alert</button><button class="btn" id="shareBtn">⤴ Share</button></div>
</div>
<div class="alert-panel" id="alertPanel">
  <div class="ap-row"><label>Notify me when approaching</label><select id="ap-station">${svc.stops.map((s, i) => `<option value="${esc(s.name)}"${i === svc.stops.length - 1 ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
  <div class="ap-row"><label>How early</label><select id="ap-lead"><option value="5">5 minutes before</option><option value="10" selected>10 minutes before</option><option value="15">15 minutes before</option><option value="20">20 minutes before</option></select></div>
  <div class="ap-actions"><button class="btn blue" id="apEnable">Enable alerts</button> <span class="muted" id="apStatus" style="font-size:.82rem"></span></div>
  <p class="ap-note">🔔 You'll get a browser notification when the train is near your station, and again when it arrives. Alerts run while this page stays open.</p>
</div>
<div id="toast"></div>
<div id="map"></div>
${facts.length ? `<div class="sect-title" style="margin-bottom:8px">Train</div><div class="facts">${facts.map((f) => `<span class="fact">${f}</span>`).join('')}</div>` : ''}
${formationHtml}
<div class="sect-title">Calling points</div>
<div class="timeline" id="timeline">${stopRows}</div>
${footer()}</div>`;
  const mapData = JSON.stringify({ points: svc.routePoints, pos: svc.currentPosition, color: svc.color, live: svc.live });
  const script = `
var lk=document.createElement('link');lk.rel='stylesheet';lk.href='${MAPLIBRE_CSS}';document.head.appendChild(lk);
var sc=document.createElement('script');sc.src='${MAPLIBRE_JS}';sc.onload=initMap;document.body.appendChild(sc);
var D=${mapData},map,tM,LIVE=D.live;
function ukMin(){var s=new Date().toLocaleString('en-GB',{timeZone:'Europe/London',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});var m=s.match(/(\\d\\d):(\\d\\d):(\\d\\d)/);return m?(+m[1]*60+ +m[2]+(+m[3])/60):0}
function segDist(a,b){var dy=b[0]-a[0],dx=(b[1]-a[1])*Math.cos(a[0]*Math.PI/180);return Math.sqrt(dx*dx+dy*dy)}
function along(seg,f){if(!seg||!seg.length)return null;if(seg.length<2)return seg[0];var d=[],tot=0,i;for(i=1;i<seg.length;i++){var dd=segDist(seg[i-1],seg[i]);d.push(dd);tot+=dd}if(tot<=0)return seg[0];var tgt=f*tot,acc=0;for(i=1;i<seg.length;i++){if(acc+d[i-1]>=tgt){var g=(tgt-acc)/d[i-1];return[seg[i-1][0]+(seg[i][0]-seg[i-1][0])*g,seg[i-1][1]+(seg[i][1]-seg[i-1][1])*g]}acc+=d[i-1]}return seg[seg.length-1]}
function trainPos(){if(LIVE&&LIVE.moving&&LIVE.seg&&LIVE.seg.length){var t0=LIVE.t0,t1=LIVE.t1;if(t1<t0)t1+=1440;var now=ukMin();if(now<t0-720)now+=1440;var f=(t1>t0)?(now-t0)/(t1-t0):1;f=Math.max(0,Math.min(1,f));return along(LIVE.seg,f)}return (LIVE&&LIVE.position)||D.pos}
function makeMk(p){var el=document.createElement('div');el.className='trainmk';el.style.setProperty('--c',D.color);el.innerHTML='<span class="tm-pulse"></span><span class="tm-dot">🚆</span>';tM=new maplibregl.Marker({element:el}).setLngLat([p[1],p[0]]).addTo(map)}
function tick(){var p=trainPos();if(p){if(tM)tM.setLngLat([p[1],p[0]]);else makeMk(p)}requestAnimationFrame(tick)}
function initMap(){map=new maplibregl.Map({container:'map',style:'${MAP_STYLE}',center:[-2,54.2],zoom:5,attributionControl:false,cooperativeGestures:true});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
 map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
 function build(){if(!(D.points&&D.points.length))return;var coords=D.points.map(function(p){return [p[1],p[0]]});
  map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords}}});
  map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':D.color,'line-width':4,'line-opacity':0.9}});
  map.addSource('ends',{type:'geojson',data:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:coords[0]},properties:{c:D.color}},{type:'Feature',geometry:{type:'Point',coordinates:coords[coords.length-1]},properties:{c:'#16181D'}}]}});
  map.addLayer({id:'ends',type:'circle',source:'ends',paint:{'circle-radius':5,'circle-color':['get','c'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
  var b=new maplibregl.LngLatBounds();coords.forEach(function(c){b.extend(c)});map.fitBounds(b,{padding:42,duration:0,maxZoom:12})}
 if(map.isStyleLoaded())build();else map.once('load',build);
 requestAnimationFrame(tick);setInterval(poll,20000)}
function poll(){fetch('/api/service/${esc(svc.id)}?date=${esc(svc.date)}').then(r=>r.json()).then(function(d){
 if(d.status){document.getElementById('status').textContent=d.status+(d.currentStation?' · '+d.currentStation:'')}
 if(d.live)LIVE=d.live;
 if(d.stops){var tl=document.getElementById('timeline');d.stops.forEach(function(s){var el=tl.querySelector('[data-name="'+(s.name||'').replace(/"/g,'')+'"]');if(el){el.classList.remove('past','cur','fut');el.classList.add(s.state==='current'?'cur':s.state==='past'?'past':'fut')}});checkAlerts(d.stops)}}).catch(function(){})}
var ID='${esc(svc.id)}',ORIG=${JSON.stringify(svc.origin || '')},DEST=${JSON.stringify(svc.destination || '')};
function toast(t){var el=document.getElementById('toast');if(!el)return;el.textContent=t;el.classList.add('show');setTimeout(function(){el.classList.remove('show')},2400)}
function hhmmMin(t){var m=(t||'').match(/(\\d\\d):(\\d\\d)/);return m?+m[1]*60+ +m[2]:null}
function notify(title,body){if(window.Notification&&Notification.permission==='granted'){try{new Notification(title,{body:body})}catch(e){}}toast(title)}
var ALERT=null;try{ALERT=JSON.parse(localStorage.getItem('alert_'+ID)||'null')}catch(e){}
function saveAlert(){try{localStorage.setItem('alert_'+ID,JSON.stringify(ALERT))}catch(e){}}
function alertStatus(){var s=document.getElementById('apStatus'),b=document.getElementById('alertBtn');if(!s||!b)return;if(ALERT&&ALERT.station){b.textContent='🔔 Alert on';s.innerHTML='✓ On for <b>'+ALERT.station+'</b> · <a href="#" id="apOff" style="color:var(--blue)">turn off</a>';var off=document.getElementById('apOff');if(off)off.onclick=function(e){e.preventDefault();ALERT=null;try{localStorage.removeItem('alert_'+ID)}catch(e){}alertStatus()};var ss=document.getElementById('ap-station'),ll=document.getElementById('ap-lead');if(ss)ss.value=ALERT.station;if(ll)ll.value=ALERT.lead}else{b.textContent='🔔 Set alert';s.textContent=''}}
function checkAlerts(stops){if(!ALERT||!ALERT.station||!stops)return;var st=null,i;for(i=0;i<stops.length;i++)if(stops[i].name===ALERT.station)st=stops[i];if(!st)return;var eta=hhmmMin(st.arr),now=ukMin();if(eta==null)return;var away=eta-now;if(away<-720)away+=1440;if(!ALERT.firedApproach&&!st.arrived&&away<=ALERT.lead&&away>-1){notify('🚆 Approaching '+ALERT.station,'Your train is about '+Math.max(1,Math.round(away))+' min away.');ALERT.firedApproach=true;saveAlert()}if(!ALERT.firedArrive&&(st.arrived||away<=0)){notify('✅ Arrived at '+ALERT.station,ORIG+' → '+DEST+' has arrived.');ALERT.firedArrive=true;saveAlert()}}
(function(){var sb=document.getElementById('shareBtn');if(sb)sb.onclick=function(){var u=location.href;if(navigator.share){navigator.share({title:ORIG+' → '+DEST,text:'Track this train live',url:u}).catch(function(){})}else if(navigator.clipboard){navigator.clipboard.writeText(u).then(function(){toast('Link copied')})}else{toast(u)}};
var ab=document.getElementById('alertBtn'),pn=document.getElementById('alertPanel');if(ab)ab.onclick=function(){pn.classList.toggle('show')};
var en=document.getElementById('apEnable');if(en)en.onclick=function(){var station=document.getElementById('ap-station').value,lead=+document.getElementById('ap-lead').value;function go(){ALERT={station:station,lead:lead,firedApproach:false,firedArrive:false};saveAlert();alertStatus();toast('Alerts set for '+station);pn.classList.remove('show')}if(window.Notification){if(Notification.permission==='granted')go();else Notification.requestPermission().then(function(p){if(p==='granted')go();else{var s=document.getElementById('apStatus');if(s)s.textContent='Notifications are blocked — enable them in your browser settings.'}})}else go()};
alertStatus();poll();})();`;
  return shell({ title: `${esc(svc.origin || '')} → ${esc(svc.destination || '')}${svc.headcode ? ` (${esc(svc.headcode)})` : ''} — Live Tracking`, desc: `Live tracking for the ${svc.operator || ''} service ${svc.origin || ''} to ${svc.destination || ''}: full calling points, delays and current position.`, head, body, script });
}

// ── Network map ────────────────────────────────────────────────────────────
function renderMap() {
  const head = `#map{position:fixed;top:54px;left:0;right:0;bottom:0}.maplibregl-canvas{outline:none}.nav{position:fixed;left:0;right:0;top:0}
.maplibregl-popup-content{border-radius:12px;font-family:inherit;font-size:.82rem;padding:10px 12px}
.maplibregl-popup-content a{color:var(--blue);font-weight:700}`;
  const body = `${nav()}<div id="map"></div>`;
  const script = `var lk=document.createElement('link');lk.rel='stylesheet';lk.href='${MAPLIBRE_CSS}';document.head.appendChild(lk);
var sc=document.createElement('script');sc.src='${MAPLIBRE_JS}';sc.onload=init;document.body.appendChild(sc);
function init(){var p=new URLSearchParams(location.search),f=p.get('focus');
 var map=new maplibregl.Map({container:'map',style:'${MAP_STYLE}',center:[-2.4,54.3],zoom:5.4,attributionControl:false});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
 map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
 var popup=new maplibregl.Popup({offset:12});
 fetch('/api/locations').then(function(r){return r.json()}).then(function(list){
  var fc={type:'FeatureCollection',features:list.filter(function(s){return s.lat!=null}).map(function(s){return {type:'Feature',geometry:{type:'Point',coordinates:[s.lon,s.lat]},properties:{code:s.code,name:s.name}}})};
  function build(){
   map.addSource('st',{type:'geojson',data:fc});
   map.addLayer({id:'st-c',type:'circle',source:'st',paint:{'circle-radius':['interpolate',['linear'],['zoom'],5,2,10,5,14,7],'circle-color':'#2563EB','circle-stroke-color':'#fff','circle-stroke-width':1.2,'circle-opacity':0.9}});
   map.addLayer({id:'st-l',type:'symbol',source:'st',minzoom:9,layout:{'text-field':['get','code'],'text-font':['Noto Sans Bold'],'text-size':11,'text-offset':[0,0.9],'text-anchor':'top'},paint:{'text-color':'#1d3a8a','text-halo-color':'#fff','text-halo-width':1.4}});
   map.on('mouseenter','st-c',function(){map.getCanvas().style.cursor='pointer'});
   map.on('mouseleave','st-c',function(){map.getCanvas().style.cursor=''});
   map.on('click','st-c',function(e){var pr=e.features[0].properties;popup.setLngLat(e.features[0].geometry.coordinates).setHTML('<b>'+pr.name+'</b> ('+pr.code+')<br><a href="/station/'+pr.code+'">Live times →</a>').addTo(map)});
   if(f){var hit=list.find(function(s){return s.code===f});if(hit)map.jumpTo({center:[hit.lon,hit.lat],zoom:13})}
  }
  if(map.isStyleLoaded())build();else map.once('load',build);
 })}`;
  return shell({ title: 'Network Map — Rail Tracker', desc: 'Interactive map of every railway station in Great Britain.', head, body, script, fullHeight: true });
}

// ── Operators ──────────────────────────────────────────────────────────────
function renderOperators(list) {
  const head = `.head{padding:26px 0 12px}.head h1{font-size:1.7rem;font-weight:800}.head p{color:var(--ink2);margin-top:3px}
.opg{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;padding:8px 0}
.opc{display:flex;align-items:center;gap:11px;padding:15px;border:1px solid var(--line);border-radius:14px}.opc:hover{background:var(--soft2)}
.opc .nm{font-weight:700;font-size:.92rem}.opc .cd{color:var(--ink3);font-size:.74rem;font-family:'SF Mono',monospace}`;
  const cards = list.map((o) => `<a class="opc" href="/operator/${o.code}">${opLogo(o.code, o.color)}<span><span class="nm">${esc(o.name)}</span><br><span class="cd">${o.code}</span></span></a>`).join('');
  const body = `${nav()}<div class="wrap"><div class="head"><h1>Train Operators</h1><p>Passenger train operating companies across Great Britain.</p></div><div class="opg">${cards}</div>${footer()}</div>`;
  return shell({ title: 'Train Operators — Rail Tracker', desc: 'UK passenger train operating companies, codes and brand colours.', head, body });
}
function renderOperator(code, info, sample) {
  const head = `.ohead{padding:26px 0;display:flex;align-items:center;gap:14px}.ohead h1{font-size:1.6rem;font-weight:800}.ohead .cd{color:var(--ink3);font-family:'SF Mono',monospace;font-size:.85rem}
.swatch{width:48px;height:48px;border-radius:13px}.note{color:var(--ink2);font-size:.95rem;line-height:1.6;max-width:640px}
.sect-title{margin:22px 0 8px}.chips{display:flex;flex-wrap:wrap;gap:9px}.chip{display:inline-flex;gap:7px;align-items:center;padding:8px 13px;border:1px solid var(--line);border-radius:999px;font-size:.85rem}.chip:hover{background:var(--soft2)}.chip .c{font-weight:700;color:var(--blue);font-family:'SF Mono',monospace}`;
  const chips = sample.map((c) => `<a class="chip" href="/station/${c}"><span class="c">${c}</span>${esc(rail.stationName(c))}</a>`).join('');
  const body = `${nav()}<div class="wrap"><div class="ohead"><span class="swatch" style="background:${info.color}"></span><div><h1>${esc(info.name)}</h1><div class="cd">Operator code ${code}</div></div></div>
<p class="note">Live ${esc(info.name)} running information appears on every station board, colour-coded with this operator's brand. Open a station to see ${esc(info.name)} trains in real time, then tap any service to track its full route.</p>
<div class="sect-title">Major stations</div><div class="chips">${chips}</div>${footer()}</div>`;
  return shell({ title: `${esc(info.name)} — Rail Tracker`, desc: `Live ${info.name} train running information across Great Britain.`, head, body });
}

// ── About / errors ─────────────────────────────────────────────────────────
function renderAbout() {
  const head = `.content{padding:26px 0;max-width:680px}.content h1{font-size:1.7rem;font-weight:800;margin-bottom:14px}
.content h2{font-size:1.05rem;font-weight:700;margin:22px 0 8px}.content p{color:var(--ink2);margin-bottom:12px;line-height:1.65}
.content a{color:var(--blue)}.content ul{color:var(--ink2);padding-left:20px;margin-bottom:12px}.content li{margin-bottom:5px}`;
  const body = `${nav()}<div class="wrap"><div class="content">
<h1>About Rail Tracker</h1>
<p>A fast, live train tracker for Great Britain — disruptions at a glance, a performance dashboard for every station, and full route tracking for individual services.</p>
<h2>What you can do</h2>
<ul><li><b>See disruptions</b> across major stations on a live map.</li>
<li><b>Open any station</b> for on-time performance, most-disrupted routes &amp; operators, weather and live boards.</li>
<li><b>Track any train</b> — every calling point, scheduled vs expected times, and live position on a map.</li>
<li><b>Browse the network</b> map and operators.</li></ul>
<h2>Data</h2>
<p>Live running information comes from Network Rail feeds via <a href="https://www.realtimetrains.co.uk/">Realtime Trains</a>; weather from <a href="https://open-meteo.com/">Open-Meteo</a>. Independent project, not affiliated with National Rail, Network Rail or any operator.</p>
<h2>Source</h2><p>Open source on <a href="https://github.com/TheDesigner56/rail-tracker">GitHub</a>.</p>
</div>${footer()}</div>`;
  return shell({ title: 'About — Rail Tracker', desc: 'About Rail Tracker — live UK train times, performance and tracking.', head, body });
}
function render404(crs) {
  const head = `.c{min-height:64vh;display:grid;place-items:center;text-align:center}.c .big{font-size:3.5rem;font-weight:800;color:var(--line)}.c h1{font-size:1.2rem;margin:6px 0}.c p{color:var(--ink2);margin-bottom:16px}.c a{color:var(--blue);font-weight:600}`;
  const body = `${nav()}<div class="wrap"><div class="c"><div><div class="big">${esc(crs || '404')}</div><h1>Station not found</h1><p>We don't have a station with that code.</p><a href="/">← Back to disruptions</a></div></div></div>`;
  return shell({ title: 'Not found — Rail Tracker', desc: 'Not found.', head, body });
}
function renderError(title, message) {
  const head = `.c{min-height:60vh;display:grid;place-items:center;text-align:center}.c h1{font-size:1.2rem;margin:8px 0}.c p{color:var(--ink2);margin-bottom:16px;max-width:360px}`;
  const body = `${nav()}<div class="wrap"><div class="c"><div><div style="font-size:2.4rem">🚧</div><h1>${esc(title)}</h1><p>${esc(message)}</p><button class="btn blue" onclick="location.reload()">Try again</button></div></div></div>`;
  return shell({ title: `${esc(title)} — Rail Tracker`, desc: message, head, body });
}

module.exports = {
  renderDisruptions, renderOverview, renderBoard, renderService, renderMap,
  renderOperators, renderOperator, renderAbout, render404, renderError,
};
