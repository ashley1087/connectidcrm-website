// Netlify Background Function: generate-blog-post-background
// Michelle submits a blog draft (question + keyword + Micah's notes).
// 1. Calls Claude to produce structured article content in Micah's voice
// 2. Renders it into the exact Division 7 Millwork article template (schema + nav + footer)
// 3. Stores the finished HTML in Supabase `blog_drafts` for preview + publish
//
// D7-specific: the template, nav, footer, and internal-link list are hardcoded
// to divisionsevenmillwork / d7millwork.com. Parameterize later for other sites.

const SUPABASE_URL = 'https://ihjhfcuiofudkdpinkxo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloamhmY3Vpb2Z1ZGtkcGlua3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjgxNzQsImV4cCI6MjA5MzA0NDE3NH0.fvnL13SthNvKxCvjAdvintux50YkbL1rgMLSWUUrDEk';

const SITE_ORIGIN = 'https://d7millwork.com';

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbUpsertDraft(draftId, fields) {
  // Update the row for this draft_id (created client-side before generation).
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/blog_drafts?draft_id=eq.${encodeURIComponent(draftId)}`,
    {
      method: 'PATCH',
      headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify(fields),
    }
  );
  if (!res.ok) console.error('Supabase draft update error:', await res.text());
}

// Pages the AI may link to internally. Keep in sync with the live sitemap.
const LINKABLE_PAGES = `
/ (Homepage)
/custom-cabinetry-guide/ (Cabinetry Guide — the pillar page)
/services/ (All services)
/services/kitchen-cabinetry/ (Kitchen Cabinetry — stock vs custom)
/services/kitchen-remodeling/ (Full Kitchen Remodels)
/services/bathroom-vanities/ (Bathroom Vanities)
/services/office-cabinetry/ (Office Cabinetry)
/services/mudroom-cabinetry/ (Mudroom Cabinetry)
/services/built-ins-millwork/ (Built-Ins & Millwork)
/services/cabinet-door-replacement/ (Cabinet Door Replacement)
/custom-kitchen-cabinets-cost-westchester/ (What custom kitchen cabinets cost in Westchester)
/custom-cabinets-vs-ikea-kitchen/ (Custom cabinets vs. an IKEA kitchen)
/cheap-kitchen-cabinets-that-dont-look-cheap/ (Cheap kitchen cabinets that don't look cheap)
/service-areas/ (Service areas hub)
/contact/ (Request a free estimate)
tel:+18453779404 (Phone: (845) 377-9404)
`.trim();

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    seo_title: { type: 'string', description: 'Title tag, aim for 55-60 characters' },
    meta_description: { type: 'string', description: 'Meta description, 140-160 characters, action-oriented' },
    slug: { type: 'string', description: 'URL slug, kebab-case, no leading or trailing slash, no domain' },
    eyebrow: { type: 'string', description: 'Small label above the H1, e.g. "Cabinetry Guide · Kitchen Cabinetry"' },
    h1_before: { type: 'string', description: 'The H1 text before the highlighted span' },
    h1_highlight: { type: 'string', description: 'The final few words of the H1, shown highlighted' },
    hero_subtitle: { type: 'string', description: 'One-sentence subtitle under the H1' },
    breadcrumb_label: { type: 'string', description: 'Short label for this article in the breadcrumb' },
    part_of_guide: { type: 'boolean', description: 'True if this belongs under the Cabinetry Guide pillar' },
    body_html: {
      type: 'string',
      description: 'The article body as HTML: <h2 class="section-title"> headings and <p> paragraphs only. Weave in 2-4 internal links using <a href="/path/"> from the allowed list. First paragraph must answer the question directly. No H1, no wrapper divs.',
    },
    faqs: {
      type: 'array',
      description: '2-3 FAQ items derived from the article for FAQPage schema',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
      },
    },
  },
  required: [
    'seo_title', 'meta_description', 'slug', 'eyebrow', 'h1_before',
    'h1_highlight', 'hero_subtitle', 'breadcrumb_label', 'part_of_guide',
    'body_html', 'faqs',
  ],
};

function buildSystemPrompt() {
  return `You are writing a blog article for Division Seven Millwork, a custom cabinetry and millwork shop in Mahopac, NY, owned by craftsman Micah Beatty. He has built cabinetry himself since 2001 and serves Westchester, Putnam, and Dutchess County NY plus Danbury CT.

VOICE:
- Write as Micah, first person ("I", "we", "my shop").
- Neighbor-to-neighbor, like explaining it at a homeowner's kitchen table.
- Plain, warm, direct. No corporate or salesy language. No hype words.
- Confident from 25 years of doing the work himself, never arrogant.
- The promise underneath everything: the craftsman who measures your project is the one who builds and finishes it.

HARD RULES:
- NO em dashes anywhere. Use commas, periods, or parentheses instead.
- Do NOT invent facts, prices, certifications, or stories that were not provided.
- Use only Micah's supplied input for specifics and examples.
- 600-850 words of body.
- Short paragraphs (2-4 sentences).
- The first paragraph must answer the question directly, no throat-clearing.
- Use <h2 class="section-title"> for section headings phrased as questions a homeowner would ask.
- Work 2-4 internal links naturally into the prose, using ONLY these pages:
${LINKABLE_PAGES}
- End the body with a friendly line inviting a free estimate, linking /contact/ or the phone tel: link.
- Sound like a real person wrote it, not a marketing department.`;
}

function buildUserPrompt(p) {
  return `Write the article.

QUESTION / TOPIC TO ANSWER:
${p.question || p.title || ''}

TARGET KEYWORD (use naturally once or twice):
${p.keyword || ''}

MICAH'S REAL INPUT (use these facts, opinions, and stories; do not invent others):
${p.micah_notes || '(none provided — keep claims general and do not fabricate specifics)'}

Return the structured fields. The H1 should split naturally into h1_before + h1_highlight (the highlight is the last few words). Pick a slug that is short, keyword-relevant, and lowercase kebab-case.`;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderArticle(d) {
  const slug = String(d.slug || '').replace(/^\/+|\/+$/g, '');
  const url = `${SITE_ORIGIN}/${slug}/`;
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (d.faqs || []).map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  const crumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
  ];
  if (d.part_of_guide) {
    crumbItems.push({ '@type': 'ListItem', position: 2, name: 'Custom Cabinetry Guide', item: `${SITE_ORIGIN}/custom-cabinetry-guide/` });
    crumbItems.push({ '@type': 'ListItem', position: 3, name: d.breadcrumb_label, item: url });
  } else {
    crumbItems.push({ '@type': 'ListItem', position: 2, name: d.breadcrumb_label, item: url });
  }
  const crumbSchema = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbItems };

  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: `${d.h1_before} ${d.h1_highlight}`.trim(),
    description: d.meta_description,
    url,
    mainEntityOfPage: url,
    datePublished: iso,
    dateModified: iso,
    inLanguage: 'en-US',
    author: { '@id': `${SITE_ORIGIN}/#business` },
    publisher: { '@id': `${SITE_ORIGIN}/#business` },
    ...(d.part_of_guide ? { isPartOf: { '@id': `${SITE_ORIGIN}/custom-cabinetry-guide/#guide` } } : {}),
  };

  const crumbHtml = d.part_of_guide
    ? `<a href="/">Home</a><span class="sep">/</span><a href="/custom-cabinetry-guide/">Cabinetry Guide</a><span class="sep">/</span><span>${esc(d.breadcrumb_label)}</span>`
    : `<a href="/">Home</a><span class="sep">/</span><span>${esc(d.breadcrumb_label)}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-14S89K4SDN"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-14S89K4SDN');
  </script>
  <title>${esc(d.seo_title)}</title>
  <meta name="description" content="${esc(d.meta_description)}" />
  <link rel="canonical" href="${url}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${esc(d.seo_title)}" />
  <meta property="og:description" content="${esc(d.meta_description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="icon" type="image/png" href="/assets/favicon.png" />
  <link rel="stylesheet" href="/assets/styles.css" />
  <script type="application/ld+json">
${JSON.stringify(blogSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(faqSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(crumbSchema, null, 2)}
  </script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<nav class="nav">
  <div class="nav-inner">
    <a class="brand" href="/"><img class="brand-logo" src="/assets/d7-logo.png" alt="Division Seven Millwork" width="215" height="51" /></a>
    <button class="nav-toggle" aria-label="Menu" aria-expanded="false">☰</button>
    <div class="nav-links" id="navlinks">
      <div class="has-menu">
        <a href="/services/">Services</a>
        <div class="menu">
          <a href="/services/kitchen-cabinetry/">Kitchen Cabinetry</a>
          <a href="/services/kitchen-remodeling/">Full Kitchen Remodels</a>
          <a href="/services/bathroom-vanities/">Bathroom Vanities</a>
          <a href="/services/office-cabinetry/">Office Cabinetry</a>
          <a href="/services/mudroom-cabinetry/">Mudroom Cabinetry</a>
          <a href="/services/built-ins-millwork/">Built-Ins &amp; Millwork</a>
          <a href="/services/cabinet-door-replacement/">Cabinet Door Replacement</a>
        </div>
      </div>
      <a href="/custom-cabinetry-guide/">Cabinetry Guide</a>
      <a href="/service-areas/">Service Areas</a>
      <a href="/about/">About</a>
      <a href="/reviews/">Reviews</a>
      <a href="/contact/">Contact</a>
      <a class="nav-cta" href="tel:+18453779404">Call (845) 377-9404</a>
    </div>
  </div>
</nav>

<div class="crumb"><div class="wrap">${crumbHtml}</div></div>

<main id="main">

<header class="hero compact">
  <div class="wrap">
    <div class="hero-eyebrow">${esc(d.eyebrow)}</div>
    <h1>${esc(d.h1_before)} <span>${esc(d.h1_highlight)}</span></h1>
    <p>${esc(d.hero_subtitle)}</p>
  </div>
</header>

<section>
  <div class="wrap">
    <div class="prose">
${d.body_html}
    </div>
  </div>
</section>

</main>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <div class="brand-sm">Division <span>Seven</span> Millwork</div>
        <p style="color:rgba(255,255,255,.6);font-size:14px;max-width:30ch;">Craftsman-built custom cabinetry and kitchen remodeling across the Hudson Valley since 2001.</p>
      </div>
      <div class="foot-col">
        <div class="foot-h">Services</div>
        <a href="/services/kitchen-cabinetry/">Kitchen Cabinetry</a>
        <a href="/services/kitchen-remodeling/">Kitchen Remodels</a>
        <a href="/services/bathroom-vanities/">Bathroom Vanities</a>
        <a href="/services/built-ins-millwork/">Built-Ins &amp; Millwork</a>
        <a href="/services/">All Services</a>
      </div>
      <div class="foot-col">
        <div class="foot-h">Company</div>
        <a href="/about/">About</a>
        <a href="/reviews/">Reviews</a>
        <a href="/process/">Our Process</a>
        <a href="/warranty/">Warranties</a>
        <a href="/service-areas/">Service Areas</a>
      </div>
      <div class="foot-col">
        <div class="foot-h">Contact</div>
        <a href="tel:+18453779404">(845) 377-9404</a>
        <a href="mailto:divisionseven@optonline.net">divisionseven@optonline.net</a>
        <span style="display:block;padding:4px 0;color:rgba(255,255,255,.6);font-size:14px;">12 White St, Ste B<br>Buchanan, NY 10511</span>
        <span style="display:block;padding:4px 0;color:rgba(255,255,255,.6);font-size:14px;">Mon–Fri, 8 AM – 4:30 PM</span>
      </div>
    </div>
    <div class="foot-bottom">
      <div>&copy; 2026 Division Seven Millwork LLC. All rights reserved.</div>
      <div>
        <a href="https://divisionsevenmillwork.connectidcrm.com/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a> ·
        <a href="https://divisionsevenmillwork.connectidcrm.com/terms-of-service" target="_blank" rel="noopener">Terms of Service</a> ·
        <a href="/sms-program/">SMS Program</a>
      </div>
    </div>
  </div>
</footer>
<script>
  (function(){
    var t=document.querySelector('.nav-toggle'), l=document.getElementById('navlinks');
    if(t&&l){t.addEventListener('click',function(){var o=l.classList.toggle('open');t.setAttribute('aria-expanded',o);});}
  })();
</script>
</body>
</html>
`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const draftId = payload.draft_id;
  if (!draftId) return { statusCode: 400, body: 'Missing draft_id' };

  if (payload.access_code !== process.env.PUBLISHER_ACCESS_CODE) {
    await sbUpsertDraft(draftId, { status: 'error', error_message: 'Bad access code' });
    return { statusCode: 202, body: '' };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    await sbUpsertDraft(draftId, { status: 'error', error_message: 'ANTHROPIC_API_KEY not set' });
    return { statusCode: 202, body: '' };
  }

  // Store the inputs so the approval queue can show context.
  await sbUpsertDraft(draftId, {
    status: 'generating',
    question: payload.question || payload.title || null,
    keyword: payload.keyword || null,
    micah_notes: payload.micah_notes || null,
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 20000,
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(payload) }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
      await sbUpsertDraft(draftId, { status: 'error', error_message: `Claude error: ${data?.error?.message || res.status}` });
      return { statusCode: 202, body: '' };
    }
    if (data.stop_reason === 'refusal') {
      await sbUpsertDraft(draftId, { status: 'error', error_message: 'Claude declined this request.' });
      return { statusCode: 202, body: '' };
    }

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    const parsed = JSON.parse(textBlock.text);
    const slug = String(parsed.slug || '').replace(/^\/+|\/+$/g, '');
    const html = renderArticle(parsed);

    await sbUpsertDraft(draftId, {
      status: 'ready',
      slug,
      seo_title: parsed.seo_title,
      generated_html: html,
      error_message: null,
    });
  } catch (e) {
    console.error('Generation failure:', e);
    await sbUpsertDraft(draftId, { status: 'error', error_message: String(e.message || e) });
  }

  return { statusCode: 202, body: '' };
};
