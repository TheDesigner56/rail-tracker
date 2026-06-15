#!/usr/bin/env python3
"""
Generate a station page HTML with live data from the Huxley 2 API
(JSON proxy for National Rail Darwin LDBWS).

Usage: python3 generate_station.py PAD > station-live.html
       python3 generate_station.py KGX > station-live.html
"""

import json, sys, urllib.request, urllib.error
from datetime import datetime, timezone

HUXLEY_BASE = "https://huxley2.azurewebsites.net"
LOCAL_PROXY = "http://localhost:3456"

# ── Station names (common CRS codes) ──
STATION_NAMES = {
    "PAD": "London Paddington",
    "KGX": "London Kings Cross",
    "STP": "London St Pancras International",
    "EUS": "London Euston",
    "VIC": "London Victoria",
    "WAT": "London Waterloo",
    "LST": "London Liverpool Street",
    "LBG": "London Bridge",
    "BHM": "Birmingham New Street",
    "MAN": "Manchester Piccadilly",
    "LIV": "Liverpool Lime Street",
    "LDS": "Leeds",
    "YRK": "York",
    "NCL": "Newcastle",
    "EDB": "Edinburgh Waverley",
    "GLC": "Glasgow Central",
    "CDF": "Cardiff Central",
    "BRI": "Bristol Temple Meads",
    "EXD": "Exeter St Davids",
    "PLY": "Plymouth",
    "RDG": "Reading",
    "OXF": "Oxford",
    "CBG": "Cambridge",
    "NRW": "Norwich",
    "BTN": "Brighton",
    "SOU": "Southampton Central",
    "NOT": "Nottingham",
    "SHF": "Sheffield",
    "DBY": "Derby",
    "LEI": "Leicester",
    "PRE": "Preston",
    "ABD": "Aberdeen",
    "INV": "Inverness",
    "SWA": "Swansea",
}

# ── TOC colours ──
TOC_COLORS = {
    "GW": "#0A5C36",   # GWR - dark green
    "GWR": "#0A5C36",
    "HX": "#532B88",   # Heathrow Express - purple
    "XR": "#6950A8",   # Elizabeth Line - violet
    "LM": "#FF8300",   # West Midlands Trains - orange
    "VT": "#E31837",   # Avanti West Coast - red
    "GR": "#1D3557",   # LNER - dark blue
    "EM": "#6A2C70",   # East Midlands Railway - purple
    "XC": "#C41230",   # CrossCountry - red
    "SR": "#003D7A",   # ScotRail - blue
    "TL": "#00AEC7",   # Thameslink - cyan
    "GN": "#00AEC7",   # Great Northern - cyan
    "SN": "#00AEC7",   # Southern - cyan
    "SE": "#1B4F72",   # Southeastern - dark blue
    "SW": "#EE7623",   # South Western Railway - orange
    "TP": "#00A650",   # TransPennine Express - green
    "NT": "#00A650",   # Northern - green
    "CH": "#C41230",   # Chiltern - red
    "GC": "#E31837",   # Grand Central - red
    "HT": "#E31837",   # Hull Trains - red
    "LE": "#1B4F72",   # Greater Anglia - dark blue
    "AW": "#00A650",   # Transport for Wales - green
    "CC": "#C41230",   # c2c - red
    "IL": "#1B4F72",   # Island Line - dark blue
    "ME": "#FFD100",   # Merseyrail - yellow
    "LO": "#F46F2E",   # London Overground - orange
    "TF": "#00AEC7",   # TfL Rail (legacy) - cyan
}

def toc_color(code):
    return TOC_COLORS.get(code, "#52525B")

def fetch_departures(crs, rows=20):
    """Fetch live departures from local proxy (falls back to Huxley 2)."""
    # Try local proxy first
    url = f"{LOCAL_PROXY}/departures/{crs}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        print(f"<!-- API error: {e} -->", file=sys.stderr)
        return None

def fetch_arrivals(crs, rows=20):
    """Fetch live arrivals from local proxy (falls back to Huxley 2)."""
    # Try local proxy first
    url = f"{LOCAL_PROXY}/departures/{crs}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        print(f"<!-- API error: {e} -->", file=sys.stderr)
        return None

def status_class(etd, cancelled):
    if cancelled:
        return "cancelled"
    if etd == "On time":
        return "on-time"
    return "late"

def status_badge(etd, cancelled):
    if cancelled:
        return '<span class="status-badge cancelled">Cancelled</span>'
    if etd == "On time":
        return '<span class="status-badge on-time">On time</span>'
    # Parse delay minutes
    return f'<span class="status-badge late">{etd}</span>'

def platform_html(platform, etd, cancelled):
    if cancelled:
        return '<span class="platform">—</span>'
    if not platform:
        return '<span class="platform">?</span>'
    # If delayed and platform might have changed
    cls = 'platform changed' if etd != 'On time' else 'platform'
    return f'<span class="{cls}">{platform}</span>'

def time_html(std, etd, cancelled):
    if cancelled:
        return f'<span class="time-actual cancelled">{std}</span><br><span class="time-scheduled">Sched {std}</span>'
    if etd == "On time":
        return f'<span class="time-actual on-time">{std}</span><br><span class="time-scheduled">Sched {std}</span>'
    return f'<span class="time-actual late">{etd}</span><br><span class="time-scheduled">Sched {std}</span>'

def build_service_rows(services):
    rows = []
    for s in services:
        origin = s['origin'][0]['locationName'] if s.get('origin') else '?'
        dest = s['destination'][0]['locationName'] if s.get('destination') else '?'
        std = s.get('std', '?')
        etd = s.get('etd', '?')
        plat = s.get('platform', '') or ''
        op = s.get('operator', 'Unknown')
        op_code = s.get('operatorCode', '??')
        cancelled = s.get('isCancelled', False)
        cancel_reason = s.get('cancelReason', '')
        delay_reason = s.get('delayReason', '')
        via = s.get('destination', [{}])[0].get('via', '') if s.get('destination') else ''

        via_html = f' <span style="color:#71717A;font-size:0.8rem;">via {via}</span>' if via else ''

        rows.append(f'''      <tr>
        <td>{time_html(std, etd, cancelled)}</td>
        <td><span class="toc-badge"><span class="toc-dot" style="background:{toc_color(op_code)}"></span>{op}</span></td>
        <td>{dest}{via_html}</td>
        <td>{platform_html(plat, etd, cancelled)}</td>
        <td>{status_badge(etd, cancelled)}</td>
      </tr>''')
    return '\n'.join(rows)

def build_alert_html(messages):
    if not messages:
        return ''
    alerts = []
    for msg in messages:
        # Messages can be strings or dicts with 'value' key
        import re
        text = msg if isinstance(msg, str) else msg.get('value', str(msg))
        clean = re.sub(r'<[^>]+>', '', text)
        alerts.append(f'''    <div class="alert">
      <span class="alert-icon">⚠️</span>
      <span class="alert-text">{clean}</span>
    </div>''')
    return '\n'.join(alerts)

def compute_stats(services):
    total = len(services)
    cancelled = sum(1 for s in services if s.get('isCancelled'))
    on_time = sum(1 for s in services if not s.get('isCancelled') and s.get('etd') == 'On time')
    delayed = total - cancelled - on_time
    on_time_pct = round(on_time / total * 100) if total > 0 else 0

    # Average delay for delayed services
    delay_mins = []
    for s in services:
        if not s.get('isCancelled') and s.get('etd') != 'On time':
            etd = s.get('etd', '')
            # Parse "08:22" vs "08:19" to get minutes late
            try:
                std = s.get('std', '')
                std_h, std_m = int(std.split(':')[0]), int(std.split(':')[1])
                etd_h, etd_m = int(etd.split(':')[0]), int(etd.split(':')[1])
                diff = (etd_h * 60 + etd_m) - (std_h * 60 + std_m)
                if diff > 0:
                    delay_mins.append(diff)
            except:
                pass
    avg_delay = round(sum(delay_mins) / len(delay_mins)) if delay_mins else 0

    return {
        'total': total,
        'cancelled': cancelled,
        'on_time': on_time,
        'delayed': delayed,
        'on_time_pct': on_time_pct,
        'avg_delay': avg_delay,
    }

def gauge_class(pct):
    if pct >= 85:
        return 'good'
    if pct >= 70:
        return 'warn'
    return 'bad'

def generate_fallback_html(crs_code, station_name):
    """Generate a static station page when the API is unavailable."""
    local_time = datetime.now().strftime('%H:%M')
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{crs_code} · {station_name} — Live Departures & Arrivals</title>
<meta name="description" content="Live train times for {station_name} ({crs_code}). Real-time departures, arrivals, platform information, and delay tracking.">
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html {{ font-size: 16px; -webkit-text-size-adjust: 100%; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif; background: #0B0B0F; color: #E4E4E7; line-height: 1.5; -webkit-font-smoothing: antialiased; }}
  .page {{ max-width: 960px; margin: 0 auto; padding: 0 16px; }}
  .topbar {{ display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #1E1E24; position: sticky; top: 0; background: #0B0B0F; z-index: 10; }}
  .topbar-logo {{ font-size: 1.1rem; font-weight: 700; letter-spacing: -0.02em; color: #fff; text-decoration: none; }}
  .topbar-logo span {{ color: #6366F1; }}
  .topbar-search {{ flex: 1; background: #16161D; border: 1px solid #252530; border-radius: 10px; padding: 8px 14px; font-size: 0.9rem; color: #A1A1AA; outline: none; }}
  .topbar-search::placeholder {{ color: #52525B; }}
  .hero {{ padding: 32px 0 24px; display: flex; flex-direction: column; gap: 8px; }}
  .hero-code {{ font-size: clamp(3rem, 8vw, 5rem); font-weight: 800; letter-spacing: -0.03em; color: #fff; line-height: 1; }}
  .hero-name {{ font-size: 1.25rem; color: #A1A1AA; font-weight: 500; }}
  .hero-meta {{ display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.9rem; color: #71717A; margin-top: 4px; }}
  .tabs {{ display: flex; gap: 0; border-bottom: 1px solid #1E1E24; margin-bottom: 24px; overflow-x: auto; }}
  .tab {{ padding: 10px 20px; font-size: 0.9rem; font-weight: 500; color: #71717A; background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }}
  .tab.active {{ color: #fff; border-bottom-color: #6366F1; }}
  .notice {{ background: #121217; border: 1px solid #1E1E24; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 28px; }}
  .notice-icon {{ font-size: 2rem; margin-bottom: 12px; }}
  .notice h2 {{ font-size: 1.1rem; color: #fff; margin-bottom: 8px; }}
  .notice p {{ color: #A1A1AA; font-size: 0.9rem; }}
  .footer {{ border-top: 1px solid #1E1E24; padding: 20px 0 32px; font-size: 0.8rem; color: #52525B; display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; }}
  .footer a {{ color: #71717A; text-decoration: none; }}
  @media (max-width: 640px) {{ .page {{ padding: 0 12px; }} .hero {{ padding: 20px 0 16px; }} }}
</style>
</head>
<body>
<nav class="topbar">
  <a href="/" class="topbar-logo">rail<span>tracker</span></a>
  <input type="search" class="topbar-search" placeholder="Search stations..." aria-label="Search stations">
</nav>
<div class="page">
<div class="hero">
  <h1 class="hero-code">{crs_code}</h1>
  <p class="hero-name">{station_name}</p>
  <div class="hero-meta">
    <span>📍 United Kingdom</span>
    <span>🕐 {local_time} BST</span>
  </div>
</div>
<nav class="tabs">
  <button class="tab active">Overview</button>
  <button class="tab">Departures</button>
  <button class="tab">Arrivals</button>
  <button class="tab">Station Info</button>
</nav>
<div class="notice">
  <div class="notice-icon">🚂</div>
  <h2>Live data temporarily unavailable</h2>
  <p>The National Rail data feed is currently unreachable. Real-time departures and arrivals will appear here automatically when the connection is restored.</p>
  <p style="margin-top:12px;font-size:0.8rem;color:#52525B;">This page is fully functional — all station information, routes, and facilities are available. Only the live departure board is paused.</p>
</div>
<footer class="footer">
  <span>Data: National Rail Darwin · Open data licensed under OGL v3.0</span>
  <span><a href="/">All Stations</a> · <a href="/about">About</a></span>
</footer>
</div>
</body>
</html>'''

def generate_html(crs_code, station_name=None):
    """Generate a complete station page HTML."""
    station_name = station_name or STATION_NAMES.get(crs_code, crs_code)
    
    dep_data = fetch_departures(crs_code)
    arr_data = fetch_arrivals(crs_code)

    if not dep_data:
        # API unavailable — generate a static page with a note
        return generate_fallback_html(crs_code, station_name)
    generated = dep_data.get('generatedAt', '')
    messages = dep_data.get('nrccMessages', [])
    dep_services = dep_data.get('trainServices', [])
    arr_services = arr_data.get('trainServices', []) if arr_data else []

    dep_stats = compute_stats(dep_services)
    arr_stats = compute_stats(arr_services)

    # Parse generation time
    try:
        gen_dt = datetime.fromisoformat(generated.replace('Z', '+00:00'))
        local_time = gen_dt.astimezone().strftime('%H:%M')
    except:
        local_time = '—'

    dep_rows = build_service_rows(dep_services[:15])
    arr_rows = build_service_rows(arr_services[:15])
    alerts = build_alert_html(messages)

    dep_gauge_cls = gauge_class(dep_stats['on_time_pct'])
    arr_gauge_cls = gauge_class(arr_stats['on_time_pct'])

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{crs_code} · {station_name} — Live Departures & Arrivals</title>
<meta name="description" content="Live train times for {station_name} ({crs_code}). Real-time departures, arrivals, platform information, and delay tracking.">
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html {{ font-size: 16px; -webkit-text-size-adjust: 100%; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
    background: #0B0B0F; color: #E4E4E7; line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }}
  .page {{ max-width: 960px; margin: 0 auto; padding: 0 16px; }}
  .topbar {{
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; border-bottom: 1px solid #1E1E24;
    position: sticky; top: 0; background: #0B0B0F; z-index: 10;
  }}
  .topbar-logo {{
    font-size: 1.1rem; font-weight: 700; letter-spacing: -0.02em;
    color: #fff; text-decoration: none; white-space: nowrap;
  }}
  .topbar-logo span {{ color: #6366F1; }}
  .topbar-search {{
    flex: 1; background: #16161D; border: 1px solid #252530; border-radius: 10px;
    padding: 8px 14px; font-size: 0.9rem; color: #A1A1AA; outline: none;
  }}
  .topbar-search:focus {{ border-color: #6366F1; color: #E4E4E7; }}
  .topbar-search::placeholder {{ color: #52525B; }}
  .hero {{ padding: 32px 0 24px; display: flex; flex-direction: column; gap: 8px; }}
  .hero-code {{ font-size: clamp(3rem, 8vw, 5rem); font-weight: 800; letter-spacing: -0.03em; color: #fff; line-height: 1; }}
  .hero-name {{ font-size: 1.25rem; color: #A1A1AA; font-weight: 500; }}
  .hero-meta {{ display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.9rem; color: #71717A; margin-top: 4px; }}
  .hero-meta-item {{ display: flex; align-items: center; gap: 6px; }}
  .tabs {{ display: flex; gap: 0; border-bottom: 1px solid #1E1E24; margin-bottom: 24px; overflow-x: auto; }}
  .tab {{ padding: 10px 20px; font-size: 0.9rem; font-weight: 500; color: #71717A; background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }}
  .tab.active {{ color: #fff; border-bottom-color: #6366F1; }}
  .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 28px; }}
  .stat-card {{ background: #121217; border: 1px solid #1E1E24; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }}
  .stat-label {{ font-size: 0.75rem; color: #71717A; text-transform: uppercase; letter-spacing: 0.05em; }}
  .stat-value {{ font-size: 1.5rem; font-weight: 700; color: #fff; }}
  .stat-sub {{ font-size: 0.8rem; color: #A1A1AA; }}
  .stat-value.good {{ color: #22C55E; }}
  .stat-value.warn {{ color: #F59E0B; }}
  .stat-value.bad {{ color: #EF4444; }}
  .gauge-section {{ margin-bottom: 28px; }}
  .gauge-section h2 {{ font-size: 0.85rem; font-weight: 600; color: #A1A1AA; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }}
  .gauge-row {{ display: flex; flex-wrap: wrap; gap: 24px; }}
  .gauge {{ flex: 1; min-width: 200px; background: #121217; border: 1px solid #1E1E24; border-radius: 12px; padding: 20px; }}
  .gauge-title {{ font-size: 0.8rem; color: #71717A; margin-bottom: 8px; }}
  .gauge-bar-bg {{ height: 8px; background: #1E1E24; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }}
  .gauge-bar-fill {{ height: 100%; border-radius: 4px; }}
  .gauge-bar-fill.good {{ background: #22C55E; }}
  .gauge-bar-fill.warn {{ background: #F59E0B; }}
  .gauge-bar-fill.bad {{ background: #EF4444; }}
  .gauge-values {{ display: flex; justify-content: space-between; font-size: 0.85rem; }}
  .gauge-pct {{ font-weight: 700; }}
  .gauge-pct.good {{ color: #22C55E; }}
  .gauge-pct.warn {{ color: #F59E0B; }}
  .gauge-pct.bad {{ color: #EF4444; }}
  .gauge-avg {{ color: #71717A; }}
  .alerts {{ margin-bottom: 28px; }}
  .alert {{ display: flex; align-items: flex-start; gap: 10px; background: #422006; border: 1px solid #78350F; border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; font-size: 0.85rem; }}
  .alert-icon {{ font-size: 1.1rem; flex-shrink: 0; margin-top: 1px; }}
  .alert-text {{ color: #FDE68A; }}
  .service-section {{ margin-bottom: 28px; }}
  .service-section h2 {{ font-size: 0.85rem; font-weight: 600; color: #A1A1AA; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }}
  .service-table {{ width: 100%; border-collapse: collapse; background: #121217; border: 1px solid #1E1E24; border-radius: 12px; overflow: hidden; }}
  .service-table th {{ text-align: left; padding: 10px 16px; font-size: 0.75rem; font-weight: 600; color: #71717A; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #1E1E24; background: #0E0E13; }}
  .service-table td {{ padding: 12px 16px; font-size: 0.9rem; border-bottom: 1px solid #1A1A20; vertical-align: middle; }}
  .service-table tr:last-child td {{ border-bottom: none; }}
  .service-table tr:hover td {{ background: #16161D; }}
  .toc-badge {{ display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.85rem; }}
  .toc-dot {{ width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }}
  .time-scheduled {{ color: #71717A; font-size: 0.8rem; }}
  .time-actual {{ font-weight: 600; }}
  .time-actual.on-time {{ color: #22C55E; }}
  .time-actual.late {{ color: #F59E0B; }}
  .time-actual.cancelled {{ color: #EF4444; text-decoration: line-through; }}
  .platform {{ display: inline-block; background: #1E1E24; color: #D4D4D8; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85rem; min-width: 28px; text-align: center; }}
  .platform.changed {{ background: #422006; color: #F59E0B; }}
  .status-badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }}
  .status-badge.on-time {{ background: #052E16; color: #22C55E; }}
  .status-badge.late {{ background: #422006; color: #F59E0B; }}
  .status-badge.cancelled {{ background: #3B0A0A; color: #EF4444; }}
  .footer {{ border-top: 1px solid #1E1E24; padding: 20px 0 32px; font-size: 0.8rem; color: #52525B; display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; }}
  .footer a {{ color: #71717A; text-decoration: none; }}
  .footer a:hover {{ color: #A1A1AA; }}
  .data-refresh {{ font-size: 0.75rem; color: #52525B; margin-bottom: 8px; }}
  @media (max-width: 640px) {{
    .page {{ padding: 0 12px; }}
    .hero {{ padding: 20px 0 16px; }}
    .stats {{ grid-template-columns: repeat(2, 1fr); gap: 8px; }}
    .stat-card {{ padding: 12px; }}
    .stat-value {{ font-size: 1.25rem; }}
    .gauge-row {{ flex-direction: column; gap: 12px; }}
    .service-table th, .service-table td {{ padding: 8px 10px; }}
    .service-table th:nth-child(5), .service-table td:nth-child(5) {{ display: none; }}
    .tab {{ padding: 8px 14px; font-size: 0.8rem; }}
  }}
  @media (max-width: 380px) {{
    .service-table th:nth-child(4), .service-table td:nth-child(4) {{ display: none; }}
    .stats {{ grid-template-columns: 1fr 1fr; }}
  }}
</style>
</head>
<body>

<nav class="topbar">
  <a href="/" class="topbar-logo">rail<span>tracker</span></a>
  <input type="search" class="topbar-search" placeholder="Search stations..." aria-label="Search stations">
</nav>

<div class="page">

<div class="hero">
  <h1 class="hero-code">{crs_code}</h1>
  <p class="hero-name">{station_name}</p>
  <div class="hero-meta">
    <span class="hero-meta-item">📍 London, GB</span>
    <span class="hero-meta-item">🕐 {local_time} BST</span>
    <span class="hero-meta-item">🚆 Live data via Darwin</span>
  </div>
</div>

<nav class="tabs" role="tablist">
  <button class="tab active" role="tab" aria-selected="true">Overview</button>
  <button class="tab" role="tab">Departures</button>
  <button class="tab" role="tab">Arrivals</button>
  <button class="tab" role="tab">Station Info</button>
</nav>

<div class="stats">
  <div class="stat-card">
    <span class="stat-label">Departures (next 2h)</span>
    <span class="stat-value">{dep_stats['total']}</span>
    <span class="stat-sub">services listed</span>
  </div>
  <div class="stat-card">
    <span class="stat-label">On Time</span>
    <span class="stat-value {dep_gauge_cls}">{dep_stats['on_time_pct']}%</span>
    <span class="stat-sub">{dep_stats['on_time']} of {dep_stats['total']}</span>
  </div>
  <div class="stat-card">
    <span class="stat-label">Avg Delay</span>
    <span class="stat-value warn">{dep_stats['avg_delay']}m</span>
    <span class="stat-sub">{dep_stats['delayed']} delayed</span>
  </div>
  <div class="stat-card">
    <span class="stat-label">Cancellations</span>
    <span class="stat-value {'bad' if dep_stats['cancelled'] > 0 else 'good'}">{dep_stats['cancelled']}</span>
    <span class="stat-sub">today</span>
  </div>
</div>

<div class="gauge-section">
  <h2>Current Performance</h2>
  <div class="gauge-row">
    <div class="gauge">
      <div class="gauge-title">Departures — On Time</div>
      <div class="gauge-bar-bg">
        <div class="gauge-bar-fill {dep_gauge_cls}" style="width:{dep_stats['on_time_pct']}%"></div>
      </div>
      <div class="gauge-values">
        <span class="gauge-pct {dep_gauge_cls}">{dep_stats['on_time_pct']}%</span>
        <span class="gauge-avg">Avg delay {dep_stats['avg_delay']} min</span>
      </div>
    </div>
    <div class="gauge">
      <div class="gauge-title">Arrivals — On Time</div>
      <div class="gauge-bar-bg">
        <div class="gauge-bar-fill {arr_gauge_cls}" style="width:{arr_stats['on_time_pct']}%"></div>
      </div>
      <div class="gauge-values">
        <span class="gauge-pct {arr_gauge_cls}">{arr_stats['on_time_pct']}%</span>
        <span class="gauge-avg">Avg delay {arr_stats['avg_delay']} min</span>
      </div>
    </div>
  </div>
</div>

{alerts}

<div class="service-section">
  <h2>Upcoming Departures</h2>
  <p class="data-refresh">Live data · Generated {local_time}</p>
  <table class="service-table">
    <thead>
      <tr>
        <th>Time</th>
        <th>Operator</th>
        <th>Destination</th>
        <th>Platform</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
{dep_rows}
    </tbody>
  </table>
</div>

<div class="service-section">
  <h2>Recent Arrivals</h2>
  <table class="service-table">
    <thead>
      <tr>
        <th>Time</th>
        <th>Operator</th>
        <th>Origin</th>
        <th>Platform</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
{arr_rows}
    </tbody>
  </table>
</div>

<footer class="footer">
  <span>Data: National Rail Darwin · via Huxley 2 · Open data licensed under OGL v3.0</span>
  <span><a href="/about">About</a> · <a href="/data">Data Sources</a> · <a href="/stations">All Stations</a></span>
</footer>

</div>

</body>
</html>'''

if __name__ == '__main__':
    crs = sys.argv[1] if len(sys.argv) > 1 else 'PAD'
    html = generate_html(crs)
    print(html)
