const express = require('express');
const cors = require('cors');
const path = require('path');
const { findTrains } = require('trainspy');

const app = express();

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

// ── Export for Vercel ──
module.exports = app;
