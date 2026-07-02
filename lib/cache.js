// ── Shared cache ────────────────────────────────────────────────────────────
// Serverless instances each carry their own memory, which fragments the cache
// and multiplies upstream calls under load (see SCALING.md, Stage 1). When
// Upstash Redis credentials are present (UPSTASH_REDIS_REST_URL/_TOKEN) the
// cache is shared across every instance via its REST API; otherwise it falls
// back to the original per-instance Map. Redis failures degrade to memory —
// the cache must never take the site down.
const mem = new Map();

const redisOn = () => !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

async function redisCmd(cmd) {
  const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).result;
}

async function cached(key, ttlMs, fn) {
  const now = Date.now();
  // Memory first — free even in Redis mode (a warm instance skips the network).
  const hit = mem.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;

  if (redisOn()) {
    try {
      const raw = await redisCmd(['GET', `rt:${key}`]);
      if (raw != null) {
        const v = JSON.parse(raw);
        mem.set(key, { v, t: now });
        return v;
      }
    } catch { /* fall through to compute */ }
  }

  const v = await fn();
  mem.set(key, { v, t: now });
  if (redisOn()) {
    // PX = TTL in ms; fire-and-forget so a slow Redis never delays a response.
    redisCmd(['SET', `rt:${key}`, JSON.stringify(v), 'PX', Math.max(1000, ttlMs)]).catch(() => {});
  }
  return v;
}

module.exports = { cached, _mem: mem };
