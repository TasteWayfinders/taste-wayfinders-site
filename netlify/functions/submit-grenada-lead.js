// netlify/functions/submit-grenada-lead.js
//
// Saves a Grenada Citizenship-by-Investment briefing request into its own
// Airtable table ("Grenada Leads"), tagging each submission with a lead tier
// computed from the IMIN qualification rules below. This runs alongside
// Netlify Forms (which already handles the email notification) — if this
// call fails, the visitor still sees the normal confirmation message, the
// team just also has the email as a fallback.
//
// Lead tier rules (per Immigrant Invest's qualification flow):
//   - Under $100,000 OR objective = "Overseas employment or study"
//       -> Not Qualified (not emailed the briefing/seminar sequence)
//   - $150,000+ AND timeframe 1-3 months   -> VIP / Hot Prospect
//   - $150,000+ AND timeframe 3-6 months   -> Qualified
//   - $150,000+ AND timeframe 6+ months    -> Nurture

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
  const capitalBracket = (data.capital_bracket || '').trim();
  const objective = (data.objective || '').trim();
  const timeframe = (data.timeframe || '').trim();

  if (!email || !fullName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields.' }),
    };
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_TOKEN;
  const tableName = 'Grenada Leads';

  if (!baseId || !token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is not configured yet. Missing Airtable credentials.' }),
    };
  }

  function computeTier(capital, obj, timing) {
    const isLowBudget = capital === 'Under $100,000';
    const isEmploymentStudy = obj === 'Overseas employment or study';
    if (isLowBudget || isEmploymentStudy) return 'Not Qualified';

    if (timing.indexOf('1–3') !== -1 || timing.indexOf('1-3') !== -1) return 'VIP / Hot Prospect';
    if (timing.indexOf('3–6') !== -1 || timing.indexOf('3-6') !== -1) return 'Qualified';
    if (timing.indexOf('6+') !== -1) return 'Nurture';
    return 'Qualified'; // fallback if timeframe text ever changes
  }

  const leadTier = computeTier(capitalBracket, objective, timeframe);

  const fields = {
    full_name: fullName,
    email: email,
    phone: data.phone || '',
    capital_bracket: capitalBracket,
    objective: objective,
    timeframe: timeframe,
    lead_tier: leadTier,
    submitted_at: new Date().toISOString(),
  };

  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // typecast lets Airtable auto-create new select options (e.g. lead_tier
      // values) the first time each one is used, instead of rejecting it.
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
      body: JSON.stringify({ ok: true, id: respData.records && respData.records[0] && respData.records[0].id, leadTier }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
