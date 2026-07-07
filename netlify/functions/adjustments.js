// Shared store for per-show manual adjustments — the "prepped forecast" the whole
// team sees. Lives entirely in this Netlify project (Netlify Blobs), no Airtable needed.
//   GET  -> returns the full map { recordId: { factorId: true, ... }, ... }
//   POST -> body { id, adj }  saves (or clears, if adj is empty) one show's factors
// Passcode-gated, same Dash_Passcode as the other functions.
exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-dash-pass',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  const GATE = process.env.Dash_Passcode;
  const pass = event.headers['x-dash-pass'] || event.headers['X-Dash-Pass'];
  if (GATE && pass !== GATE) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Invalid passcode' }) };
  }

  let store;
  try {
    const { getStore } = await import('@netlify/blobs');
    store = getStore('sofar-adjustments');
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'blobs unavailable: ' + e.message }) };
  }
  const KEY = 'all';

  try {
    if (event.httpMethod === 'GET') {
      const data = (await store.get(KEY, { type: 'json' })) || {};
      return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
    }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const id = body.id;
      const adj = body.adj;
      if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'missing id' }) };
      const data = (await store.get(KEY, { type: 'json' })) || {};
      if (adj && Object.keys(adj).length) data[id] = adj; else delete data[id];
      await store.set(KEY, JSON.stringify(data));
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, count: Object.keys(data).length }) };
    }
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
  return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'method not allowed' }) };
};
