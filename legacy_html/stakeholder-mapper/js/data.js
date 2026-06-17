// ============================================================
// SDC Stakeholder Mapper — data.js
// Stakeholder data model, CRUD operations, localStorage persistence
// ============================================================

// ── Group colours ──────────────────────────────────────────
const SM_GROUP_COLOURS = {
  delivery:  '#002664',
  executive: '#D7153A',
  users:     '#2E8B8B',
  external:  '#E07B39',
  other:     '#6B7280',
};

const SM_GROUP_LABELS = {
  delivery:  'Delivery Team',
  executive: 'Executive / Governance',
  users:     'Users / Frontline',
  external:  'External',
  other:     'Other',
};

// RACI cycle order
const SM_RACI_CYCLE = ['L', 'A', 'C', 'I', 'E', '—'];

// ── State ──────────────────────────────────────────────────
const smState = {
  mode: 'splash',           // splash | ai | manual | editor
  projectTitle: '',
  projectContext: '',       // raw (unsanitised) project description
  stakeholders: [],         // array of stakeholder objects
  phases: ['Discover', 'Define', 'Develop', 'Deliver'],
  activeView: 'power',      // power | raci | orgchart
  activeFilter: 'all',      // all | delivery | executive | users | external | other
  orgChart: {               // org chart hierarchy (populated from image upload)
    nodes: [],              // [{ id, label, parentId }]
  },
  metadata: {
    createdAt: null,
    updatedAt: null,
  },
};

let _shIdCounter = 1;

/** Reset the stakeholder ID counter (called on new project). */
function smResetIdCounter() { _shIdCounter = 1; }

// ── Stakeholder factory ────────────────────────────────────

/**
 * Create a new stakeholder object with defaults.
 * @param {object} [overrides]
 * @returns {object}
 */
function smCreateStakeholder(overrides = {}) {
  const id = 'sh_' + String(_shIdCounter++).padStart(3, '0');
  const defaultRaci = {};
  for (const phase of smState.phases) {
    defaultRaci[phase.toLowerCase()] = '—';
  }

  return {
    id,
    name: '',         // role label — safe to send to AI
    realName: '',     // real staff name — LOCAL ONLY, never sent to AI
    initials: '',     // 2-letter initials shown on matrix dot (from SF export or derived)
    team: '',
    group: 'other',
    power: 0.5,       // 0.0–1.0
    interest: 0.5,    // 0.0–1.0
    raci: defaultRaci,
    notes: '',
    changeReadiness: null,
    ...overrides,
  };
}

// ── CRUD ───────────────────────────────────────────────────

function smAddStakeholder(data = {}) {
  const sh = smCreateStakeholder(data);
  smState.stakeholders.push(sh);
  smPersist();
  return sh;
}

function smUpdateStakeholder(id, updates) {
  const idx = smState.stakeholders.findIndex(s => s.id === id);
  if (idx === -1) return false;
  smState.stakeholders[idx] = { ...smState.stakeholders[idx], ...updates };
  smPersist();
  return true;
}

function smDeleteStakeholder(id) {
  smState.stakeholders = smState.stakeholders.filter(s => s.id !== id);
  smPersist();
}

function smGetStakeholder(id) {
  return smState.stakeholders.find(s => s.id === id) || null;
}

function smGetFilteredStakeholders() {
  if (smState.activeFilter === 'all') return smState.stakeholders;
  return smState.stakeholders.filter(s => s.group === smState.activeFilter);
}

/**
 * Get stakeholders grouped by group key, in display order.
 * @returns {Array<{group, label, colour, stakeholders}>}
 */
function smGetGroupedStakeholders() {
  const ORDER = ['delivery', 'executive', 'users', 'external', 'other'];
  const groups = {};

  for (const sh of smState.stakeholders) {
    const g = sh.group || 'other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(sh);
  }

  return ORDER
    .filter(g => groups[g] && groups[g].length > 0)
    .map(g => ({
      group: g,
      label: SM_GROUP_LABELS[g] || g,
      colour: SM_GROUP_COLOURS[g] || '#6B7280',
      stakeholders: groups[g],
    }));
}

// ── Phase management ───────────────────────────────────────

function smAddPhase(name = 'New Phase') {
  if (smState.phases.includes(name)) return;
  smState.phases.push(name);
  // Add default RACI entry for new phase in all stakeholders
  const key = name.toLowerCase();
  for (const sh of smState.stakeholders) {
    if (!sh.raci[key]) sh.raci[key] = '—';
  }
  smPersist();
}

function smRemovePhase(name) {
  if (smState.phases.length <= 1) return; // keep at least one
  smState.phases = smState.phases.filter(p => p !== name);
  const key = name.toLowerCase();
  for (const sh of smState.stakeholders) {
    delete sh.raci[key];
  }
  smPersist();
}

function smRenamePhase(oldName, newName) {
  if (!newName || newName === oldName) return;
  const idx = smState.phases.indexOf(oldName);
  if (idx === -1) return;
  smState.phases[idx] = newName;
  const oldKey = oldName.toLowerCase();
  const newKey = newName.toLowerCase();
  for (const sh of smState.stakeholders) {
    if (sh.raci[oldKey] !== undefined) {
      sh.raci[newKey] = sh.raci[oldKey];
      delete sh.raci[oldKey];
    }
  }
  smPersist();
}

// ── RACI cycling ───────────────────────────────────────────

/**
 * Cycle a stakeholder's RACI code for a given phase to the next value.
 * @param {string} stakeholderId
 * @param {string} phase  — phase name (will be lowercased)
 */
function smCycleRaci(stakeholderId, phase) {
  const sh = smGetStakeholder(stakeholderId);
  if (!sh) return;
  const key = phase.toLowerCase();
  const current = sh.raci[key] || '—';
  const idx = SM_RACI_CYCLE.indexOf(current);
  const next = SM_RACI_CYCLE[(idx + 1) % SM_RACI_CYCLE.length];
  sh.raci[key] = next;
  smPersist();
  return next;
}

// ── Persistence ────────────────────────────────────────────

const SM_LS_STATE = 'sm_state';

function smPersist() {
  smState.metadata.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(SM_LS_STATE, JSON.stringify({
      projectTitle: smState.projectTitle,
      stakeholders: smState.stakeholders,
      phases: smState.phases,
      orgChart: smState.orgChart,
      metadata: smState.metadata,
    }));
  } catch (_) { /* storage full — ignore */ }
}

function smLoadFromStorage() {
  try {
    const raw = localStorage.getItem(SM_LS_STATE);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.stakeholders && Array.isArray(saved.stakeholders)) {
      smState.projectTitle = saved.projectTitle || '';
      smState.stakeholders = saved.stakeholders;
      smState.phases = saved.phases || ['Discover', 'Define', 'Develop', 'Deliver'];
      smState.orgChart = saved.orgChart || { nodes: [] };
      smState.metadata = saved.metadata || {};
      // Sync ID counter
      for (const sh of smState.stakeholders) {
        const num = parseInt((sh.id || '').replace('sh_', ''), 10);
        if (!isNaN(num) && num >= _shIdCounter) _shIdCounter = num + 1;
      }
      return true;
    }
  } catch (_) { /* corrupt storage — ignore */ }
  return false;
}

// ── Serialise / deserialise for JSON export/import ─────────

function smSerialise() {
  return {
    tool: 'SDC Stakeholder Mapper',
    version: '1.1',
    exportedAt: new Date().toISOString(),
    projectTitle: smState.projectTitle,
    phases: smState.phases,
    stakeholders: smState.stakeholders,
    orgChart: smState.orgChart,
    metadata: smState.metadata,
  };
}

function smDeserialise(json) {
  if (!json || !Array.isArray(json.stakeholders)) {
    throw new Error('Invalid stakeholder map file. Expected a JSON file exported from this tool.');
  }
  smState.projectTitle = json.projectTitle || '';
  smState.phases = json.phases || ['Discover', 'Define', 'Develop', 'Deliver'];
  smState.stakeholders = json.stakeholders;
  smState.orgChart = json.orgChart || { nodes: [] };
  smState.metadata = json.metadata || {};
  _shIdCounter = 1;
  for (const sh of smState.stakeholders) {
    const num = parseInt((sh.id || '').replace('sh_', ''), 10);
    if (!isNaN(num) && num >= _shIdCounter) _shIdCounter = num + 1;
  }
  smPersist();
}

// ── Bulk import from AI response ───────────────────────────

/**
 * Replace stakeholder list with AI-generated data.
 * Validates and normalises each entry.
 * @param {Array} aiStakeholders
 */
function smImportFromAi(aiStakeholders) {
  smState.stakeholders = [];
  _shIdCounter = 1;

  for (const raw of aiStakeholders) {
    const raci = {};
    for (const phase of smState.phases) {
      const key = phase.toLowerCase();
      const code = (raw.raci || {})[key] || '—';
      raci[key] = SM_RACI_CYCLE.includes(code) ? code : '—';
    }

    const power    = Math.min(1, Math.max(0, parseFloat(raw.power)    || 0.5));
    const interest = Math.min(1, Math.max(0, parseFloat(raw.interest) || 0.5));

    // Derive initials from name if not provided
    const name     = String(raw.name     || '').trim() || 'Unknown';
    const initials = String(raw.initials || '').trim() || smDeriveInitials(name);

    smState.stakeholders.push(smCreateStakeholder({
      name,
      initials,
      realName: '',   // never populated from AI — local only
      team:     String(raw.team    || '').trim(),
      group:    ['delivery','executive','users','external','other'].includes(raw.group) ? raw.group : 'other',
      power,
      interest,
      raci,
      notes:    String(raw.notes   || '').trim(),
    }));
  }

  smPersist();
}

// ── SuccessFactors import ───────────────────────────────────

/**
 * Import stakeholders from SuccessFactors AI extraction result.
 * SF exports contain: initials, roleTitle, team, seniority level.
 * Initials are shown on the dot; roleTitle is the AI-safe name.
 * @param {Array} sfStakeholders
 */
function smImportFromSf(sfStakeholders) {
  _shIdCounter = Math.max(_shIdCounter, 1);

  for (const raw of sfStakeholders) {
    const raci = {};
    for (const phase of smState.phases) {
      raci[phase.toLowerCase()] = '—';
    }

    const power    = Math.min(1, Math.max(0, parseFloat(raw.power)    || 0.5));
    const interest = Math.min(1, Math.max(0, parseFloat(raw.interest) || 0.5));
    const initials = String(raw.initials || '').trim().toUpperCase().substring(0, 3);
    const name     = String(raw.name     || raw.roleTitle || '').trim() || 'Unknown';

    smState.stakeholders.push(smCreateStakeholder({
      name,
      initials,
      realName: '',   // initials are not full names — no PII concern
      team:     String(raw.team || '').trim(),
      group:    ['delivery','executive','users','external','other'].includes(raw.group) ? raw.group : 'other',
      power,
      interest,
      raci,
      notes:    String(raw.notes || '').trim(),
    }));
  }

  smPersist();
}

// ── Org chart import ────────────────────────────────────────

/**
 * Replace the org chart with AI-extracted hierarchy.
 * @param {Array<{id, label, parentId}>} nodes
 */
function smImportOrgChart(nodes) {
  smState.orgChart = { nodes: nodes.map((n, i) => ({
    id:       n.id       || 'oc_' + i,
    label:    String(n.label    || '').trim() || 'Unknown',
    parentId: n.parentId || null,
  })) };
  smPersist();
}

/**
 * Add a node to the org chart.
 */
function smOrgChartAddNode(label, parentId = null) {
  const id = 'oc_' + Date.now();
  smState.orgChart.nodes.push({ id, label, parentId });
  smPersist();
  return id;
}

/**
 * Update an org chart node's label or parent.
 */
function smOrgChartUpdateNode(id, updates) {
  const node = smState.orgChart.nodes.find(n => n.id === id);
  if (node) Object.assign(node, updates);
  smPersist();
}

/**
 * Remove an org chart node (and re-parent its children to its parent).
 */
function smOrgChartRemoveNode(id) {
  const node = smState.orgChart.nodes.find(n => n.id === id);
  if (!node) return;
  const parentId = node.parentId;
  // Re-parent children
  smState.orgChart.nodes.forEach(n => {
    if (n.parentId === id) n.parentId = parentId;
  });
  smState.orgChart.nodes = smState.orgChart.nodes.filter(n => n.id !== id);
  smPersist();
}

// ── Utility ────────────────────────────────────────────────

/**
 * Derive 2-letter initials from a role title or name string.
 * e.g. "Product Owner" → "PO", "Executive Sponsor" → "ES"
 */
function smDeriveInitials(str) {
  if (!str || !str.trim()) return '';
  const words = str.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function smGroupColour(group) {
  return SM_GROUP_COLOURS[group] || SM_GROUP_COLOURS.other;
}

function smGroupLabel(group) {
  return SM_GROUP_LABELS[group] || group;
}

/**
 * Convert 0–10 slider value to 0.0–1.0 float.
 */
function smSliderToFloat(val) {
  return Math.round(parseInt(val, 10)) / 10;
}

/**
 * Convert 0.0–1.0 float to 0–10 slider value.
 */
function smFloatToSlider(val) {
  return Math.round(parseFloat(val) * 10);
}
