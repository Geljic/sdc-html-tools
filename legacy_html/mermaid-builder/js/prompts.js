// ============================================================
// Mermaid Diagram Builder — prompts.js
// System prompts per diagram type + response parsing
// ============================================================

// ── Diagram type metadata ──────────────────────────────────
const MD_DIAGRAM_TYPES = [
  {
    id: 'auto',
    label: 'Auto-detect',
    keyword: null,
    description: 'Let AI choose the best diagram type',
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    keyword: 'flowchart TD',
    description: 'Process flows, decision trees, workflows',
    example: `flowchart TD
    A[Start] --> B{Decision?}
    B -->|Yes| C[Do this]
    B -->|No| D[Do that]
    C --> E[End]
    D --> E`,
  },
  {
    id: 'sequence',
    label: 'Sequence Diagram',
    keyword: 'sequenceDiagram',
    description: 'System interactions, API calls, user journeys',
    example: `sequenceDiagram
    actor User
    participant App
    participant API
    User->>App: Submit form
    App->>API: POST /data
    API-->>App: 200 OK
    App-->>User: Show confirmation`,
  },
  {
    id: 'journey',
    label: 'User Journey',
    keyword: 'journey',
    description: 'HCD journey mapping with satisfaction scores',
    example: `journey
    title My Working Day
    section Morning
      Make coffee: 5: Me
      Read emails: 3: Me
    section Afternoon
      Team standup: 4: Me, Team
      Write report: 2: Me`,
  },
  {
    id: 'gantt',
    label: 'Gantt Chart',
    keyword: 'gantt',
    description: 'Project timelines and task scheduling',
    example: `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Discovery
        Stakeholder interviews :a1, 2024-01-01, 7d
        Research synthesis     :a2, after a1, 5d
    section Design
        Prototype              :b1, after a2, 10d`,
  },
  {
    id: 'mindmap',
    label: 'Mindmap',
    keyword: 'mindmap',
    description: 'Brainstorming, concept maps, topic hierarchies',
    example: `mindmap
  root((HCD Process))
    Discover
      Interviews
      Surveys
    Define
      Personas
      Problem Statement
    Develop
      Ideation
      Prototyping
    Deliver
      Testing
      Launch`,
  },
  {
    id: 'quadrant',
    label: 'Quadrant Chart',
    keyword: 'quadrantChart',
    description: '2×2 prioritisation, effort vs impact matrices',
    example: `quadrantChart
    title Effort vs Impact
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Quick wins
    quadrant-2 Major projects
    quadrant-3 Fill-ins
    quadrant-4 Thankless tasks
    Feature A: [0.3, 0.6]
    Feature B: [0.45, 0.23]
    Feature C: [0.57, 0.69]`,
  },
  {
    id: 'er',
    label: 'Entity Relationship',
    keyword: 'erDiagram',
    description: 'Data models, database schemas',
    example: `erDiagram
    STUDENT ||--o{ ENROLMENT : has
    COURSE  ||--o{ ENROLMENT : includes
    STUDENT {
        string name
        string email
    }
    COURSE {
        string title
        string code
    }`,
  },
];

function mdGetDiagramType(id) {
  return MD_DIAGRAM_TYPES.find(t => t.id === id) || MD_DIAGRAM_TYPES[0];
}

// ── Base system prompt ─────────────────────────────────────
const MD_BASE_SYSTEM = `You are an expert at creating Mermaid diagram syntax.

Your job is to take a plain English description and produce valid, well-structured Mermaid diagram code.

CRITICAL RULES:
- Return ONLY the raw Mermaid syntax — no markdown code fences, no explanation, no preamble, no trailing text
- The first line must be the diagram type keyword (e.g. flowchart TD, sequenceDiagram, journey, etc.)
- Use short, readable node IDs with no spaces (use camelCase or underscores)
- Keep diagrams readable — aim for 8-20 nodes/steps for flowcharts and sequences
- Do NOT wrap output in \`\`\`mermaid or any other fences
- Do NOT add any text before or after the diagram code`;

// ── Per-type system prompt additions ──────────────────────
const MD_TYPE_INSTRUCTIONS = {
  auto: `Choose the most appropriate diagram type based on the description.
- Use flowchart for processes, decisions, and workflows
- Use sequenceDiagram for interactions between systems or people
- Use journey for user experience mapping
- Use gantt for project timelines
- Use mindmap for brainstorming and concept hierarchies
- Use quadrantChart for prioritisation matrices`,

  flowchart: `Create a flowchart diagram.
Rules:
- Start with: flowchart TD (or LR if the flow is better horizontal)
- Use descriptive node labels in square brackets for rectangles: A[Label]
- Use diamond shapes for decisions: B{Decision?}
- Use rounded rectangles for start/end: A([Start])
- Use --> for connections, with optional labels: A -->|Yes| B
- Group related steps logically
- Maximum 20 nodes for readability`,

  sequence: `Create a sequence diagram.
Rules:
- Start with: sequenceDiagram
- Declare participants at the top: participant Name or actor Name
- Use ->> for solid arrows (synchronous): A->>B: Message
- Use -->> for dashed arrows (async/return): B-->>A: Response
- Use Note over A,B: text for notes
- Use activate/deactivate for lifeline boxes where helpful
- Keep messages concise (under 60 characters)`,

  journey: `Create a user journey diagram.
Rules:
- Start with: journey
- Add a title: title Journey Name
- Group steps into sections: section Phase Name
- Each task: Task name: score: Actor1, Actor2
- Scores are integers 1-5 (1=very negative, 5=very positive)
- Use realistic scores that reflect the emotional experience
- Actor names should be short (e.g. User, Staff, System)`,

  gantt: `Create a Gantt chart.
Rules:
- Start with: gantt
- Add title: title Project Name
- Add date format: dateFormat YYYY-MM-DD
- Group tasks into sections: section Section Name
- Task format: Task name :status, id, start-date, duration
- Status options: done, active, crit (critical), milestone
- Duration format: Nd (days), Nw (weeks)
- Use after id to chain tasks: Task :a2, after a1, 5d
- Use today's date as the reference point for scheduling`,

  mindmap: `Create a mindmap diagram.
Rules:
- Start with: mindmap
- The root node uses double parentheses: root((Central Topic))
- Child nodes are indented with spaces (2 spaces per level)
- Use plain text for nodes (no special characters)
- Maximum 4 levels of depth for readability
- Aim for 3-6 branches from the root`,

  quadrant: `Create a quadrant chart.
Rules:
- Start with: quadrantChart
- Add title: title Chart Title
- Define axes: x-axis Low Label --> High Label
- Define axes: y-axis Low Label --> High Label
- Label quadrants: quadrant-1 through quadrant-4 (top-right, top-left, bottom-left, bottom-right)
- Plot items: Item Name: [x, y] where x and y are 0.0-1.0
- Aim for 4-12 items`,

  er: `Create an entity relationship diagram.
Rules:
- Start with: erDiagram
- Entity format: ENTITY_NAME { type fieldName }
- Relationship format: ENTITY1 ||--o{ ENTITY2 : "relationship label"
- Cardinality: || (one), o| (zero or one), }{ (one or more), }o (zero or more)
- Use UPPERCASE for entity names
- Keep field types simple: string, int, date, boolean`,
};

// ── Build system prompt for a given diagram type ───────────
function mdBuildSystemPrompt(diagramTypeId) {
  const typeInstructions = MD_TYPE_INSTRUCTIONS[diagramTypeId] || MD_TYPE_INSTRUCTIONS.auto;
  return MD_BASE_SYSTEM + '\n\n' + typeInstructions;
}

// ── Build user prompt ──────────────────────────────────────
function mdBuildUserPrompt(description, diagramTypeId, existingCode) {
  const today = new Date().toISOString().split('T')[0];
  const typeInfo = mdGetDiagramType(diagramTypeId);

  let prompt = '';

  if (diagramTypeId !== 'auto' && typeInfo.keyword) {
    prompt += `Diagram type: ${typeInfo.label} (keyword: ${typeInfo.keyword})\n\n`;
  }

  prompt += `Today's date: ${today}\n\n`;

  if (existingCode && existingCode.trim()) {
    prompt += `Existing diagram to refine or update:\n${existingCode.trim()}\n\n`;
    prompt += `User's requested changes or additions:\n${description.trim()}`;
  } else {
    prompt += `Description:\n${description.trim()}`;
  }

  return prompt;
}

// ── Parse and clean AI response ────────────────────────────
/**
 * Strip any accidental markdown fences or leading/trailing whitespace
 * from the AI response, returning clean Mermaid syntax.
 * @param {string} raw
 * @returns {string}
 */
function mdParseAiResponse(raw) {
  let cleaned = raw.trim();

  // Remove ```mermaid ... ``` fences if present
  cleaned = cleaned.replace(/^```mermaid\s*/i, '').replace(/```\s*$/, '').trim();

  // Remove plain ``` fences
  cleaned = cleaned.replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

  // Remove any leading explanation lines (lines before the diagram keyword)
  const diagramKeywords = [
    'flowchart', 'graph', 'sequenceDiagram', 'journey', 'gantt',
    'mindmap', 'quadrantChart', 'erDiagram', 'classDiagram',
    'stateDiagram', 'pie', 'gitGraph', 'timeline', 'xychart',
  ];

  const lines = cleaned.split('\n');
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().toLowerCase();
    if (diagramKeywords.some(kw => trimmed.startsWith(kw.toLowerCase()))) {
      startIdx = i;
      break;
    }
  }

  return lines.slice(startIdx).join('\n').trim();
}

// ── Validate that a string looks like Mermaid code ─────────
function mdLooksLikeMermaid(code) {
  if (!code || code.trim().length < 5) return false;
  const diagramKeywords = [
    'flowchart', 'graph ', 'sequenceDiagram', 'journey', 'gantt',
    'mindmap', 'quadrantChart', 'erDiagram', 'classDiagram',
    'stateDiagram', 'pie', 'gitGraph', 'timeline', 'xychart',
  ];
  const first = code.trim().toLowerCase();
  return diagramKeywords.some(kw => first.startsWith(kw.toLowerCase()));
}

// ── Detect diagram type from code ─────────────────────────
function mdDetectDiagramType(code) {
  if (!code) return 'flowchart';
  const first = code.trim().toLowerCase();
  if (first.startsWith('flowchart') || first.startsWith('graph ')) return 'flowchart';
  if (first.startsWith('sequencediagram')) return 'sequence';
  if (first.startsWith('journey')) return 'journey';
  if (first.startsWith('gantt')) return 'gantt';
  if (first.startsWith('mindmap')) return 'mindmap';
  if (first.startsWith('quadrantchart')) return 'quadrant';
  if (first.startsWith('erdiagram')) return 'er';
  return 'flowchart';
}
