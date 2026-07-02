// ── Per-trip live check ────────────────────────────────────────────────────
// Reads the live picture for every leg of a saved trip and produces a short,
// plain-language advisory: is the booked train delayed/cancelled, is a tube /
// Elizabeth line leg disrupted, and does any delay threaten a tight changeover.
const rail = require('./rail');
const parseHHMM = rail.parseHHMM;

async function checkTrip(trip) {
  const legs = (trip && trip.legs) || [];
  const issues = [];
  let worst = 'ok';
  const bump = (sev) => { if (sev === 'major') worst = 'major'; else if (sev === 'minor' && worst === 'ok') worst = 'minor'; };

  // 1) Train legs — is the specific service delayed or cancelled?
  for (const l of legs) {
    if (l.mode !== 'train') continue;
    let delay = 0, cancelled = false;
    try {
      if (l.serviceId) {
        const svc = await rail.getService(l.serviceId, trip.travel_date);
        cancelled = /cancel/i.test(svc.status || '');
        delay = svc.currentDelay || 0;
        const toStop = (svc.stops || []).find((s) => s.name && l.to && s.name.includes(l.to));
        if (toStop && toStop.delay) delay = Math.max(delay, toStop.delay);
      } else if (l.fromCode) {
        const b = await rail.getBoard(l.fromCode, 'departures', String(l.dep || '').replace(':', ''));
        const m = (b.services || []).find((s) => parseHHMM(s.scheduled) === parseHHMM(l.dep))
          || (b.services || []).find((s) => l.to && s.place && s.place.toLowerCase().includes(String(l.to).toLowerCase()));
        if (m) { cancelled = m.cancelled; delay = m.delay || 0; }
      }
    } catch { /* if we can't read it, treat as on time */ }
    l._delay = delay; l._cancelled = cancelled;
    if (cancelled) { issues.push({ sev: 'major', text: `Your ${l.dep} ${l.from} → ${l.to} train is cancelled — find an alternative.` }); bump('major'); }
    else if (delay >= 10) { issues.push({ sev: 'major', text: `Your ${l.dep} ${l.from} → ${l.to} train is running about +${delay} min late.` }); bump('major'); }
    else if (delay > 0) { issues.push({ sev: 'minor', text: `Your ${l.dep} ${l.from} → ${l.to} train is about +${delay} min late.` }); bump('minor'); }
  }

  // 2) TfL legs — any active line disruption?
  const tflModes = [...new Set(legs.filter((l) => ['tube', 'elizabeth-line', 'overground', 'dlr', 'tram'].includes(l.mode)).map((l) => l.mode))];
  if (tflModes.length) {
    const status = await rail.getTflLineStatus(tflModes).catch(() => ({}));
    for (const l of legs) {
      if (!tflModes.includes(l.mode)) continue;
      const k = l.line ? l.line.toLowerCase().replace(/ line$/, '') : (l.mode === 'elizabeth-line' ? 'elizabeth' : l.mode === 'dlr' ? 'dlr' : null);
      const a = k && status[k];
      if (a && !issues.some((x) => x.text.startsWith(a.line))) {
        const major = /suspend|severe|no service|part|closed/i.test(a.severity);
        issues.push({ sev: major ? 'major' : 'minor', text: `${a.line}: ${a.severity}${a.reason ? ' — ' + a.reason : ''}` });
        bump(major ? 'major' : 'minor');
      }
    }
  }

  // 3) Changeover risk — a delayed leg eating into a tight connection.
  for (let i = 0; i < legs.length - 1; i++) {
    const a = legs[i], b = legs[i + 1];
    if (a.mode === 'train' && a.arr && b.dep) {
      const gap = (parseHHMM(b.dep) - parseHHMM(a.arr) + 1440) % 1440;
      const delay = a._delay || 0;
      if (delay > 0 && gap < 720 && delay >= gap - 4) {
        issues.push({ sev: 'major', text: `Tight change at ${a.to}: a +${delay} min delay leaves about ${Math.max(0, gap - delay)} min for your ${b.dep} ${b.line || 'connection'} — have a backup in mind.` });
        bump('major');
      }
    }
  }

  const summary = issues.length
    ? (worst === 'major' ? 'Action may be needed — ' : 'Heads-up — ') + issues[0].text
    : 'All clear — every leg of your trip is running to time.';
  return { worst, issues, summary, checkedAt: new Date().toISOString() };
}

module.exports = { checkTrip };
