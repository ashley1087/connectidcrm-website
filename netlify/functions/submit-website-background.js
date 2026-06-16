// Netlify Background Function: submit-website-background
// Called when Local Website Onboarding form is submitted.
// 1. Inserts into Supabase client_onboarding
// 2. Fires Make webhook for website build automation
// 3. Adds a formatted note to the GHL contact record

const GHL_API      = 'https://services.leadconnectorhq.com';
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

function ghlHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

async function ghlAddNote(contactId, body, apiKey) {
  const res = await fetch(`${GHL_API}/contacts/${contactId}/notes`, {
    method: 'POST',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('GHL note error:', err);
  }
}

async function ghlAddTag(contactId, tag, apiKey) {
  await fetch(`${GHL_API}/contacts/${contactId}/tags`, {
    method: 'POST',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify({ tags: [tag] }),
  });
}

function formatWebsiteIntake(p) {
  const bool = (v) => v === true ? 'Yes' : v === false ? 'No' : '';
  const lines = [
    '🌐 Website Onboarding — Submitted ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    '',
    '── SECTION 1: BUSINESS IDENTITY ─────────',
    `Business name:     ${p.business_name       || ''}`,
    `Phone:             ${p.phone               || ''}`,
    `Email:             ${p.email               || ''}`,
    `Address:           ${[p.address_street, p.address_city, p.address_state, p.address_postal].filter(Boolean).join(', ')}`,
    `Existing website:  ${p.existing_website    || ''}`,
    `Primary trade:     ${p.primary_trade       || ''}`,
    `Regular hours:     ${p.hours_regular       || ''}`,
    `Emergency hours:   ${p.hours_emergency     || ''}`,
    '',
    '── SECTION 2: SERVICES ───────────────────',
    `All services:\n${p.services_all            || ''}`,
    `Top revenue drivers:\n${p.services_top     || ''}`,
    `Emergency services: ${bool(p.emergency_services)}${p.emergency_response_time ? ' — ' + p.emergency_response_time : ''}`,
    `Financing offered:  ${bool(p.financing_offered)}${p.financing_details ? ' — ' + p.financing_details : ''}`,
    `Guarantees/warranties: ${p.guarantees      || ''}`,
    '',
    '── SECTION 3: SERVICE AREAS ──────────────',
    `Primary city:      ${p.primary_city        || ''}`,
    `Priority areas:\n${p.priority_areas        || ''}`,
    `All service areas:\n${p.all_service_areas  || ''}`,
    `Excluded areas:    ${p.excluded_areas      || ''}`,
    '',
    '── SECTION 4: PROOF & TRUST ──────────────',
    `Years in business: ${p.years_in_business   || ''}`,
    `Jobs completed:    ${p.jobs_completed      || ''}`,
    `License numbers:   ${p.license_numbers     || ''}`,
    `Insurance:         ${p.insurance_details   || ''}`,
    `Certifications:    ${p.certifications      || ''}`,
    `Technician details:\n${p.technician_details || ''}`,
    `Customer reviews:\n${p.reviews             || ''}`,
    `Photo assets:      ${p.photo_assets        || ''}`,
    '',
    '── SECTION 5: LOCAL CONTEXT ──────────────',
    `Property types:    ${p.property_types      || ''}`,
    `Common problems:\n${p.common_problems      || ''}`,
    `Common job types:\n${p.common_job_types    || ''}`,
    `Local neighborhoods: ${p.local_neighborhoods || ''}`,
    '',
    '── SECTION 6: COMPETITION ────────────────',
    `Competitors:\n${p.competitors             || ''}`,
    `Differentiators:\n${p.differentiators     || ''}`,
    `Common objections: ${p.common_objections  || ''}`,
    '',
    '── SECTION 7: EXISTING SEO ───────────────',
    `Google Search Console: ${bool(p.gsc_access)}`,
    `Pages already ranking:\n${p.ranking_pages  || ''}`,
    `Pages to keep:\n${p.pages_to_keep         || ''}`,
  ];
  return lines.join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const MAKE_WEBHOOK = process.env.MAKE_WEBHOOK_WEBSITE;
  const GHL_KEY      = process.env.GHL_API_KEY;

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

  // ── 3. Add GHL note ───────────────────────────────────────────────────────
  const contactId = cleanPayload.ghl_contact_id || null;
  if (GHL_KEY && contactId) {
    const noteBody = formatWebsiteIntake(cleanPayload);
    await Promise.all([
      ghlAddNote(contactId, noteBody, GHL_KEY),
      ghlAddTag(contactId, 'website onboarding submitted', GHL_KEY),
    ]);
    console.log('GHL note + tag added for contact:', contactId);
  } else {
    if (!GHL_KEY) console.log('GHL_API_KEY not set — skipping GHL note');
    if (!contactId) console.log('No ghl_contact_id in payload — skipping GHL note');
  }

  return { statusCode: 202, body: '' };
};
