# Rail Tracker

Fast, mobile-first **live UK train tracker** — departures and arrivals for every
station in Great Britain, plus full route tracking for individual services. Think
[bustimes.org](https://bustimes.org), but for the railway.

## Features

- **Live boards** — real-time departures & arrivals for 2,500+ stations, with
  platforms, delays, cancellations, operator, headcode and coach count. One
  upstream request per board (fast).
- **Track any train** — tap a service to open its trip page: every calling point
  with scheduled vs expected times, the train's progress, formation (unit
  numbers), and a live position marker on a map.
- **Stations near me** — find the closest stations using the browser's location.
- **Network map** — every station on an interactive map; tap for live times.
- **Operators** — every train operating company, colour-coded across the app.
- **Search** — type-ahead station search by name or CRS code, anywhere.

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
| `/` | Home: search, near-me, popular & all stations |
| `/station/:crs` | Live departures (e.g. `/station/PAD`) |
| `/station/:crs/arrivals` | Live arrivals |
| `/service/:id` | Service trip page + live map |
| `/map` | All-stations network map |
| `/operators`, `/operator/:code` | Operator directory |
| `/api/board/:crs?mode=` | Board JSON |
| `/api/service/:id` | Live service position + calling points JSON |
| `/api/nearby?lat=&lon=` | Nearest stations |
| `/api/search?q=` · `/api/locations` · `/api/stations` | Lookups |

## Deployment

Deployed on Vercel — `vercel.json` rewrites all paths to the `index.js`
serverless function.

## Data & attribution

Live running information originates from National Rail / Network Rail and is
surfaced via Realtime Trains. Rail Tracker is an independent project and is not
affiliated with, or endorsed by, National Rail, Network Rail or any train
operating company.
