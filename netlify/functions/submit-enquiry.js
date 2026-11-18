// netlify/functions/submit-enquiry.js
//
// Saves consultation and contact-form enquiries into the "Enquiries" table in
// Airtable. Runs alongside Netlify Forms (which sends the email notification),
// so if this call fails the team still has the email.

// ---- Visa Readiness result email (sent through a Make webhook -> Zoho Mail) ----
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildResultEmail(name, dest, mail) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(mail.pct) || 0)));
  const ok = mail.qualified === true;
  const tips = (Array.isArray(mail.tips) ? mail.tips : []).slice(0, 6)
    .map((t) => String(t || '').trim().slice(0, 220)).filter(Boolean);
  const first = esc(String(name).trim().split(/\s+/)[0] || 'there');
  const bookUrl = 'https://tastewayfinders.com/consultation.html';
  const waMsg = 'Hello Taste Wayfinders, I passed the Visa Readiness Check and I want to start my application. Name: ' + name + (dest ? '. Destination: ' + dest : '') + '.';
  const waUrl = 'https://wa.me/2349152395723?text=' + encodeURIComponent(waMsg);
  const subject = ok
    ? 'Your Visa Readiness result: ' + pct + '%, you can proceed to apply'
    : 'Your Visa Readiness result: ' + pct + '%, next step is a consultation';
  const intro = ok
    ? 'Good news. Based on your answers, you are in a good position to start your application' + (dest ? ' for ' + esc(dest) : '') + '.'
    : 'Based on your answers, applying now' + (dest ? ' for ' + esc(dest) : '') + ' could be risky. A professional consultation will show you what to fix, and the right timing, before you apply.';
  const cta = ok
    ? '<p style="margin:22px 0 6px;"><a href="' + esc(waUrl) + '" style="background:#301A4D;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block;">Start my application on WhatsApp</a></p>'
      + '<p style="margin:6px 0;font-size:13px;color:#5B4B72;">Or message us on WhatsApp at +234 915 239 5723.</p>'
    : '<p style="margin:22px 0 6px;"><a href="' + bookUrl + '" style="background:#301A4D;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block;">Book a professional consultation (&#8358;20,000)</a></p>'
      + '<p style="margin:6px 0;font-size:13px;color:#5B4B72;">Booking link: <a href="' + bookUrl + '" style="color:#6C469C;">' + bookUrl + '</a></p>';
  const tipList = tips.length
    ? '<p style="margin:18px 0 6px;font-weight:bold;color:#301A4D;">' + (ok ? 'Tips to strengthen your application' : 'What to work on first') + '</p><ul style="margin:0 0 0 18px;padding:0;line-height:1.6;">'
      + tips.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>'
    : '';
  const html = '<div style="font-family:Arial,sans-serif;color:#241638;font-size:15px;line-height:1.55;max-width:560px;">'
    + '<p>Hello ' + first + ',</p>'
    + '<p>Thank you for completing the Taste Wayfinders Visa Readiness Check. Here is your result.</p>'
    + '<div style="background:#F3EEFA;border-radius:12px;padding:18px 20px;margin:16px 0;">'
    + '<div style="font-size:13px;letter-spacing:1px;color:#6C469C;font-weight:bold;">YOUR READINESS SCORE</div>'
    + '<div style="font-size:40px;font-weight:bold;color:#301A4D;line-height:1.2;">' + pct + '%</div>'
    + '<div style="background:#E1D6F2;border-radius:6px;height:10px;margin-top:8px;"><div style="background:#6C469C;border-radius:6px;height:10px;width:' + pct + '%;"></div></div>'
    + '</div>'
    + '<p>' + intro + '</p>'
    + tipList
    + cta
    + '<p style="margin-top:22px;font-size:12.5px;color:#5B4B72;">This score is a general readiness guide, not a visa decision or a guarantee. Visa outcomes are decided by the relevant embassy or immigration authority.</p>'
    + '<div style="margin-top:26px;color:#7030A0;"><div style="font-size:22px;font-weight:bold;">SUPPORT</div><div style="font-size:15px;">- Taste Wayfinders LTD</div>'
    + '<div style="margin-top:12px;font-size:14px;line-height:1.6;"><b>Email:</b> info@tastetravels.net<br><b>Phone:</b> +2349152395723<br><b>Instagram:</b> taste_wayfinders<br>Website: tastewayfinders.com</div></div>'
    + '</div>';
  return { subject, html };
}

async function sendResultEmail(to, name, dest, mail) {
  const url = process.env.MAKE_EMAIL_WEBHOOK_URL;
  if (!url || !mail || typeof mail !== 'object') return;
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(to)) return;
  const { subject, html } = buildResultEmail(name, dest, mail);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
      signal: ctrl.signal,
    });
  } catch (e) { /* the lead is already saved; never fail the request over the email */ }
  finally { clearTimeout(timer); }
}

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
  const allowed = ['contact', 'consultation', 'eligibility', 'newsletter'];
  const source = allowed.indexOf(data.source) > -1 ? data.source : 'consultation';

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
    if (source === 'eligibility') {
      await sendResultEmail(email, name, clean(data.interest, 200), data.mail);
    }
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: body.error || 'Could not save to Airtable.' }) };
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
