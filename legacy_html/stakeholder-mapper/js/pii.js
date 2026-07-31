// ============================================================
// SDC Stakeholder Mapper — pii.js
// Find-and-replace PII protection module
// Auto-detects likely names/emails, applies rules before AI send
// ============================================================

let _piiIdCounter = 1;
let _piiRules = []; // [{ id, find, replace }]

function piiNextId() {
  return 'pii_' + (_piiIdCounter++);
}

// ── Auto-detection ─────────────────────────────────────────

/**
 * Scan text for likely PII (names, emails) and return suggested rules.
 * Does NOT modify _piiRules directly — caller decides what to merge.
 * @param {string} text
 * @returns {Array<{id, find, replace}>}
 */
function piiAutoDetect(text) {
  if (!text || !text.trim()) return [];

  const suggestions = [];
  const seen = new Set();

  // Pattern 1: Capitalised word pairs (likely full names)
  // Excludes common non-name pairs (NSW, HCD, etc.)
  const EXCLUDE_WORDS = new Set([
    'NSW', 'HCD', 'SDC', 'AI', 'IT', 'HR', 'PM', 'CEO', 'CFO', 'CTO',
    'The', 'This', 'That', 'These', 'Those', 'Our', 'Their', 'Your',
    'New', 'South', 'Wales', 'Department', 'Education', 'Government',
    'Project', 'Team', 'Group', 'Board', 'Committee', 'Council',
    'Service', 'Design', 'Change', 'Digital', 'Product', 'Senior',
    'Executive', 'Director', 'Manager', 'Officer', 'Principal',
  ]);

  const namePattern = /\b([A-Z][a-z]{1,20})\s+([A-Z][a-z]{1,20})\b/g;
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const first = match[1];
    const last  = match[2];
    const full  = match[0];
    if (EXCLUDE_WORDS.has(first) || EXCLUDE_WORDS.has(last)) continue;
    if (seen.has(full.toLowerCase())) continue;
    seen.add(full.toLowerCase());
    suggestions.push({ id: piiNextId(), find: full, replace: '' });
  }

  // Pattern 2: Email addresses
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  while ((match = emailPattern.exec(text)) !== null) {
    const email = match[0];
    if (seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    suggestions.push({ id: piiNextId(), find: email, replace: '[email removed]' });
  }

  // Pattern 3: Phone numbers (Australian formats)
  const phonePattern = /\b(?:\+?61\s?)?(?:0[2-9]\d{8}|\d{4}\s?\d{3}\s?\d{3})\b/g;
  while ((match = phonePattern.exec(text)) !== null) {
    const phone = match[0];
    if (seen.has(phone)) continue;
    seen.add(phone);
    suggestions.push({ id: piiNextId(), find: phone, replace: '[phone removed]' });
  }

  return suggestions;
}

/**
 * Merge auto-detected suggestions into _piiRules,
 * skipping any that already have a matching 'find' value.
 * @param {string} text
 */
function piiMergeDetected(text) {
  const suggestions = piiAutoDetect(text);
  for (const s of suggestions) {
    const exists = _piiRules.some(r => r.find.toLowerCase() === s.find.toLowerCase());
    if (!exists) {
      _piiRules.push(s);
    }
  }
  piiRenderRules();
  piiUpdateCount();
}

// ── Apply rules ────────────────────────────────────────────

/**
 * Apply all PII rules to text (word-boundary aware, case-insensitive).
 * Rules with empty 'replace' remove the found term.
 * @param {string} text
 * @returns {string}
 */
function piiApply(text) {
  let result = text;
  for (const rule of _piiRules) {
    if (!rule.find || !rule.find.trim()) continue;
    const escaped = rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const replacement = rule.replace || '';
    try {
      result = result.replace(new RegExp('\\b' + escaped + '\\b', 'gi'), replacement);
    } catch (_) {
      // Invalid regex — skip
    }
  }
  return result;
}

/**
 * Count how many replacements would be made.
 * @param {string} text
 * @returns {number}
 */
function piiCountReplacements(text) {
  let count = 0;
  for (const rule of _piiRules) {
    if (!rule.find || !rule.find.trim()) continue;
    const escaped = rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const matches = text.match(new RegExp('\\b' + escaped + '\\b', 'gi'));
      count += matches ? matches.length : 0;
    } catch (_) { /* skip */ }
  }
  return count;
}

// ── Rule management ────────────────────────────────────────

function piiAddRule(find = '', replace = '') {
  _piiRules.push({ id: piiNextId(), find, replace });
  piiRenderRules();
  piiUpdateCount();
}

function piiRemoveRule(id) {
  _piiRules = _piiRules.filter(r => r.id !== id);
  piiRenderRules();
  piiUpdateCount();
}

function piiUpdateRule(id, field, value) {
  const rule = _piiRules.find(r => r.id === id);
  if (rule) rule[field] = value;
  piiUpdateCount();
}

function piiGetRules() {
  return _piiRules;
}

function piiSetRules(rules) {
  _piiRules = rules || [];
  _piiIdCounter = Math.max(_piiIdCounter, _piiRules.length + 1);
  piiRenderRules();
  piiUpdateCount();
}

function piiClearRules() {
  _piiRules = [];
  piiRenderRules();
  piiUpdateCount();
}

// ── UI rendering ───────────────────────────────────────────

function piiRenderRules() {
  const container = document.getElementById('sm-pii-rules-list');
  if (!container) return;

  if (_piiRules.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--muted);font-style:italic">No rules yet — paste text above to auto-detect names, or add rules manually.</p>';
    return;
  }

  container.innerHTML = _piiRules.map(rule => `
    <div class="sm-pii-rule" data-id="${escAttr(rule.id)}">
      <input
        type="text"
        value="${escAttr(rule.find)}"
        placeholder="Find (e.g. Sarah Chen)"
        oninput="piiUpdateRule('${escAttr(rule.id)}', 'find', this.value)"
        aria-label="Find text"
      />
      <span class="sm-pii-rule-arrow">→</span>
      <input
        type="text"
        value="${escAttr(rule.replace)}"
        placeholder="Replace with (e.g. Product Owner)"
        oninput="piiUpdateRule('${escAttr(rule.id)}', 'replace', this.value)"
        aria-label="Replace with"
      />
      <button
        class="sm-pii-rule-remove"
        onclick="piiRemoveRule('${escAttr(rule.id)}')"
        title="Remove rule"
        aria-label="Remove rule"
      >✕</button>
    </div>
  `).join('');
}

function piiUpdateCount() {
  const countEl = document.getElementById('sm-pii-count');
  if (!countEl) return;
  const active = _piiRules.filter(r => r.find && r.replace).length;
  if (active === 0) {
    countEl.textContent = '';
    countEl.style.display = 'none';
  } else {
    countEl.textContent = active + ' rule' + (active !== 1 ? 's' : '');
    countEl.style.display = 'inline';
  }
}

// ── Preview modal ──────────────────────────────────────────

function smPiiPreview() {
  const raw = document.getElementById('sm-ai-context-input')?.value || '';
  if (!raw.trim()) {
    smToast('Please paste some project context first.', 'error');
    return;
  }
  const sanitised = piiApply(raw);
  const previewEl = document.getElementById('sm-pii-preview-text');
  if (previewEl) {
    previewEl.textContent = sanitised;
  }
  document.getElementById('sm-pii-preview-modal')?.classList.remove('hidden');
}

function smPiiPreviewClose() {
  document.getElementById('sm-pii-preview-modal')?.classList.add('hidden');
}

// ── Triggered from textarea paste/input ───────────────────

// Called from oninput on the context textarea (debounced)
let _piiDebounceTimer = null;
function smPiiAutoDetect() {
  clearTimeout(_piiDebounceTimer);
  _piiDebounceTimer = setTimeout(() => {
    const text = document.getElementById('sm-ai-context-input')?.value || '';
    piiMergeDetected(text);
  }, 600);
}

// ── Utility ────────────────────────────────────────────────

function escAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
