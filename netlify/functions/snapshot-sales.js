// netlify/functions/snapshot-sales.js
//
// Runs once a day. Reads current ticket counts for upcoming LA events from the
// Events table and appends one row per event to the Sales Snapshots table.
// Over time this builds the sales history Airtable doesn't keep on its own.
//
// Requires env var: AIRTABLE_TOKEN  (same one the airtable-proxy uses)

// Source: the shared Sofar Events base (read-only for us)
const EVENTS_BASE = 'appFjmrBPpOKVSdpz';
const EVENTS_TABLE = 'tbllbjaH51fEJ7T8I';

// Destination: our own Post Tracking base
const TRACKING_BASE = 'appde0DoLpwImXbA7';
const SNAPSHOTS_TABLE = 'tblEAs5M0xpWfIR1G';

// Events table field IDs
const F = {
  eventId:  'fld6kPXqYPAJ33zPy',
  sold:     'fld1sPVQ5eR8Z6mp1',
  capacity: 'fldpArwsw2bq6GwXU',
  revenue:  'fldjkoY11B00TaQxe',
  date:     'fldYZs4rzlAk3JSvW',
  city:     'fld7ACJAR43GQHQyz',
  venue:    'fldcuGwWp6gTEY9r3',
};

const AT = 'https://api.airtable.com/v0';

function laToday() {
  // YYYY-MM-DD in America/Los_Angeles regardless of where the function runs
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function airtable(path, options = {}) {
  const res = await fetch(`${AT}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchUpcomingLaEvents() {
  const today = laToday();
  // Only upcoming LA shows. Filter by field ID to survive field renames.
  const formula = encodeURIComponent(
    `AND({${F.city}} = 'la', IS_AFTER({${F.date}}, '${today}'))`
  );
  const fields = [F.eventId, F.sold, F.capacity, F.revenue, F.date, F.venue]
    .map(f => `fields[]=${f}`).join('&');

  let records = [];
  let offset;
  do {
    const url = `${EVENTS_BASE}/${EVENTS_TABLE}?filterByFormula=${formula}` +
                `&${fields}&returnFieldsByFieldId=true&pageSize=100` +
                (offset ? `&offset=${offset}` : '');
    const page = await airtable(url);
    records = records.concat(page.records);
    offset = page.offset;
  } while (offset);

  return records;
}

function selectName(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v.name) return v.name;
  if (Array.isArray(v) && v[0]) return v[0].name || String(v[0]);
  return String(v);
}

async function writeSnapshots(events, snapshotDate) {
  const rows = events
    .filter(r => r.fields[F.eventId])
    .map(r => ({
      fields: {
        'Snapshot Key': `${r.fields[F.eventId]}_${snapshotDate}`,
        'Event ID':     Number(r.fields[F.eventId]),
        'Snapshot Date': snapshotDate,
        'Tickets Sold': Number(r.fields[F.sold] || 0),
        'Capacity':     Number(r.fields[F.capacity] || 0),
        'Revenue':      Number(r.fields[F.revenue] || 0),
        'Show Date':    r.fields[F.date] || null,
        'Venue':        selectName(r.fields[F.venue]),
      },
    }));

  // Upsert on Snapshot Key so a re-run on the same day overwrites rather
  // than duplicating. Airtable caps writes at 10 records per request.
  for (let i = 0; i < rows.length; i += 10) {
    await airtable(`${TRACKING_BASE}/${SNAPSHOTS_TABLE}`, {
      method: 'PATCH',
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: ['Snapshot Key'] },
        records: rows.slice(i, i + 10),
        typecast: true,
      }),
    });
  }
  return rows.length;
}

export async function runSnapshot() {
  try {
    const snapshotDate = laToday();
    const events = await fetchUpcomingLaEvents();
    const written = await writeSnapshots(events, snapshotDate);
    console.log(`Snapshot ${snapshotDate}: wrote ${written} events`);
    return { ok: true, date: snapshotDate, events: written };
  } catch (err) {
    console.error('Snapshot failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// HTTP entry point. Visit this URL to run a snapshot on demand.
export default async function handler() {
  const result = await runSnapshot();
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
