// netlify/functions/submit-application.js
//
// Saves an "Apply Now" form submission into Airtable so it shows up in the
// client's "My Applications" dashboard (account.html -> get-applications.js).
//
// This runs ALONGSIDE Netlify Forms, not instead of it: the form still submits
// to Netlify Forms first (so the team keeps getting email notifications no
// matter what), and this function is called afterwards as an enhancement. If
// this call fails for any reason, the visitor still sees their normal success
// message — the team just also has the email as a fallback.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request body.' }),
    };
  }

  const email = (data.email || '').trim();
  const fullName = (data.full_name || '').trim();

  if (!email || !fullName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields.' }),
    };
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_TOKEN;
  const tableName = 'Applications';

  if (!baseId || !token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is not configured yet. Missing Airtable credentials.' }),
    };
  }

  // The Applications table only has a single free-text "notes" field, so we
  // fold the extra context the form collects (phone, destination, timeline,
  // document status, message) into one readable block rather than losing it.
  const extraDetails = [
    data.phone ? `Phone/WhatsApp: ${data.phone}` : null,
    data.destination ? `Destination: ${data.destination}` : null,
    data.timeline ? `Timeline: ${data.timeline}` : null,
    data.documents_status ? `Documents on hand: ${data.documents_status}` : null,
    data.message ? `Message: ${data.message}` : null,
  ].filter(Boolean).join('\n');

  const fields = {
    client_email: email,
    full_name: fullName,
    service: data.service || 'General enquiry',
    status: 'Submitted',
    notes: extraDetails,
    updated_at: new Date().toISOString(),
  };

  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // typecast lets Airtable auto-create the "Submitted" option on the status
      // field the first time it's used, instead of rejecting an unknown value.
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    const respData = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: respData.error || 'Could not save to Airtable.' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, id: respData.records && respData.records[0] && respData.records[0].id }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
