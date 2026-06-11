// Netlify Background Function: submit-website-background
// Called when Local Website Onboarding form is submitted.
// 1. Inserts into Supabase client_onboarding
// 2. Fires Make webhook for website build automation

const SUPABASE_URL = 'https://ihjhfcuiofudkdpinkxo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloamhmY3Vpb2Z1ZGtkcGlua3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjgxNzQsImV4cCI6MjA5MzA0NDE3NH0.fvnL13SthNvKxCvjAdvintux50YkbL1rgMLSWUUrDEk';

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbInsert(table, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Supabase insert error (${table}):`, err);
    return false;
  }
  return true;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const MAKE_WEBHOOK = process.env.MAKE_WEBHOOK_WEBSITE;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Clean empty strings
  const cleanPayload = { ...payload };
  Object.keys(cleanPayload).forEach((k) => {
    if (cleanPayload[k] === '') cleanPayload[k] = null;
  });

  // Coerce booleans
  cleanPayload.emergency_services = cleanPayload.emergency_services === true || cleanPayload.emergency_services === 'true';
  cleanPayload.financing_offered  = cleanPayload.financing_offered  === true || cleanPayload.financing_offered  === 'true';
  cleanPayload.gsc_access         = cleanPayload.gsc_access         === true || cleanPayload.gsc_access         === 'true';
  if (cleanPayload.years_in_business) {
    cleanPayload.years_in_business = parseInt(cleanPayload.years_in_business) || null;
  }

  // ── 1. Insert into Supabase ───────────────────────────────────────────────
  await sbInsert('client_onboarding', cleanPayload);

  // ── 2. Fire Make webhook ──────────────────────────────────────────────────
  if (MAKE_WEBHOOK) {
    try {
      await fetch(MAKE_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_type: 'website', ...cleanPayload }),
      });
      console.log('Make webhook fired (Website)');
    } catch (e) {
      console.error('Make webhook error (Website):', e.message);
    }
  }

  return { statusCode: 202, body: '' };
};
