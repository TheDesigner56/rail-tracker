#!/bin/bash
# Vercel build script — generates static station pages from live data
python3 generate_station.py PAD > station-live.html
python3 generate_station.py KGX > station-kgx.html
python3 generate_station.py MAN > station-man.html
python3 generate_station.py BRI > station-bri.html
python3 generate_station.py EDB > station-edb.html
python3 generate_station.py GLC > station-glc.html
echo "Build complete — 6 station pages generated"
