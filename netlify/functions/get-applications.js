// netlify/functions/get-applications.js
//
// Returns ONLY the logged-in client's own application records.
// Netlify automatically verifies the Identity JWT and populates
// context.clientContext.user for us — we never trust anything the
// browser sends about "who am I", only what Netlify itself confirms.

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;

  if (!user || !user.email) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Not logged in.' }),
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

  // Only ever fetch rows matching this exact logged-in user's email —
  // this is the line that keeps Client A from ever seeing Client B's data.
  const formula = `{client_email} = '${user.email.replace(/'/g, "\\'")}'`;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=updated_at&sort[0][direction]=desc`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: data.error || 'Could not reach Airtable.' }),
      };
    }

    const records = (data.records || []).map((r) => ({
      id: r.id,
      service: r.fields.service || 'General enquiry',
      status: r.fields.status || 'Submitted',
      notes: r.fields.notes || '',
      document_link: r.fields.document_link || '',
      // "documents" is an Airtable Attachment-type field: an array of files,
      // each with its own hosted url/filename. Note these urls are only
      // guaranteed valid for a couple of hours after Airtable returns them,
      // which is fine since the client is viewing them live right now.
      documents: Array.isArray(r.fields.documents)
        ? r.fields.documents.map((f) => ({ url: f.url, filename: f.filename }))
        : [],
      updated_at: r.fields.updated_at || r.createdTime,
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
