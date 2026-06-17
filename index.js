const express = require('express');
const cors = require('cors');
const rail = require('./lib/rail');
const views = require('./lib/views');

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

// ── API ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', stations: Object.keys(rail.STATIONS).length, operators: Object.keys(rail.TOC).length });
});

app.get('/api/stations', (req, res) => res.json(rail.allStations()));
app.get('/api/locations', (req, res) => res.json(rail.allLocations()));
app.get('/api/search', (req, res) => res.json(rail.searchStations(req.query.q || '')));

app.get('/api/nearby', (req, res) => {
  const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' });
  res.json(rail.nearby(lat, lon, Math.min(parseInt(req.query.n, 10) || 12, 30)));
});

async function serveBoardJson(req, res, mode) {
  const crs = crsOf(req.params.crs);
  if (!rail.stationName(crs)) return res.status(404).json({ error: 'unknown station' });
  try {
    res.json(await cached(`b:${crs}:${mode}`, BOARD_TTL, () => rail.getBoard(crs, mode)));
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
    res.json(await cached('disruptions', DISRUPTIONS_TTL, () => rail.getDisruptions()));
  } catch (e) {
    res.status(502).json({ error: 'failed to fetch disruptions' });
  }
});

app.get('/api/weather', async (req, res) => {
  const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' });
  res.json((await rail.getWeather(lat, lon)) || {});
});

app.get('/api/service/:id', async (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9]/g, '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : undefined;
  try {
    const svc = await cached(`s:${id}:${date || 'today'}`, SERVICE_TTL, () => rail.getService(id, date));
    // Trim for polling clients.
    res.json({
      id: svc.id, status: svc.status, currentStation: svc.currentStation,
      currentPosition: svc.currentPosition, currentDelay: svc.currentDelay,
      stops: svc.stops.map((s) => ({ name: s.name, state: s.state, delay: s.delay })),
    });
  } catch (e) {
    res.status(502).json({ error: `failed to fetch service ${id}` });
  }
});

// ── Pages ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send(views.renderDisruptions()));
app.get('/about', (req, res) => res.send(views.renderAbout()));
app.get('/map', (req, res) => res.send(views.renderMap()));

app.get('/operators', (req, res) => res.send(views.renderOperators(rail.operatorList())));
app.get('/operator/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase().slice(0, 2);
  const info = rail.TOC[code];
  if (!info) return res.status(404).send(views.render404(code));
  const sample = ['PAD', 'KGX', 'EUS', 'VIC', 'WAT', 'LST', 'MAN', 'BHM', 'EDB', 'GLC', 'LDS', 'BRI'].filter((c) => rail.stationName(c));
  res.send(views.renderOperator(code, info, sample));
});

app.get('/station/:crs', async (req, res) => {
  const crs = crsOf(req.params.crs);
  if (!rail.stationName(crs)) return res.status(404).send(views.render404(crs));
  try {
    const o = await cached(`o:${crs}`, OVERVIEW_TTL, () => rail.getOverview(crs));
    res.send(views.renderOverview(o));
  } catch (e) {
    res.status(502).send(views.renderError('Live data unavailable', `We couldn't reach the data feed for ${rail.stationName(crs)}. Please try again in a moment.`));
  }
});

async function serveBoardPage(req, res, mode) {
  const crs = crsOf(req.params.crs);
  if (!rail.stationName(crs)) return res.status(404).send(views.render404(crs));
  try {
    const board = await cached(`b:${crs}:${mode}`, BOARD_TTL, () => rail.getBoard(crs, mode));
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
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
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
