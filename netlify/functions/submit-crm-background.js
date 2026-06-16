// Netlify Background Function: submit-crm-background
// Called when CRM onboarding form is submitted.
// 1. Inserts into Supabase crm_onboarding
// 2. Fires Make webhook for CRM automation
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

function formatCrmIntake(p) {
  const bool = (v) => v === true ? 'Yes' : v === false ? 'No' : '';
  const qualifiedActionLabels = {
    book_calendar: 'Book them on calendar automatically',
    notify_me:     'Notify me immediately to call/text personally',
    both:          'Both — book them and notify me',
  };
  const reviewResponseLabels = {
    auto:      'Auto-respond — AI posts automatically',
    suggested: 'Suggested — AI drafts, I approve and post',
    none:      'No — handle reviews manually',
  };
  const lines = [
    '📋 CRM Onboarding — Submitted ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    '',
    '── SECTION 1: CONTACT INFO ───────────────',
    `Name:              ${[p.first_name, p.last_name].filter(Boolean).join(' ')}`,
    `Email:             ${p.email              || ''}`,
    '',
    '── SECTION 2: BUSINESS INFO ──────────────',
    `Niche / Industry:  ${p.niche             || ''}`,
    `All services:\n${p.all_services          || ''}`,
    `Services excluded: ${p.services_excluded || ''}`,
    `Service area:      ${p.service_area      || ''}`,
    `Excluded areas:    ${p.excluded_service_areas || ''}`,
    `Business hours:    ${p.business_hours    || ''}`,
    '',
    '── SECTION 3: CALLS & SMS ────────────────',
    `Call forwarding:   ${p.call_forwarding_number   || ''}`,
    `SMS notifications: ${p.sms_notifications_number || ''}`,
    `System notify email: ${p.email_notifications    || ''}`,
    `Business "from" email: ${p.business_from_email  || ''}`,
    `Voicemail message:\n${p.voicemail_message       || ''}`,
    '',
    '── SECTION 4: LEAD NOTIFICATIONS ────────',
    `Intake team:       ${[p.intake_team_sms && 'SMS', p.intake_team_email && 'Email', p.intake_team_inapp && 'In-App'].filter(Boolean).join(', ') || ''}`,
    `Sales team:        ${[p.sales_team_sms && 'SMS', p.sales_team_email && 'Email', p.sales_team_inapp && 'In-App'].filter(Boolean).join(', ') || ''}`,
    '',
    '── SECTION 5: ESTIMATES ──────────────────',
    `Free estimates:    ${p.offers_free_estimates === true ? 'Yes' : p.offers_free_estimates === false ? 'No' : ''}`,
    `Estimate charge:   ${p.estimate_charge    || ''}`,
    '',
    '── SECTION 6: MISSED CALL TEXT-BACK ─────',
    `Missed call text-back: ${bool(p.missed_call_textback)}`,
    `Setup method:      ${p.missed_call_setup_method || ''}`,
    `Rings before missed: ${p.missed_call_rings_seconds || ''}`,
    '',
    '── SECTION 7: APPOINTMENTS ───────────────',
    `Collect lead address: ${bool(p.collect_lead_address)}`,
    `Appointment locations: ${[p.appt_loc_lead && 'Lead address', p.appt_loc_business && 'Business address', p.appt_loc_zoom && 'Zoom', p.appt_loc_meet && 'Google Meet', p.appt_loc_other && 'Other'].filter(Boolean).join(', ') || ''}`,
    `Appointment link:  ${p.appointment_link  || ''}`,
    '',
    '── SECTION 8: SYSTEM USERS ───────────────',
    `User 1:            ${p.user_1_info       || ''}`,
    `User 1 on calendar: ${bool(p.user_1_on_calendar)}`,
    `User 2:            ${p.user_2_info       || ''}`,
    `User 2 on calendar: ${bool(p.user_2_on_calendar)}`,
    `User 3:            ${p.user_3_info       || ''}`,
    `User 3 on calendar: ${bool(p.user_3_on_calendar)}`,
    `Additional users:\n${p.users_additional  || ''}`,
    `Website form needed: ${bool(p.needs_website_form)}`,
    `Website credentials:\n${p.website_credentials || ''}`,
    `Has marketing contact: ${bool(p.has_marketing_contact)}`,
    `Marketing contact: ${p.marketing_contact_info || ''}`,
    '',
    '── SECTION 9: CALENDAR SETTINGS ─────────',
    `Meeting interval:  ${p.meeting_interval_minutes || ''} min`,
    `Meeting duration:  ${p.meeting_duration_minutes || ''} min`,
    `Min scheduling notice: ${p.min_scheduling_notice || ''}`,
    `Scheduling range:  ${p.date_range        || ''}`,
    `Max bookings/day:  ${p.max_bookings_per_day   || ''}`,
    `Max bookings/slot: ${p.max_bookings_per_slot  || ''}`,
    `Pre-buffer:        ${p.pre_buffer_minutes  || ''} min`,
    `Post-buffer:       ${p.post_buffer_minutes || ''} min`,
    '',
    '── SECTION 10: AI & OUTREACH ─────────────',
    `AI name:           ${p.ai_name           || ''}`,
    `Qualified lead action: ${qualifiedActionLabels[p.qualified_lead_action] || p.qualified_lead_action || ''}`,
    `Google reviews:    ${reviewResponseLabels[p.google_review_response] || p.google_review_response || ''}`,
    `Qualifying Q1:\n${p.qualifying_question_1 || ''}`,
    `Qualifying Q2:\n${p.qualifying_question_2 || ''}`,
    `Outgoing offer:\n${p.outgoing_offer       || ''}`,
    `Financing offered: ${bool(p.offers_financing)}`,
    `Financing details: ${p.financing_details  || ''}`,
    `Warranty / guarantee:\n${p.warranty_guarantee || ''}`,
    `Business logo:     ${p.business_logo_url  || ''}`,
    `Product docs:\n${p.ai_documents_url       || ''}`,
  ];
  return lines.join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const MAKE_WEBHOOK = process.env.MAKE_WEBHOOK_CRM;
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

  // ── 1. Insert into Supabase ───────────────────────────────────────────────
  await sbInsert('crm_onboarding', cleanPayload);

  // ── 2. Fire Make webhook ──────────────────────────────────────────────────
  if (MAKE_WEBHOOK) {
    try {
      await fetch(MAKE_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_type: 'crm', ...cleanPayload }),
      });
      console.log('Make webhook fired (CRM)');
    } catch (e) {
      console.error('Make webhook error (CRM):', e.message);
    }
  }

  // ── 3. Add GHL note ───────────────────────────────────────────────────────
  const contactId = cleanPayload.ghl_contact_id || null;
  if (GHL_KEY && contactId) {
    const noteBody = formatCrmIntake(cleanPayload);
    await Promise.all([
      ghlAddNote(contactId, noteBody, GHL_KEY),
      ghlAddTag(contactId, 'crm onboarding submitted', GHL_KEY),
    ]);
    console.log('GHL note + tag added for contact:', contactId);
  } else {
    if (!GHL_KEY) console.log('GHL_API_KEY not set — skipping GHL note');
    if (!contactId) console.log('No ghl_contact_id in payload — skipping GHL note');
  }

  return { statusCode: 202, body: '' };
};
