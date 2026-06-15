#!/bin/bash
# Vercel build script — generates static station pages from live data
# Falls back to static placeholder pages if the API is unavailable

STATIONS="PAD KGX STP EUS VIC WAT LST BHM MAN LIV LDS EDB GLC CDF BRI RDG OXF"

echo "Generating station pages..."
for crs in $STATIONS; do
  python3 generate_station.py "$crs" > "station-${crs}.html" 2>/dev/null
  if grep -q "Live data temporarily unavailable" "station-${crs}.html" 2>/dev/null; then
    echo "  ${crs} — fallback (API unavailable)"
  else
    echo "  ${crs} — live data"
  fi
done

# Also generate the main live page
python3 generate_station.py PAD > station-live.html 2>/dev/null

echo "Build complete — $(ls station-*.html 2>/dev/null | wc -l) station pages generated"
