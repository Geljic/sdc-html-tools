// ============================================================
// Mermaid Diagram Builder — app.js
// State machine · mode routing · splash · AI panel · settings
// ============================================================

// ── App state ──────────────────────────────────────────────
const appState = {
  mode: 'splash',           // splash | ai | form | code
  diagramType: 'flowchart', // flowchart | sequence | journey | gantt | mindmap | quadrant | er
  activeBuilderType: null,  // which form builder is active
};

// ── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  previewInit();
  appShowSplash();
  settingsLoadFromStorage();
  setupResizer();
  setupExportDropdown();
  setupNavDropdowns();
  setupCodeEditorKeys();

  // Keyboard: Escape closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      settingsClose();
      closeExportMenu();
    }
  });
});

// ── Screen routing ─────────────────────────────────────────
function appShowSplash() {
  appState.mode = 'splash';
  document.getElementById('welcome-screen').style.display = 'flex';
  document.getElementById('editor-screen').classList.remove('visible');
  document.getElementById('ai-prompt-panel').style.display = 'none';
}

function appShowEditor() {
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('editor-screen').classList.add('visible');
}

// ── Splash card handlers ───────────────────────────────────

function welcomeChooseAi() {
  appState.mode = 'ai';
  document.getElementById('ai-prompt-panel').style.display = 'flex';
  document.getElementById('welcome-cards').style.display = 'none';
  document.getElementById('welcome-prompt').style.display = 'none';

  // Check credentials
  if (!mdHasCredentials()) {
    document.getElementById('ai-creds-warn').style.display = 'flex';
  } else {
    document.getElementById('ai-creds-warn').style.display = 'none';
  }

  // Focus textarea
  setTimeout(() => document.getElementById('ai-notes-input')?.focus(), 100);
}

function welcomeChooseForm() {
  appState.mode = 'form';
  // Show diagram type selector on splash, then go to editor
  const type = appState.diagramType;
  appShowEditor();
  editorSwitchTab('form');
  builderInitForType(type);
  updateEditorTitle('Form Builder — ' + getDiagramTypeLabel(type));
}

function welcomeChooseCode() {
  appState.mode = 'code';
  appShowEditor();
  editorSwitchTab('code');

  // Set a starter diagram if code is empty
  const input = document.getElementById('mermaid-code-input');
  if (input && !input.value.trim()) {
    const starter = mdGetDiagramType('flowchart').example;
    input.value = starter;
    previewRender(starter);
  }
  updateEditorTitle('Code Editor');
  setTimeout(() => document.getElementById('mermaid-code-input')?.focus(), 100);
}

function welcomeJsonSelected(file) {
  if (!file) return;
  previewLoadJson(file);
}

function hideAiPanel() {
  document.getElementById('ai-prompt-panel').style.display = 'none';
  document.getElementById('welcome-cards').style.display = 'grid';
  document.getElementById('welcome-prompt').style.display = 'block';
  appState.mode = 'splash';
}

// ── AI Generation ──────────────────────────────────────────

async function runAiGenerate() {
  const description = document.getElementById('ai-notes-input')?.value || '';
  if (!description.trim()) {
    showToast('Please describe your diagram first', 'error');
    return;
  }

  if (!mdHasCredentials()) {
    showToast('Configure API credentials first (⚙️ settings)', 'error');
    settingsOpen();
    return;
  }

  const typeSelect = document.getElementById('ai-type-select');
  const diagramTypeId = typeSelect?.value || 'auto';

  const btn = document.getElementById('btn-ai-generate');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Generating…';
  btn.disabled = true;

  try {
    const systemPrompt = mdBuildSystemPrompt(diagramTypeId);
    const userPrompt   = mdBuildUserPrompt(description, diagramTypeId, '');

    const raw = await mdCallAi(systemPrompt, userPrompt, { maxTokens: 2048, temperature: 0.2 });
    const code = mdParseAiResponse(raw);

    if (!mdLooksLikeMermaid(code)) {
      throw new Error('AI returned unexpected output. Try rephrasing your description.');
    }

    // Set code and go to editor
    const codeInput = document.getElementById('mermaid-code-input');
    if (codeInput) codeInput.value = code;

    // Detect type and update state
    const detectedType = mdDetectDiagramType(code);
    appState.diagramType = detectedType;

    appShowEditor();
    editorSwitchTab('code');
    previewRender(code);
    updateEditorTitle('AI Generated — ' + getDiagramTypeLabel(detectedType));
    showToast('✓ Diagram generated');

  } catch (err) {
    showToast('AI error: ' + err.message, 'error');
    console.error('AI generation error:', err);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// ── Editor tab switching ───────────────────────────────────

function editorSwitchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.editor-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + tabId);
  });

  // If switching to form, show the right builder
  if (tabId === 'form') {
    showFormBuilderForType(appState.diagramType);
  }
}

function showFormBuilderForType(type) {
  // Hide all builders
  ['fc-builder', 'seq-builder', 'journey-builder', 'gantt-builder', 'form-type-unsupported']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

  // Show the right one
  const supportedTypes = { flowchart: 'fc-builder', sequence: 'seq-builder', journey: 'journey-builder', gantt: 'gantt-builder' };
  const builderId = supportedTypes[type];

  if (builderId) {
    const el = document.getElementById(builderId);
    if (el) el.style.display = 'flex';

    // Init if not already done
    if (appState.activeBuilderType !== type) {
      appState.activeBuilderType = type;
      builderInitForType(type);
    }
  } else {
    const unsupported = document.getElementById('form-type-unsupported');
    if (unsupported) {
      unsupported.style.display = 'flex';
      unsupported.innerHTML = `
        <div style="text-align:center;color:var(--muted);padding:24px">
          <div style="font-size:2rem;margin-bottom:8px">✏️</div>
          <div style="font-weight:600;margin-bottom:4px">Form builder not available for ${getDiagramTypeLabel(type)}</div>
          <div style="font-size:12px">Use the Code tab to edit this diagram type directly</div>
        </div>`;
    }
  }
}

// ── Diagram type selector (in editor toolbar) ──────────────

function editorChangeDiagramType(type) {
  appState.diagramType = type;

  // If on form tab, re-init the builder
  const activeTab = document.querySelector('.editor-tab.active')?.dataset.tab;
  if (activeTab === 'form') {
    appState.activeBuilderType = null; // force re-init
    showFormBuilderForType(type);
  }
}

function getDiagramTypeLabel(typeId) {
  const t = mdGetDiagramType(typeId);
  return t ? t.label : typeId;
}

// ── Code editor input handler ──────────────────────────────

function onCodeInput(value) {
  previewScheduleRender(value, 350);
}

// ── Snippet legend ─────────────────────────────────────────

function toggleSnippetPanel() {
  const header = document.getElementById('snippet-panel-header');
  const body   = document.getElementById('snippet-panel-body');
  if (!header || !body) return;
  const collapsed = header.classList.toggle('collapsed');
  body.classList.toggle('hidden', collapsed);
}

/**
 * Insert a snippet at the current cursor position in the code textarea.
 * If there is a selection, it is replaced. After insertion the preview updates.
 */
function insertSnippet(text) {
  const ta = document.getElementById('mermaid-code-input');
  if (!ta) return;

  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const value = ta.value;

  // If textarea is empty or cursor is at end of a line, add a newline prefix
  const before = value.slice(0, start);
  const needsNewline = before.length > 0 && !before.endsWith('\n');
  const insert = (needsNewline ? '\n' : '') + text;

  ta.value = before + insert + value.slice(end);
  const newPos = start + insert.length;
  ta.selectionStart = newPos;
  ta.selectionEnd   = newPos;
  ta.focus();

  onCodeInput(ta.value);
}

/**
 * Replace the entire code textarea with a starter diagram template.
 */
function insertStarterDiagram(typeId) {
  const ta = document.getElementById('mermaid-code-input');
  if (!ta) return;

  const typeInfo = mdGetDiagramType(typeId);
  if (!typeInfo || !typeInfo.example) return;

  if (ta.value.trim() && !confirm('Replace current diagram with a ' + typeInfo.label + ' starter?')) return;

  ta.value = typeInfo.example;
  ta.focus();
  ta.selectionStart = ta.value.length;
  ta.selectionEnd   = ta.value.length;

  appState.diagramType = typeId;
  const sel = document.getElementById('diagram-type-select');
  if (sel) sel.value = typeId;

  onCodeInput(ta.value);
}

// ── Editor toolbar title ───────────────────────────────────

function updateEditorTitle(title) {
  const el = document.getElementById('editor-toolbar-title');
  if (el) el.textContent = title;
}

// ── Settings modal ─────────────────────────────────────────

function settingsOpen() {
  document.getElementById('settings-modal').classList.remove('hidden');
  document.getElementById('settings-endpoint').value = mdGetEndpoint();
  document.getElementById('settings-key').value = mdGetApiKey();
  document.getElementById('settings-model').value = mdGetModel();
}

function settingsClose() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function settingsSave() {
  const endpoint = document.getElementById('settings-endpoint').value.trim();
  const key      = document.getElementById('settings-key').value.trim();
  const model    = document.getElementById('settings-model').value.trim();

  mdSaveApiCredentials(endpoint, key, model);
  settingsClose();
  showToast('✓ Settings saved');

  // Update AI creds warning if visible
  if (mdHasCredentials()) {
    document.getElementById('ai-creds-warn').style.display = 'none';
  }
}

function settingsLoadFromStorage() {
  // Pre-populate on load (done in settingsOpen, but also check creds warn)
  if (!mdHasCredentials()) {
    const warn = document.getElementById('ai-creds-warn');
    if (warn) warn.style.display = 'none'; // hidden until AI panel is opened
  }
}

// ── Theme selector ─────────────────────────────────────────

function onThemeChange(theme) {
  previewSetTheme(theme);
}

// ── Export dropdown ────────────────────────────────────────

function setupExportDropdown() {
  const btn = document.getElementById('export-btn');
  const menu = document.getElementById('export-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  document.addEventListener('click', () => closeExportMenu());
  menu.addEventListener('click', (e) => e.stopPropagation());
}

function closeExportMenu() {
  document.getElementById('export-menu')?.classList.remove('open');
}

// ── Resizable split pane ───────────────────────────────────

function setupResizer() {
  const resizer = document.getElementById('pane-resizer');
  const left    = document.querySelector('.editor-left');
  if (!resizer || !left) return;

  let isResizing = false;
  let startX = 0;
  let startW = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startW = left.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = e.clientX - startX;
    const newW = Math.max(240, Math.min(700, startW + delta));
    left.style.width = newW + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ── Navbar dropdown toggles ────────────────────────────────

function setupNavDropdowns() {
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

// ── Form builder type switcher (in form panel header) ──────

function formSwitchType(type) {
  appState.diagramType = type;
  appState.activeBuilderType = null;
  showFormBuilderForType(type);

  // Update the type selector in toolbar
  const sel = document.getElementById('diagram-type-select');
  if (sel) sel.value = type;
}

// ── "Back to splash" from editor ──────────────────────────

function editorBackToSplash() {
  if (document.getElementById('mermaid-code-input')?.value.trim()) {
    if (!confirm('Go back to the start? Your current diagram will be lost unless you save it first.')) return;
  }
  appShowSplash();
  // Reset
  document.getElementById('welcome-cards').style.display = 'grid';
  document.getElementById('welcome-prompt').style.display = 'block';
  document.getElementById('ai-prompt-panel').style.display = 'none';
  document.getElementById('mermaid-code-input').value = '';
  document.getElementById('diagram-output').innerHTML = `
    <div class="preview-empty">
      <div class="preview-empty-icon">📊</div>
      <div>Your diagram will appear here</div>
    </div>`;
}

// ── Code editor keyboard handling ──────────────────────────
// Option 4: Tab intercept + smart Enter auto-indent
// - Tab         → insert 2 spaces at cursor (no focus jump)
// - Shift+Tab   → remove up to 2 leading spaces from current line (dedent)
// - Enter       → insert newline + match current line's indentation
//                 + extra indent if line ends with : (section/title keywords)

function setupCodeEditorKeys() {
  const ta = document.getElementById('mermaid-code-input');
  if (!ta) return;

  ta.addEventListener('keydown', (e) => {
    // ── Tab / Shift+Tab ──────────────────────────────────
    if (e.key === 'Tab') {
      e.preventDefault();

      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const value = ta.value;

      if (e.shiftKey) {
        // Shift+Tab: dedent — remove up to 2 leading spaces from the current line
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineText  = value.slice(lineStart);
        const spaces    = lineText.match(/^( {1,2})/);
        if (spaces) {
          const remove = spaces[1].length;
          ta.value = value.slice(0, lineStart) + value.slice(lineStart + remove);
          ta.selectionStart = Math.max(lineStart, start - remove);
          ta.selectionEnd   = Math.max(lineStart, end   - remove);
        }
      } else {
        // Tab: insert 2 spaces at cursor
        ta.value = value.slice(0, start) + '  ' + value.slice(end);
        ta.selectionStart = start + 2;
        ta.selectionEnd   = start + 2;
      }

      // Trigger preview update
      onCodeInput(ta.value);
      return;
    }

    // ── Enter: smart auto-indent ─────────────────────────
    if (e.key === 'Enter') {
      e.preventDefault();

      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const value = ta.value;

      // Find the start of the current line
      const lineStart   = value.lastIndexOf('\n', start - 1) + 1;
      const currentLine = value.slice(lineStart, start);

      // Measure leading whitespace of current line
      const indentMatch = currentLine.match(/^(\s*)/);
      let indent = indentMatch ? indentMatch[1] : '';

      // If the current line (trimmed) ends with ':', add one extra indent level
      // This handles: "section Discovery:", "title My Chart", journey sections, etc.
      const trimmed = currentLine.trimEnd();
      if (trimmed.endsWith(':')) {
        indent += '    '; // 4 spaces for section children
      } else if (/^\s*(section|title|journey|gantt|flowchart|sequenceDiagram|mindmap|erDiagram|quadrantChart)\b/i.test(currentLine)) {
        // Top-level Mermaid keywords: next line gets base indent
        indent = '    ';
      }

      // Insert newline + computed indent, replacing any selection
      ta.value = value.slice(0, start) + '\n' + indent + value.slice(end);
      const newPos = start + 1 + indent.length;
      ta.selectionStart = newPos;
      ta.selectionEnd   = newPos;

      // Trigger preview update
      onCodeInput(ta.value);
      return;
    }
  });

  // Also show a subtle hint in the textarea placeholder area
  ta.title = 'Tab = indent (2 spaces)  ·  Shift+Tab = dedent  ·  Enter = auto-indent';
}
