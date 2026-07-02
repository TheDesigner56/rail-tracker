// ── Web Push (VAPID) ───────────────────────────────────────────────────────
// Sends notifications to a stored PushSubscription. No-op unless the VAPID env
// vars are present. Reports `gone` for dead subscriptions so callers can prune.
const webpush = require('web-push');

let _ready;
// The VAPID public key is public by design; default it so only the private key
// (a real secret) needs to be set as an env var.
const DEFAULT_VAPID_PUBLIC = 'BFbJSWH4waLHPkR4yiZ5hxl2klXb9EjMA5n9bwkQdnT-uArR2YHF0szna0Q0Aly4zSaLoguNC3r5rMle6Ou9u0E';
const publicKey = () => process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC;
function init() {
  if (_ready !== undefined) return _ready;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:gideonmdavid@gmail.com', publicKey(), priv);
    _ready = true;
  } else { _ready = false; }
  return _ready;
}

async function send(sub, payload) {
  if (!init()) return { ok: false };
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600, urgency: 'high' },
    );
    return { ok: true };
  } catch (e) {
    const status = e && e.statusCode;
    return { ok: false, status, gone: status === 404 || status === 410 };
  }
}

module.exports = { init, send, publicKey, configured: () => init() };
