// Netlify Background Function: publish-blog-post-background
// Takes an approved blog draft and publishes it to the D7 bunny.net storage zone:
// 1. PUT <slug>/index.html to storage
// 2. Read sitemap.xml from storage, add the new URL, PUT it back
// 3. (optional) Purge the pull-zone cache
// 4. Mark the draft published in Supabase

const SUPABASE_URL = 'https://ihjhfcuiofudkdpinkxo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloamhmY3Vpb2Z1ZGtkcGlua3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjgxNzQsImV4cCI6MjA5MzA0NDE3NH0.fvnL13SthNvKxCvjAdvintux50YkbL1rgMLSWUUrDEk';

const SITE_ORIGIN = 'https://d7millwork.com';

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbGetDraft(draftId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/blog_drafts?draft_id=eq.${encodeURIComponent(draftId)}&select=slug,generated_html,status&limit=1`,
    { headers: SB_HEADERS }
  );
  const rows = await res.json();
  return rows?.[0] || null;
}

async function sbUpdateDraft(draftId, fields) {
  await fetch(`${SUPABASE_URL}/rest/v1/blog_drafts?draft_id=eq.${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const draftId = payload.draft_id;
  if (!draftId) return { statusCode: 400, body: 'Missing draft_id' };

  if (payload.access_code !== process.env.PUBLISHER_ACCESS_CODE) {
    await sbUpdateDraft(draftId, { status: 'error', error_message: 'Bad access code' });
    return { statusCode: 202, body: '' };
  }

  const ZONE = process.env.BUNNY_STORAGE_ZONE;
  const STORAGE_KEY = process.env.BUNNY_STORAGE_KEY;
  const HOST = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';
  const PULLZONE_ID = process.env.BUNNY_PULLZONE_ID;
  const BUNNY_API_KEY = process.env.BUNNY_API_KEY;

  if (!ZONE || !STORAGE_KEY) {
    await sbUpdateDraft(draftId, { status: 'error', error_message: 'Bunny storage env vars not set' });
    return { statusCode: 202, body: '' };
  }

  const draft = await sbGetDraft(draftId);
  if (!draft || !draft.generated_html || !draft.slug) {
    await sbUpdateDraft(draftId, { status: 'error', error_message: 'Draft not found or not generated' });
    return { statusCode: 202, body: '' };
  }

  const slug = String(draft.slug).replace(/^\/+|\/+$/g, '');
  const storageBase = `https://${HOST}/${ZONE}`;

  try {
    await sbUpdateDraft(draftId, { status: 'publishing' });

    // 1. Upload the article
    const putRes = await fetch(`${storageBase}/${slug}/index.html`, {
      method: 'PUT',
      headers: { AccessKey: STORAGE_KEY, 'Content-Type': 'text/html; charset=utf-8' },
      body: draft.generated_html,
    });
    if (!putRes.ok) throw new Error(`Article upload failed: ${putRes.status} ${await putRes.text()}`);

    // 2. Update sitemap.xml
    const newLoc = `${SITE_ORIGIN}/${slug}/`;
    const today = new Date().toISOString().slice(0, 10);
    const smRes = await fetch(`${storageBase}/sitemap.xml`, { headers: { AccessKey: STORAGE_KEY } });
    if (smRes.ok) {
      let xml = await smRes.text();
      if (!xml.includes(`<loc>${newLoc}</loc>`)) {
        const entry = `  <url><loc>${newLoc}</loc><lastmod>${today}</lastmod><priority>0.7</priority></url>\n`;
        xml = xml.replace('</urlset>', `${entry}</urlset>`);
        const smPut = await fetch(`${storageBase}/sitemap.xml`, {
          method: 'PUT',
          headers: { AccessKey: STORAGE_KEY, 'Content-Type': 'application/xml' },
          body: xml,
        });
        if (!smPut.ok) console.error('Sitemap update failed:', await smPut.text());
      }
    } else {
      console.error('Could not read sitemap.xml:', smRes.status);
    }

    // 3. Purge cache (optional)
    if (PULLZONE_ID && BUNNY_API_KEY) {
      try {
        await fetch(`https://api.bunny.net/pullzone/${PULLZONE_ID}/purgeCache`, {
          method: 'POST',
          headers: { AccessKey: BUNNY_API_KEY },
        });
      } catch (e) { console.error('Cache purge failed:', e.message); }
    }

    await sbUpdateDraft(draftId, { status: 'published', published_url: newLoc, error_message: null });
    console.log('Published:', newLoc);
  } catch (e) {
    console.error('Publish failure:', e);
    await sbUpdateDraft(draftId, { status: 'error', error_message: String(e.message || e) });
  }

  return { statusCode: 202, body: '' };
};
