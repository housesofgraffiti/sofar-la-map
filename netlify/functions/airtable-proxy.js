const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-airtable-token',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const token = event.headers['x-airtable-token'];
  if (!token) {
    return {
      statusCode: 401,
      headers: CORS,
      body: JSON.stringify({ error: { message: 'Missing x-airtable-token header' } })
    };
  }

  const {
    baseId = 'appFjmrBPpOKVSdpz',
    table = 'Events',
    recordId,
    pageSize = '100',
    offset,
    filterByFormula
  } = event.queryStringParameters || {};

  const headers = { ...CORS, 'Content-Type': 'application/json' };

  try {
    // DELETE a single record
    if (event.httpMethod === 'DELETE') {
      if (!recordId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: { message: 'Missing recordId' } }) };
      }
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`;
      const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      return { statusCode: res.status, headers, body: JSON.stringify(data) };
    }

    // GET records
    const params = new URLSearchParams({ pageSize });
    if (offset) params.append('offset', offset);
    if (filterByFormula) params.append('filterByFormula', filterByFormula);

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${params}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    return { statusCode: res.status, headers, body: JSON.stringify(data) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: { message: err.message } }) };
  }
};
