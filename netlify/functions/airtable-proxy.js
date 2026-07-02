// netlify/functions/airtable-proxy.js
// Holds the Airtable token server-side. The browser never sees it.
// Set these in Netlify → Site settings → Environment variables:
//   AIRTABLE_TOKEN   (required)  an Airtable personal access token, scoped to the
//                                 Sofar Events base, with BOTH data.records:read
//                                 AND data.records:write. (Upgrading from the old
//                                 read-only token is a self-serve change on your
//                                 own Airtable account — Account → Developer hub →
//                                 Personal access tokens. No external admin needed.)
//   DASH_PASSCODE    (optional)  a shared team passcode; if set, callers must match it
//
// GET   → read records (unchanged behavior)
// PATCH → batch-update records. Body: { "baseId": "...", "table": "...",
//          "records": [ { "id": "recXXXXXXXXXXXXXX", "fields": { "Tickets Sold": 42 } }, ... ] }
//          Airtable caps batch updates at 10 records per call — split larger
//          syncs into multiple PATCH requests.

const TOKEN = process.env.airtable_api;
const GATE  = process.env.Dash_Passcode;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-dash-pass, content-type',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  if (!TOKEN) {
    return { statusCode: 500, headers: cors,
      body: JSON.stringify({ error: { message: 'Server is missing AIRTABLE_TOKEN' } }) };
  }

  // Passcode gate (checked on the server) — applies to both GET and PATCH
  if (GATE) {
    const given = event.headers['x-dash-pass'] || event.headers['X-Dash-Pass'];
    if (given !== GATE) {
      return { statusCode: 401, headers: cors,
        body: JSON.stringify({ error: { message: 'Incorrect passcode' } }) };
    }
  }

  // ── PATCH: batch-update up to 10 records ──────────────────────────────
  if (event.httpMethod === 'PATCH') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: cors,
      body: JSON.stringify({ error: { message: 'Invalid JSON body' } }) }; }

    const { baseId, table, records } = body;
    if (!baseId || !table) {
      return { statusCode: 400, headers: cors,
        body: JSON.stringify({ error: { message: 'Missing baseId or table' } }) };
    }
    if (!Array.isArray(records) || records.length === 0) {
      return { statusCode: 400, headers: cors,
        body: JSON.stringify({ error: { message: 'Missing or empty records array' } }) };
    }
    if (records.length > 10) {
      return { statusCode: 400, headers: cors,
        body: JSON.stringify({ error: { message: 'Airtable allows max 10 records per batch — split into multiple calls' } }) };
    }
    for (const rec of records) {
      if (!rec.id || !rec.fields) {
        return { statusCode: 400, headers: cors,
          body: JSON.stringify({ error: { message: 'Each record needs an id and a fields object' } }) };
      }
    }

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
    try {
      const r = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records }),
      });
      const data = await r.json();
      return {
        statusCode: r.status,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(data),
      };
    } catch (e) {
      return { statusCode: 502, headers: cors,
        body: JSON.stringify({ error: { message: e.message } }) };
    }
  }

  // ── GET: read records (unchanged) ─────────────────────────────────────
  const q = event.queryStringParameters || {};
  const { baseId, table, pageSize, offset, filterByFormula } = q;

  if (!baseId || !table) {
    return { statusCode: 400, headers: cors,
      body: JSON.stringify({ error: { message: 'Missing baseId or table' } }) };
  }

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  if (pageSize)       url.searchParams.set('pageSize', pageSize);
  if (offset)         url.searchParams.set('offset', offset);
  if (filterByFormula) url.searchParams.set('filterByFormula', filterByFormula);

  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const data = await r.json();
    return {
      statusCode: r.status,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return { statusCode: 502, headers: cors,
      body: JSON.stringify({ error: { message: e.message } }) };
  }
};
