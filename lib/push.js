// ── Web Push (VAPID) ───────────────────────────────────────────────────────
// Sends notifications to a stored PushSubscription. No-op unless the VAPID env
// vars are present. Reports `gone` for dead subscriptions so callers can prune.
const webpush = require('web-push');

let _ready;
function init() {
  if (_ready !== undefined) return _ready;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@railtracker.uk', pub, priv);
    _ready = true;
  } else { _ready = false; }
  return _ready;
}
const publicKey = () => process.env.VAPID_PUBLIC_KEY || '';

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
