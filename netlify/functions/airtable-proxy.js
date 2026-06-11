// netlify/functions/airtable-proxy.js
// Holds the Airtable token server-side. The browser never sees it.
// Set these in Netlify → Site settings → Environment variables:
//   AIRTABLE_TOKEN   (required)  a scoped, read-only Airtable personal access token
//   DASH_PASSCODE    (optional)  a shared team passcode; if set, callers must match it

const TOKEN = process.env.AIRTABLE_TOKEN;
const GATE  = process.env.DASH_PASSCODE;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-dash-pass, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  if (!TOKEN) {
    return { statusCode: 500, headers: cors,
      body: JSON.stringify({ error: { message: 'Server is missing AIRTABLE_TOKEN' } }) };
  }

  // Optional passcode gate (checked on the server)
  if (GATE) {
    const given = event.headers['x-dash-pass'] || event.headers['X-Dash-Pass'];
    if (given !== GATE) {
      return { statusCode: 401, headers: cors,
        body: JSON.stringify({ error: { message: 'Incorrect passcode' } }) };
    }
  }

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
