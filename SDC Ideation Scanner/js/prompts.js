// ============================================================
// PROMPTS — Three-stage agentic workflow for Innovative Ideation Scan
// Stage 1: Global Innovation Scanner
// Stage 2: Ideation & Unpacking Engine
// Stage 3: Source Validation Agent (optional)
// ============================================================

// ── SCAN FOCUS OPTIONS ──────────────────────────────────────
const SCAN_FOCUS_OPTIONS = [
  { value: 'all',             label: 'All Sectors' },
  { value: 'public-sector',   label: 'Public Sector / Government' },
  { value: 'tech-saas',       label: 'Tech / SaaS' },
  { value: 'healthcare',      label: 'Healthcare' },
  { value: 'education',       label: 'Education' },
  { value: 'financial',       label: 'Financial Services' },
  { value: 'cross-industry',  label: 'Cross-Industry Innovation' },
  { value: 'global-best',     label: 'Global Best Practice' },
  { value: 'other',           label: 'Other (specify below)' },
];

// ── STAGE 1: GLOBAL INNOVATION SCANNER ──────────────────────

const STAGE1_SYSTEM_PROMPT = [
  'You are a Global Innovation Research Analyst specialising in Human-Centred Design (HCD), service design, and digital transformation.',
  '',
  'Your role is to conduct a deep "innovation scan" — drawing on your extensive knowledge of:',
  '- Global HCD and service design best practices (UK GDS, Singapore GovTech, IDEO, Nesta, etc.)',
  '- Digital transformation case studies across public and private sectors',
  '- Emerging design patterns, interaction paradigms, and UX innovations',
  '- Industry benchmarks and maturity models',
  '- Cross-industry analogies and transferable solutions',
  '',
  'You will be given:',
  '1. A PROJECT CONTEXT describing the current state, problem statement, user personas, and constraints',
  '2. HIGH-LEVEL OPPORTUNITIES — raw solution ideas or improvement areas identified by the team',
  '3. A SCAN FOCUS indicating which sector lens to prioritise (may be "All Sectors")',
  '',
  'Your task:',
  '- Identify 4–6 relevant global best practices from organisations that have solved similar problems',
  '- Find 3–5 analogous solutions from related or different sectors',
  '- Surface 3–4 current design trends relevant to this problem space',
  '- Recommend 3–4 inspiration sources the team should explore',
  '- Be specific — name real organisations, real frameworks, real design patterns.',
  '- Every insight must be clearly connected back to the project context.',
  '',
  'URL QUALITY REQUIREMENTS:',
  '- For every url_hint field, provide a REAL, verifiable URL where you are confident it exists.',
  '- If you are NOT confident in the exact URL, provide a descriptive Google search query instead (e.g. "UK GDS service standard onboarding").',
  '- Prefer official .gov, .org, or well-known domain URLs.',
  '- Do NOT fabricate or guess URLs — use descriptive search terms if unsure.',
  '',
  'IMPORTANT:',
  '- Respond with a JSON object ONLY. No markdown fencing, no preamble.',
  '- Keep descriptions concise (1-2 sentences each).',
  '',
  'JSON SCHEMA:',
  '{',
  '  "scan_summary": "<2-3 sentence overview>",',
  '  "best_practices": [',
  '    {',
  '      "title": "<practice name>",',
  '      "source_domain": "<org or country>",',
  '      "description": "<1-2 sentences>",',
  '      "relevance": "<1 sentence>",',
  '      "url_hint": "<URL or search term>"',
  '    }',
  '  ],',
  '  "analogous_solutions": [',
  '    {',
  '      "title": "<solution name>",',
  '      "sector": "<industry>",',
  '      "description": "<1-2 sentences>",',
  '      "transferable_insight": "<1 sentence>",',
  '      "url_hint": "<URL or search term>"',
  '    }',
  '  ],',
  '  "design_trends": [',
  '    {',
  '      "trend": "<trend name>",',
  '      "description": "<1 sentence>",',
  '      "application": "<1 sentence>",',
  '      "url_hint": "<URL or search term>"',
  '    }',
  '  ],',
  '  "inspiration_sources": [',
  '    {',
  '      "name": "<source name>",',
  '      "type": "<Report | Case Study | Framework | Tool | Book | Community>",',
  '      "why_relevant": "<1 sentence>",',
  '      "url_hint": "<URL or search term>"',
  '    }',
  '  ]',
  '}',
].join('\n');

/**
 * Build the user prompt for Stage 1.
 * @param {string} context - Project context text
 * @param {string} opportunities - Opportunities text
 * @param {string} scanFocus - Scan focus value from dropdown
 * @param {string} [otherFocusText] - Custom focus text when scanFocus is 'other'
 */
function buildStage1UserPrompt(context, opportunities, scanFocus, otherFocusText) {
  let focusLabel;
  if (scanFocus === 'other' && otherFocusText && otherFocusText.trim()) {
    focusLabel = 'Custom Focus: ' + otherFocusText.trim();
  } else {
    focusLabel = SCAN_FOCUS_OPTIONS.find(o => o.value === scanFocus)?.label || 'All Sectors';
  }

  const parts = [
    '## PROJECT CONTEXT',
    '',
    context.trim(),
    '',
    '## HIGH-LEVEL OPPORTUNITIES',
    '',
    opportunities.trim(),
    '',
    '## SCAN FOCUS',
    '',
    focusLabel,
    '',
    '---',
    'Conduct your global innovation scan and respond with the JSON object only.',
  ];

  return parts.join('\n');
}


// ── STAGE 1 OUTPUT COMPRESSION ──────────────────────────────

/**
 * Compress Stage 1 output into a condensed summary for Stage 2.
 * This reduces the token count significantly while preserving key insights.
 * Includes url_hint values so Stage 2 can reference them for best_practice_url.
 */
function compressStage1ForStage2(stage1) {
  const lines = [];

  lines.push('INNOVATION SCAN INSIGHTS (condensed):');
  lines.push('');

  // Best practices — title + relevance + url
  if (stage1.best_practices && stage1.best_practices.length > 0) {
    lines.push('Best Practices:');
    stage1.best_practices.forEach((bp, i) => {
      let line = (i + 1) + '. ' + bp.title + ' (' + (bp.source_domain || '') + ') — ' + (bp.relevance || bp.description || '');
      if (bp.url_hint) line += ' [ref: ' + bp.url_hint + ']';
      lines.push(line);
    });
    lines.push('');
  }

  // Analogous solutions — title + transferable insight + url
  if (stage1.analogous_solutions && stage1.analogous_solutions.length > 0) {
    lines.push('Analogous Solutions:');
    stage1.analogous_solutions.forEach((as, i) => {
      let line = (i + 1) + '. ' + as.title + ' (' + (as.sector || '') + ') — ' + (as.transferable_insight || as.description || '');
      if (as.url_hint) line += ' [ref: ' + as.url_hint + ']';
      lines.push(line);
    });
    lines.push('');
  }

  // Design trends — trend + application + url
  if (stage1.design_trends && stage1.design_trends.length > 0) {
    lines.push('Design Trends:');
    stage1.design_trends.forEach((dt, i) => {
      let line = (i + 1) + '. ' + dt.trend + ' — ' + (dt.application || dt.description || '');
      if (dt.url_hint) line += ' [ref: ' + dt.url_hint + ']';
      lines.push(line);
    });
    lines.push('');
  }

  return lines.join('\n');
}


// ── STAGE 2: IDEATION & UNPACKING ENGINE ────────────────────

const STAGE2_SYSTEM_PROMPT = [
  'You are a Senior Service Designer and Product Strategist specialising in Human-Centred Design (HCD).',
  '',
  'Your role is to unpack high-level solution opportunities into detailed, actionable solution concepts with concrete features.',
  '',
  'You will be given:',
  '1. PROJECT CONTEXT — current state, problem, personas, constraints',
  '2. OPPORTUNITIES — raw solution ideas to unpack',
  '3. INNOVATION SCAN INSIGHTS — condensed best practices and trends from a research scan (includes reference URLs)',
  '',
  'Your task:',
  '- Create one solution concept per opportunity',
  '- Each concept gets 3–4 concrete features (not more)',
  '- Each feature needs: name, description (1-2 sentences), HCD value prop (1 sentence), best practice reference, a URL for that reference, complexity (Low/Medium/High), rationale (1 sentence)',
  '- Add 2-3 cross-cutting themes (with URLs where applicable) and 2-3 risks with mitigations',
  '',
  'Complexity: Low = existing tools, <1 sprint | Medium = some new tooling, 1-3 sprints | High = significant new capability, 3+ sprints',
  '',
  'URL QUALITY REQUIREMENTS:',
  '- For best_practice_url, reuse the reference URL from the Innovation Scan Insights if one was provided.',
  '- If no URL was provided in the scan insights, provide a REAL, verifiable URL or a descriptive Google search query.',
  '- For cross-cutting theme url_hint, provide a URL only where a clear, relevant reference exists. Use null if none applies.',
  '- Do NOT fabricate or guess URLs — use descriptive search terms if unsure.',
  '',
  'IMPORTANT:',
  '- Respond with JSON ONLY. No markdown fencing, no preamble.',
  '- Be concise — 1-2 sentences per field maximum.',
  '',
  'JSON SCHEMA:',
  '{',
  '  "solution_overview": "<2-3 sentences>",',
  '  "solution_concepts": [',
  '    {',
  '      "opportunity_source": "<which opportunity>",',
  '      "concept_name": "<name>",',
  '      "concept_description": "<2-3 sentences>",',
  '      "features": [',
  '        {',
  '          "feature_name": "<name>",',
  '          "description": "<1-2 sentences>",',
  '          "hcd_value_proposition": "<1 sentence>",',
  '          "best_practice_reference": "<which scan insight>",',
  '          "best_practice_url": "<URL or search term for the referenced best practice>",',
  '          "implementation_complexity": "<Low|Medium|High>",',
  '          "complexity_rationale": "<1 sentence>"',
  '        }',
  '      ]',
  '    }',
  '  ],',
  '  "cross_cutting_themes": [{"theme":"<name>","description":"<1 sentence>","url_hint":"<URL or search term, or null if not applicable>"}],',
  '  "risks_and_considerations": [{"risk":"<description>","mitigation":"<1 sentence>"}]',
  '}',
].join('\n');

/**
 * Build the user prompt for Stage 2 (single batch).
 * Uses compressed Stage 1 output to reduce token count.
 */
function buildStage2UserPrompt(context, opportunities, stage1, batchLabel) {
  const compressed = compressStage1ForStage2(stage1);

  const parts = [
    '## PROJECT CONTEXT',
    '',
    context.trim(),
    '',
    '## OPPORTUNITIES TO UNPACK' + (batchLabel ? ' (' + batchLabel + ')' : ''),
    '',
    opportunities.trim(),
    '',
    '## ' + compressed,
    '',
    '---',
    'Unpack each opportunity into a solution concept with 3-4 features. Respond with JSON only.',
  ];

  return parts.join('\n');
}

/**
 * Split opportunities text into batches of N items.
 * Detects numbered lists (1. 2. 3.) or bullet lists (- or *).
 * Returns array of strings, each containing up to batchSize items.
 */
function splitOpportunities(opportunitiesText, batchSize) {
  if (!batchSize || batchSize < 1) batchSize = 3;

  const text = opportunitiesText.trim();

  // Try to split on numbered list items (1. 2. 3. etc.)
  const numberedPattern = /(?:^|\n)\s*\d+[\.\)]\s+/;
  let items = [];

  if (numberedPattern.test(text)) {
    // Split on numbered items, keeping the content
    items = text.split(/(?=(?:^|\n)\s*\d+[\.\)]\s+)/m)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  } else if (/(?:^|\n)\s*[-*]\s+/.test(text)) {
    // Split on bullet items
    items = text.split(/(?=(?:^|\n)\s*[-*]\s+)/m)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // If we couldn't parse items, or there are few enough, return as single batch
  if (items.length <= batchSize) {
    return [text];
  }

  // Chunk into batches
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize).join('\n'));
  }
  return batches;
}


// ── STAGE 3: SOURCE VALIDATION AGENT (optional) ─────────────

const STAGE3_SYSTEM_PROMPT = [
  'You are a Research Validation Agent. Your role is to spot-check the factual accuracy of AI-generated innovation scan outputs.',
  '',
  'You will be given a list of claims extracted from an innovation scan, including:',
  '- Organisation names and frameworks referenced',
  '- URLs or search terms provided as references',
  '- Factual claims about best practices, solutions, and trends',
  '',
  'Your task:',
  '- For each item, assess whether the claim is plausible and the reference is likely valid.',
  '- Flag any items that appear fabricated, hallucinated, or significantly inaccurate.',
  '- Suggest corrections where possible.',
  '',
  'IMPORTANT:',
  '- Be conservative — only flag items you are reasonably confident are wrong.',
  '- If a URL looks plausible but you cannot verify it, mark it as "uncertain" rather than "likely_invalid".',
  '- Respond with JSON ONLY. No markdown fencing, no preamble.',
  '- Keep your response concise to minimise token usage.',
  '',
  'JSON SCHEMA:',
  '{',
  '  "validation_summary": "<1-2 sentences summarising overall quality>",',
  '  "confidence_score": <0.0-1.0 overall confidence in the outputs>,',
  '  "flags": [',
  '    {',
  '      "section": "<best_practices|analogous_solutions|design_trends|inspiration_sources|solution_concepts|cross_cutting_themes>",',
  '      "item_index": <0-based index>,',
  '      "field": "<url_hint|best_practice_url|title|name|description>",',
  '      "original_value": "<the value being checked>",',
  '      "status": "<likely_valid|uncertain|likely_invalid>",',
  '      "reason": "<1 sentence explanation>",',
  '      "suggested_fix": "<corrected value or better search term, or null>"',
  '    }',
  '  ]',
  '}',
].join('\n');

/**
 * Build the user prompt for Stage 3 validation.
 * Extracts only the fields that need validation to minimise token usage.
 */
function buildStage3UserPrompt(stage1, stage2) {
  const items = [];

  // Extract Stage 1 items
  (stage1.best_practices || []).forEach((bp, i) => {
    items.push({
      section: 'best_practices', index: i,
      title: bp.title, source: bp.source_domain, url: bp.url_hint
    });
  });
  (stage1.analogous_solutions || []).forEach((as, i) => {
    items.push({
      section: 'analogous_solutions', index: i,
      title: as.title, source: as.sector, url: as.url_hint
    });
  });
  (stage1.design_trends || []).forEach((dt, i) => {
    items.push({
      section: 'design_trends', index: i,
      title: dt.trend, url: dt.url_hint
    });
  });
  (stage1.inspiration_sources || []).forEach((is, i) => {
    items.push({
      section: 'inspiration_sources', index: i,
      title: is.name, type: is.type, url: is.url_hint
    });
  });

  // Extract Stage 2 items
  (stage2.solution_concepts || []).forEach((concept, ci) => {
    (concept.features || []).forEach((f, fi) => {
      if (f.best_practice_url) {
        items.push({
          section: 'solution_concepts', index: ci,
          feature_index: fi,
          title: f.feature_name,
          reference: f.best_practice_reference,
          url: f.best_practice_url
        });
      }
    });
  });
  (stage2.cross_cutting_themes || []).forEach((t, i) => {
    if (t.url_hint) {
      items.push({
        section: 'cross_cutting_themes', index: i,
        title: t.theme, url: t.url_hint
      });
    }
  });

  return 'Validate the following ' + items.length + ' items from an innovation scan output.\n\n'
    + JSON.stringify(items, null, 1);
}


// ── STAGE 3B: DEEP URL REPLACEMENT AGENT ────────────────────

const STAGE3B_SYSTEM_PROMPT = [
  'You are a Deep Research Validation Agent specialising in finding accurate source references.',
  '',
  'You will be given a list of items from an innovation scan that were flagged as having uncertain or invalid URL references.',
  'For each item, your task is to:',
  '1. Determine if the original URL/reference is actually valid (sometimes the initial check was too conservative)',
  '2. If the original is invalid or uncertain, find a REAL, verifiable replacement URL',
  '3. Prefer official .gov, .org, or well-known domain URLs',
  '4. If you cannot find a real URL, provide a highly specific Google search query that will lead to the right resource',
  '',
  'IMPORTANT:',
  '- Only provide replacements you are confident about.',
  '- Do NOT fabricate URLs. If unsure, provide a descriptive search term.',
  '- Respond with JSON ONLY. No markdown fencing, no preamble.',
  '- Keep your response concise.',
  '',
  'JSON SCHEMA:',
  '{',
  '  "replacements": [',
  '    {',
  '      "section": "<best_practices|analogous_solutions|design_trends|inspiration_sources|solution_concepts|cross_cutting_themes>",',
  '      "item_index": <0-based index>,',
  '      "field": "<url_hint|best_practice_url>",',
  '      "feature_index": <0-based index or null if not a feature>,',
  '      "original_value": "<the original URL or search term>",',
  '      "replacement_url": "<new URL or search term>",',
  '      "confidence": "<high|medium|low>",',
  '      "reason": "<1 sentence explaining why this replacement is better>"',
  '    }',
  '  ]',
  '}',
].join('\n');

/**
 * Build the user prompt for Stage 3b deep validation.
 * Only includes items that were flagged as uncertain or invalid.
 */
function buildStage3bUserPrompt(flaggedItems) {
  return 'The following ' + flaggedItems.length + ' source references were flagged as uncertain or invalid in an innovation scan.\n'
    + 'For each one, find a better replacement URL or confirm the original is actually valid.\n\n'
    + JSON.stringify(flaggedItems, null, 1);
}
