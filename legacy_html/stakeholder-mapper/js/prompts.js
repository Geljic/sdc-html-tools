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
- Return ONLY the JSON array, nothing else`;

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
