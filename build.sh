#!/bin/bash
# Vercel build script — generates static station pages from live data
# Falls back to static placeholder pages if the API is unavailable

# Map of CRS codes to URL-friendly names
declare -A STATION_MAP
STATION_MAP=(
  ["PAD"]="london-paddington"
  ["KGX"]="london-kings-cross"
  ["STP"]="london-st-pancras"
  ["EUS"]="london-euston"
  ["VIC"]="london-victoria"
  ["WAT"]="london-waterloo"
  ["LST"]="london-liverpool-street"
  ["LBG"]="london-bridge"
  ["BHM"]="birmingham-new-street"
  ["MAN"]="manchester-piccadilly"
  ["LIV"]="liverpool-lime-street"
  ["LDS"]="leeds"
  ["YRK"]="york"
  ["NCL"]="newcastle"
  ["EDB"]="edinburgh-waverley"
  ["GLC"]="glasgow-central"
  ["CDF"]="cardiff-central"
  ["BRI"]="bristol-temple-meads"
  ["EXD"]="exeter-st-davids"
  ["PLY"]="plymouth"
  ["RDG"]="reading"
  ["OXF"]="oxford"
  ["CBG"]="cambridge"
  ["NRW"]="norwich"
  ["BTN"]="brighton"
  ["SOU"]="southampton-central"
  ["NOT"]="nottingham"
  ["SHF"]="sheffield"
  ["DBY"]="derby"
  ["LEI"]="leicester"
  ["PRE"]="preston"
  ["ABD"]="aberdeen"
  ["INV"]="inverness"
  ["SWA"]="swansea"
)

echo "Generating station pages..."
for crs in "${!STATION_MAP[@]}"; do
  name="${STATION_MAP[$crs]}"
  python3 generate_station.py "$crs" > "station-${name}.html" 2>/dev/null
  if grep -q "Live data temporarily unavailable" "station-${name}.html" 2>/dev/null; then
    echo "  ${crs} (${name}) — fallback (API unavailable)"
  else
    echo "  ${crs} (${name}) — live data"
  fi
done

# Also generate the main live page and a few key stations with CRS-code filenames for compatibility
python3 generate_station.py PAD > station-live.html 2>/dev/null
python3 generate_station.py PAD > station-PAD.html 2>/dev/null
python3 generate_station.py KGX > station-KGX.html 2>/dev/null
python3 generate_station.py MAN > station-MAN.html 2>/dev/null
python3 generate_station.py EDB > station-EDB.html 2>/dev/null
python3 generate_station.py GLC > station-GLC.html 2>/dev/null
python3 generate_station.py BRI > station-BRI.html 2>/dev/null

echo "Build complete — $(ls station-*.html 2>/dev/null | wc -l) station pages generated"
