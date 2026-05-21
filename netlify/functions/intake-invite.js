// Netlify Function: intake-invite
// Called via GHL trigger link: /intake-invite?cid={{contact.id}}
// Fetches contact from GHL, creates a Supabase intake invitation, redirects to /intake?token=UUID

const GHL_API      = 'https://services.leadconnectorhq.com';
const SUPABASE_URL = 'https://ihjhfcuiofudkdpinkxo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloamhmY3Vpb2Z1ZGtkcGlua3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjgxNzQsImV4cCI6MjA5MzA0NDE3NH0.fvnL13SthNvKxCvjAdvintux50YkbL1rgMLSWUUrDEk';

function redirect(path) {
  return { statusCode: 302, headers: { Location: path }, body: '' };
}

exports.handler = async (event) => {
  const params = new URLSearchParams(event.queryStringParameters
    ? new URLSearchParams(Object.entries(event.queryStringParameters).map(([k,v]) => [k,v]))
    : '');
  const contactId = (event.queryStringParameters || {}).cid || '';

  if (!contactId) {
    return redirect('/intake-error.html?reason=missing_contact');
  }

  const API_KEY = process.env.GHL_API_KEY;
  if (!API_KEY) {
    console.error('GHL_API_KEY not set');
    return redirect('/intake-error.html?reason=config_error');
  }

  // ── 1. Fetch contact from GHL ──
  let contact;
  try {
    const res = await fetch(`${GHL_API}/contacts/${contactId}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Version': '2021-07-28',
      },
    });
    const data = await res.json();
    if (!res.ok || !data.contact) {
      console.error('GHL contact fetch failed:', JSON.stringify(data));
      return redirect('/intake-error.html?reason=contact_not_found');
    }
    contact = data.contact;
  } catch (err) {
    console.error('GHL fetch error:', err.message);
    return redirect('/intake-error.html?reason=ghl_error');
  }

  // ── 2. Build contact fields ──
  const firstName = contact.firstName || '';
  const lastName  = contact.lastName  || '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || contact.name || '';
  const email     = contact.email       || '';
  const company   = contact.companyName || '';

  // ── 3. Generate a UUID token ──
  // crypto.randomUUID() is available in Node 14.17+ / Netlify runtime
  const token = crypto.randomUUID();

  // ── 4. Upsert invitation in Supabase ──
  // If this contact already has an open (not submitted) invitation, reuse their token
  // so clicking the link again doesn't create duplicates. We key on email.
  let finalToken = token;
  try {
    // Check for existing open invitation by email
    if (email) {
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/intake_invitations?client_email=eq.${encodeURIComponent(email)}&submitted_at=is.null&select=token&limit=1`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing[0]?.token) {
        finalToken = existing[0].token; // Reuse existing open invitation
      } else {
        // Create a new invitation
        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/intake_invitations`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            token:        token,
            client_name:  fullName,
            client_email: email,
            company_name: company,
          }),
        });
        if (!insertRes.ok) {
          const err = await insertRes.text();
          console.error('Supabase insert error:', err);
          // Non-fatal — redirect anyway, form will show "invalid" if token doesn't save
        }
      }
    } else {
      // No email — create invitation without dedup check
      await fetch(`${SUPABASE_URL}/rest/v1/intake_invitations`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          token:        token,
          client_name:  fullName,
          client_email: email,
          company_name: company,
        }),
      });
    }
  } catch (err) {
    console.error('Supabase error:', err.message);
    // Non-fatal — try the redirect anyway
  }

  // ── 5. Redirect to intake form ──
  return redirect(`/intake?token=${finalToken}`);
};
