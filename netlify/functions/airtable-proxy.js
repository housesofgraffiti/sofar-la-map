exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-airtable-token',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  const token = event.headers['x-airtable-token'];
  if (!token) {
    return {
      statusCode: 401,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Missing x-airtable-token header' } })
    };
  }

  const {
    baseId = 'appFjmrBPpOKVSdpz',
    table = 'Events',
    pageSize = '100',
    offset,
    filterByFormula
  } = event.queryStringParameters || {};

  const params = new URLSearchParams({ pageSize });
  if (offset) params.append('offset', offset);
  if (filterByFormula) params.append('filterByFormula', filterByFormula);

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${params}`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    return {
      statusCode: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: err.message } })
    };
  }
};
