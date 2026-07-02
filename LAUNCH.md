# Launch runbook

Every layer, in order. Anything already done is marked ✅; anything needing a
human account/key is marked 👤 (only the owner can do these).

## 1 · Data layer

- ✅ Official Realtime Trains API client (scraper fallback; honest failures).
- 👤 **Register at [api-portal.rtt.io](https://api-portal.rtt.io)** (free,
  personal/non-commercial) → get API credentials.
- ✅ Stage-1/2 plan for growth & revenue: see [SCALING.md](./SCALING.md)
  (Darwin LDBWS → Push Port; triggers listed there).
- Optional 👤: free TfL key ([api-portal.tfl.gov.uk](https://api-portal.tfl.gov.uk))
  raises last-mile rate limits → `TFL_APP_KEY`.

## 2 · Cache / infrastructure layer

- ✅ Edge caching (`s-maxage` + SWR) on all public pages & read-only APIs.
- ✅ Shared-cache abstraction (`lib/cache.js`): set
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (👤 free at
  [upstash.com](https://upstash.com)) and every serverless instance shares one
  cache — recommended at growth, required before heavy traffic.
- ✅ Upstream retries with backoff; bot-challenge detection.

## 3 · Application backend layer (trip alerts)

- ✅ Supabase project `rail-tracker` (`qjlwnrfuirgsegupaagu`, eu-west-2):
  `trips` + `push_subs` tables, RLS on.
- ✅ pg_cron scheduler calling `/api/cron/check` every 15 min (no-ops until env
  vars exist). ⚠️ Free-tier Supabase pauses after ~1 week idle — restore from
  the dashboard if status shows INACTIVE (using the DB for real keeps it awake).
- ✅ Web Push (VAPID) + service worker + PWA manifest.

## 4 · Configuration layer (👤 Vercel → Settings → Environment Variables)

| Variable | Value / source | Purpose |
| --- | --- | --- |
| `RTT_API_USER` / `RTT_API_PASS` | from api-portal.rtt.io | live train data |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel↔Supabase integration or Supabase → Settings → API | trip storage |
| `VAPID_PRIVATE_KEY` | provided in session (regenerate with `npx web-push generate-vapid-keys` if rotating) | push alerts |
| `CRON_SECRET` | `eff06c62718cf5f7129ea21db67bc197d623304992e6ce23` (matches the pre-armed pg_cron job) | protects the scheduler endpoint |
| `TFL_APP_KEY` (optional) | api-portal.tfl.gov.uk | TfL rate limits |
| `MAPTILER_KEY` (recommended) | maptiler.com — restrict to your domain | maps |
| `UPSTASH_REDIS_REST_URL/_TOKEN` (at growth) | upstash.com | shared cache |

## 5 · Release layer

1. 👤 Merge **PR #2** (squash) — production picks up everything.
2. 👤 Custom domain on the Vercel project; restrict the MapTiler key to it.
3. Update the pg_cron URL if the domain changes from `rail-tracker.vercel.app`
   (Supabase → SQL: `select cron.alter_job(job_id, command := …)` or re-run the
   scheduler migration with the new URL).

## 6 · Verification layer (after deploy — 5 minutes)

- [ ] Home: geolocate fills nearest station; plan **Bath Spa → King's Cross**
      (multi-leg via Paddington, disruption callouts if any).
- [ ] Pick-a-train chips recalculate the itinerary.
- [ ] A walking leg opens in-app directions with live dot.
- [ ] Service page: live 🚆 marker; formation diagram; Set alert works in-tab.
- [ ] Board: Earlier/Later, risk tags; station overview: travel advice + chart
      tooltips.
- [ ] `/trips`: save a trip, Enable alerts, receive the pre-departure push
      (set a trip departing within ~75 min to test).
- [ ] Dark mode toggle; iPhone: Add to Home Screen → push permission works.
- [ ] Buy tickets → Trainline lands pre-filled.

## 7 · Trust & legal layer

- ✅ About page: attribution (RTT / TfL / MapTiler / OSM / Open-Meteo),
  independence disclaimer, plain-English privacy note (no trackers; trips
  stored only for alerts; location stays on device).
- ✅ Security headers; no cookies; localStorage only.
- When revenue starts: RTT free tier is **non-commercial** → move to Darwin
  (SCALING.md Stage 1) and add an affiliate-commission disclosure line.

## 8 · Growth layer (when ready)

- Trainline / Trip.com / TrainPal affiliate IDs → wrap `/go/trainline` links.
- Railcard affiliate (Awin) as a natural upsell.
- Watch SCALING.md triggers; Stage 2 (Darwin Push Port worker) at 50k+ DAU.
