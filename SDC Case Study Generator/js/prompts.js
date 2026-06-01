// ============================================================
// PROMPTS — Batched AI extraction for the 13-slide case study
//
// Batch 1: Slides 1–4  (Cover, Snapshot, Who Involved, Challenges)
// Batch 2: Slides 5–8  (Methods, Findings, Opportunities, Recommendations)
// Batch 3: Slides 12–13 (Benefits, Contact)
// Slides 9–11 are skipped — SDC boilerplate filled manually
// ============================================================

const CASE_STUDY_SYSTEM_PROMPT = `You are a Service Design case study editor working for the NSW Department of Education Service Design and Change (SDC) team.

You will be given the full text extracted from a completed HCD project report PowerPoint presentation, followed by a set of slide fields to populate.

Your task:
- Read the extracted presentation text carefully before populating any fields.
- For every field, find the best matching content from the source presentation.
- Do NOT copy text verbatim unless it is a statistic, a quote, or a proper noun. Rewrite and condense to produce polished case study language.
- If a field has no clear match in the source, use the string "[NOT FOUND — suggest content]" and briefly note what would ideally go there.
- Return ONLY a valid JSON object matching the exact shape specified. No markdown fencing, no preamble, no explanation outside the JSON.
- All string values must be plain text (no markdown formatting inside values).
- For array fields, return a JSON array of strings.`;


// ── BATCH 1: Slides 1–4 ──────────────────────────────────────

const BATCH1_USER_PROMPT_TEMPLATE = function (rawText) {
  return `Here is the full text extracted from the project report presentation:

---
${rawText}
---

Now populate the following fields for Slides 1–4 of the case study template.

Return a single JSON object with this exact shape:

{
  "slide1": {
    "presenterName": "string — name of the presenter or lead author (or null if not found)",
    "presenterTitle": "string — role/title of the presenter (or null if not found)",
    "projectName": "string — name of the product, system or service being studied",
    "subtitle": "string — one sentence: what the project aimed to achieve and for whom",
    "goal1Heading": "string — heading for Phase 1 (e.g. Discovery)",
    "goal1Description": "string — 1–2 sentence description of what happened in Phase 1",
    "goal2Heading": "string — heading for Phase 2 (e.g. Requirements / Define)",
    "goal2Description": "string — 1–2 sentence description of what happened in Phase 2",
    "goal3Heading": "string — heading for Phase 3 (e.g. Design / Develop)",
    "goal3Description": "string — 1–2 sentence description of what happened in Phase 3",
    "objectiveStatement": "string — one sentence framing the overarching project objective",
    "closingQuote": "string — an inspiring quote reflecting human-centred design ethos (can be invented if none found, attributed to 'SDC Team')"
  },
  "slide2": {
    "stats": [
      { "number": "string — the statistic value (e.g. '12', '3 months', '47%')", "label": "string — short label (e.g. 'workshops run', 'interviews conducted')" }
    ]
  },
  "slide3": {
    "projectTeamName": "string — name of the project team",
    "projectTeamRoles": ["string — each role listed"],
    "smes": ["string — each SME team or function who provided expert input"],
    "externalStakeholders": ["string — each external stakeholder group (end users, clients, vendors, schools, partners)"]
  },
  "slide4": {
    "contextParagraph": "string — 2–3 sentences framing the problem environment",
    "challenges": ["string — each specific challenge uncovered during discovery (short active sentence, 8–10 items)"]
  }
}

Rules for slide2.stats:
- Include 7–8 statistics
- Order from largest/most impactful number to smallest
- Draw from: workshops run, interviews conducted, personas created, wireframe iterations, requirements sets, participants, stakeholder groups, weeks of research, etc.
- If fewer than 7 clear stats exist, synthesise reasonable ones from the content and note them with "(estimated)" in the label`;
};


// ── BATCH 2: Slides 5–8 ──────────────────────────────────────

const BATCH2_USER_PROMPT_TEMPLATE = function (rawText) {
  return `Here is the full text extracted from the project report presentation:

---
${rawText}
---

Now populate the following fields for Slides 5–8 of the case study template.

Return a single JSON object with this exact shape:

{
  "slide5": {
    "approachDescription": "string — 3–5 sentence narrative covering the overall methodology: HCD, discovery, workshops, personas, journey mapping, blueprints, wireframes, prototyping, requirements",
    "activityCallouts": [
      {
        "stat": "string — a number or quantity",
        "label": "string — activity name in CAPS (e.g. 'WORKSHOPS', 'INTERVIEWS', 'PERSONAS')",
        "description": "string — 1–2 sentences describing this activity"
      }
    ]
  },
  "slide6": {
    "findingsSummary": "string — 1–2 sentences describing systemic patterns at a high level",
    "keyFindings": ["string — each synthesised insight (pattern across the research, not a raw observation), 7–9 items"]
  },
  "slide7": {
    "artifactType": "string — name of the research artifact shown as a visual snippet (e.g. 'Journey Map', 'Service Blueprint', 'Affinity Map')",
    "opportunitiesSummary": "string — one sentence framing the overall improvement intent",
    "opportunityStatements": ["string — each opportunity starting with an action verb: design, enable, standardise, improve, reduce, introduce, align, etc. (8–10 items)"]
  },
  "slide8": {
    "artifactType": "string — name of the artifact shown as a visual (e.g. 'Persona', 'Wireframe', 'Prototype')",
    "keyRecommendations": ["string — each concise actionable recommendation, one sentence (3–4 items)"],
    "outcomeStatement": "string — one sentence describing the validated output of the project",
    "deliverables": ["string — each concrete output produced as a noun phrase (5–7 items)"]
  }
}

Rules for slide5.activityCallouts:
- Include exactly 2–3 callouts
- Choose the most impactful activities from the methodology
- Stats should be specific numbers where possible`;
};


// ── BATCH 3: Slides 12–13 ────────────────────────────────────

const BATCH3_USER_PROMPT_TEMPLATE = function (rawText) {
  return `Here is the full text extracted from the project report presentation:

---
${rawText}
---

Now populate the following fields for Slides 12–13 of the case study template.

Return a single JSON object with this exact shape:

{
  "slide12": {
    "sectionHeading": "string — heading for the benefits section (e.g. 'Why this matters')",
    "benefits": [
      {
        "heading": "string — short benefit heading",
        "description": "string — description starting with '…because' explaining why this benefit matters"
      }
    ]
  },
  "slide13": {
    "callToAction": "string — short phrase directing the audience (e.g. 'Get in touch', 'Work with us')",
    "email": "string — contact email address (or null if not found)",
    "physicalAddress": "string — physical address (or null if not found)",
    "additionalContact": "string — optional: website, phone, LinkedIn (or null if not found)"
  }
}

Rules for slide12.benefits:
- Include exactly 3 benefits
- Each description must start with '…because'
- Draw from the project outcomes, findings, and recommendations
- Frame benefits from the perspective of the organisation and end users`;
};


// ── EXPORTED BATCH DEFINITIONS ────────────────────────────────

const CASE_STUDY_BATCHES = [
  {
    id:           'batch1',
    label:        'Extracting project overview, team and challenges…',
    slides:       ['slide1', 'slide2', 'slide3', 'slide4'],
    buildPrompt:  BATCH1_USER_PROMPT_TEMPLATE
  },
  {
    id:           'batch2',
    label:        'Extracting methods, findings and recommendations…',
    slides:       ['slide5', 'slide6', 'slide7', 'slide8'],
    buildPrompt:  BATCH2_USER_PROMPT_TEMPLATE
  },
  {
    id:           'batch3',
    label:        'Extracting benefits and contact details…',
    slides:       ['slide12', 'slide13'],
    buildPrompt:  BATCH3_USER_PROMPT_TEMPLATE
  }
];
