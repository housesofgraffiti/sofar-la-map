// netlify/functions/claude-proxy.js
// Forwards requests to the Anthropic API using a server-side API key.
// Set these in Netlify → Site settings → Environment variables:
//   CLAUDE_API_KEY   (required)  your Anthropic API key
//   DASH_PASSCODE    (optional)  shared team passcode; if set, callers must match it

const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
const GATE       = process.env.DASH_PASSCODE;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-dash-pass, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  if (!CLAUDE_KEY) {
    return { statusCode: 500, headers: cors,
      body: JSON.stringify({ error: { message: 'Server is missing CLAUDE_API_KEY' } }) };
  }

  // Passcode gate
  if (GATE) {
    const given = event.headers['x-dash-pass'] || event.headers['X-Dash-Pass'];
    if (given !== GATE) {
      return { statusCode: 401, headers: cors,
        body: JSON.stringify({ error: { message: 'Incorrect passcode' } }) };
    }
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: { message: 'Invalid JSON body' } }) }; }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
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
};
