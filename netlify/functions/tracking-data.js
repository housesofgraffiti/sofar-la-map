// netlify/functions/tracking-data.js
//
// Read-only. Returns everything the post-impact dashboard panel needs:
// the daily sales snapshots and the post log, from the Post Tracking base.
//
// Requires env var: AIRTABLE_TOKEN

const TRACKING_BASE = 'appde0DoLpwImXbA7';
const SNAPSHOTS_TABLE = 'tblEAs5M0xpWfIR1G';
const POSTLOG_TABLE = 'tbl7B4IuYGVkcNtOa';

const AT = 'https://api.airtable.com/v0';

async function fetchAll(tableId) {
  let records = [];
  let offset;
  do {
    const url = `${AT}/${TRACKING_BASE}/${tableId}?pageSize=100` +
                (offset ? `&offset=${offset}` : '');
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` },
    });
    if (!res.ok) throw new Error(`${tableId} ${res.status}: ${await res.text()}`);
    const page = await res.json();
    records = records.concat(page.records.map(r => r.fields));
    offset = page.offset;
  } while (offset);
  return records;
}

export default async function handler() {
  try {
    const [snapshots, posts] = await Promise.all([
      fetchAll(SNAPSHOTS_TABLE),
      fetchAll(POSTLOG_TABLE),
    ]);
    return new Response(JSON.stringify({ snapshots, posts }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
