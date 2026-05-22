// Netlify Function: send-audit-email
// Called after the Marketing Hourglass Audit email capture.
// 1. Sends a personalized results email via Resend.
// 2. Creates or updates the contact in GHL and tags them "leak audit taken".

const RESEND_API  = 'https://api.resend.com/emails';
const GHL_API     = 'https://services.leadconnectorhq.com';
const LOCATION_ID = 'rZeTsPPOr6CElU2SG1jQ';

// ── GHL helpers ──────────────────────────────────────────────────────────────
function ghlHeaders(apiKey) {
  return {
    Authorization:  `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version:        '2021-07-28',
  };
}

async function ghlFindOrCreateContact(firstName, email, apiKey) {
  // 1. Search by email
  const searchRes = await fetch(
    `${GHL_API}/contacts/?locationId=${LOCATION_ID}&email=${encodeURIComponent(email)}`,
    { headers: ghlHeaders(apiKey) }
  );
  const searchData = await searchRes.json();
  const existing   = searchData?.contacts?.[0] || null;
  if (existing) return existing.id;

  // 2. Not found — create
  const createRes = await fetch(`${GHL_API}/contacts/`, {
    method:  'POST',
    headers: ghlHeaders(apiKey),
    body:    JSON.stringify({
      locationId: LOCATION_ID,
      firstName:  firstName || '',
      email:      email,
      source:     'Leak Audit',
    }),
  });
  const createData = await createRes.json();
  return createData?.contact?.id || null;
}

async function ghlAddTag(contactId, tag, apiKey) {
  await fetch(`${GHL_API}/contacts/${contactId}/tags`, {
    method:  'POST',
    headers: ghlHeaders(apiKey),
    body:    JSON.stringify({ tags: [tag] }),
  });
}

async function ghlAddNote(contactId, body, apiKey) {
  await fetch(`${GHL_API}/contacts/${contactId}/notes`, {
    method:  'POST',
    headers: ghlHeaders(apiKey),
    body:    JSON.stringify({ body }),
  });
}

function formatAuditNote(firstName, total, scores, weakestStage) {
  const lines = [
    '📊 Marketing Hourglass Audit — ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    `Score: ${total}/28 | Biggest leak: ${weakestStage}`,
    '',
  ];
  const STAGES = ['Know', 'Like', 'Trust', 'Try', 'Buy', 'Repeat', 'Refer'];
  STAGES.forEach((stage, i) => {
    const s = scores[i + 1] || scores[String(i + 1)] || 0;
    lines.push(`${stage}: ${s}/4`);
  });
  return lines.join('\n');
}

const STAGES = ['Know', 'Like', 'Trust', 'Try', 'Buy', 'Repeat', 'Refer'];

const RECOMMENDATIONS = {
  Know:   'Your visibility strategy needs attention. Focus on Google Business Profile, consistent social posts, and a system to capture reviews from every happy customer.',
  Like:   'Your first impression is costing you jobs. Update your website with real proof — before/after photos, specific client outcomes, and a clear reason why you\'re the right call.',
  Trust:  'Prospects aren\'t confident enough to hire you yet. Build a review system that runs on autopilot and add one or two real client case studies to your site.',
  Try:    'You\'re making it too hard for someone to take a small first step. Add online booking or a "text us" option and follow up every estimate within 24 hours automatically.',
  Buy:    'You\'re losing deals after the quote. Implement a 5-touch follow-up sequence for every open estimate — most jobs go to whoever follows up first.',
  Repeat: 'You have a goldmine of past customers you\'re not talking to. A quarterly reactivation campaign to your dormant list is the fastest revenue you can recover.',
  Refer:  'Happy customers aren\'t sending you new ones because you\'re not asking on purpose. Automate a referral ask to fire after every completed job.',
};

const TIER_COPY = {
  early:   { label: 'Foundation Stage',  heading: 'You have real gaps — and real upside.' },
  growing: { label: 'Building Momentum', heading: 'Good foundation. Time to plug the leaks.' },
  strong:  { label: 'Well-Built System', heading: 'Strong systems. Let\'s optimize the weak spots.' },
};

function buildEmailHtml(firstName, total, scores, weakestStage) {
  let tier;
  if      (total <= 14) tier = 'early';
  else if (total <= 21) tier = 'growing';
  else                  tier = 'strong';

  const tierData = TIER_COPY[tier];

  // Build stage rows
  const stageRows = STAGES.map((stage, i) => {
    const q     = i + 1;
    const score = scores[q] || scores[String(q)] || 0;
    const bars  = '█'.repeat(score) + '░'.repeat(4 - score);
    return `
      <tr>
        <td style="padding:6px 12px 6px 0; font-size:14px; font-weight:700; color:#111; width:70px;">${stage}</td>
        <td style="padding:6px 0; font-size:14px; letter-spacing:2px; color:${stage === weakestStage ? '#FF1744' : '#FA5E36'};">${bars}</td>
        <td style="padding:6px 0 6px 12px; font-size:13px; color:#6c757d; text-align:right;">${score}/4</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Marketing Hourglass Audit Results</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">

          <!-- Header gradient bar -->
          <tr>
            <td style="background:linear-gradient(135deg,#FA5E36,#EB3656);padding:28px 32px;">
              <p style="margin:0;font-size:13px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px;">Marketing Hourglass Audit</p>
              <h1 style="margin:8px 0 0;font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Your Results Are In</h1>
            </td>
          </tr>

          <!-- Score block -->
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#6c757d;">Overall Score</p>
              <p style="margin:0 0 6px;">
                <span style="font-size:52px;font-weight:900;color:#111;letter-spacing:-2px;line-height:1;">${total}</span>
                <span style="font-size:20px;font-weight:700;color:#6c757d;"> / 28</span>
              </p>
              <span style="display:inline-block;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:800;background:${tier === 'early' ? '#fff1f0' : tier === 'growing' ? '#fff8e1' : '#e8f8f0'};color:${tier === 'early' ? '#c0392b' : tier === 'growing' ? '#e67e22' : '#27ae60'};">
                ${tierData.label}
              </span>
            </td>
          </tr>

          <!-- Heading + intro -->
          <tr>
            <td style="padding:20px 32px 0;">
              <h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#111;letter-spacing:-0.3px;">${tierData.heading}</h2>
              <p style="margin:0;font-size:14px;color:#6c757d;line-height:1.7;">
                ${firstName ? 'Hey ' + firstName + ' — ' : ''}here\'s a breakdown of where your marketing system is strong and where it\'s leaking revenue.
              </p>
            </td>
          </tr>

          <!-- Stage breakdown -->
          <tr>
            <td style="padding:24px 32px 0;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#6c757d;">Stage Breakdown</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${stageRows}
              </table>
            </td>
          </tr>

          <!-- Biggest leak -->
          <tr>
            <td style="padding:24px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5f5;border:1.5px solid #ffd5d5;border-radius:10px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#FF1744;">Your Biggest Leak</p>
                    <p style="margin:0 0 8px;font-size:17px;font-weight:900;color:#111;">${weakestStage} stage</p>
                    <p style="margin:0;font-size:14px;color:#111;line-height:1.65;">${RECOMMENDATIONS[weakestStage]}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 32px 0;text-align:center;">
              <p style="margin:0 0 6px;font-size:16px;font-weight:800;color:#111;">Want to fix the leaks?</p>
              <p style="margin:0 0 18px;font-size:14px;color:#6c757d;line-height:1.6;">Connectid works with $1M+ home service businesses to recover revenue from the customers they already have. No ads. No funnels.</p>
              <a href="https://link.connectidcrm.com/widget/booking/rBfjlEMkmCmO5uszg1ET?utm_source=audit-email&utm_medium=email&utm_campaign=audit-results"
                 style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#FA5E36,#EB3656);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:-0.2px;">
                Book a free strategy call →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 32px 32px;border-top:1px solid #F0EFEE;margin-top:28px;">
              <p style="margin:24px 0 0;font-size:12px;color:#adb5bd;line-height:1.6;">
                You completed the Marketing Hourglass Audit at connectidcrm.com.<br/>
                Questions? Email <a href="mailto:ashley@connectidcrm.com" style="color:#FF1744;text-decoration:none;">ashley@connectidcrm.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.error('RESEND_API_KEY not set — skipping email send');
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'no_key' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { firstName = '', email, scores = {}, total = 0, weakestStage = '' } = body;

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'email required' }) };
  }

  const GHL_KEY = process.env.GHL_API_KEY;

  // Run email send + GHL upsert in parallel
  const emailPromise = (async () => {
    const html    = buildEmailHtml(firstName, total, scores, weakestStage);
    const subject = `Your Marketing Hourglass Score: ${total}/28 (${weakestStage} needs attention)`;
    const res = await fetch(RESEND_API, {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from:    'Ashley DePiano <ashley@connectidcrm.com>',
        to:      [email],
        subject: subject,
        html:    html,
      }),
    });
    const data = await res.json();
    if (!res.ok) console.error('Resend error:', JSON.stringify(data));
    else console.log('Audit email sent to:', email, '| id:', data.id);
    return data;
  })();

  const ghlPromise = (async () => {
    if (!GHL_KEY) {
      console.log('GHL_API_KEY not set — skipping CRM sync');
      return;
    }
    try {
      const contactId = await ghlFindOrCreateContact(firstName, email, GHL_KEY);
      if (!contactId) { console.error('Could not find/create GHL contact for:', email); return; }
      const note = formatAuditNote(firstName, total, scores, weakestStage);
      await Promise.all([
        ghlAddTag(contactId, 'leak audit taken', GHL_KEY),
        ghlAddNote(contactId, note, GHL_KEY),
      ]);
      console.log('GHL contact tagged + noted:', contactId);
    } catch (err) {
      console.error('GHL sync error:', err.message);
    }
  })();

  try {
    await Promise.all([emailPromise, ghlPromise]);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Handler exception:', err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
