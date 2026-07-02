const express = require('express');
const cors = require('cors');
const rail = require('./lib/rail');
const views = require('./lib/views');
const db = require('./lib/db');
const push = require('./lib/push');
const tripcheck = require('./lib/tripcheck');

const app = express();
app.use(cors());
app.use(express.json());

// ── Tiny in-memory cache (best-effort across warm serverless invocations) ──
const cache = new Map();
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return Promise.resolve(hit.v);
  return Promise.resolve(fn()).then((v) => { cache.set(key, { v, t: Date.now() }); return v; });
}
const BOARD_TTL = 45_000;
const SERVICE_TTL = 15_000;
const OVERVIEW_TTL = 45_000;
const DISRUPTIONS_TTL = 120_000;

const crsOf = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);

// Everything here is public and personalisation-free, so let the CDN absorb
// repeat traffic: cache at the edge for `secs`, serve stale while revalidating.
const edge = (res, secs, swr = secs * 4) =>
  res.set('Cache-Control', `public, s-maxage=${secs}, stale-while-revalidate=${swr}`);

// ── API ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', stations: Object.keys(rail.STATIONS).length, operators: Object.keys(rail.TOC).length });
});

app.get('/api/stations', (req, res) => { edge(res, 86400); res.json(rail.allStations()); });
app.get('/api/locations', (req, res) => { edge(res, 86400); res.json(rail.allLocations()); });
app.get('/api/search', (req, res) => { edge(res, 3600); res.json(rail.searchStations(req.query.q || '')); });

app.get('/api/nearby', (req, res) => {
  const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' });
  edge(res, 86400);
  res.json(rail.nearby(lat, lon, Math.min(parseInt(req.query.n, 10) || 12, 30)));
});

const atOf = (q) => (/^\d{3,4}$/.test(q || '') ? String(q).padStart(4, '0') : '');
async function serveBoardJson(req, res, mode) {
  const crs = crsOf(req.params.crs);
  if (!rail.stationName(crs)) return res.status(404).json({ error: 'unknown station' });
  const at = atOf(req.query.at);
  try {
    const board = await cached(`b:${crs}:${mode}:${at || 'now'}`, BOARD_TTL, () => rail.getBoard(crs, mode, at || undefined));
    edge(res, 30);
    res.json(board);
  } catch (e) {
    res.status(502).json({ error: `failed to fetch board for ${crs}` });
  }
}
app.get('/api/board/:crs', (req, res) => serveBoardJson(req, res, req.query.mode === 'arrivals' ? 'arrivals' : 'departures'));
// Back-compat aliases for the previous API shape.
app.get('/api/departures/:crs', (req, res) => serveBoardJson(req, res, 'departures'));
app.get('/api/arrivals/:crs', (req, res) => serveBoardJson(req, res, 'arrivals'));

app.get('/api/disruptions', async (req, res) => {
  try {
    const d = await cached('disruptions', DISRUPTIONS_TTL, () => rail.getDisruptions());
    edge(res, 60);
    res.json(d);
  } catch (e) {
    res.status(502).json({ error: 'failed to fetch disruptions' });
  }
});

app.get('/api/weather', async (req, res) => {
  const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' });
  edge(res, 600);
  res.json((await rail.getWeather(lat, lon)) || {});
});

app.get('/api/service/:id', async (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9]/g, '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : undefined;
  try {
    const svc = await cached(`s:${id}:${date || 'today'}`, SERVICE_TTL, () => rail.getService(id, date));
    edge(res, 15);
    // Trim for polling clients.
    res.json({
      id: svc.id, status: svc.status, currentStation: svc.currentStation,
      currentPosition: svc.currentPosition, currentDelay: svc.currentDelay, live: svc.live,
      stops: svc.stops.map((s) => ({ name: s.name, state: s.state, delay: s.delay, arr: s.realArr || s.schedArr, arrived: s.arrived })),
    });
  } catch (e) {
    res.status(502).json({ error: `failed to fetch service ${id}` });
  }
});

// ── Pages ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => { edge(res, 600); res.send(views.renderHome()); });
app.get('/disruptions', (req, res) => { edge(res, 300); res.send(views.renderDisruptions()); });
app.get('/about', (req, res) => { edge(res, 3600); res.send(views.renderAbout()); });

app.get('/api/journey', async (req, res) => {
  const from = crsOf(req.query.from), to = crsOf(req.query.to);
  if (!rail.stationName(from) || !rail.stationName(to)) return res.status(400).json({ error: 'valid from and to required' });
  if (from === to) return res.status(400).json({ error: 'from and to must differ' });
  try {
    const j = await cached(`j:${from}:${to}`, 30_000, () => rail.getJourney(from, to));
    edge(res, 30);
    res.json(j);
  } catch (e) {
    res.status(502).json({ error: 'failed to plan journey' });
  }
});

// Multi-modal door-to-door planner: rail spine (RTT) + cross-London (TfL).
app.get('/api/plan', async (req, res) => {
  const from = crsOf(req.query.from), to = crsOf(req.query.to);
  if (!rail.stationName(from) || !rail.stationName(to)) return res.status(400).json({ error: 'valid from and to required' });
  if (from === to) return res.status(400).json({ error: 'from and to must differ' });
  try {
    const p = await cached(`p:${from}:${to}`, 60_000, () => rail.getJourneyPlan(from, to));
    edge(res, 45);
    res.json(p);
  } catch (e) {
    res.status(502).json({ error: 'failed to plan journey' });
  }
});

// Hand off to a Trainline booking prefilled with the journey: resolves
// Trainline's location URNs server-side, then deep-links into /book/results
// (stations + date/time already filled). Falls back to the route page.
app.get('/go/trainline', async (req, res) => {
  const from = crsOf(req.query.from), to = crsOf(req.query.to);
  if (!rail.stationName(from) || !rail.stationName(to)) return res.redirect(302, 'https://www.thetrainline.com/');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : undefined;
  const time = /^\d{2}:\d{2}$/.test(req.query.time || '') ? req.query.time : undefined;
  try {
    res.redirect(302, await rail.getTrainlineUrl(from, to, date, time));
  } catch {
    res.redirect(302, 'https://www.thetrainline.com/');
  }
});
// ── Trip tracker: saved trips + Web Push proactive alerts ──────────────────
const ownerOf = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
function ukParts() {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
  return p;
}

app.get('/api/push/vapid', (req, res) => res.json({ key: push.publicKey(), enabled: push.configured() }));

app.post('/api/push/subscribe', async (req, res) => {
  const owner = ownerOf(req.body.owner);
  const s = req.body.subscription || {};
  if (!owner || !s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) return res.status(400).json({ error: 'invalid subscription' });
  try {
    await db.saveSub({ owner, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, user_agent: String(req.get('user-agent') || '').slice(0, 200) });
    res.json({ ok: true });
  } catch (e) { res.status(503).json({ error: 'storage unavailable' }); }
});

app.post('/api/trips', async (req, res) => {
  const owner = ownerOf(req.body.owner);
  const b = req.body || {};
  if (!owner || !Array.isArray(b.legs) || !b.legs.length || !/^\d{4}-\d{2}-\d{2}$/.test(b.travel_date || '')) return res.status(400).json({ error: 'invalid trip' });
  try {
    const trip = await db.saveTrip({
      owner, name: String(b.name || '').slice(0, 120) || null, travel_date: b.travel_date,
      origin: String(b.origin || '').slice(0, 120), destination: String(b.destination || '').slice(0, 120),
      depart: String(b.depart || '').slice(0, 5), arrive: String(b.arrive || '').slice(0, 5),
      legs: b.legs.slice(0, 12), notified: {},
    });
    res.json({ ok: true, trip });
  } catch (e) { res.status(503).json({ error: 'storage unavailable' }); }
});

app.get('/api/trips', async (req, res) => {
  const owner = ownerOf(req.query.owner);
  if (!owner) return res.json({ trips: [] });
  res.json({ trips: await db.listTrips(owner) });
});

app.delete('/api/trips/:id', async (req, res) => {
  const owner = ownerOf(req.query.owner);
  if (!owner) return res.status(400).json({ error: 'owner required' });
  await db.deleteTrip(req.params.id, owner);
  res.json({ ok: true });
});

// On-demand check (used by the Trips page to refresh a trip's live status).
app.post('/api/trips/:id/check', async (req, res) => {
  const trip = await db.getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'not found' });
  try { res.json(await tripcheck.checkTrip(trip)); }
  catch (e) { res.status(502).json({ error: 'check failed' }); }
});

// Scheduled checker — invoked by an external cron (Supabase pg_cron / GitHub
// Actions) every ~15 min. Decides which advance notifications are due and pushes.
app.get('/api/cron/check', async (req, res) => {
  if (!process.env.CRON_SECRET || req.query.secret !== process.env.CRON_SECRET) return res.status(403).json({ error: 'forbidden' });
  const p = ukParts();
  const today = `${p.year}-${p.month}-${p.day}`;
  const tmrw = (() => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const nowMin = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
  let checked = 0, sent = 0;
  try {
    const trips = await db.activeTrips();
    for (const trip of trips) {
      const done = trip.notified || {};
      const depMin = /^\d{2}:\d{2}/.test(trip.depart || '') ? parseInt(trip.depart.slice(0, 2), 10) * 60 + parseInt(trip.depart.slice(3, 5), 10) : null;
      let kind = null;
      if (trip.travel_date === tmrw && !done.day_before && nowMin >= 1080 && nowMin <= 1290) kind = 'day_before';
      else if (trip.travel_date === today && depMin != null) {
        const until = depMin - nowMin;
        if (!done.predepart && until >= 0 && until <= 75) kind = 'predepart';
        else if (!done.morning && nowMin >= 360 && nowMin <= 600 && until > 75) kind = 'morning';
      }
      if (!kind) continue;
      checked++;
      const result = await tripcheck.checkTrip(trip).catch(() => ({ worst: 'ok', issues: [], summary: 'Trip saved.' }));
      const subs = await db.subsFor(trip.owner);
      const route = trip.name || `${trip.origin} → ${trip.destination}`;
      const lead = kind === 'day_before' ? 'Tomorrow' : kind === 'morning' ? 'Today' : 'Leaving soon';
      const title = `${result.worst === 'major' ? '⚠️ ' : ''}${lead}: ${route}`;
      const body = result.summary + (result.issues.length > 1 ? ` (+${result.issues.length - 1} more)` : '');
      for (const sub of subs) {
        const r = await push.send(sub, { title, body, url: '/trips', tag: `trip-${trip.id}` });
        if (r.ok) sent++; else if (r.gone) await db.removeSub(sub.endpoint);
      }
      await db.markTrip(trip.id, { notified: { ...done, [kind]: true }, last_checked: new Date().toISOString(), last_summary: result.summary });
    }
    res.json({ ok: true, trips: trips.length, checked, sent });
  } catch (e) { res.status(500).json({ error: 'cron failed' }); }
});

// Service worker (must be served from the origin root for scope) + PWA manifest.
app.get('/sw.js', (req, res) => res.type('application/javascript').set('Cache-Control', 'no-cache').send(views.SW_JS));
app.get('/manifest.webmanifest', (req, res) => { edge(res, 86400); res.type('application/manifest+json').send(views.MANIFEST_JSON); });

app.get('/trips', (req, res) => { edge(res, 3600); res.send(views.renderTrips()); });

app.get('/map', (req, res) => { edge(res, 3600); res.send(views.renderMap()); });

app.get('/operators', (req, res) => { edge(res, 3600); res.send(views.renderOperators(rail.operatorList())); });
app.get('/operator/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase().slice(0, 2);
  const info = rail.TOC[code];
  if (!info) return res.status(404).send(views.render404(code));
  const sample = ['PAD', 'KGX', 'EUS', 'VIC', 'WAT', 'LST', 'MAN', 'BHM', 'EDB', 'GLC', 'LDS', 'BRI'].filter((c) => rail.stationName(c));
  edge(res, 3600);
  res.send(views.renderOperator(code, info, sample));
});

app.get('/station/:crs', async (req, res) => {
  const crs = crsOf(req.params.crs);
  if (!rail.stationName(crs)) return res.status(404).send(views.render404(crs));
  try {
    const o = await cached(`o:${crs}`, OVERVIEW_TTL, () => rail.getOverview(crs));
    edge(res, 45);
    res.send(views.renderOverview(o));
  } catch (e) {
    res.status(502).send(views.renderError('Live data unavailable', `We couldn't reach the data feed for ${rail.stationName(crs)}. Please try again in a moment.`));
  }
});

async function serveBoardPage(req, res, mode) {
  const crs = crsOf(req.params.crs);
  if (!rail.stationName(crs)) return res.status(404).send(views.render404(crs));
  const at = atOf(req.query.at);
  try {
    const board = await cached(`b:${crs}:${mode}:${at || 'now'}`, BOARD_TTL, () => rail.getBoard(crs, mode, at || undefined));
    edge(res, 30);
    res.send(views.renderBoard(board));
  } catch (e) {
    res.status(502).send(views.renderError('Live data unavailable', `We couldn't reach the data feed for ${rail.stationName(crs)}. Please try again in a moment.`));
  }
}
app.get('/station/:crs/departures', (req, res) => serveBoardPage(req, res, 'departures'));
app.get('/station/:crs/arrivals', (req, res) => serveBoardPage(req, res, 'arrivals'));

app.get('/service/:id', async (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9]/g, '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : undefined;
  try {
    const svc = await cached(`s:${id}:${date || 'today'}`, SERVICE_TTL, () => rail.getService(id, date));
    if (!svc.route.length) return res.status(404).send(views.renderError('Service not found', 'This service may have finished or the identifier is invalid.'));
    edge(res, 15);
    res.send(views.renderService(svc));
  } catch (e) {
    res.status(502).send(views.renderError('Tracking unavailable', "We couldn't load this service right now. Please try again."));
  }
});
// Back-compat: the old tracker route.
app.get('/track/:id', (req, res) => res.redirect(301, `/service/${req.params.id}`));

// ── SEO ─────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  edge(res, 86400);
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  edge(res, 86400);
  const statics = ['/', '/map', '/operators', '/about'];
  const urls = [
    ...statics.map((u) => `  <url><loc>${base}${u}</loc></url>`),
    ...rail.allStations().map(({ code }) => `  <url><loc>${base}/station/${code}</loc><changefreq>hourly</changefreq></url>`),
  ].join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
});

app.use((req, res) => res.status(404).send(views.render404('')));

module.exports = app;

// Allow running directly for local dev: `node index.js`
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Rail Tracker on http://localhost:${port}`));
}
