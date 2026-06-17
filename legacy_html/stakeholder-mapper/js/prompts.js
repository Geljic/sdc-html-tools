// ============================================================
// SDC Stakeholder Mapper — prompts.js
// AI system prompt, user prompt builder, JSON response parser
// ============================================================

// ── System prompt ──────────────────────────────────────────

const SM_SYSTEM_PROMPT = `You are a Service Design and Change Management expert helping to identify and categorise project stakeholders for the NSW Department of Education.

Given a project description, org chart, or meeting notes, extract a structured list of stakeholders.

For each stakeholder, provide:
- name: their role label (NOT a personal name — use role titles only, e.g. "Product Owner", "Executive Sponsor", "Frontline Teacher")
- team: their team or organisational unit (e.g. "Digital Delivery", "People & Culture", "School Operations")
- group: one of exactly: delivery | executive | users | external | other
- power: a decimal from 0.0 to 1.0 representing their influence/authority over the project
- interest: a decimal from 0.0 to 1.0 representing how much they care about the outcome
- raci: an object with a key per project phase, each value being one of: L, A, C, I, E, or —
- notes: one sentence about their key concern or engagement need

Return ONLY a valid JSON array. No explanation, no preamble, no markdown fences, no trailing text.

Group definitions:
- delivery: The team building or running the project (product owner, designers, developers, SDC practitioners)
- executive: Senior leaders, governance bodies, sponsors who have authority over the project
- users: End users, frontline staff, students, parents — people directly impacted by the outcome
- external: Vendors, partner agencies, unions, external consultants
- other: Anyone who doesn't fit the above

Power scoring guidance:
- 0.8–1.0: Can stop or fundamentally change the project (SES, Secretary, Board, Minister)
- 0.5–0.8: Significant influence, must be managed (Directors, Product Owners, Union reps)
- 0.2–0.5: Some influence, should be consulted (Team leads, Subject matter experts)
- 0.0–0.2: Limited influence (Individual contributors, peripheral teams)

Interest scoring guidance:
- 0.8–1.0: Directly impacted, highly invested in outcome (daily users, project team)
- 0.5–0.8: Moderately impacted, engaged but not daily concern
- 0.2–0.5: Aware but not deeply invested
- 0.0–0.2: Peripheral awareness only

RACI code definitions:
- L: Lead — owns this phase, drives the work
- A: Accountable — signs off, has final say
- C: Consult — must be consulted before decisions
- I: Inform — kept updated, no input required
- E: Engage — active participant (interviews, co-design, testing)
- —: Not involved in this phase

Important rules:
- Use role titles, never personal names
- Spread power/interest scores realistically — avoid clustering everything at 0.5
- Include users who should be engaged in discovery (score them high on interest, lower on power)
- Include decision-makers who need buy-in (high power, variable interest)
- Aim for 6–20 stakeholders for a typical project
- Return ONLY the JSON array, nothing else

Power/interest inference by team or group type:
- Executive / SES / Secretary / Minister → power 0.85–1.0, interest 0.5–0.8
- Director-General / Deputy Secretary → power 0.75–0.9, interest 0.6–0.8
- Executive Director / Director → power 0.6–0.8, interest 0.5–0.75
- Manager / Team Lead → power 0.4–0.65, interest 0.6–0.85
- Delivery team (SDC, designers, developers, product owners) → power 0.4–0.7, interest 0.8–1.0
- Frontline staff / teachers / students / parents → power 0.1–0.35, interest 0.75–1.0
- Union representatives → power 0.5–0.75, interest 0.7–0.9
- External vendors / partner agencies → power 0.2–0.5, interest 0.4–0.7
- Governance / audit / legal → power 0.6–0.85, interest 0.3–0.6`;

// ── User prompt builder ────────────────────────────────────

/**
 * Build the user prompt from sanitised project context.
 * @param {string} sanitisedContext  — PII-scrubbed project description
 * @param {string} projectTitle
 * @param {string[]} phases          — e.g. ['Discover', 'Define', 'Develop', 'Deliver']
 * @returns {string}
 */
function smBuildUserPrompt(sanitisedContext, projectTitle, phases) {
  const today = new Date().toISOString().split('T')[0];
  const phaseList = phases.join(', ');

  return `Project name: ${projectTitle || 'Unnamed project'}
Today's date: ${today}
Project phases: ${phaseList}

Project context:
${sanitisedContext.trim()}

Identify all stakeholders mentioned or implied in the context above. Include:
- Direct users who will be engaged in discovery research
- Decision-makers who need to approve or fund the work
- Delivery team members responsible for the project
- Impacted groups who need change management support
- External parties (vendors, partner agencies, unions) if relevant

For the RACI object, use these exact phase keys (lowercase): ${phases.map(p => p.toLowerCase()).join(', ')}

Return a JSON array of stakeholder objects.`;
}

// ── Response parser ────────────────────────────────────────

/**
 * Parse and validate the AI response into a stakeholder array.
 * Strips markdown fences, extracts JSON array, validates structure.
 * @param {string} raw  — raw AI response text
 * @returns {Array}     — array of stakeholder objects
 * @throws {Error}      — if parsing fails
 */
function smParseAiResponse(raw) {
  let cleaned = raw.trim();

  // Strip markdown fences
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  // Find the JSON array (may have leading/trailing text)
  const arrayStart = cleaned.indexOf('[');
  const arrayEnd   = cleaned.lastIndexOf(']');

  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
    throw new Error('AI response did not contain a valid JSON array. Please try again.');
  }

  const jsonStr = cleaned.slice(arrayStart, arrayEnd + 1);

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Could not parse AI response as JSON: ' + e.message);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI response was not a JSON array. Please try again.');
  }

  if (parsed.length === 0) {
    throw new Error('AI returned an empty stakeholder list. Try providing more project context.');
  }

  // Validate and normalise each entry
  const valid = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || !item) continue;
    if (!item.name) continue; // skip entries without a name

    valid.push({
      name:     String(item.name    || '').trim(),
      team:     String(item.team    || '').trim(),
      group:    ['delivery','executive','users','external','other'].includes(item.group)
                  ? item.group : 'other',
      power:    Math.min(1, Math.max(0, parseFloat(item.power)    || 0.5)),
      interest: Math.min(1, Math.max(0, parseFloat(item.interest) || 0.5)),
      raci:     smNormaliseRaci(item.raci),
      notes:    String(item.notes   || '').trim(),
    });
  }

  if (valid.length === 0) {
    throw new Error('No valid stakeholders found in AI response. Please try again with more context.');
  }

  return valid;
}

/**
 * Normalise a RACI object — ensure all values are valid codes.
 * @param {object} raci
 * @returns {object}
 */
function smNormaliseRaci(raci) {
  if (!raci || typeof raci !== 'object') return {};
  const VALID = new Set(['L', 'A', 'C', 'I', 'E', '—', '-', '']);
  const result = {};
  for (const [key, val] of Object.entries(raci)) {
    const code = String(val || '—').trim();
    result[key.toLowerCase()] = VALID.has(code) ? (code === '-' || code === '' ? '—' : code) : '—';
  }
  return result;
}

// ── Mermaid export (lossy — for doc embedding only) ────────

/**
 * Generate a simplified Mermaid quadrantChart from stakeholder data.
 * WARNING: This is a lossy export — group colours, interactivity,
 * and collision avoidance are lost. For Confluence/markdown embedding only.
 * @param {Array} stakeholders
 * @param {string} projectTitle
 * @returns {string}
 */
function smGenerateMermaid(stakeholders, projectTitle) {
  const lines = [
    'quadrantChart',
    `    title ${(projectTitle || 'Stakeholder Map').replace(/[^\w\s\-]/g, '')} — Power/Interest Matrix`,
    '    x-axis Low Interest --> High Interest',
    '    y-axis Low Power --> High Power',
    '    quadrant-1 Manage Closely',
    '    quadrant-2 Keep Satisfied',
    '    quadrant-3 Monitor',
    '    quadrant-4 Keep Informed',
  ];

  for (const s of stakeholders) {
    // Clamp to avoid edge overlap in Mermaid
    const x = Math.min(0.95, Math.max(0.05, s.interest));
    const y = Math.min(0.95, Math.max(0.05, s.power));
    // Sanitise name for Mermaid (no special chars)
    const name = (s.name || 'Unknown').replace(/[^\w\s\-]/g, '').substring(0, 30);
    lines.push(`    ${name}: [${x.toFixed(2)}, ${y.toFixed(2)}]`);
  }

  return lines.join('\n');
}

// ── SuccessFactors image prompt ─────────────────────────────

/**
 * System prompt for extracting stakeholders from a SuccessFactors export image.
 * SF exports show: initials (2 letters), role title, team/unit, reporting hierarchy.
 * Initials are NOT PII — they are safe to include in the AI response.
 */
const SM_SF_SYSTEM_PROMPT = `You are an expert at reading SuccessFactors org chart exports for the NSW Department of Education.

A SuccessFactors export image shows a vertical list of people with:
- 2-letter initials in a circle (e.g. MD, MM, JF, SS, RJ)
- A role title (e.g. "Secretary, Department of Education", "Chief Operating Officer")
- A team or unit name (e.g. "Primary Employment", "Shared Services")
- Sometimes a reporting level or matrix count

Extract each person as a stakeholder object. The initials are anonymised — they are safe to use.

For each person, return:
- initials: the 2-letter initials shown in the circle (e.g. "MD")
- name: the role title (e.g. "Secretary, Department of Education") — this is the AI-safe label
- team: the team or unit name if shown, otherwise infer from context
- group: one of: delivery | executive | users | external | other
  - Secretary/CEO/COO/CFO/Director-General → executive
  - Directors/Managers/Team Leads → delivery or executive depending on seniority
  - Frontline staff → users
- power: 0.0–1.0 based on seniority (Secretary = 0.95, COO = 0.85, Director = 0.7, Manager = 0.5, etc.)
- interest: 0.0–1.0 (infer from role — operational roles score higher interest)
- notes: one sentence about their likely engagement need

Return ONLY a valid JSON array. No explanation, no preamble, no markdown fences.

Important:
- Preserve the initials exactly as shown — they will be displayed on the matrix dot
- Use the role title as the name field — never invent personal names
- Infer the reporting hierarchy from the visual order (top = most senior)`;

/**
 * Build user prompt for SF image extraction.
 * The image is passed separately as a vision message — this is the text part.
 * @param {string} projectTitle
 * @param {string[]} phases
 * @param {string} [additionalContext] — optional extra context from the user
 */
function smBuildSfUserPrompt(projectTitle, phases, additionalContext = '') {
  const phaseList = phases.join(', ');
  const contextBlock = additionalContext && additionalContext.trim()
    ? `\n\nAdditional context from the user:\n${additionalContext.trim()}`
    : '';
  return `Project: ${projectTitle || 'Unnamed project'}
Project phases: ${phaseList}${contextBlock}

The attached image is a SuccessFactors org chart export. Extract all visible people as stakeholders.
Preserve their initials exactly. Use their role titles as the name field.
For the RACI object, use these phase keys (lowercase): ${phases.map(p => p.toLowerCase()).join(', ')}
Set all RACI values to "—" by default — the user will fill these in.

Return a JSON array of stakeholder objects.`;
}

/**
 * Parse and validate a SuccessFactors AI response.
 * Same structure as smParseAiResponse but also validates initials field.
 */
function smParseSfResponse(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd   = cleaned.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
    throw new Error('AI response did not contain a valid JSON array.');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
  } catch (e) {
    throw new Error('Could not parse AI response as JSON: ' + e.message);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AI returned an empty or invalid stakeholder list.');
  }

  return parsed.filter(item => item && item.name).map(item => ({
    initials: String(item.initials || '').trim().toUpperCase().substring(0, 3),
    name:     String(item.name     || '').trim() || 'Unknown',
    team:     String(item.team     || '').trim(),
    group:    ['delivery','executive','users','external','other'].includes(item.group) ? item.group : 'other',
    power:    Math.min(1, Math.max(0, parseFloat(item.power)    || 0.5)),
    interest: Math.min(1, Math.max(0, parseFloat(item.interest) || 0.5)),
    notes:    String(item.notes    || '').trim(),
  }));
}

// ── Org chart image prompt ──────────────────────────────────

/**
 * System prompt for extracting a hierarchy from an org chart image.
 * The image shows boxes connected by lines — extract the tree structure.
 */
const SM_ORGCHART_SYSTEM_PROMPT = `You are an expert at reading organisational hierarchy diagrams.

The attached image shows an org chart with boxes connected by lines representing reporting relationships.
Each box contains a team name, group name, or role title.

Extract the hierarchy as a flat list of nodes with parent-child relationships.

For each node, return:
- id: a short unique slug (e.g. "ops-group", "service-experience") — lowercase, hyphens only
- label: the exact text shown in the box (e.g. "Operations Group", "Service Design team")
- parentId: the id of the parent node, or null if this is the root

Rules:
- The topmost box is the root (parentId: null)
- Boxes connected below another box are its children
- Preserve the exact label text from the image
- If a box has multiple parents (matrix structure), pick the primary/closest parent

Return ONLY a valid JSON array of node objects. No explanation, no preamble, no markdown fences.`;

/**
 * Build user prompt for org chart image extraction.
 */
function smBuildOrgChartUserPrompt() {
  return `The attached image is an org chart. Extract all visible boxes and their parent-child relationships.
Return a JSON array of node objects with id, label, and parentId fields.
The root node should have parentId: null.`;
}

/**
 * Parse and validate an org chart AI response.
 * @param {string} raw
 * @returns {Array<{id, label, parentId}>}
 */
function smParseOrgChartResponse(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd   = cleaned.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
    throw new Error('AI response did not contain a valid JSON array.');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
  } catch (e) {
    throw new Error('Could not parse org chart response as JSON: ' + e.message);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AI returned an empty org chart.');
  }

  return parsed.filter(n => n && n.label).map((n, i) => ({
    id:       String(n.id || 'node_' + i).trim(),
    label:    String(n.label || '').trim(),
    parentId: n.parentId || null,
  }));
}

// ── Org chart CSV prompt ────────────────────────────────────

/**
 * System prompt for inferring org hierarchy from a flat staff list CSV.
 * The CSV has had PII columns stripped by the user before sending.
 * Remaining columns typically include: Role, Team, Manager, Department, Level.
 */
const SM_ORGCHART_CSV_SYSTEM_PROMPT = `You are an expert at reading staff list data and inferring organisational hierarchies.

You will receive a CSV with columns representing staff attributes (e.g. Role, Team, Manager, Department, Level).
Personal name columns have been removed by the user for privacy.

Your task is to infer the reporting hierarchy from the available data and return it as a flat list of nodes.

For each unique team, group, or role cluster, create a node:
- id: a short unique slug (lowercase, hyphens only, e.g. "operations-group", "service-design-team")
- label: the team or group name (e.g. "Operations Group", "Service Design Team")
- parentId: the id of the parent node, or null if this is the root

Rules:
- Group rows by Team or Department to create team nodes
- Use the Manager column (if present) to infer parent-child relationships between teams
- If a "Level" or "Grade" column exists, use it to determine hierarchy depth
- The most senior team/group is the root (parentId: null)
- Do NOT create individual person nodes — only team/group nodes
- Aim for 5–20 nodes representing the organisational structure

Return ONLY a valid JSON array of node objects. No explanation, no preamble, no markdown fences.`;

/**
 * Build user prompt for CSV org chart extraction.
 * @param {string} sanitisedCsv — CSV with PII columns already stripped
 */
function smBuildOrgChartCsvUserPrompt(sanitisedCsv) {
  return `The following is a staff list CSV with personal name columns removed.
Infer the organisational hierarchy from the remaining columns and return a JSON array of team/group nodes.

CSV data:
${sanitisedCsv}

Return a JSON array of node objects with id, label, and parentId fields.
The root node should have parentId: null.
Group by team/department — do not create individual person nodes.`;
}
