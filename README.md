# Rail Tracker

Live UK train times, departure boards, and disruption tracking — built with real-time data from National Rail's Darwin system.

## Design

Flighty-inspired dark UI. Server-rendered HTML. Zero JavaScript required. Every station page is fully crawlable by search engines — all data in the initial HTML payload.

## Data Sources

- **National Rail Darwin (OpenLDBWS)** — live departures, arrivals, platforms, delays, cancellations
- **Huxley 2** — community JSON proxy for the Darwin SOAP API (no API key needed)
- **NaPTAN / NPTG** — station locations and codes (planned)
- **Network Rail TRUST / TD** — train movements and signalling data (planned)

## Architecture

```
generate_station.py  →  fetches live data from Huxley 2  →  renders static HTML
```

- Pure Python 3, no framework
- Output is self-contained HTML + CSS
- Works for any UK station: `python3 generate_station.py PAD`
- Deployable as static files or with a simple Python web server

## Quick Start

```bash
# Generate a live station page
python3 generate_station.py PAD > station.html

# Or serve dynamically
python3 -m http.server 8080
```

Then open `http://localhost:8080/station.html`

## Station Codes

Any 3-letter CRS code works:
- PAD — London Paddington
- KGX — London Kings Cross
- MAN — Manchester Piccadilly
- BRI — Bristol Temple Meads
- EDB — Edinburgh Waverley
- GLC — Glasgow Central
- ...and ~2,500 more

## Status

Early prototype. Live departure data is working. Next steps:
- [ ] Live arrivals
- [ ] Station search
- [ ] Network-wide disruption map
- [ ] Train tracking map
- [ ] Historical punctuality data
- [ ] Progressive enhancement with HTMX for live updates
