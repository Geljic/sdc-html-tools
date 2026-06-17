// ============================================================
// SDC Stakeholder Mapper — app.js
// State machine · splash routing · editor · settings · toast
// ============================================================

// ── Boot ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  smSettingsLoadFromStorage();
  smSetupExportDropdown();
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

// ── Splash card handlers ───────────────────────────────────

function smChooseAi() {
  smState.mode = 'ai';
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

  document.getElementById('sm-view-power').style.display = view === 'power' ? 'flex' : 'none';
  document.getElementById('sm-view-raci').style.display  = view === 'raci'  ? 'flex' : 'none';

  document.getElementById('tab-power').classList.toggle('active', view === 'power');
  document.getElementById('tab-raci').classList.toggle('active',  view === 'raci');
  document.getElementById('tab-power').setAttribute('aria-selected', String(view === 'power'));
  document.getElementById('tab-raci').setAttribute('aria-selected',  String(view === 'raci'));

  if (view === 'power') smRenderMatrix();
  if (view === 'raci')  smRenderRaci();
}

// ── Refresh all UI ─────────────────────────────────────────

function smRefreshAll() {
  smRenderStakeholderList();
  smRenderPhaseList();
  smUpdateListCount();

  if (smState.activeView === 'power') smRenderMatrix();
  if (smState.activeView === 'raci')  smRenderRaci();

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
  document.getElementById('edit-name').value    = sh.name    || '';
  document.getElementById('edit-team').value    = sh.team    || '';
  document.getElementById('edit-notes').value   = sh.notes   || '';
  document.getElementById('edit-group').value   = sh.group   || 'other';

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

  const name    = document.getElementById('edit-name')?.value?.trim()  || '';
  const team    = document.getElementById('edit-team')?.value?.trim()  || '';
  const notes   = document.getElementById('edit-notes')?.value?.trim() || '';
  const group   = document.getElementById('edit-group')?.value         || 'other';
  const power   = smSliderToFloat(document.getElementById('edit-power')?.value    || 5);
  const interest = smSliderToFloat(document.getElementById('edit-interest')?.value || 5);

  // Get current RACI from the stakeholder (already updated by smEditSetRaci)
  const sh = smGetStakeholder(_editingId);
  const raci = sh ? { ...sh.raci } : {};

  smUpdateStakeholder(_editingId, { name, team, notes, group, power, interest, raci });

  smEditClose();
  smRefreshAll();
  smToast('Stakeholder saved.');
}

function smEditDelete() {
  if (!_editingId) return;
  if (!confirm('Delete this stakeholder?')) return;
  smDeleteStakeholder(_editingId);
  smEditClose();
  smRefreshAll();
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
