# Scaling Rail Tracker

The strategy in one line: **serve everyone from our own cache, and make the
upstream cost a function of the railway (stations × refresh rate), never of the
audience.** Each stage below moves more of the data behind that principle.

## The maths that drives everything

A board viewed by 10,000 people in the same minute is **one** upstream fetch if
caching works. Our layers:

- **Edge cache** (`s-maxage` + `stale-while-revalidate`): repeat page/API views
  served by the CDN. Already live.
- **Server cache** (per-instance, 15–120s TTLs): collapses concurrent misses.
  ⚠️ Serverless spreads this across many instances, so it fragments under load —
  that's what Stage 1's shared cache fixes.

So upstream usage ≈ `distinct stations/services being watched × refresh rate`,
not users.

## Stage 0 — now (≈0–2k daily users): Realtime Trains API

- **Source:** [api-portal.rtt.io](https://api-portal.rtt.io) free tier
  (`RTT_API_USER` / `RTT_API_PASS`). Personal, non-commercial.
- **Limits:** ~30 req/min, 9,000/day. With caching that supports roughly
  ~20 distinct station fetches per minute burst and a few thousand sessions/day.
- **Good until:** sustained rate-limit errors, or the day the app takes revenue
  (ads/affiliate = commercial use → not allowed on this tier).

## Stage 1 — growth (≈2k–50k daily users, or first revenue): Darwin LDBWS + shared cache

- **Source:** National Rail's Darwin **LDBWS Public** on the
  [Rail Data Marketplace](https://raildata.org.uk) (REST at
  `api1.raildata.org.uk`; free open tier ≈5,000 req/hour — ~10× RTT — cap
  removable via infoservices@nationalrail.co.uk; instant approval; commercial
  use OK with National Rail attribution).
- **Work:**
  1. `lib/darwin.js` adapter mapping LDBWS boards/service details into the same
     internal shapes (the adapter pattern is already proven — `rttApi` did it).
  2. **Shared cache:** Upstash Redis (free/cheap) replacing the in-memory `Map`
     in `index.js`, so all serverless instances share one cache and upstream
     calls stop fragmenting.
  3. Keep RTT as fallback/enrichment while allowed.
- **Cost:** ~£0–10/month (Redis). Triggers: RTT 429s, ~2k DAU, or monetization.

## Stage 2 — scale (50k+ daily users → millions): Darwin Push Port ingestion

- **Source:** Darwin **Push Port** (streaming feed of every train movement,
  cancellation and platform change) via the Rail Data Marketplace.
- **Architecture flip:** a small always-on worker (Fly.io/Railway, ~£5–20/mo)
  ingests the stream into Redis/Postgres; the site reads **only our store**.
  Upstream cost becomes O(1) regardless of audience; board reads are <10ms and
  survive any upstream outage or bot-challenge — this is how bustimes.org and
  Realtime Trains themselves work.
- **Alongside:** self-host map tiles once past MapTiler's free 100k loads/mo
  (~£20–50/mo fixed); batch the trip-alert cron by departure window; consider
  multi-region Redis read replicas.
- **Cost:** ~£30–100/month infrastructure at millions of users — a rounding
  error against the ad + affiliate revenue modelled for that traffic.

## Non-data ceilings (for completeness)

| Dependency | Free ceiling | At-scale move |
| --- | --- | --- |
| TfL Unified API | generous with free `TFL_APP_KEY` | keep; cache line-status (done) |
| MapTiler | 100k map loads/mo | self-host tiles or paid plan |
| Vercel | hobby limits | edge caching (done) keeps function load low; upgrade plan when needed |
| Supabase (trips/push) | free tier | batch cron; still cheap at 100k trips |

## Migration triggers — watch for these

1. **RTT 429s / daily-cap exhaustion** in logs → start Stage 1.
2. **First ad or affiliate revenue** → Stage 1 immediately (licence, not load).
3. **LDBWS request volume nearing its cap** or >50k DAU → Stage 2.
4. **MapTiler dashboard >80k loads/mo** → tiles decision.
