# Rail Tracker

Fast, mobile-first **live UK train tracker** — departures and arrivals for every
station in Great Britain, plus full route tracking for individual services. Think
[bustimes.org](https://bustimes.org), but for the railway.

Light, card-based dashboard UI (inspired by Flighty's Airports product).

## Features

- **Door-to-door journey planner** — plan A → B across the whole network, even
  when there's no direct train. The live rail leg (Realtime Trains) is stitched
  to the cross-London / last-mile hop — tube, bus, walking, Elizabeth line, DLR
  — via Transport for London's free Journey Planner, and presented as a
  Citymapper-style multi-leg itinerary with a total door-to-door time. Handles
  direct trains, intra-London hops, regional → London (train → tube) and
  London → regional (tube → train). **Live disruption callouts** — the operator
  service message for an affected tube / Elizabeth line / Overground / DLR leg
  (from TfL's line-status feed) — surface inline, so you see *"Elizabeth line:
  no service to Heathrow Terminals…"* without leaving the app. (National Rail
  operator messages, e.g. Heathrow Express, would need a free Darwin token.)
- **Disruptions landing** — major GB stations on a live map, colour-coded by
  status, plus a delay table (departure/arrival average delay, on-time %,
  cancellations and derived alerts).
- **Station Overview** — per-station dashboard: operational status, departure &
  arrival on-time performance, most-disrupted routes & operators, busiest
  routes, current weather, and live board previews.
- **Live boards** — real-time departures & arrivals for 2,500+ stations, with
  platforms, delays, cancellations, operator and headcode. One upstream request
  per board (fast).
- **Track any train** — tap a service to open its trip page: every calling point
  with scheduled vs expected times, the train's progress, formation (unit
  numbers), and a live position marker on a map.
- **Network map** — every station on an interactive map; tap for live times.
- **Operators** — every train operating company, colour-coded across the app.
- **Search** — type-ahead station search by name or CRS code (⌘K), anywhere.

## Architecture

```
index.js        Express app + routes (the Vercel entrypoint)
lib/rail.js     Data layer — fetches & parses realtimetrains.co.uk
lib/views.js    Server-rendered HTML (dark, mobile-first UI)
```

- Server-rendered HTML for fast first paint and full crawlability; progressive
  enhancement (search, geolocation, live map polling) where JS is available.
- Live data comes from Network Rail's train describer / timetable feeds via
  [Realtime Trains](https://www.realtimetrains.co.uk/), parsed with `cheerio`.
- Station names & coordinates ship with the `trainspy` dependency (2,595
  stations with lat/lon).

## Develop

```bash
npm install
node index.js            # http://localhost:3000
```

## Key routes

| Route | Description |
| --- | --- |
| `/` | Major Stations & Disruptions (map + delay table) |
| `/station/:crs` | Station Overview dashboard (e.g. `/station/PAD`) |
| `/station/:crs/departures` · `/station/:crs/arrivals` | Live boards |
| `/service/:id` | Service trip page + live map |
| `/map` | All-stations network map |
| `/operators`, `/operator/:code` | Operator directory |
| `/api/plan?from=&to=` | Multi-modal door-to-door journey plan (JSON) |
| `/api/disruptions` | Major-station status summary (map + table) |
| `/api/board/:crs?mode=` | Board JSON |
| `/api/service/:id` | Live service position + calling points JSON |
| `/api/weather?lat=&lon=` · `/api/nearby?lat=&lon=` | Weather / nearest stations |
| `/api/search?q=` · `/api/locations` · `/api/stations` | Lookups |

## Deployment

Deployed on Vercel — `vercel.json` rewrites all paths to the `index.js`
serverless function.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `RTT_API_USER` / `RTT_API_PASS` | **Recommended.** Credentials for the official [Realtime Trains API](https://api.rtt.io) (free registration). With these set, all live data uses the contracted JSON API; without them the app falls back to scraping the website, which now sits behind a bot challenge and fails from most servers. |
| `MAPTILER_KEY` | MapTiler vector-tile key for the maps (a sensible default ships in the code; set your own and restrict it to your domain in production). |
| `TFL_APP_KEY` | Transport for London API key. The journey planner works key-less, but a free key (from [api-portal.tfl.gov.uk](https://api-portal.tfl.gov.uk)) raises the rate limit for the cross-London last-mile hop. |

## Launch checklist & scaling roadmap

Ready-for-users state: public pages and read-only APIs are **edge-cached**
(`s-maxage` + `stale-while-revalidate`) so the CDN absorbs repeat traffic;
upstream fetches retry transient failures; the UI supports dark mode, reduced
motion and keyboard focus; boards only auto-refresh while the tab is visible.

To go live:

1. Set the env vars above (Supabase integration, `VAPID_PRIVATE_KEY`,
   `CRON_SECRET`), then schedule `/api/cron/check?secret=…` every ~15 min for
   trip alerts.
2. Point a custom domain at the Vercel project; restrict the MapTiler key to it.
3. Register production apps with TfL (`TFL_APP_KEY`) to raise rate limits.

At serious scale the data source and cache architecture change in stages —
the full plan, with the maths and migration triggers, lives in
[SCALING.md](./SCALING.md): RTT free API now → Darwin LDBWS (Rail Data
Marketplace) + shared Redis at growth/first-revenue → Darwin Push Port
ingestion worker at 50k+ daily users.

## Data & attribution

Live running information originates from National Rail / Network Rail and is
surfaced via Realtime Trains. Cross-London and last-mile routing (tube, bus,
walking, Elizabeth line, DLR) comes from Transport for London's open Unified
API. Rail Tracker is an independent project and is not affiliated with, or
endorsed by, National Rail, Network Rail, Transport for London or any train
operating company.
