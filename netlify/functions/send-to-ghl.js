// Netlify Function: forward worksheet data to GHL.
//   1. Add a Note to the contact (body)
//   2. Add Tags to the contact
//   3. (Optional) Upload a PDF to the contact's documents section
//
// Env vars (set in Netlify → Site settings → Environment variables):
//   GHL_API_KEY  — Private Integration Token from GHL (required)
//   GHL_LOCATION_ID — sub-account / location ID (required for file uploads)

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function res(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

async function readJsonOrText(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return res(405, { error: 'POST only' });

  const token = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID || null;
  if (!token) return res(500, { error: 'GHL_API_KEY is not configured on this site. Add it in Netlify → Site settings → Environment variables.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return res(400, { error: 'Invalid JSON body' }); }

  const { contactId, note, tags, pdfBase64, pdfFilename } = payload;
  if (!contactId || typeof contactId !== 'string') return res(400, { error: 'contactId is required' });
  if (!note || typeof note !== 'string') return res(400, { error: 'note is required' });

  const baseHeaders = {
    'Authorization': `Bearer ${token}`,
    'Version': GHL_API_VERSION,
    'Accept': 'application/json'
  };
  const jsonHeaders = { ...baseHeaders, 'Content-Type': 'application/json' };

  const result = { ok: true, note: null, tags: null, pdf: null };

  // 1. Add note
  try {
    const r = await fetch(`${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/notes`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ body: note })
    });
    const data = await readJsonOrText(r);
    if (!r.ok) return res(r.status, { error: 'Add Note failed', status: r.status, detail: data });
    result.note = { ok: true, id: data?.note?.id || data?.id || null };
  } catch (e) {
    return res(502, { error: 'Network error calling GHL Add Note', detail: e.message });
  }

  // 2. Add tags (best-effort)
  if (Array.isArray(tags) && tags.length) {
    try {
      const r = await fetch(`${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/tags`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ tags })
      });
      const data = await readJsonOrText(r);
      result.tags = r.ok ? { ok: true, applied: data } : { ok: false, status: r.status, detail: data };
    } catch (e) {
      result.tags = { ok: false, error: e.message };
    }
  }

  // 3. Upload PDF to contact documents (best-effort)
  if (pdfBase64 && typeof pdfBase64 === 'string') {
    const filename = (pdfFilename && typeof pdfFilename === 'string') ? pdfFilename : 'worksheet.pdf';
    try {
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

      // Use GHL multipart upload to the contact's files endpoint.
      const form = new FormData();
      form.append('file', fileBlob, filename);
      if (locationId) form.append('locationId', locationId);
      form.append('id', contactId);

      const r = await fetch(`${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/upload-files`, {
        method: 'POST',
        headers: baseHeaders, // no Content-Type — let fetch set the multipart boundary
        body: form
      });
      const data = await readJsonOrText(r);
      if (r.ok) {
        result.pdf = { ok: true, id: data?.id || data?.fileId || null, filename, bytes: pdfBuffer.length };
      } else {
        result.pdf = { ok: false, status: r.status, detail: data, filename, endpoint: 'contacts/upload-files' };
      }
    } catch (e) {
      result.pdf = { ok: false, error: e.message };
    }
  }

  return res(200, result);
};
