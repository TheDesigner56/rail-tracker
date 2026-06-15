#!/bin/bash
# Vercel build script — generates static station pages from live data
# If the API is unavailable during build, keeps the pre-generated pages from git

# Map of CRS codes to URL-friendly names
STATIONS="PAD:london-paddington KGX:london-kings-cross STP:london-st-pancras EUS:london-euston VIC:london-victoria WAT:london-waterloo LST:london-liverpool-street LBG:london-bridge BHM:birmingham-new-street MAN:manchester-piccadilly LIV:liverpool-lime-street LDS:leeds YRK:york NCL:newcastle EDB:edinburgh-waverley GLC:glasgow-central CDF:cardiff-central BRI:bristol-temple-meads EXD:exeter-st-davids PLY:plymouth RDG:reading OXF:oxford CBG:cambridge NRW:norwich BTN:brighton SOU:southampton-central NOT:nottingham SHF:sheffield DBY:derby LEI:leicester PRE:preston ABD:aberdeen INV:inverness SWA:swansea"

echo "Generating station pages..."
API_REACHABLE=false

# Quick check if the local proxy is reachable
if curl -sf "http://localhost:3456/health" > /dev/null 2>&1; then
  API_REACHABLE=true
  echo "Local proxy reachable — generating fresh pages"
else
  echo "Local proxy unreachable — keeping pre-generated pages from git"
fi

for pair in $STATIONS; do
  crs="${pair%%:*}"
  name="${pair##*:}"
  if [ "$API_REACHABLE" = true ]; then
    python3 generate_station.py "$crs" > "station-${name}.html" 2>/dev/null
    if grep -q "Live data temporarily unavailable" "station-${name}.html" 2>/dev/null; then
      echo "  ${crs} (${name}) — fallback (API unavailable)"
    else
      echo "  ${crs} (${name}) — live data"
    fi
  else
    # Keep the committed file — only regenerate if it doesn't exist
    if [ ! -f "station-${name}.html" ]; then
      python3 generate_station.py "$crs" > "station-${name}.html" 2>/dev/null
      echo "  ${crs} (${name}) — fallback (no pre-generated file)"
    else
      echo "  ${crs} (${name}) — kept from previous build"
    fi
  fi
done

echo "Build complete — $(ls station-*.html 2>/dev/null | wc -l) station pages generated"