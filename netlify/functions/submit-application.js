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

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4MB — stays under Airtable's 5MB API limit

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

  let recordId;

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

    recordId = respData.records && respData.records[0] && respData.records[0].id;
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }

  // Attach any uploaded documents to the new record. This is a best-effort
  // enhancement: the application itself is already saved above, so a failure
  // here (including the "documents" attachment field not existing yet in
  // Airtable) never fails the whole request — it just gets noted in the
  // response for debugging.
  const attachmentErrors = [];
  const attachments = Array.isArray(data.attachments) ? data.attachments.slice(0, MAX_ATTACHMENTS) : [];

  if (recordId && attachments.length) {
    for (const att of attachments) {
      if (!att || !att.base64 || !att.filename) continue;

      // Rough size check on the decoded content (base64 is ~4/3 the size of the original bytes).
      const approxBytes = Math.floor((att.base64.length * 3) / 4);
      if (approxBytes > MAX_ATTACHMENT_BYTES) {
        attachmentErrors.push(`${att.filename} was too large and was skipped.`);
        continue;
      }

      try {
        const uploadRes = await fetch(
          `https://content.airtable.com/v0/${baseId}/${recordId}/documents/uploadAttachment`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contentType: att.contentType || 'application/octet-stream',
              filename: att.filename,
              file: att.base64,
            }),
          }
        );
        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.json().catch(() => ({}));
          attachmentErrors.push(`${att.filename}: ${(uploadErr.error && uploadErr.error.message) || uploadRes.status}`);
        }
      } catch (err) {
        attachmentErrors.push(`${att.filename}: ${err.message}`);
      }
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      id: recordId,
      attachmentErrors: attachmentErrors.length ? attachmentErrors : undefined,
    }),
  };
};
