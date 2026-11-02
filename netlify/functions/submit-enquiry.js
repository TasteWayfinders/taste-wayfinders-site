// netlify/functions/submit-enquiry.js
//
// Saves consultation and contact-form enquiries into the "Enquiries" table in
// Airtable. Runs alongside Netlify Forms (which sends the email notification),
// so if this call fails the team still has the email.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }
  let data;
  try { data = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) }; }

  const clean = (v, max) => String(v || '').trim().slice(0, max || 500);
  const name = clean(data.name, 200);
  const email = clean(data.email, 200);
  if (!name || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields.' }) };
  }
  const source = data.source === 'contact' ? 'contact' : 'consultation';

  const baseId = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_TOKEN;
  if (!baseId || !token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is not configured yet.' }) };
  }

  const fields = {
    Name: name,
    Email: email,
    Phone: clean(data.phone, 60),
    Source: source,
    Interest: clean(data.interest, 200),
    Purpose: clean(data.purpose, 200),
    Message: clean(data.message, 4000),
    Submitted: new Date().toISOString(),
  };

  try {
    const res = await fetch('https://api.airtable.com/v0/' + baseId + '/' + encodeURIComponent('Enquiries'), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    const body = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: body.error || 'Could not save to Airtable.' }) };
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
