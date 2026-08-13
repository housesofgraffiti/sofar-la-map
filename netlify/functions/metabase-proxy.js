// netlify/functions/metabase-proxy.js
// Serves LA show data straight from Metabase (the source of truth) instead of Airtable.
//
// Why: Airtable's sync from the Sofar platform lags and drops records. Verified 2026-08-13:
// Tiki Too 8/16 was 43/43 SOLD OUT in the platform but 26 in Airtable, and the 8/13
// Dead Lady Vintage show (70 sold, $2,072) was missing from Airtable entirely.
//
// Response deliberately mimics Airtable's shape — { records: [ { id, fields } ] } — so the
// dashboard's existing field mapping, projections and per-show adjustments work unchanged.
// `id` is the Metabase event_id as a string.
//
// Netlify env vars required:
//   metabase_url       e.g. https://sofar-sounds.metabaseapp.com   (no trailing slash)
//   metabase_api_key   a Metabase API key (Admin > Settings > Authentication > API keys)
//   Dash_Passcode      optional; gate is currently disabled to match the other functions
//
// Query params:  ?month=YYYY-MM   (one month)   |   ?all=1   (everything from 2023-11-01)

const MB_URL = (process.env.metabase_url || '').replace(/\/+$/, '');
const MB_KEY = process.env.metabase_api_key;
const DB_ID  = 2; // Redshift warehouse

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-dash-pass, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'content-type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  // ── GATE DISABLED ── temporary, authorized for a presentation. Reinstate by
  // uncommenting the block below. Do not delete — this is meant to come back.
  // const GATE = process.env.Dash_Passcode;
  // if (GATE) {
  //   const given = event.headers['x-dash-pass'] || event.headers['X-Dash-Pass'];
  //   if (given !== GATE) {
  //     return { statusCode: 401, headers: cors,
  //       body: JSON.stringify({ error: { message: 'Incorrect passcode' } }) };
  //   }
  // }

  if (!MB_URL || !MB_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({
      error: { message: 'Server is missing metabase_url or metabase_api_key' } }) };
  }

  // ---- work out the date window -------------------------------------------------
  const q = event.queryStringParameters || {};
  let from = '2023-11-01', to = '2100-01-01';
  if (!q.all) {
    const m = /^(\d{4})-(\d{2})$/.exec(q.month || '');
    if (!m) return { statusCode: 400, headers: cors, body: JSON.stringify({
      error: { message: 'Pass ?month=YYYY-MM or ?all=1' } }) };
    const y = +m[1], mo = +m[2];
    const pad = n => String(n).padStart(2, '0');
    from = `${y}-${pad(mo)}-01`;
    to   = mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01`;
  }

  const sql = `
    SELECT
      s.event_id,
      s.local_starts_at::date                       AS show_date,
      v.venue_name                                  AS venue,
      v.neighborhood_cached_slug                    AS neighborhood,
      f.tickets_sold                                AS sold,
      f.num_tickets_available_for_sale              AS cap,
      ROUND(f.total_charge_amount_less_fees_usd, 2) AS revenue
    FROM _blessed.event_summary s
    JOIN _blessed.event_financials f ON f.event_id = s.event_id
    LEFT JOIN _blessed.venues v      ON v.venue_id = s.venue_id
    WHERE s.city_cached_slug = 'la'
      AND s.is_cancelled = false
      AND s.local_starts_at >= '${from}'
      AND s.local_starts_at <  '${to}'
    ORDER BY s.local_starts_at`;

  try {
    const r = await fetch(`${MB_URL}/api/dataset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': MB_KEY },
      body: JSON.stringify({ database: DB_ID, type: 'native', native: { query: sql } }),
    });
    const data = await r.json();
    if (!r.ok || data.status === 'failed') {
      return { statusCode: r.ok ? 502 : r.status, headers: cors, body: JSON.stringify({
        error: { message: data.error || `Metabase returned ${r.status}` } }) };
    }

    const cols = (data.data.cols || []).map(c => c.name);
    const idx  = n => cols.indexOf(n);
    const iId = idx('event_id'), iDate = idx('show_date'), iVen = idx('venue'),
          iNb = idx('neighborhood'), iSold = idx('sold'), iCap = idx('cap'), iRev = idx('revenue');

    const records = (data.data.rows || []).map(row => ({
      id: String(row[iId]),                       // event_id doubles as the record key
      fields: {
        'Event ID':           Number(row[iId]),
        'Show Date':          String(row[iDate] || '').slice(0, 10),
        'Venue Name':         row[iVen] || '',
        'Neighborhood Cache': row[iNb] || '',
        'Tickets Sold':       Number(row[iSold]) || 0,
        'Tickets Available':  Number(row[iCap]) || 0,
        'USD Revenue':        Number(row[iRev]) || 0,
        'City':               'la',
      },
    }));

    return { statusCode: 200, headers: cors, body: JSON.stringify({ records }) };
  } catch (e) {
    return { statusCode: 502, headers: cors,
      body: JSON.stringify({ error: { message: e.message } }) };
  }
};
