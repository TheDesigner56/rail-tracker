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

module.exports = {
  STATIONS, LOCATIONS, TOC,
  stationName, stationLoc, allStations, allLocations, searchStations, nearby,
  operatorName, operatorColor, operatorList, operatorCodeFromName,
  getBoard, getService, fmtMins, parseHHMM, haversine,
};
