// ============================================================
// SDC Stakeholder Mapper — app.js
// State machine · splash routing · editor · settings · toast
// ============================================================

// ── Boot ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  smSettingsLoadFromStorage();
  smSetupExportDropdown();
  smSetupUploadDropdown();
  smSetupResizer();
  smSetupNavDropdowns();

  // Try to restore previous session
  const restored = smLoadFromStorage();
  if (restored && smState.stakeholders.length > 0) {
    smShowEditor();
    smRefreshAll();
  } else {
    smShowSplash();
  }

  // Keyboard: Escape closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      smSettingsClose();
      smEditClose();
      smPiiPreviewClose();
      smCloseExportMenu();
    }
  });

  // Window resize: re-render matrix
  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      if (smState.mode === 'editor' && smState.activeView === 'power') {
        smRenderMatrix();
      }
    }, 200);
  });
});

// ── Screen routing ─────────────────────────────────────────

function smShowSplash() {
  smState.mode = 'splash';
  document.getElementById('sm-welcome-screen').style.display = 'flex';
  document.getElementById('sm-editor-screen').style.display  = 'none';
  smHideAiPanel();
}

function smShowEditor() {
  smState.mode = 'editor';
  document.getElementById('sm-welcome-screen').style.display = 'none';
  document.getElementById('sm-editor-screen').style.display  = 'flex';

  // Sync project title input
  const titleInput = document.getElementById('sm-project-title-input');
  if (titleInput) titleInput.value = smState.projectTitle || '';
}

function smBackToSplash() {
  smShowSplash();
}

function smNewProject() {
  if (!confirm('Start a new project? This will clear all stakeholders, the org chart, and the project title. Your current data will be lost unless you have saved a JSON file.')) return;

  // Reset state
  smState.projectTitle   = '';
  smState.projectContext = '';
  smState.stakeholders   = [];
  smState.orgChart       = { nodes: [] };
  smState.phases         = ['Discover', 'Define', 'Develop', 'Deliver'];
  smState.activeView     = 'power';
  smState.activeFilter   = 'all';
  smState.metadata       = { createdAt: null, updatedAt: null };

  // Reset ID counter (defined in data.js)
  smResetIdCounter();

  // Clear localStorage
  try { localStorage.removeItem('sm_state'); } catch (_) {}

  smShowSplash();
  smToast('New project started.', 'success');
}

// ── Splash card handlers ───────────────────────────────────

function smChooseAi() {
  smState.mode = 'ai';
  smHideSfPanel(true);
  smHideOcPanel(true);
  document.getElementById('sm-ai-panel').style.display = 'flex';
  document.getElementById('sm-welcome-cards').style.display = 'none';
  document.getElementById('sm-welcome-prompt').style.display = 'none';

  // Check credentials
  const warnEl = document.getElementById('sm-creds-warn');
  if (warnEl) warnEl.style.display = smHasCredentials() ? 'none' : 'flex';

  // Init PII rules
  piiClearRules();
  piiRenderRules();

  setTimeout(() => document.getElementById('sm-ai-project-title')?.focus(), 100);
}

function smHideAiPanel() {
  document.getElementById('sm-ai-panel').style.display = 'none';
  document.getElementById('sm-welcome-cards').style.display = 'grid';
  document.getElementById('sm-welcome-prompt').style.display = 'block';
  smState.mode = 'splash';
}

// ── SuccessFactors panel ────────────────────────────────────

let _sfPendingFile = null; // file selected before panel shown

function smChooseSf() {
  smState.mode = 'sf';
  _sfPendingFile = null;
  smHideAiPanel();
  smHideOcPanel(true);
  document.getElementById('sm-sf-panel').style.display = 'flex';
  document.getElementById('sm-welcome-cards').style.display = 'none';
  document.getElementById('sm-welcome-prompt').style.display = 'none';

  const warnEl = document.getElementById('sm-sf-creds-warn');
  if (warnEl) warnEl.style.display = smHasCredentials() ? 'none' : 'flex';

  // Reset file label and button
  const label = document.getElementById('sm-sf-file-label');
  if (label) label.textContent = 'Click to select or drag & drop a SuccessFactors export';
  const btn = document.getElementById('sm-sf-btn-generate');
  if (btn) btn.disabled = true;

  setTimeout(() => document.getElementById('sm-sf-project-title')?.focus(), 100);
}

/** Called from editor "Upload more" dropdown */
function smChooseSfFromEditor() {
  // Show the SF panel over the editor by temporarily showing welcome screen
  smShowSplash();
  setTimeout(() => smChooseSf(), 50);
}

function smHideSfPanel(silent = false) {
  document.getElementById('sm-sf-panel').style.display = 'none';
  if (!silent) {
    document.getElementById('sm-welcome-cards').style.display = 'grid';
    document.getElementById('sm-welcome-prompt').style.display = 'block';
    smState.mode = 'splash';
  }
  _sfPendingFile = null;
}

function smSfPanelFileSelected(file) {
  if (!file) return;
  _sfPendingFile = file;
  const label = document.getElementById('sm-sf-file-label');
  if (label) label.textContent = `✓ ${file.name} selected`;
  const btn = document.getElementById('sm-sf-btn-generate');
  if (btn) btn.disabled = false;
  // If panel not visible (called from editor shortcut), open panel first
  const panel = document.getElementById('sm-sf-panel');
  if (panel && panel.style.display === 'none') smChooseSf();
}

async function smRunSfGenerate() {
  if (!_sfPendingFile) {
    smToast('Please select a file first.', 'error');
    return;
  }
  if (!smHasCredentials()) {
    smToast('Please configure your API credentials first.', 'error');
    smSettingsOpen();
    return;
  }

  const projectTitle = document.getElementById('sm-sf-project-title')?.value?.trim() || '';
  const context      = document.getElementById('sm-sf-context')?.value?.trim() || '';

  const btn = document.getElementById('sm-sf-btn-generate');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Extracting…'; }

  try {
    const userPrompt = smBuildSfUserPrompt(projectTitle, smState.phases, context);
    const raw = await smCallAiWithImage(SM_SF_SYSTEM_PROMPT, userPrompt, _sfPendingFile, { maxTokens: 4000, temperature: 0.2 });
    const sfStakeholders = smParseSfResponse(raw);

    smImportFromSf(sfStakeholders);
    smHideSfPanel(true);
    smShowEditor();
    smRefreshAll();
    smToast(`✓ ${sfStakeholders.length} stakeholders added from SuccessFactors export.`, 'success');
  } catch (err) {
    smToast('SuccessFactors import failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📊 Extract stakeholders →'; }
  }
}

// ── Org chart panel ─────────────────────────────────────────

let _ocPendingImageFile = null;
let _ocPendingCsvData   = null; // { headers: [], rows: [], excludedCols: Set }
let _ocCurrentType      = 'image'; // 'image' | 'csv'

function smChooseOrgChart() {
  smState.mode = 'oc';
  _ocPendingImageFile = null;
  _ocPendingCsvData   = null;
  smHideAiPanel();
  smHideSfPanel(true);
  document.getElementById('sm-oc-panel').style.display = 'flex';
  document.getElementById('sm-welcome-cards').style.display = 'none';
  document.getElementById('sm-welcome-prompt').style.display = 'none';

  const warnEl = document.getElementById('sm-oc-creds-warn');
  if (warnEl) warnEl.style.display = smHasCredentials() ? 'none' : 'flex';

  smOcSwitchType('image');

  const btn = document.getElementById('sm-oc-btn-generate');
  if (btn) btn.disabled = true;
}

/** Called from editor "Upload more" dropdown */
function smChooseOrgChartFromEditor() {
  smShowSplash();
  setTimeout(() => smChooseOrgChart(), 50);
}

function smHideOcPanel(silent = false) {
  document.getElementById('sm-oc-panel').style.display = 'none';
  if (!silent) {
    document.getElementById('sm-welcome-cards').style.display = 'grid';
    document.getElementById('sm-welcome-prompt').style.display = 'block';
    smState.mode = 'splash';
  }
  _ocPendingImageFile = null;
  _ocPendingCsvData   = null;
}

function smOcSwitchType(type) {
  _ocCurrentType = type;
  document.getElementById('sm-oc-image-section').style.display = type === 'image' ? 'block' : 'none';
  document.getElementById('sm-oc-csv-section').style.display   = type === 'csv'   ? 'block' : 'none';
  document.getElementById('sm-oc-tab-image').classList.toggle('active', type === 'image');
  document.getElementById('sm-oc-tab-csv').classList.toggle('active',   type === 'csv');

  // Reset generate button
  const btn = document.getElementById('sm-oc-btn-generate');
  if (btn) btn.disabled = true;
}

function smOcPanelImageSelected(file) {
  if (!file) return;
  _ocPendingImageFile = file;
  const label = document.getElementById('sm-oc-img-file-label');
  if (label) label.textContent = `✓ ${file.name} selected`;
  const btn = document.getElementById('sm-oc-btn-generate');
  if (btn) btn.disabled = false;
}

function smOcPanelCsvSelected(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = smParseCsv(e.target.result);
      if (!parsed.headers.length) {
        smToast('Could not read CSV headers. Check the file format.', 'error');
        return;
      }
      _ocPendingCsvData = {
        headers:     parsed.headers,
        rows:        parsed.rows,
        excludedCols: new Set(), // user selects which to exclude
      };

      const label = document.getElementById('sm-oc-csv-file-label');
      if (label) label.textContent = `✓ ${file.name} — ${parsed.rows.length} rows, ${parsed.headers.length} columns`;

      smOcRenderColumnExclusion();
      smOcRenderCsvPreview();

      document.getElementById('sm-oc-csv-columns').style.display = 'block';
      const btn = document.getElementById('sm-oc-btn-generate');
      if (btn) btn.disabled = false;
    } catch (err) {
      smToast('Could not parse CSV: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

/**
 * Render column exclusion checkboxes.
 * Auto-suggests excluding columns that look like personal names.
 */
function smOcRenderColumnExclusion() {
  if (!_ocPendingCsvData) return;
  const { headers, excludedCols } = _ocPendingCsvData;

  // Auto-suggest name columns
  const NAME_HINTS = ['name', 'full name', 'employee name', 'staff name', 'person', 'first name', 'last name', 'surname'];
  for (const h of headers) {
    if (NAME_HINTS.some(hint => h.toLowerCase().includes(hint))) {
      excludedCols.add(h);
    }
  }

  const container = document.getElementById('sm-oc-csv-column-list');
  if (!container) return;

  container.innerHTML = headers.map(h => `
    <label class="sm-csv-col-label ${excludedCols.has(h) ? 'excluded' : ''}">
      <input type="checkbox" ${excludedCols.has(h) ? 'checked' : ''}
        onchange="smOcToggleExcludeCol('${escAttr(h)}', this.checked)"
        aria-label="Exclude column ${escAttr(h)}" />
      <span class="sm-csv-col-name">${escHtml(h)}</span>
      ${excludedCols.has(h) ? '<span class="sm-csv-col-badge">excluded</span>' : ''}
    </label>
  `).join('');
}

function smOcToggleExcludeCol(colName, exclude) {
  if (!_ocPendingCsvData) return;
  if (exclude) {
    _ocPendingCsvData.excludedCols.add(colName);
  } else {
    _ocPendingCsvData.excludedCols.delete(colName);
  }
  smOcRenderColumnExclusion();
  smOcRenderCsvPreview();
}

/**
 * Render a preview of the first 3 CSV rows with excluded columns greyed out.
 */
function smOcRenderCsvPreview() {
  if (!_ocPendingCsvData) return;
  const { headers, rows, excludedCols } = _ocPendingCsvData;
  const previewRows = rows.slice(0, 3);

  const container = document.getElementById('sm-oc-csv-preview');
  if (!container) return;

  const thCells = headers.map(h =>
    `<th class="${excludedCols.has(h) ? 'col-excluded' : ''}">${escHtml(h)}</th>`
  ).join('');

  const bodyRows = previewRows.map(row =>
    '<tr>' + headers.map(h =>
      `<td class="${excludedCols.has(h) ? 'col-excluded' : ''}">${escHtml(row[h] || '')}</td>`
    ).join('') + '</tr>'
  ).join('');

  container.innerHTML = `
    <table class="sm-csv-preview-table">
      <thead><tr>${thCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

/**
 * Build sanitised CSV text (excluded columns stripped) for AI.
 */
function smOcBuildSanitisedCsv() {
  if (!_ocPendingCsvData) return '';
  const { headers, rows, excludedCols } = _ocPendingCsvData;
  const safeHeaders = headers.filter(h => !excludedCols.has(h));

  const lines = [safeHeaders.join(',')];
  for (const row of rows) {
    lines.push(safeHeaders.map(h => {
      const val = (row[h] || '').replace(/"/g, '""');
      return val.includes(',') ? `"${val}"` : val;
    }).join(','));
  }
  return lines.join('\n');
}

async function smRunOcGenerate() {
  if (!smHasCredentials()) {
    smToast('Please configure your API credentials first.', 'error');
    smSettingsOpen();
    return;
  }

  const btn = document.getElementById('sm-oc-btn-generate');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Extracting…'; }

  try {
    let nodes;

    if (_ocCurrentType === 'image') {
      if (!_ocPendingImageFile) throw new Error('Please select an image file first.');
      const userPrompt = smBuildOrgChartUserPrompt();
      const raw = await smCallAiWithImage(SM_ORGCHART_SYSTEM_PROMPT, userPrompt, _ocPendingImageFile, { maxTokens: 3000, temperature: 0.1 });
      nodes = smParseOrgChartResponse(raw);
    } else {
      if (!_ocPendingCsvData) throw new Error('Please select a CSV file first.');
      const sanitisedCsv = smOcBuildSanitisedCsv();
      const userPrompt   = smBuildOrgChartCsvUserPrompt(sanitisedCsv);
      const raw = await smCallAi(SM_ORGCHART_CSV_SYSTEM_PROMPT, userPrompt, { maxTokens: 3000, temperature: 0.1 });
      nodes = smParseOrgChartResponse(raw);
    }

    smImportOrgChart(nodes);
    smHideOcPanel(true);
    smShowEditor();
    smRefreshAll();
    smSwitchView('orgchart');
    smToast(`✓ Org chart loaded with ${nodes.length} nodes. Click any node to edit.`, 'success');
  } catch (err) {
    smToast('Org chart import failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🌳 Extract org chart →'; }
  }
}

// ── CSV parser ──────────────────────────────────────────────

/**
 * Parse a CSV string into { headers, rows }.
 * Handles quoted fields with commas.
 * @param {string} text
 * @returns {{ headers: string[], rows: object[] }}
 */
function smParseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = smParseCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = smParseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }

  return { headers, rows };
}

function smParseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function smChooseManual() {
  smState.mode = 'manual';
  smShowEditor();
  smRefreshAll();
  // Open add stakeholder immediately
  setTimeout(() => smAddStakeholder(), 100);
}

function smLoadJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result);
      smDeserialise(json);
      smShowEditor();
      smRefreshAll();
      smToast('Stakeholder map loaded successfully.');
    } catch (err) {
      smToast('Could not load file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ── AI generation flow ─────────────────────────────────────

async function smRunAiGenerate() {
  // Close preview modal if open
  smPiiPreviewClose();

  const projectTitle = document.getElementById('sm-ai-project-title')?.value?.trim() || '';
  const rawContext   = document.getElementById('sm-ai-context-input')?.value?.trim() || '';

  if (!rawContext) {
    smToast('Please paste some project context first.', 'error');
    return;
  }

  if (!smHasCredentials()) {
    smToast('Please configure your API credentials first.', 'error');
    smSettingsOpen();
    return;
  }

  // Apply PII rules
  const sanitised = piiApply(rawContext);

  // Update state
  smState.projectTitle  = projectTitle;
  smState.projectContext = rawContext;

  // Show loading state
  const btn = document.getElementById('sm-btn-generate');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

  try {
    const userPrompt = smBuildUserPrompt(sanitised, projectTitle, smState.phases);
    const raw = await smCallAi(SM_SYSTEM_PROMPT, userPrompt, { maxTokens: 3000, temperature: 0.3 });
    const stakeholders = smParseAiResponse(raw);

    smImportFromAi(stakeholders);
    smShowEditor();
    smRefreshAll();
    smToast(`✓ ${stakeholders.length} stakeholders generated. Review and edit as needed.`, 'success');
  } catch (err) {
    smToast('AI generation failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Generate stakeholder list'; }
  }
}

// ── View switching ─────────────────────────────────────────

function smSwitchView(view) {
  smState.activeView = view;

  document.getElementById('sm-view-power').style.display    = view === 'power'    ? 'flex' : 'none';
  document.getElementById('sm-view-raci').style.display     = view === 'raci'     ? 'flex' : 'none';
  document.getElementById('sm-view-orgchart').style.display = view === 'orgchart' ? 'flex' : 'none';

  ['power', 'raci', 'orgchart'].forEach(v => {
    const tab = document.getElementById('tab-' + v);
    if (tab) {
      tab.classList.toggle('active', v === view);
      tab.setAttribute('aria-selected', String(v === view));
    }
  });

  if (view === 'power')    smRenderMatrix();
  if (view === 'raci')     smRenderRaci();
  if (view === 'orgchart') smRenderOrgChart();
}

// ── Refresh all UI ─────────────────────────────────────────

function smRefreshAll() {
  smRenderStakeholderList();
  smRenderPhaseList();
  smUpdateListCount();

  if (smState.activeView === 'power')    smRenderMatrix();
  if (smState.activeView === 'raci')     smRenderRaci();
  if (smState.activeView === 'orgchart') smRenderOrgChart();

  // Sync project title
  const titleInput = document.getElementById('sm-project-title-input');
  if (titleInput && smState.projectTitle) titleInput.value = smState.projectTitle;
}

// ── Stakeholder list (left panel) ──────────────────────────

function smRenderStakeholderList() {
  const container = document.getElementById('sm-stakeholder-list');
  if (!container) return;

  const stakeholders = smGetFilteredStakeholders();

  if (stakeholders.length === 0) {
    container.innerHTML = `
      <div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">
        ${smState.stakeholders.length === 0
          ? 'No stakeholders yet.<br>Click <strong>+ Add</strong> to get started.'
          : 'No stakeholders in this group.'}
      </div>`;
    return;
  }

  container.innerHTML = stakeholders.map(s => `
    <div class="sm-stakeholder-item" onclick="smOpenEdit('${escAttr(s.id)}')" title="Click to edit">
      <span class="sm-stakeholder-dot" style="background:${smGroupColour(s.group)}"></span>
      <div class="sm-stakeholder-info">
        <div class="sm-stakeholder-name">${escHtml(s.name || 'Unnamed')}</div>
        <div class="sm-stakeholder-meta">${escHtml(s.team || smGroupLabel(s.group))}</div>
      </div>
      <div class="sm-stakeholder-scores">
        <div class="sm-score-bar">
          <span class="sm-score-label" title="Power">P</span>
          <div class="sm-score-track">
            <div class="sm-score-fill" style="width:${Math.round(s.power * 100)}%;background:${smGroupColour(s.group)}"></div>
          </div>
        </div>
        <div class="sm-score-bar">
          <span class="sm-score-label" title="Interest">I</span>
          <div class="sm-score-track">
            <div class="sm-score-fill" style="width:${Math.round(s.interest * 100)}%;background:${smGroupColour(s.group)}"></div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function smUpdateListCount() {
  const el = document.getElementById('sm-list-count');
  if (el) el.textContent = smState.stakeholders.length;
}

// ── Group filter ───────────────────────────────────────────

function smFilterGroup(group) {
  smState.activeFilter = group;

  document.querySelectorAll('.sm-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.group === group);
  });

  smRenderStakeholderList();
}

// ── Add stakeholder ────────────────────────────────────────

function smAddStakeholder() {
  const sh = smCreateStakeholder({ name: '', group: 'other' });
  smState.stakeholders.push(sh);
  smPersist();
  smOpenEdit(sh.id);
}

// ── Edit modal ─────────────────────────────────────────────

let _editingId = null;

function smOpenEdit(id) {
  const sh = smGetStakeholder(id);
  if (!sh) return;
  _editingId = id;

  // Populate fields
  document.getElementById('edit-name').value     = sh.name     || '';
  document.getElementById('edit-realname').value = sh.realName || '';
  document.getElementById('edit-initials').value = sh.initials || '';
  document.getElementById('edit-team').value     = sh.team     || '';
  document.getElementById('edit-notes').value    = sh.notes    || '';
  document.getElementById('edit-group').value    = sh.group    || 'other';

  const powerSlider    = document.getElementById('edit-power');
  const interestSlider = document.getElementById('edit-interest');
  const powerVal       = document.getElementById('edit-power-val');
  const interestVal    = document.getElementById('edit-interest-val');

  const pv = smFloatToSlider(sh.power);
  const iv = smFloatToSlider(sh.interest);
  if (powerSlider)    powerSlider.value    = pv;
  if (interestSlider) interestSlider.value = iv;
  if (powerVal)       powerVal.textContent    = pv;
  if (interestVal)    interestVal.textContent = iv;

  // Render RACI section
  smRenderEditRaci(sh);

  // Show modal
  document.getElementById('sm-edit-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('edit-name')?.focus(), 50);
}

function smRenderEditRaci(sh) {
  const container = document.getElementById('sm-edit-raci');
  if (!container) return;

  container.innerHTML = `
    <div class="sm-edit-raci-title">Engagement by phase — click to set</div>
    <div class="sm-edit-raci-grid">
      ${smState.phases.map(phase => {
        const key  = phase.toLowerCase();
        const code = sh.raci[key] || '—';
        return `
          <div class="sm-edit-raci-row">
            <span class="sm-edit-raci-phase">${escHtml(phase)}</span>
            <div class="sm-raci-cycle-btns">
              ${SM_RACI_CYCLE.map(c => `
                <button
                  class="sm-raci-cycle-btn ${code === c ? 'active' : ''}"
                  data-code="${escAttr(c)}"
                  data-phase="${escAttr(key)}"
                  onclick="smEditSetRaci('${escAttr(key)}', '${escAttr(c)}', this)"
                  title="${raciCodeLabel(c)}"
                >${escHtml(c)}</button>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function smEditSetRaci(phaseKey, code, btn) {
  // Update visual state
  const row = btn.closest('.sm-edit-raci-row');
  row.querySelectorAll('.sm-raci-cycle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Store in temp (will be saved on smEditSave)
  const sh = smGetStakeholder(_editingId);
  if (sh) sh.raci[phaseKey] = code;
}

function smEditSave() {
  if (!_editingId) return;

  const name     = document.getElementById('edit-name')?.value?.trim()     || '';
  const realName = document.getElementById('edit-realname')?.value?.trim() || '';
  const initials = (document.getElementById('edit-initials')?.value?.trim() || smDeriveInitials(name)).toUpperCase().substring(0, 3);
  const team     = document.getElementById('edit-team')?.value?.trim()     || '';
  const notes    = document.getElementById('edit-notes')?.value?.trim()    || '';
  const group    = document.getElementById('edit-group')?.value            || 'other';
  const power    = smSliderToFloat(document.getElementById('edit-power')?.value    || 5);
  const interest = smSliderToFloat(document.getElementById('edit-interest')?.value || 5);

  // Get current RACI from the stakeholder (already updated by smEditSetRaci)
  const sh = smGetStakeholder(_editingId);
  const raci = sh ? { ...sh.raci } : {};

  smUpdateStakeholder(_editingId, { name, realName, initials, team, notes, group, power, interest, raci });

  smEditClose();
  smRefreshAll();
  smToast('Stakeholder saved.');
}

function smEditDelete() {
  if (!_editingId) return;
  if (!confirm('Delete this stakeholder?')) return;
  smDeleteStakeholder(_editingId);
  smEditClose();
  // Always re-render matrix regardless of active view to remove deleted dot
  smRenderStakeholderList();
  smUpdateListCount();
  smRenderMatrix();
  if (smState.activeView === 'raci') smRenderRaci();
  smToast('Stakeholder deleted.');
}

function smEditClose() {
  _editingId = null;
  document.getElementById('sm-edit-modal')?.classList.add('hidden');
}

// ── Phase config ───────────────────────────────────────────

function smTogglePhaseConfig() {
  const body    = document.getElementById('sm-phase-config-body');
  const chevron = document.getElementById('sm-phase-chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.classList.toggle('open', !isOpen);
  if (!isOpen) smRenderPhaseList();
}

function smRenderPhaseList() {
  const container = document.getElementById('sm-phase-list');
  if (!container) return;

  container.innerHTML = smState.phases.map((phase, idx) => `
    <div class="sm-phase-item">
      <input
        type="text"
        value="${escAttr(phase)}"
        onchange="smRenamePhase('${escAttr(phase)}', this.value)"
        aria-label="Phase name"
      />
      ${smState.phases.length > 1
        ? `<button class="sm-phase-remove" onclick="smRemovePhaseAndRefresh('${escAttr(phase)}')" title="Remove phase">✕</button>`
        : ''}
    </div>
  `).join('');
}

function smRemovePhaseAndRefresh(name) {
  smRemovePhase(name);
  smRenderPhaseList();
  smRefreshAll();
}

function smAddPhaseAndRefresh() {
  let name = 'New Phase';
  let i = 2;
  while (smState.phases.includes(name)) { name = 'New Phase ' + i++; }
  smAddPhase(name);
  smRenderPhaseList();
  smRefreshAll();
}

// ── Settings ───────────────────────────────────────────────

function smSettingsOpen() {
  document.getElementById('sm-settings-endpoint').value = smGetEndpoint();
  document.getElementById('sm-settings-key').value      = smGetApiKey();
  document.getElementById('sm-settings-model').value    = smGetModel();
  document.getElementById('sm-settings-modal').classList.remove('hidden');
}

function smSettingsClose() {
  document.getElementById('sm-settings-modal')?.classList.add('hidden');
}

function smSettingsSave() {
  const endpoint = document.getElementById('sm-settings-endpoint')?.value?.trim() || '';
  const key      = document.getElementById('sm-settings-key')?.value?.trim()      || '';
  const model    = document.getElementById('sm-settings-model')?.value?.trim()    || '';
  smSaveApiCredentials(endpoint, key, model);
  smSettingsClose();
  smToast('API settings saved.');

  // Update credentials warning if visible
  const warnEl = document.getElementById('sm-creds-warn');
  if (warnEl) warnEl.style.display = smHasCredentials() ? 'none' : 'flex';
}

function smSettingsLoadFromStorage() {
  // Settings are loaded lazily via smGetEndpoint() etc.
  // Nothing to do here — just a hook for future init logic.
}

// ── Toast ──────────────────────────────────────────────────

let _toastTimer = null;

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {'info'|'success'|'error'} [kind='info']
 */
function smToast(msg, kind = 'info') {
  const el = document.getElementById('sm-toast');
  if (!el) return;

  el.textContent = msg;
  el.className = 'show';
  if (kind === 'error')   el.classList.add('toast-error');
  if (kind === 'success') el.classList.add('toast-success');

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.className = '';
  }, kind === 'error' ? 5000 : 3000);
}

// ── Upload dropdown ─────────────────────────────────────────

function smSetupUploadDropdown() {
  const btn  = document.getElementById('sm-upload-btn');
  const menu = document.getElementById('sm-upload-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    smCloseUploadMenu();
    smCloseExportMenu();
    if (!isOpen) {
      menu.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
}

function smCloseUploadMenu() {
  const menu = document.getElementById('sm-upload-menu');
  const btn  = document.getElementById('sm-upload-btn');
  if (menu) menu.classList.remove('open');
  if (btn)  btn.setAttribute('aria-expanded', 'false');
}

// ── Resizer ────────────────────────────────────────────────

function smSetupResizer() {
  const resizer = document.getElementById('sm-resizer');
  const left    = document.querySelector('.sm-editor-left');
  if (!resizer || !left) return;

  let startX, startW;

  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = left.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizer.classList.contains('dragging')) return;
    const newW = Math.max(200, Math.min(500, startW + (e.clientX - startX)));
    left.style.width = newW + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!resizer.classList.contains('dragging')) return;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Re-render matrix after resize
    if (smState.activeView === 'power') {
      setTimeout(() => smRenderMatrix(), 50);
    }
  });
}

// ── Nav dropdowns ──────────────────────────────────────────

function smSetupNavDropdowns() {
  document.querySelectorAll('.nav-group-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.nextElementSibling;
      const isOpen = dropdown?.classList.contains('open');
      // Close all
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
      if (!isOpen && dropdown) dropdown.classList.add('open');
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
  });
}

// ── Utility ────────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function smPiiAddRule() {
  piiAddRule('', '');
}

