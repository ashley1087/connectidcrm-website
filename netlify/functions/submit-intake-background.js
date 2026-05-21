// Netlify Background Function: submit-intake-background
// POSTed to by the intake form after all 7 steps are complete.
// 1. Inserts intake into Supabase
// 2. Looks up GHL contact by email → adds note + tag
// 3. Waits 60 s for Make.com to create a ClickUp task ID
// 4. Re-fetches GHL contact → if ClickUp task ID found → creates subtask

const GHL_API      = 'https://services.leadconnectorhq.com';
const LOCATION_ID  = 'rZeTsPPOr6CElU2SG1jQ';
const SUPABASE_URL = 'https://ihjhfcuiofudkdpinkxo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloamhmY3Vpb2Z1ZGtkcGlua3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjgxNzQsImV4cCI6MjA5MzA0NDE3NH0.fvnL13SthNvKxCvjAdvintux50YkbL1rgMLSWUUrDEk';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Supabase helpers ────────────────────────────────────────────────────────
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

// ── GHL helpers ─────────────────────────────────────────────────────────────
function ghlHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

async function ghlFindContactByEmail(email, apiKey) {
  const res = await fetch(
    `${GHL_API}/contacts/?locationId=${LOCATION_ID}&email=${encodeURIComponent(email)}`,
    { headers: ghlHeaders(apiKey) }
  );
  const data = await res.json();
  return data?.contacts?.[0] || null;
}

async function ghlGetContact(contactId, apiKey) {
  const res = await fetch(`${GHL_API}/contacts/${contactId}`, {
    headers: ghlHeaders(apiKey),
  });
  const data = await res.json();
  return data?.contact || null;
}

async function ghlAddNote(contactId, body, apiKey) {
  await fetch(`${GHL_API}/contacts/${contactId}/notes`, {
    method: 'POST',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify({ body }),
  });
}

async function ghlAddTag(contactId, tag, apiKey) {
  await fetch(`${GHL_API}/contacts/${contactId}/tags`, {
    method: 'POST',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify({ tags: [tag] }),
  });
}

// ── Get the GHL custom field ID for clickup_task_id ─────────────────────────
async function getClickUpFieldId(apiKey) {
  const res = await fetch(`${GHL_API}/locations/${LOCATION_ID}/customFields`, {
    headers: ghlHeaders(apiKey),
  });
  const data = await res.json();
  const fields = data?.customFields || [];
  const field = fields.find(
    (f) => f.fieldKey === 'contact.clickup_task_id' || f.name?.toLowerCase().includes('clickup')
  );
  return field?.id || null;
}

// ── ClickUp helpers ─────────────────────────────────────────────────────────
async function clickupGetTask(taskId, apiKey) {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) return null;
  return res.json();
}

async function clickupCreateSubtask(parentTaskId, listId, name, description, apiKey) {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, parent: parentTaskId }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('ClickUp subtask create error:', JSON.stringify(data));
    return null;
  }
  return data;
}

// ── Format intake as readable note / description ────────────────────────────
function formatIntake(p) {
  const lines = [
    '📋 Strategy First Intake — Submitted ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    '',
    '── SECTION 1: ABOUT YOU ──────────────────',
    `Name:              ${p.contact_name     || ''}`,
    `Email:             ${p.contact_email    || ''}`,
    `Company:           ${p.company_name     || ''}`,
    `Phone:             ${p.phone            || ''}`,
    `Website:           ${p.website          || ''}`,
    `Address:           ${p.address          || ''}`,
    `Primary industry:  ${p.primary_industry || ''}`,
    `Secondary industry:${p.secondary_industry || ''}`,
    '',
    '── SECTION 2: BUSINESS OVERVIEW ─────────',
    `Mission & vision:\n${p.mission_vision     || ''}`,
    `Business goals:\n${p.business_goals       || ''}`,
    `Most profitable offers:\n${p.profitable_offers || ''}`,
    `Differentiators:\n${p.differentiators     || ''}`,
    `KPIs tracked:\n${p.kpis_tracked           || ''}`,
    '',
    '── SECTION 3: MARKETING ──────────────────',
    `Marketing goals:\n${p.marketing_goals         || ''}`,
    `Lead gen tactics:\n${p.lead_gen_tactics        || ''}`,
    `Lead gen process:\n${p.lead_gen_process        || ''}`,
    `Retention process:\n${p.retention_process      || ''}`,
    `#1 marketing challenge:\n${p.top_marketing_challenge || ''}`,
    '',
    '── SECTION 4: BRAND ──────────────────────',
    `Ideal client:\n${p.ideal_client          || ''}`,
    `Core message:\n${p.core_message          || ''}`,
    `Brand personality:\n${p.brand_personality || ''}`,
    `Brand identity assets:\n${p.brand_identity_assets || ''}`,
    `Competitor 1: ${p.competitor_1_name || ''} — ${p.competitor_1_url || ''}`,
    `Competitor 2: ${p.competitor_2_name || ''} — ${p.competitor_2_url || ''}`,
    `Competitor 3: ${p.competitor_3_name || ''} — ${p.competitor_3_url || ''}`,
    '',
    '── SECTION 5: GROWTH ─────────────────────',
    `Marketing channels: ${Array.isArray(p.marketing_channels) ? p.marketing_channels.join(', ') : (p.marketing_channels || '')}`,
    `Other channels: ${p.marketing_channels_other || ''}`,
    `Sales cycle:\n${p.sales_cycle           || ''}`,
    `Content strategy:\n${p.has_content_strategy || ''}`,
    `Marketing budget:\n${p.marketing_budget   || ''}`,
    `Marketing tech:\n${p.marketing_tech       || ''}`,
    `Marketing team:\n${p.marketing_team       || ''}`,
    `Previous materials:\n${p.previous_materials || ''}`,
    '',
    '── SECTION 6: CUSTOMER EXPERIENCE ───────',
    `Transaction process:\n${p.transaction_process   || ''}`,
    `Onboarding process:\n${p.onboarding_process     || ''}`,
    `After-sale follow-up:\n${p.after_sale_followup  || ''}`,
    `Satisfaction process:\n${p.satisfaction_process || ''}`,
    '',
    '── SECTION 7: ONLINE PRESENCE ────────────',
    `Google Business: ${p.url_google_business || ''}`,
    `Facebook:        ${p.url_facebook        || ''}`,
    `Instagram:       ${p.url_instagram       || ''}`,
    `LinkedIn:        ${p.url_linkedin        || ''}`,
    `YouTube:         ${p.url_youtube         || ''}`,
    `X/Twitter:       ${p.url_x               || ''}`,
    `Other:           ${p.url_other           || ''}`,
  ];
  return lines.join('\n');
}

// ── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // Background functions must return 202 quickly; heavy work continues after
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GHL_KEY      = process.env.GHL_API_KEY;
  const CLICKUP_KEY  = process.env.CLICKUP_API_KEY;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const token = payload.invitation_token || null;

  // ── 1. Insert into Supabase ─────────────────────────────────────────────
  const cleanPayload = { ...payload };
  Object.keys(cleanPayload).forEach((k) => {
    if (cleanPayload[k] === '') cleanPayload[k] = null;
  });
  await sbInsert('strategy_first_intakes', cleanPayload);

  if (!GHL_KEY) {
    console.error('GHL_API_KEY not set — skipping GHL/ClickUp steps');
    return { statusCode: 202, body: '' };
  }

  // ── 2. Look up GHL contact by email ─────────────────────────────────────
  const email = payload.contact_email || '';
  if (!email) {
    console.error('No contact_email in payload — cannot update GHL');
    return { statusCode: 202, body: '' };
  }

  const contact = await ghlFindContactByEmail(email, GHL_KEY);
  if (!contact) {
    console.error('GHL contact not found for email:', email);
    return { statusCode: 202, body: '' };
  }
  const contactId = contact.id;

  // ── 3. Add note + tag ────────────────────────────────────────────────────
  const noteBody = formatIntake(payload);
  await Promise.all([
    ghlAddNote(contactId, noteBody, GHL_KEY),
    ghlAddTag(contactId, 'strategy first intake submitted', GHL_KEY),
  ]);
  console.log('GHL note + tag added for contact:', contactId);

  // ── 4. Wait 60 s for Make.com to populate the ClickUp task ID ───────────
  if (!CLICKUP_KEY) {
    console.log('CLICKUP_API_KEY not set — skipping ClickUp subtask');
    return { statusCode: 202, body: '' };
  }

  await sleep(60000);

  // ── 5. Re-fetch contact to get ClickUp task ID ───────────────────────────
  const fieldId        = await getClickUpFieldId(GHL_KEY);
  const freshContact   = await ghlGetContact(contactId, GHL_KEY);
  const customFields   = freshContact?.customFields || [];

  let clickUpTaskId = null;
  if (fieldId) {
    const field = customFields.find((f) => f.id === fieldId);
    clickUpTaskId = field?.value || null;
  }
  // Fallback: scan all custom fields for anything that looks like a ClickUp task ID
  if (!clickUpTaskId) {
    const fallback = customFields.find(
      (f) => f.value && /^[a-z0-9]{6,10}$/i.test(String(f.value).trim())
    );
    clickUpTaskId = fallback?.value || null;
  }

  if (!clickUpTaskId) {
    console.log('No ClickUp task ID found after 60 s — skipping subtask creation');
    return { statusCode: 202, body: '' };
  }

  // ── 6. Get parent task to find its list ID ────────────────────────────────
  const parentTask = await clickupGetTask(clickUpTaskId, CLICKUP_KEY);
  if (!parentTask?.list?.id) {
    console.error('Could not fetch ClickUp parent task:', clickUpTaskId);
    return { statusCode: 202, body: '' };
  }

  // ── 7. Create subtask ─────────────────────────────────────────────────────
  const subtaskName = `Strategy First Intake — ${payload.company_name || payload.contact_name || email}`;
  const subtask = await clickupCreateSubtask(
    clickUpTaskId,
    parentTask.list.id,
    subtaskName,
    noteBody,
    CLICKUP_KEY
  );

  if (subtask) {
    console.log('ClickUp subtask created:', subtask.id, subtask.url);
  }

  return { statusCode: 202, body: '' };
};
