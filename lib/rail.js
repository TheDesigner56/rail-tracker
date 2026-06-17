// ── Rail data layer ────────────────────────────────────────────────────────
// Fetches and parses live data from realtimetrains.co.uk (the same source the
// `trainspy` library uses). We parse boards and service pages ourselves so we
// can do it in a single request per board (trainspy fires one request *per
// service*, which is slow) and expose full calling-point routes for the
// service-detail / live-tracking pages.

const cheerio = require('cheerio');
const { getCurrentState } = require('trainspy/dist/src/trackTrain.js');

const RAW_CODES = require('trainspy/dist/src/map/stationCodes.json');
const RAW_LOCS = require('trainspy/dist/src/map/stationLocations.json');

// code → name
const STATIONS = {};
for (const s of RAW_CODES.stations) STATIONS[s['CRS Code']] = s['Station Name'];
// Backfill any codes that only exist in the locations file.
for (const code of Object.keys(RAW_LOCS)) {
  if (!STATIONS[code] && RAW_LOCS[code].station_name) STATIONS[code] = RAW_LOCS[code].station_name;
}

// code → { name, lat, lon }
const LOCATIONS = {};
for (const code of Object.keys(RAW_LOCS)) {
  const l = RAW_LOCS[code];
  if (typeof l.latitude === 'number' && typeof l.longitude === 'number') {
    LOCATIONS[code] = { name: STATIONS[code] || l.station_name || code, lat: l.latitude, lon: l.longitude };
  }
}

// ── Operators (ATOC two-letter codes used by realtimetrains) ────────────────
const TOC = {
  AW: { name: 'Transport for Wales', color: '#FF0000' },
  CC: { name: 'c2c', color: '#B7007C' },
  CH: { name: 'Chiltern Railways', color: '#00BFFF' },
  CS: { name: 'Caledonian Sleeper', color: '#1B2A4A' },
  XC: { name: 'CrossCountry', color: '#C41230' },
  EM: { name: 'East Midlands Railway', color: '#713563' },
  ES: { name: 'Eurostar', color: '#0B3C8E' },
  GC: { name: 'Grand Central', color: '#1D1D1D' },
  GN: { name: 'Great Northern', color: '#0099A8' },
  GR: { name: 'LNER', color: '#CE0E2D' },
  GW: { name: 'Great Western Railway', color: '#0A493E' },
  HT: { name: 'Hull Trains', color: '#1E2E5A' },
  HX: { name: 'Heathrow Express', color: '#532A6B' },
  IL: { name: 'Island Line', color: '#1B4F72' },
  LD: { name: 'Lumo', color: '#2D2A6E' },
  LE: { name: 'Greater Anglia', color: '#D70428' },
  LM: { name: 'West Midlands Railway', color: '#E37222' },
  LO: { name: 'London Overground', color: '#EE7C0E' },
  LT: { name: 'London Underground', color: '#10069F' },
  ME: { name: 'Merseyrail', color: '#FFD100' },
  NT: { name: 'Northern', color: '#0F4C9A' },
  SE: { name: 'Southeastern', color: '#0A2D5E' },
  SN: { name: 'Southern', color: '#00A94F' },
  SR: { name: 'ScotRail', color: '#1E467D' },
  SW: { name: 'South Western Railway', color: '#24398C' },
  TL: { name: 'Thameslink', color: '#E5007D' },
  TP: { name: 'TransPennine Express', color: '#00A0DD' },
  TW: { name: 'Tyne & Wear Metro', color: '#FFC20E' },
  VT: { name: 'Avanti West Coast', color: '#004354' },
  XR: { name: 'Elizabeth Line', color: '#6950A8' },
};
const TOC_BY_NAME = {};
for (const [code, v] of Object.entries(TOC)) TOC_BY_NAME[v.name.toLowerCase()] = code;

function operatorName(code) { return (TOC[code] && TOC[code].name) || code || 'Unknown'; }
function operatorColor(code) { return (TOC[code] && TOC[code].color) || '#52525B'; }
function operatorCodeFromName(name) {
  if (!name) return null;
  return TOC_BY_NAME[name.trim().toLowerCase()] || null;
}

// ── Time helpers ─────────────────────────────────────────────────────────────
// RTT prints times as HHMM, sometimes with a fraction glyph (e.g. "1705¾").
function parseHHMM(str) {
  if (!str) return null;
  const digits = String(str).replace(/[^0-9]/g, '');
  if (digits.length < 4) return null;
  const hh = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  if (isNaN(hh) || isNaN(mm) || hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}
function fmtMins(str) {
  const m = parseHHMM(str);
  if (m == null) return str || '';
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
// Signed delay in minutes between scheduled and real, tolerant of midnight wrap.
function delayMins(sched, real) {
  const s = parseHHMM(sched), r = parseHHMM(real);
  if (s == null || r == null) return 0;
  let d = r - s;
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}

function haversine(la1, lo1, la2, lo2) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Station lookups ──────────────────────────────────────────────────────────
function stationName(crs) { return STATIONS[crs] || null; }
function stationLoc(crs) { return LOCATIONS[crs] || null; }
function allStations() {
  return Object.entries(STATIONS).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
}
function allLocations() {
  return Object.entries(LOCATIONS).map(([code, l]) => ({ code, name: l.name, lat: l.lat, lon: l.lon }));
}
function searchStations(q) {
  q = (q || '').toLowerCase().trim();
  if (!q) return [];
  const out = [];
  for (const [code, name] of Object.entries(STATIONS)) {
    const ln = name.toLowerCase();
    const codeMatch = code.toLowerCase() === q ? 3 : code.toLowerCase().startsWith(q) ? 2 : 0;
    const nameMatch = ln.startsWith(q) ? 2 : ln.includes(q) ? 1 : 0;
    const partMatch = ln.split(/[\s,()&]+/).some((p) => p.startsWith(q)) ? 1 : 0;
    const score = codeMatch + nameMatch + partMatch;
    if (score > 0) out.push({ code, name, score });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 25)
    .map(({ code, name }) => ({ code, name }));
}
function nearby(lat, lon, n = 12) {
  return Object.entries(LOCATIONS)
    .map(([code, l]) => ({ code, name: l.name, lat: l.lat, lon: l.lon, distKm: haversine(lat, lon, l.lat, l.lon) }))
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, n);
}

function operatorList() {
  return Object.entries(TOC).map(([code, v]) => ({ code, name: v.name, color: v.color }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Fetch helpers ──────────────────────────────────────────────────────────
const RTT = 'https://www.realtimetrains.co.uk';
function today() { return new Date().toISOString().slice(0, 10); }
function nowHHMM() { return new Date().toTimeString().slice(0, 5).replace(':', ''); }

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'rail-tracker (+https://railtracker.uk)' } });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.text();
}

// ── Board (departures / arrivals) ─────────────────────────────────────────
// One request, no per-service fetches. mode = 'departures' | 'arrivals'.
async function getBoard(crs, mode = 'departures') {
  crs = crs.toUpperCase().slice(0, 3);
  const date = today(), time = nowHHMM();
  const url = `${RTT}/search/detailed/gb-nr:${crs}/${date}/${time}` + (mode === 'arrivals' ? '/arrivals' : '');
  const $ = cheerio.load(await fetchText(url));
  const arr = mode === 'arrivals';
  const services = [];

  for (const el of $('a.service').toArray()) {
    const row = $(el);
    const href = row.attr('href') || '';
    const m = href.match(/gb-nr:(\w+)/);
    if (!m) continue;
    const id = m[1];

    const tocCode = row.find('.toc').first().text().trim();
    const headcode = row.find('.tid').first().text().trim();
    const cars = row.find('.cars').first().text().replace(/[^0-9]/g, '');
    const platform = row.find('.platform').first().text().trim();

    let sched, real, place;
    if (arr) {
      sched = row.find('.time.plan.a.gbtt').first().text().trim() || row.find('.time.plan.a.wtt').first().text().trim();
      real = row.find('.time.real.a.act').first().text().trim() || row.find('.time.real.a.exp').first().text().trim();
      place = row.find('.location.o span').first().text().trim() || row.find('.location.o').first().text().trim();
    } else {
      sched = row.find('.time.plan.d.gbtt').first().text().trim() || row.find('.time.plan.d.wtt').first().text().trim();
      real = row.find('.time.real.d.act').first().text().trim() || row.find('.time.real.d.exp').first().text().trim();
      place = row.find('.location.d span').first().text().trim() || row.find('.location.d').first().text().trim();
    }

    // Skip non-applicable rows: a terminating train has no departure, an
    // originating train has no arrival.
    if (!sched && !real) continue;
    if (/^(terminates|starts) here$/i.test(place)) continue;

    const cancelled = /cancel/i.test(row.find('.time.real, .cancelled, .cancel').text()) || row.hasClass('cancelled');
    const actual = !!(arr ? row.find('.time.real.a.act').first().text().trim() : row.find('.time.real.d.act').first().text().trim());
    const delay = real ? delayMins(sched, real) : 0;

    services.push({
      id, headcode, operatorCode: tocCode, operator: operatorName(tocCode), color: operatorColor(tocCode),
      cars: cars ? parseInt(cars, 10) : null, platform: platform || null,
      place, scheduled: fmtMins(sched), expected: fmtMins(real || sched),
      delay, actual, cancelled,
    });
  }

  return {
    crs, name: stationName(crs) || crs, loc: stationLoc(crs),
    mode, generatedAt: new Date().toISOString(), services,
  };
}

// ── Service detail (full route + live position) ────────────────────────────
async function getService(id, date) {
  id = String(id).replace(/[^a-zA-Z0-9]/g, '');
  date = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today();
  const $ = cheerio.load(await fetchText(`${RTT}/service/gb-nr:${id}/${date}/detailed`));

  const operator = $('.toc div').first().text().trim() || $('.toc').first().text().trim();
  const operatorCode = operatorCodeFromName(operator);

  // Header line: "1Y68 1642 Origin to Destination ..."
  const h3 = $('h3').first().text().replace(/\s+/g, ' ').trim();
  const headcode = (h3.match(/^([0-9][A-Z][0-9]{2})\b/) || [])[1] || null;

  // Info panel: UID, formation (unit numbers), service characteristics.
  const info = $('.callout.infopanel').text().replace(/\s+/g, ' ').trim();
  const formation = (info.match(/\b\d{5,6}(?:\s*\+\s*\d{5,6})+/) || [])[0] || null;
  const tags = [];
  for (const t of ['Driver only operated', 'Express Passenger', 'Ordinary Passenger', 'Empty Coaching Stock', 'Charter']) {
    if (info.includes(t)) tags.push(t);
  }

  // Full ordered route. RTT marks each timing point with `call` (the train
  // stops) or `pass` (passes through); public passenger stops also carry
  // `public`. Public times live in .gbtt, realtime times in .realtime, and a
  // ready-made signed delay in .delay. (Note: each outer row contains a nested
  // bare `.location` wrapping the name, so we select only `.call`/`.pass`.)
  const txt = (sel, ctx) => ctx.find(sel).first().text().replace(/\s+/g, ' ').trim();
  const route = [];
  let pathInfo = null;
  for (const el of $('.locationlist .location.call, .locationlist .location.pass').toArray()) {
    const row = $(el);
    const cls = el.attribs.class || '';
    const rawName = txt('.name', row);
    if (!rawName) continue;
    const nm = rawName.match(/^(.*?)\s*\[(\w{3})\]\s*$/);
    const name = nm ? nm[1] : rawName;
    const code = nm ? nm[2] : null;
    const loc = code && LOCATIONS[code] ? LOCATIONS[code] : null;
    const addl = txt('.addl', row);
    if (!pathInfo && addl) pathInfo = addl;

    const actArr = txt('.realtime .arr.act', row), expArr = txt('.realtime .arr.exp', row);
    const actDep = txt('.realtime .dep.act', row), expDep = txt('.realtime .dep.exp', row);
    const dTxt = txt('.delay', row).replace(/[^0-9+-]/g, '');
    route.push({
      name, code, platform: txt('.platform', row) || null,
      stopsHere: / call(\s|$)/.test(' ' + cls), public: /\bpublic\b/.test(cls),
      location: loc ? { lat: loc.lat, lon: loc.lon } : null,
      schedArr: fmtMins(txt('.gbtt .arr', row)), schedDep: fmtMins(txt('.gbtt .dep', row)),
      realArr: fmtMins(actArr || expArr), realDep: fmtMins(actDep || expDep),
      arrived: !!actArr, departed: !!actDep,
      delay: dTxt ? parseInt(dTxt, 10) || 0 : 0,
    });
  }

  // Live frontier = last point the train has actually reached.
  let currentIndex = -1;
  route.forEach((r, i) => { if (r.arrived || r.departed) currentIndex = i; });
  route.forEach((r, i) => {
    r.state = i < currentIndex ? 'past' : i === currentIndex ? (r.departed ? 'departed' : 'current') : 'future';
  });

  let status = 'Scheduled';
  try {
    const cs = getCurrentState($);
    if (cs && cs.body && cs.body.status) status = cs.body.status;
  } catch { /* fall back to derived status */ }
  if (currentIndex === -1 && status === 'Scheduled') status = 'Not yet departed';

  // Public timeline = advertised calling points (fall back to all stops).
  let stops = route.filter((r) => r.stopsHere && r.public);
  if (stops.length < 2) stops = route.filter((r) => r.stopsHere);

  // Display state per public stop: everything the train has left is `past`; the
  // first stop it hasn't yet left is `current` (where it is, or heading next);
  // the rest are `future`. This keeps a live marker visible between stations.
  let frontierFound = false;
  stops.forEach((s) => {
    if (s.departed) s.state = 'past';
    else if (!frontierFound) { s.state = 'current'; frontierFound = true; }
    else s.state = 'future';
  });
  const origin = stops[0] || route[0] || null;
  const destination = stops[stops.length - 1] || route[route.length - 1] || null;
  const routePoints = route.filter((r) => r.location).map((r) => [r.location.lat, r.location.lon]);

  // Last known geographic position (walk back from frontier to a located row).
  let currentPosition = null, currentStation = null, currentDelay = 0;
  if (currentIndex >= 0) {
    currentStation = route[currentIndex].name;
    currentDelay = route[currentIndex].delay;
    for (let i = currentIndex; i >= 0; i--) {
      if (route[i].location) { currentPosition = [route[i].location.lat, route[i].location.lon]; break; }
    }
  }

  return {
    id, date, headcode, operator, operatorCode, color: operatorColor(operatorCode),
    origin: origin ? origin.name : null, destination: destination ? destination.name : null,
    originCode: origin ? origin.code : null, destinationCode: destination ? destination.code : null,
    status, currentIndex, currentStation, currentDelay, formation, tags, pathInfo,
    route, stops, routePoints, currentPosition,
  };
}

// ── Major stations (for the disruptions landing) ───────────────────────────
const MAJOR = [
  ['PAD', 'London'], ['KGX', 'London'], ['EUS', 'London'], ['WAT', 'London'],
  ['VIC', 'London'], ['LST', 'London'], ['LBG', 'London'], ['BHM', 'Birmingham'],
  ['MAN', 'Manchester'], ['LDS', 'Leeds'], ['LIV', 'Liverpool'], ['EDB', 'Edinburgh'],
  ['GLC', 'Glasgow'], ['BRI', 'Bristol'], ['RDG', 'Reading'], ['YRK', 'York'],
  ['NCL', 'Newcastle'], ['CDF', 'Cardiff'], ['SHF', 'Sheffield'], ['NOT', 'Nottingham'],
];
const CITY = Object.fromEntries(MAJOR);
function cityFor(crs, name) {
  if (CITY[crs]) return CITY[crs];
  const n = name || stationName(crs) || '';
  if (/^London /.test(n)) return 'London';
  return n.replace(/\s*\(.*\)\s*/, '').split(/\s+/).slice(0, 2).join(' ');
}

// ── Performance aggregation over a board ───────────────────────────────────
// "On time" tolerance: rail convention treats arrivals within ~5 minutes as on
// time (cf. National Rail PPM). Counting every +1 min as "delayed" would paint
// every board red.
const ON_TIME_TOL = 5;
function summarizeBoard(b) {
  const s = (b && b.services) || [];
  const total = s.length;
  const cancelled = s.filter((x) => x.cancelled).length;
  const delayed = s.filter((x) => !x.cancelled && x.delay > ON_TIME_TOL);
  const onTime = s.filter((x) => !x.cancelled && x.delay <= ON_TIME_TOL).length;
  const avg = delayed.length ? Math.round(delayed.reduce((a, x) => a + x.delay, 0) / delayed.length) : 0;
  return {
    total, cancelled, delayed: delayed.length, onTime,
    onTimePct: total ? Math.round((onTime / total) * 100) : 100,
    delayedPct: total ? Math.round((delayed.length / total) * 100) : 0,
    cancelPct: total ? Math.round((cancelled / total) * 100) : 0,
    avgDelay: avg,
  };
}

function group(services, keyFn, labelFn) {
  const m = new Map();
  for (const s of services) {
    const k = keyFn(s);
    if (!k) continue;
    const cur = m.get(k) || { key: k, label: labelFn(s), color: s.color, total: 0, disrupted: 0, dSum: 0, dN: 0 };
    cur.total++;
    if (s.cancelled || s.delay > ON_TIME_TOL) cur.disrupted++;
    if (!s.cancelled && s.delay > 0) { cur.dSum += s.delay; cur.dN++; }
    m.set(k, cur);
  }
  return [...m.values()].map((g) => ({ ...g, avgDelay: g.dN ? Math.round(g.dSum / g.dN) : 0 }));
}
const disruptedRoutes = (b) => group(b.services, (s) => s.place, (s) => s.place).filter((g) => g.disrupted > 0).sort((a, b) => b.disrupted - a.disrupted || b.avgDelay - a.avgDelay);
const disruptedOperators = (b) => group(b.services, (s) => s.operatorCode, (s) => s.operator).filter((g) => g.disrupted > 0).sort((a, b) => b.disrupted - a.disrupted);
const busiestRoutes = (b) => group(b.services, (s) => s.place, (s) => s.place).sort((a, b) => b.total - a.total);
const busiestOperators = (b) => group(b.services, (s) => s.operatorCode, (s) => s.operator).sort((a, b) => b.total - a.total);

// Overall station status + honest, data-derived alerts.
function statusOf(dep, arr) {
  const cancelPct = Math.max(dep.cancelPct, arr.cancelPct);
  const avgDelay = Math.max(dep.avgDelay, arr.avgDelay);
  const onTimePct = Math.round((dep.onTimePct + arr.onTimePct) / 2);
  let level = 'normal';
  if (cancelPct >= 5 || avgDelay >= 30 || onTimePct < 50) level = 'major';
  else if (cancelPct >= 2 || avgDelay >= 12 || onTimePct < 75) level = 'minor';
  const alerts = [];
  if (cancelPct >= 4) alerts.push('Cancellations');
  if (avgDelay >= 25) alerts.push('Severe delays');
  else if (avgDelay >= 12) alerts.push('Delays');
  if (onTimePct < 60) alerts.push('Low punctuality');
  const color = level === 'major' ? '#EF4444' : level === 'minor' ? '#F59E0B' : '#22C55E';
  return { level, color, onTimePct, avgDelay, cancelPct, alerts };
}

// ── Weather (Open-Meteo, keyless) ──────────────────────────────────────────
const WMO = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'], 51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️'],
};
const weatherCache = new Map();
async function getWeather(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.t < 600_000) return hit.v;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m&wind_speed_unit=kmh&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const c = j.current || {};
    const [desc, icon] = WMO[c.weather_code] || ['—', '🌡️'];
    const v = { tempC: Math.round(c.temperature_2m), desc, icon, windKmh: Math.round(c.wind_speed_10m), gustKmh: Math.round(c.wind_gusts_10m) };
    weatherCache.set(key, { v, t: Date.now() });
    return v;
  } catch { return null; }
}

// ── Aggregated views ───────────────────────────────────────────────────────
async function getOverview(crs) {
  crs = crs.toUpperCase().slice(0, 3);
  const loc = stationLoc(crs);
  const [dep, arr, weather] = await Promise.all([
    getBoard(crs, 'departures').catch(() => ({ crs, services: [] })),
    getBoard(crs, 'arrivals').catch(() => ({ crs, services: [] })),
    loc ? getWeather(loc.lat, loc.lon) : Promise.resolve(null),
  ]);
  const depStats = summarizeBoard(dep), arrStats = summarizeBoard(arr);
  return {
    crs, name: stationName(crs), city: cityFor(crs), loc, weather,
    dep, arr, depStats, arrStats, status: statusOf(depStats, arrStats),
    disruptedRoutes: disruptedRoutes(dep).slice(0, 6),
    disruptedOperators: disruptedOperators(dep).slice(0, 6),
    busiestRoutes: busiestRoutes(dep).slice(0, 6),
    busiestOperators: busiestOperators(dep).slice(0, 6),
    operatorsServed: new Set(dep.services.map((s) => s.operatorCode).filter(Boolean)).size,
    destinationsServed: new Set(dep.services.map((s) => s.place)).size,
  };
}

async function mapLimit(items, limit, fn) {
  const out = []; let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

async function getDisruptions() {
  const rows = await mapLimit(MAJOR, 10, async ([crs]) => {
    try {
      const [dep, arr] = await Promise.all([getBoard(crs, 'departures'), getBoard(crs, 'arrivals')]);
      const depStats = summarizeBoard(dep), arrStats = summarizeBoard(arr);
      const st = statusOf(depStats, arrStats);
      const l = stationLoc(crs);
      return {
        code: crs, name: stationName(crs), city: cityFor(crs),
        lat: l && l.lat, lon: l && l.lon,
        dep: depStats, arr: arrStats, status: st.level, color: st.color, alerts: st.alerts,
      };
    } catch { return null; }
  });
  const order = { major: 0, minor: 1, normal: 2 };
  return rows.filter(Boolean).sort((a, b) => order[a.status] - order[b.status] || b.dep.avgDelay - a.dep.avgDelay);
}

module.exports = {
  STATIONS, LOCATIONS, TOC, MAJOR,
  stationName, stationLoc, cityFor, allStations, allLocations, searchStations, nearby,
  operatorName, operatorColor, operatorList, operatorCodeFromName,
  getBoard, getService, getOverview, getDisruptions, getWeather,
  summarizeBoard, disruptedRoutes, disruptedOperators, busiestRoutes, busiestOperators, statusOf,
  fmtMins, parseHHMM, haversine,
};
