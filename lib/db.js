// ── Supabase data access (trips + push subscriptions) ──────────────────────
// All access is server-side with the service-role key (RLS is on; the public
// never touches the database directly). If the env vars aren't set, every call
// degrades to a no-op so the rest of the app keeps working.
const { createClient } = require('@supabase/supabase-js');

let _sb;
function sb() {
  if (_sb !== undefined) return _sb;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  _sb = (url && key) ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return _sb;
}
const configured = () => !!sb();

async function saveTrip(t) {
  const c = sb(); if (!c) throw new Error('storage not configured');
  const { data, error } = await c.from('trips').insert(t).select().single();
  if (error) throw error; return data;
}
async function listTrips(owner) {
  const c = sb(); if (!c || !owner) return [];
  const { data } = await c.from('trips').select('*').eq('owner', owner).eq('active', true).order('travel_date');
  return data || [];
}
async function getTrip(id) {
  const c = sb(); if (!c) return null;
  const { data } = await c.from('trips').select('*').eq('id', id).single();
  return data || null;
}
async function deleteTrip(id, owner) {
  const c = sb(); if (!c) return;
  await c.from('trips').update({ active: false }).eq('id', id).eq('owner', owner);
}
async function activeTrips() {
  const c = sb(); if (!c) return [];
  const { data } = await c.from('trips').select('*').eq('active', true);
  return data || [];
}
async function markTrip(id, patch) {
  const c = sb(); if (!c) return;
  await c.from('trips').update(patch).eq('id', id);
}
async function saveSub(s) {
  const c = sb(); if (!c) throw new Error('storage not configured');
  await c.from('push_subs').upsert(s, { onConflict: 'endpoint' });
}
async function subsFor(owner) {
  const c = sb(); if (!c || !owner) return [];
  const { data } = await c.from('push_subs').select('*').eq('owner', owner);
  return data || [];
}
async function removeSub(endpoint) {
  const c = sb(); if (!c) return;
  await c.from('push_subs').delete().eq('endpoint', endpoint);
}

module.exports = { configured, saveTrip, listTrips, getTrip, deleteTrip, activeTrips, markTrip, saveSub, subsFor, removeSub };
