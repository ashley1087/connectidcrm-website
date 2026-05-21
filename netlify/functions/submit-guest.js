// Netlify Function: submit-guest
// Receives the podcast application form, gates on revenue,
// and creates a contact in GoHighLevel with tag "handshake apply".

const GHL_API     = 'https://services.leadconnectorhq.com';
const LOCATION_ID = 'rZeTsPPOr6CElU2SG1jQ';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse application/x-www-form-urlencoded body
  const params  = new URLSearchParams(event.body || '');
  const name    = (params.get('name')           || '').trim();
  const company = (params.get('company')        || '').trim();
  const trade   = (params.get('trade')          || '').trim();
  const revenue = (params.get('annual_revenue') || '').trim();

  // ── Server-side revenue gate (backup to the JS check) ──
  const DISQUALIFIED = ['Under $250K', '$250K – $500K', '$500K – $1M'];
  if (!revenue || DISQUALIFIED.includes(revenue)) {
    return {
      statusCode: 302,
      headers: { Location: '/ig-thanks.html?qualified=false' },
      body: '',
    };
  }

  const API_KEY = process.env.GHL_API_KEY;
  if (!API_KEY) {
    console.error('GHL_API_KEY environment variable is not set');
    return { statusCode: 302, headers: { Location: '/ig-thanks.html' }, body: '' };
  }

  // Split full name into first / last
  const parts     = name.split(' ');
  const firstName = parts[0] || name;
  const lastName  = parts.slice(1).join(' ') || '';

  // ── Create contact in GHL ──
  let contactId;
  try {
    const res = await fetch(`${GHL_API}/contacts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type':  'application/json',
        'Version':       '2021-07-28',
      },
      body: JSON.stringify({
        locationId:  LOCATION_ID,
        firstName,
        lastName,
        companyName: company,
        source:      'Instagram Link in Bio',
        tags:        ['handshake apply', `trade: ${trade}`],
        customFields: [{ id: 't6wHo2y6k0RuHwn4DMaB', value: revenue }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('GHL contact create error:', JSON.stringify(data));
    } else {
      contactId = data?.contact?.id;
    }
  } catch (err) {
    console.error('GHL fetch error:', err.message);
  }

  // ── Add a note with full application details ──
  if (contactId) {
    try {
      await fetch(`${GHL_API}/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type':  'application/json',
          'Version':       '2021-07-28',
        },
        body: JSON.stringify({
          body: [
            'Podcast Application — The Handshake Business',
            `Name:    ${name}`,
            `Company: ${company}`,
            `Trade:   ${trade}`,
            `Revenue: ${revenue}`,
            `Source:  Instagram Link in Bio`,
          ].join('\n'),
        }),
      });
    } catch (err) {
      console.error('GHL note error:', err.message);
    }
  }

  // Always redirect to thank-you page
  return {
    statusCode: 302,
    headers: { Location: '/ig-thanks.html' },
    body: '',
  };
};
