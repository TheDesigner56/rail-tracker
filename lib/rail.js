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
// Add minutes to an "HH:MM" (or "HHMM") clock time, wrapping past midnight.
function addMins(hhmm, add) {
  const m = parseHHMM(hhmm);
  if (m == null) return null;
  const n = (((m + Math.round(add || 0)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
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
// Realtime Trains expects UK local date/time. Hosts (e.g. Vercel) run in UTC,
// so derive Europe/London explicitly — otherwise the board is queried an hour
// behind during BST and shows already-departed services.
function ukNow() {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date())) p[x.type] = x.value;
  return p;
}
function today() { const p = ukNow(); return `${p.year}-${p.month}-${p.day}`; }
function nowHHMM() { const p = ukNow(); return `${p.hour}${p.minute}`; }

async function fetchText(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'rail-tracker (+https://railtracker.uk)' } });
      if (res.ok) return res.text();
      // Retry transient upstream errors (overload / rate-limit); fail fast on 4xx.
      if (res.status >= 500 || res.status === 429) lastErr = new Error(`upstream ${res.status}`);
      else throw new Error(`upstream ${res.status}`);
    } catch (e) { lastErr = e; }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw lastErr || new Error('upstream error');
}

// ── Board (departures / arrivals) ─────────────────────────────────────────
// One request, no per-service fetches. mode = 'departures' | 'arrivals'.
async function getBoard(crs, mode = 'departures', at) {
  crs = crs.toUpperCase().slice(0, 3);
  const date = today();
  const time = (typeof at === 'string' && /^\d{3,4}$/.test(at)) ? at.padStart(4, '0') : nowHHMM();
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

  return annotateRisk({
    crs, name: stationName(crs) || crs, loc: stationLoc(crs),
    mode, at: time, generatedAt: new Date().toISOString(), services,
  });
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
  // Rolling-stock unit numbers appear after the "(Network Rail, TPS)" marker
  // (single or "+"-joined; the 8-digit schedule id won't match \b\d{5,6}\b).
  const units = ((info.split(/TPS\)/)[1] || '').match(/(?<!\d)\d{5,6}(?!\d)/g) || []);
  const formation = units.length ? units.join(' + ') : null;
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
  // Not departed yet (e.g. sitting at the origin platform) → still place the
  // train at its starting point so the live marker is always shown.
  if (!currentPosition && routePoints.length) currentPosition = routePoints[0];

  // Live segment for smooth client-side interpolation: the train has left
  // `from` (actual departure t0) and is due at `to` (expected arrival t1), so
  // the client can glide the marker along `seg` by elapsed time.
  let live = { moving: false, position: currentPosition };
  const departedStops = stops.filter((s) => s.departed);
  const fromStop = departedStops.length ? departedStops[departedStops.length - 1] : null;
  const toStop = fromStop ? stops[stops.indexOf(fromStop) + 1] : null;
  if (fromStop && toStop && fromStop.location && toStop.location && !toStop.arrived) {
    const t0 = parseHHMM(fromStop.realDep || fromStop.schedDep);
    const t1 = parseHHMM(toStop.realArr || toStop.schedArr);
    const fi = route.indexOf(fromStop), ti = route.indexOf(toStop);
    const seg = route.slice(fi, ti + 1).filter((r) => r.location).map((r) => [r.location.lat, r.location.lon]);
    if (t0 != null && t1 != null && seg.length >= 2) {
      live = { moving: true, t0, t1, seg, from: fromStop.name, to: toStop.name };
    }
  }

  // Factual train / rolling-stock details parsed from the service page.
  const train = {
    cars: ($.root().text().match(/(\d+)\s*coaches/i) || [])[1] || null,
    formation,
    trainClass: units.length ? units[0].slice(0, 3) : ((pathInfo && (pathInfo.match(/Class\s+([\w/x]+)/i) || [])[1]) || null),
    power: (pathInfo && (pathInfo.match(/\bon\s+(electric|diesel|bi-?mode|steam)\b/i) || [])[1]) || null,
    maxSpeed: (pathInfo && (pathInfo.match(/(\d+)\s*mph/) || [])[1]) || null,
    seating: (info.match(/(First & Standard|First and Standard|Standard only|Standard|First)\s+class seating/i) || [])[0] || null,
    reservations: (info.match(/Reservations\s+(?:recommended|compulsory|available|possible|not available)/i) || [])[0] || null,
  };

  return {
    id, date, headcode, operator, operatorCode, color: operatorColor(operatorCode),
    origin: origin ? origin.name : null, destination: destination ? destination.name : null,
    originCode: origin ? origin.code : null, destinationCode: destination ? destination.code : null,
    status, currentIndex, currentStation, currentDelay, formation, tags, pathInfo, train,
    route, stops, routePoints, currentPosition, live,
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

// ── London routing (for the cross-London / last-mile TfL hop) ───────────────
// RTT gives the rail spine; TfL's free Journey Planner stitches the London end
// (tube, walk, bus, Elizabeth line, DLR …). A Greater-London bounding box marks
// whether a station sits on the TfL network, and the terminus map turns a
// board's destination/origin name into a CRS so we know where the train meets
// the Underground.
function isLondon(crs) {
  const l = stationLoc(crs);
  return !!l && l.lat > 51.28 && l.lat < 51.70 && l.lon > -0.56 && l.lon < 0.34;
}
const LONDON_TERMINI = {
  PAD: ['paddington'], KGX: ["king's cross", 'kings cross'], STP: ['st pancras'], EUS: ['euston'],
  MYB: ['marylebone'], WAT: ['waterloo'], VIC: ['victoria'], LST: ['liverpool street'],
  LBG: ['london bridge'], CHX: ['charing cross'], CST: ['cannon street'], FST: ['fenchurch street'],
  BFR: ['blackfriars'], CTK: ['city thameslink'], MOG: ['moorgate'],
};
function terminusFromPlace(place) {
  const p = (place || '').toLowerCase();
  for (const [crs, frags] of Object.entries(LONDON_TERMINI)) {
    if (frags.some((f) => p.includes(f))) return crs;
  }
  return null;
}
// London termini a board runs to (departures) / comes from (arrivals), soonest first.
function terminiOnBoard(board) {
  const seen = [], set = new Set();
  for (const s of (board.services || [])) {
    const crs = terminusFromPlace(s.place);
    if (crs && stationLoc(crs) && !set.has(crs)) { set.add(crs); seen.push(crs); }
  }
  return seen;
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

// Per-service "delay risk" — an honest heuristic from how this board is running
// *right now*: the service's own state, blended with how its operator and its
// route are currently performing. Not a forecast model; it reflects live
// conditions so a punctual-looking train on a struggling route still flags.
function annotateRisk(board) {
  const s = (board && board.services) || [];
  const byOp = {}, byRoute = {};
  for (const x of s) {
    const bad = x.cancelled || x.delay > ON_TIME_TOL;
    const o = (byOp[x.operatorCode] = byOp[x.operatorCode] || { n: 0, d: 0 });
    o.n++; if (bad) o.d++;
    const r = (byRoute[x.place] = byRoute[x.place] || { n: 0, d: 0 });
    r.n++; if (bad) r.d++;
  }
  for (const x of s) {
    if (x.cancelled) { x.risk = 100; x.riskLevel = 'cancelled'; continue; }
    const o = byOp[x.operatorCode] || { n: 1, d: 0 }, r = byRoute[x.place] || { n: 1, d: 0 };
    const base = x.delay > ON_TIME_TOL ? 0.85 : x.delay > 0 ? 0.45 : 0.12;
    const score = base * 0.45 + (o.d / o.n) * 0.3 + (r.d / r.n) * 0.25;
    x.risk = Math.min(99, Math.round(score * 100));
    x.riskLevel = x.risk >= 55 ? 'high' : x.risk >= 28 ? 'med' : 'low';
  }
  return board;
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
  // Red ("major") is reserved for genuinely severe disruption; amber ("minor")
  // carries the everyday delays so the map isn't a sea of red.
  let level = 'normal';
  if (avgDelay >= 30 || cancelPct >= 10 || onTimePct < 50) level = 'major';
  else if (avgDelay >= 12 || cancelPct >= 4 || onTimePct < 78) level = 'minor';
  const alerts = [];
  if (cancelPct >= 8) alerts.push('Cancellations');
  if (avgDelay >= 30) alerts.push('Severe delays');
  else if (avgDelay >= 15) alerts.push('Delays');
  if (onTimePct < 55) alerts.push('Low punctuality');
  const color = level === 'major' ? '#EF4444' : level === 'minor' ? '#F59E0B' : '#22C55E';
  return { level, color, onTimePct, avgDelay, cancelPct, alerts };
}

// Bucket a board into a short delay-over-time series for the live delay chart.
// (We only have a live snapshot, so this is delay by scheduled time across the
// board's window — an honest "expected delay" curve, not historical actuals.)
function delayTimeline(services) {
  const pts = (services || [])
    .filter((s) => !s.cancelled && s.scheduled)
    .map((s) => ({ m: parseHHMM(s.scheduled), d: Math.max(0, s.delay || 0), op: s.operator }))
    .filter((p) => p.m != null)
    .sort((a, b) => a.m - b.m);
  if (pts.length < 2) return { buckets: [], live: 0, peak: 0 };
  const lo = pts[0].m, hi = pts[pts.length - 1].m, range = Math.max(60, hi - lo), N = 16, step = range / N;
  const hhmm = (m) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
  const buckets = [];
  for (let i = 0; i < N; i++) {
    const a = lo + i * step, b = a + step;
    const inB = pts.filter((p) => p.m >= a && (i === N - 1 ? p.m <= b : p.m < b));
    // Worst operator in this slot, by total delay contributed then count.
    const opm = {};
    inB.forEach((p) => { const o = (opm[p.op] = opm[p.op] || { d: 0, n: 0 }); o.d += p.d; o.n++; });
    let top = null;
    for (const k of Object.keys(opm)) { if (!top || opm[k].d > opm[top].d || (opm[k].d === opm[top].d && opm[k].n > opm[top].n)) top = k; }
    buckets.push({
      avg: inB.length ? Math.round(inB.reduce((s, p) => s + p.d, 0) / inB.length) : 0,
      n: inB.length, from: hhmm(a), to: hhmm(b), top: top || null,
    });
  }
  return { buckets, live: Math.round(pts.reduce((s, p) => s + p.d, 0) / pts.length), peak: Math.max(0, ...buckets.map((b) => b.avg)) };
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
// Plain-language "travel advice" — reads the live picture (delays, cancellations,
// which operators/routes are worst, the weather and the next-2h trend) and says
// what it likely means for the traveller. Honest synthesis of the data already on
// the page, not a prediction model.
function stationInsights(o) {
  const out = [];
  const dep = o.depStats, arr = o.arrStats, st = o.status, w = o.weather;
  const cancelPct = Math.max(dep.cancelPct, arr.cancelPct);
  const avgDelay = Math.max(dep.avgDelay, arr.avgDelay);
  const disrupted = dep.delayed + dep.cancelled;

  if (st.level === 'major') out.push({ icon: '🔴', text: 'Significant disruption right now — allow plenty of extra time and check your specific train is still running before you set off.' });
  else if (st.level === 'minor') out.push({ icon: '🟠', text: 'Running a little behind — leave a few minutes’ buffer, especially with a tight connection.' });
  else out.push({ icon: '🟢', text: 'Services are running well — no need to allow more time than usual.' });

  if (cancelPct >= 8) out.push({ icon: '🚫', text: `Cancellations are elevated (${cancelPct}% of services) — have a backup train in mind.` });
  if (avgDelay >= 12) out.push({ icon: '⏱️', text: `Late trains are averaging about +${avgDelay} min — build that into any onward connection.` });

  const op = (o.disruptedOperators || [])[0], op2 = (o.disruptedOperators || [])[1];
  if (op && op.disrupted >= 3 && (!op2 || op.disrupted >= op2.disrupted * 2)) {
    out.push({ icon: '🚆', text: `Most disruption is on ${op.label} services${op.avgDelay ? ` (avg +${op.avgDelay} min)` : ''} — other operators here may be running better.` });
  }
  const rt = (o.disruptedRoutes || [])[0];
  if (rt && rt.disrupted >= 3 && rt.disrupted >= disrupted * 0.5) {
    out.push({ icon: '🧭', text: `Delays are concentrated on ${rt.label} trains — other destinations look less affected.` });
  }

  if (st.level !== 'normal' && w) {
    const windy = w.gustKmh >= 60 || w.windKmh >= 45;
    const wet = /rain|snow|drizzle|shower|thunder|sleet|hail/i.test(w.desc || '');
    if (windy) out.push({ icon: '💨', text: `Strong winds (gusts ${w.gustKmh} km/h) are a likely factor — speed restrictions and debris on the line are common in these conditions.` });
    else if (wet) out.push({ icon: '🌧️', text: `Wet weather (${(w.desc || '').toLowerCase()}) may be slowing things down — adhesion and speed restrictions can apply.` });
    else out.push({ icon: '🛠️', text: `Weather is calm (${(w.desc || '').toLowerCase()}), so this looks operational — signalling, a fault or knock-on delays — rather than weather-driven.` });
  }

  const tl = o.depTimeline;
  if (tl && tl.buckets && tl.buckets.length >= 6) {
    const half = Math.floor(tl.buckets.length / 2);
    const avgOf = (a) => { const v = a.filter((b) => b.n); return v.length ? v.reduce((s, b) => s + b.avg, 0) / v.length : 0; };
    const f = avgOf(tl.buckets.slice(0, half)), l = avgOf(tl.buckets.slice(half));
    if (l >= f + 5 && l >= 8) out.push({ icon: '📈', text: 'Delays are building over the next couple of hours — an earlier train may be the safer bet.' });
    else if (f >= l + 5 && f >= 8) out.push({ icon: '📉', text: 'Delays are easing off over the next couple of hours — a slightly later train may run better.' });
  }

  return out.slice(0, 4);
}

async function getOverview(crs) {
  crs = crs.toUpperCase().slice(0, 3);
  const loc = stationLoc(crs);
  const [dep, arr, weather] = await Promise.all([
    getBoard(crs, 'departures').catch(() => ({ crs, services: [] })),
    getBoard(crs, 'arrivals').catch(() => ({ crs, services: [] })),
    loc ? getWeather(loc.lat, loc.lon) : Promise.resolve(null),
  ]);
  const depStats = summarizeBoard(dep), arrStats = summarizeBoard(arr);
  const o = {
    crs, name: stationName(crs), city: cityFor(crs), loc, weather,
    dep, arr, depStats, arrStats, status: statusOf(depStats, arrStats),
    depTimeline: delayTimeline(dep.services), arrTimeline: delayTimeline(arr.services),
    disruptedRoutes: disruptedRoutes(dep).slice(0, 6),
    disruptedOperators: disruptedOperators(dep).slice(0, 6),
    busiestRoutes: busiestRoutes(dep).slice(0, 6),
    busiestOperators: busiestOperators(dep).slice(0, 6),
    operatorsServed: new Set(dep.services.map((s) => s.operatorCode).filter(Boolean)).size,
    destinationsServed: new Set(dep.services.map((s) => s.place)).size,
  };
  o.insights = stationInsights(o);
  return o;
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

// Direct journeys A → B. RTT's "to" filter lists trains from `from` that call
// at `to`; we enrich each with the arrival time at `to` from its service page.
// (Direct only — journeys needing a change need a routing engine / planner API.)
async function getJourney(from, to) {
  from = from.toUpperCase().slice(0, 3); to = to.toUpperCase().slice(0, 3);
  const date = today(), time = nowHHMM();
  const $ = cheerio.load(await fetchText(`${RTT}/search/detailed/gb-nr:${from}/to/gb-nr:${to}/${date}/${time}`));
  const base = [];
  for (const el of $('a.service').toArray()) {
    const m = ($(el).attr('href') || '').match(/gb-nr:(\w+)/);
    if (!m) continue;
    const toc = $(el).find('.toc').first().text().trim();
    base.push({ id: m[1], operatorCode: toc, operator: operatorName(toc), color: operatorColor(toc), headcode: $(el).find('.tid').first().text().trim() });
    if (base.length >= 8) break;
  }
  // Only offer trains that haven't departed yet (compare the *expected* time, so
  // a late-running train you can still catch stays in the list).
  const nowMin = parseHHMM(nowHHMM());
  const upcoming = (s) => { const d = parseHHMM(s.dep); return d == null || nowMin == null || (d - nowMin + 1440) % 1440 <= 720; };
  const services = (await Promise.all(base.map(async (s) => {
    try {
      const svc = await getService(s.id);
      const fromStop = svc.stops.find((x) => x.code === from) || svc.route.find((x) => x.code === from);
      const toStop = svc.stops.find((x) => x.code === to) || svc.route.find((x) => x.code === to);
      if (!fromStop || !toStop) return null;
      const dep = fromStop.realDep || fromStop.schedDep, arr = toStop.realArr || toStop.schedArr;
      const dm = parseHHMM(dep), am = parseHHMM(arr);
      const duration = dm != null && am != null ? (am - dm + 1440) % 1440 : null;
      const stopsBetween = svc.stops.filter((x) => {
        const i = svc.stops.indexOf(fromStop), j = svc.stops.indexOf(toStop);
        return svc.stops.indexOf(x) > i && svc.stops.indexOf(x) < j;
      }).length;
      return {
        ...s, dep, arr, duration, depDelay: fromStop.delay || 0, arrDelay: toStop.delay || 0,
        platform: fromStop.platform || null, finalDestination: svc.destination,
        status: svc.status, cancelled: /cancel/i.test(svc.status || ''), intermediateStops: stopsBetween,
      };
    } catch { return null; }
  }))).filter(Boolean).filter(upcoming).sort((a, b) => (parseHHMM(a.dep) || 0) - (parseHHMM(b.dep) || 0));
  return { from, to, fromName: stationName(from), toName: stationName(to), generatedAt: new Date().toISOString(), services };
}

// ── TfL Journey Planner (free; keyless, or richer with TFL_APP_KEY) ─────────
// Covers the London end: walking, tube, bus, Elizabeth line, DLR, Overground.
// Outside Greater London it returns no journey — which is exactly why we use it
// only for the last mile and lean on RTT for the national rail spine.
const TFL = 'https://api.tfl.gov.uk';
function tflAuth() {
  const k = process.env.TFL_APP_KEY;
  return k ? `?app_key=${encodeURIComponent(k)}` : '';
}
function decodeLineString(path) {
  try {
    const pts = JSON.parse((path && path.lineString) || 'null');
    if (Array.isArray(pts)) return pts.filter((p) => Array.isArray(p) && p.length >= 2).slice(0, 300);
  } catch { /* ignore malformed geometry */ }
  return null;
}
function simplifyTflLeg(leg) {
  const mode = (leg.mode && leg.mode.name) || 'walking';
  const ro = (leg.routeOptions && leg.routeOptions[0]) || {};
  const out = {
    mode, line: ro.name || (ro.lineIdentifier && ro.lineIdentifier.name) || null,
    title: (leg.instruction && leg.instruction.summary) || null,
    from: (leg.departurePoint && leg.departurePoint.commonName) || null,
    to: (leg.arrivalPoint && leg.arrivalPoint.commonName) || null,
    duration: Math.max(0, Math.round(leg.duration || 0)),
    dist: leg.distance ? Math.round(leg.distance) : null,
  };
  // For walking legs, carry the route geometry + turn-by-turn steps so the
  // client can draw an in-app walking map and track the user along it.
  if (mode === 'walking') {
    out.path = decodeLineString(leg.path);
    const steps = (leg.instruction && leg.instruction.steps) || [];
    out.steps = steps.slice(0, 60).map((s) => ({
      head: s.descriptionHeading || null, st: s.streetName || null, d: s.description || null,
      turn: s.turnDirection || null, m: s.distance ? Math.round(s.distance) : null,
      lat: s.latitude, lon: s.longitude,
    }));
  }
  return out;
}
async function getTflJourney(fromLoc, toLoc) {
  if (!fromLoc || !toLoc) return null;
  const f = `${fromLoc.lat},${fromLoc.lon}`, t = `${toLoc.lat},${toLoc.lon}`;
  const url = `${TFL}/Journey/JourneyResults/${f}/to/${t}${tflAuth()}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'rail-tracker (+https://railtracker.uk)' } });
    if (!r.ok) return null;
    const j = await r.json();
    const journeys = (j.journeys || []).slice().sort((a, b) => (a.duration || 1e9) - (b.duration || 1e9));
    if (!journeys.length) return null;
    const legs = (journeys[0].legs || []).map(simplifyTflLeg).filter((l) => l.duration > 0 || l.mode !== 'walking');
    if (!legs.length) return null;
    return { duration: journeys[0].duration || legs.reduce((a, l) => a + l.duration, 0), legs };
  } catch { return null; }
}

// ── TfL line-status disruptions (free) ──────────────────────────────────────
// The operator-communication "callout" you'd otherwise hop to Citymapper for —
// e.g. "Elizabeth line: No service to Heathrow Terminals due to a fire alert".
// Covers tube, Elizabeth line, Overground, DLR and tram (National Rail operator
// messages such as Heathrow Express need Darwin — see README).
const tflStatusCache = new Map();
async function getTflLineStatus(modes) {
  const key = modes.slice().sort().join(',');
  if (!key) return {};
  const hit = tflStatusCache.get(key);
  if (hit && Date.now() - hit.t < 90_000) return hit.v;
  const out = {};
  try {
    const r = await fetch(`${TFL}/Line/Mode/${encodeURIComponent(key)}/Status${tflAuth()}`, { headers: { 'User-Agent': 'rail-tracker (+https://railtracker.uk)' } });
    if (r.ok) {
      for (const ln of await r.json()) {
        const bad = (ln.lineStatuses || []).find((s) => (s.statusSeverity != null ? s.statusSeverity < 10 : s.statusSeverityDescription && s.statusSeverityDescription !== 'Good Service'));
        if (bad) {
          const k = (ln.name || '').toLowerCase().replace(/ line$/, '').trim();
          out[k] = { line: ln.name, severity: bad.statusSeverityDescription, reason: (bad.reason || '').replace(/\s+/g, ' ').trim() };
        }
      }
    }
  } catch { /* disruptions are best-effort */ }
  tflStatusCache.set(key, { v: out, t: Date.now() });
  return out;
}
// Tag a TfL journey's legs with any active line disruption; return the alert list.
async function annotateTflDisruptions(tfl) {
  if (!tfl || !tfl.legs) return [];
  const want = new Set(['tube', 'elizabeth-line', 'dlr', 'overground', 'tram']);
  const modes = [...new Set(tfl.legs.map((l) => l.mode).filter((m) => want.has(m)))];
  if (!modes.length) return [];
  const status = await getTflLineStatus(modes);
  const norm = (s) => (s || '').toLowerCase().replace(/ line$/, '').trim();
  const alerts = [];
  for (const l of tfl.legs) {
    const k = l.line ? norm(l.line) : (l.mode === 'elizabeth-line' ? 'elizabeth' : l.mode === 'dlr' ? 'dlr' : null);
    const a = k && status[k];
    if (a) { l.alert = a; if (!alerts.some((x) => x.line === a.line)) alerts.push(a); }
  }
  return alerts;
}

// ── Door-to-door journey planner ────────────────────────────────────────────
// Rail spine (RTT) + cross-London / last-mile (TfL), assembled into multi-leg
// plans with a total door-to-door time. Handles: direct trains, intra-London
// (TfL only), regional → London (train → tube) and London → regional
// (tube → train). A regional change away from London isn't routed yet.
function trainLeg(s, fromCRS, toCRS) {
  return {
    mode: 'train', operator: s.operator, operatorCode: s.operatorCode, color: s.color,
    headcode: s.headcode, serviceId: s.id,
    from: stationName(fromCRS), fromCode: fromCRS, to: stationName(toCRS), toCode: toCRS,
    dep: fmtMins(s.dep), arr: fmtMins(s.arr), duration: s.duration,
    platform: s.platform || null, depDelay: s.depDelay || 0, arrDelay: s.arrDelay || 0,
    intermediateStops: s.intermediateStops || 0, status: s.status, cancelled: !!s.cancelled,
    finalDestination: s.finalDestination || null,
  };
}
// Stamp clock times onto a run of duration-only legs, starting at `startHHMM`.
function chainAfter(startHHMM, legs) {
  let clock = startHHMM;
  return legs.map((l) => {
    const dep = clock, arr = addMins(clock, l.duration);
    clock = arr || clock;
    return { ...l, dep, arr };
  });
}
function planTotals(legs) {
  const veh = legs.filter((l) => l.mode !== 'walking').length;
  const depart = legs[0].dep, arrive = legs[legs.length - 1].arr;
  const dm = parseHHMM(depart), am = parseHHMM(arrive);
  return { depart, arrive, duration: dm != null && am != null ? (am - dm + 1440) % 1440 : null, changes: Math.max(0, veh - 1) };
}

async function getJourneyPlan(from, to) {
  from = from.toUpperCase().slice(0, 3); to = to.toUpperCase().slice(0, 3);
  const meta = { from, to, fromName: stationName(from), toName: stationName(to), generatedAt: new Date().toISOString() };
  const fromLoc = stationLoc(from), toLoc = stationLoc(to);
  const now = () => fmtMins(nowHHMM());

  // 1) Direct trains win outright.
  const direct = await getJourney(from, to).catch(() => ({ services: [] }));
  if (direct.services && direct.services.length) {
    const plans = direct.services.slice(0, 6).map((s) => {
      const legs = [trainLeg(s, from, to)];
      return { kind: 'direct', via: null, ...planTotals(legs), legs };
    });
    // A direct service run by a TfL mode (Elizabeth line, Overground) can still
    // carry a line disruption worth flagging.
    const tflMode = { XR: 'elizabeth-line', LO: 'overground' }[direct.services[0].operatorCode];
    const alerts = tflMode ? Object.values(await getTflLineStatus([tflMode])).slice(0, 3) : [];
    return { ...meta, mode: 'direct', alerts, plans };
  }

  // 2) Both ends inside London → a pure TfL journey (no train).
  if (isLondon(from) && isLondon(to)) {
    const t = await getTflJourney(fromLoc, toLoc);
    if (t) {
      const alerts = await annotateTflDisruptions(t);
      const legs = chainAfter(now(), t.legs);
      return { ...meta, mode: 'london', alerts, plans: [{ kind: 'london', via: null, ...planTotals(legs), legs }] };
    }
  }

  // 3) Regional → London: train to a terminus, then TfL across town. Try the
  // candidate termini and keep whichever delivers the earliest arrival, so a
  // faster route (e.g. via Paddington) beats one that merely departs sooner
  // (e.g. via Waterloo).
  if (toLoc && isLondon(to) && !isLondon(from)) {
    const board = await getBoard(from, 'departures').catch(() => ({ services: [] }));
    const nowM = parseHHMM(nowHHMM());
    const fromNow = (hhmm) => { const m = parseHHMM(hhmm); return m == null ? 1e9 : (m - nowM + 1440) % 1440; };
    let best = null;
    for (const terminus of terminiOnBoard(board).slice(0, 2)) {
      const rail = await getJourney(from, terminus).catch(() => ({ services: [] }));
      if (!rail.services || !rail.services.length) continue;
      const tfl = await getTflJourney(stationLoc(terminus), toLoc);
      if (!tfl) continue;
      const alerts = await annotateTflDisruptions(tfl);
      const plans = rail.services.slice(0, 4).map((s) => {
        const t = trainLeg(s, from, terminus);
        const legs = [t, ...chainAfter(t.arr, tfl.legs)];
        return { kind: 'via', via: terminus, viaName: stationName(terminus), ...planTotals(legs), legs };
      });
      const earliest = Math.min(...plans.map((p) => fromNow(p.arrive)));
      if (!best || earliest < best.earliest) best = { terminus, plans, earliest, alerts };
    }
    if (best) return { ...meta, mode: 'via', via: best.terminus, viaName: stationName(best.terminus), alerts: best.alerts, plans: best.plans };
  }

  // 4) London → regional: TfL to the terminus, then a train out.
  if (fromLoc && isLondon(from) && !isLondon(to)) {
    const board = await getBoard(to, 'arrivals').catch(() => ({ services: [] }));
    for (const terminus of terminiOnBoard(board).slice(0, 2)) {
      const tfl = await getTflJourney(fromLoc, stationLoc(terminus));
      if (!tfl) continue;
      const alerts = await annotateTflDisruptions(tfl);
      const access = chainAfter(now(), tfl.legs);
      const readyAt = parseHHMM(access[access.length - 1].arr);
      const rail = await getJourney(terminus, to).catch(() => ({ services: [] }));
      const usable = (rail.services || []).filter((s) => {
        const d = parseHHMM(fmtMins(s.dep));
        return d != null && readyAt != null && (d - readyAt + 1440) % 1440 < 720; // departs after we get there
      }).slice(0, 4);
      if (!usable.length) continue;
      const plans = usable.map((s) => {
        const legs = [...access, trainLeg(s, terminus, to)];
        return { kind: 'via', via: terminus, viaName: stationName(terminus), ...planTotals(legs), legs };
      });
      return { ...meta, mode: 'via', via: terminus, viaName: stationName(terminus), alerts, plans };
    }
  }

  // Nothing we can stitch yet (e.g. a regional change away from London).
  return { ...meta, mode: 'none', plans: [] };
}

// ── Ticketing deep-links (Trainline, prefilled booking) ─────────────────────
// Trainline's prefilled /book/results URL needs its internal location URNs, not
// CRS. Resolve them via Trainline's public locations-search API (matched to our
// CRS via `shortName`) and memoise — station→URN is stable. Falls back to the
// route "train-times" page if resolution fails, so the link always works.
const TL_URN = new Map();
function tlSlug(s) {
  return (s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
async function trainlineUrn(crs, name) {
  crs = (crs || '').toUpperCase();
  if (TL_URN.has(crs)) return TL_URN.get(crs);
  let urn = null;
  try {
    const url = `https://www.thetrainline.com/api/locations-search/v2/search?searchTerm=${encodeURIComponent(name || crs)}&locale=en-gb`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      const locs = (j.searchLocations || []).filter((l) => l.locationType === 'station');
      const hit = locs.find((l) => (l.shortName || '').toUpperCase() === crs) || locs[0];
      if (hit && hit.code) urn = hit.code;
    }
  } catch { /* fall back to the route page */ }
  TL_URN.set(crs, urn);
  return urn;
}
async function getTrainlineUrl(fromCrs, toCrs, date, time) {
  fromCrs = (fromCrs || '').toUpperCase(); toCrs = (toCrs || '').toUpperCase();
  const fromName = stationName(fromCrs), toName = stationName(toCrs);
  const [fu, tu] = await Promise.all([trainlineUrn(fromCrs, fromName), trainlineUrn(toCrs, toName)]);
  if (fu && tu) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today();
    const t = /^\d{2}:\d{2}$/.test(time || '') ? time : '08:00';
    const p = new URLSearchParams();
    p.set('origin', fu); p.set('destination', tu);
    p.set('outwardDate', `${d}T${t}:00`); p.set('outwardDateType', 'departAfter');
    p.set('journeySearchType', 'single'); p.append('passengers[]', '1990-01-01');
    return `https://www.thetrainline.com/book/results?${p.toString()}`;
  }
  return `https://www.thetrainline.com/train-times/${tlSlug(fromName)}-to-${tlSlug(toName)}`;
}

module.exports = {
  STATIONS, LOCATIONS, TOC, MAJOR,
  stationName, stationLoc, cityFor, allStations, allLocations, searchStations, nearby,
  operatorName, operatorColor, operatorList, operatorCodeFromName,
  getBoard, getService, getOverview, getDisruptions, getWeather, getJourney, getJourneyPlan, getTrainlineUrl, getTflLineStatus,
  summarizeBoard, disruptedRoutes, disruptedOperators, busiestRoutes, busiestOperators, statusOf,
  fmtMins, parseHHMM, haversine, isLondon,
};
