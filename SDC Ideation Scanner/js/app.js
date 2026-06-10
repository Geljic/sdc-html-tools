// ============================================================
// APP — UI state, file handling, tab switching, rendering
// ============================================================

// ── STATE ──
let uploadedFiles = [];    // { name, size, text }
let lastResult = null;     // { stage1, stage2, elapsed, model, usage }
let lastValidation = null; // { validation_summary, confidence_score, flags }
let validationMap = {};    // Lookup: 'section:index:field' → status
let cumulativeUsage = null; // { prompt_tokens, completion_tokens, total_tokens, validationTokens }
let projectSlug = '';

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  // CORS warning for file:// protocol
  if (window.location.protocol === 'file:') {
    const cw = document.getElementById('cors-warning');
    if (cw) cw.classList.add('show');
  }

  // Populate scan focus dropdown
  const sel = document.getElementById('scan-focus');
  if (sel) {
    SCAN_FOCUS_OPTIONS.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });

    // Show/hide "Other focus" textarea
    sel.addEventListener('change', () => {
      const otherGroup = document.getElementById('other-focus-group');
      if (otherGroup) otherGroup.style.display = sel.value === 'other' ? '' : 'none';
    });
  }

  // Dropzone events
  const dz = document.getElementById('dropzone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
  }

  // Character counters
  setupCharCount('project-context', 'context-chars');
  setupCharCount('opportunities-text', 'opps-chars');

  // Navbar dropdown toggle
  document.querySelectorAll('.nav-group-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const li = this.closest('li');
      const wasOpen = li.classList.contains('open');
      document.querySelectorAll('.sdc-navbar__links > li').forEach(l => l.classList.remove('open'));
      if (!wasOpen) li.classList.add('open');
    });
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.sdc-navbar__links > li')) {
      document.querySelectorAll('.sdc-navbar__links > li').forEach(l => l.classList.remove('open'));
    }
  });
});

function setupCharCount(textareaId, countId) {
  const ta = document.getElementById(textareaId);
  const ct = document.getElementById(countId);
  if (!ta || !ct) return;
  ta.addEventListener('input', () => {
    ct.textContent = ta.value.length.toLocaleString() + ' chars';
  });
}

// ── SETTINGS ──
function openSettings() {
  document.getElementById('proxy-url').value = getEndpoint();
  document.getElementById('api-key').value = getApiKey();
  document.getElementById('model-name').value = getModel();
  document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
}

function saveSettings() {
  const endpoint = document.getElementById('proxy-url').value.trim();
  const key = document.getElementById('api-key').value.trim();
  const model = document.getElementById('model-name').value.trim();
  saveApiCredentials(endpoint, key, model);
  closeSettings();
  showToast('Settings saved');
}

async function testConn() {
  const btn = document.getElementById('test-conn-btn');
  const status = document.getElementById('conn-status');
  btn.disabled = true;
  btn.textContent = 'Testing…';
  status.textContent = '';

  // Temporarily save current values for testing
  const endpoint = document.getElementById('proxy-url').value.trim();
  const key = document.getElementById('api-key').value.trim();
  saveApiCredentials(endpoint, key, document.getElementById('model-name').value.trim());

  try {
    const result = await testConnection();
    status.innerHTML = '<span style="color:var(--doe-green)">✓ Connected — ' + result.models.length + ' models available</span>';
  } catch (e) {
    status.innerHTML = '<span style="color:var(--doe-red)">✗ ' + e.message + '</span>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
}

// ── FILE HANDLING ──
function handleFileInput(e) {
  handleFiles(e.target.files);
  e.target.value = '';
}

async function handleFiles(fileList) {
  for (const file of fileList) {
    const ext = file.name.split('.').pop().toLowerCase();
    let text = '';

    try {
      if (ext === 'txt' || ext === 'md') {
        text = await readFileAsText(file);
      } else if (ext === 'docx') {
        text = await extractDocx(file);
      } else if (ext === 'pdf') {
        text = await extractPdf(file);
      } else {
        showToast('Unsupported file type: .' + ext);
        continue;
      }
    } catch (e) {
      showToast('Error reading ' + file.name + ': ' + e.message);
      continue;
    }

    uploadedFiles.push({ name: file.name, size: file.size, text: text });
    renderFileList();
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

async function extractDocx(file) {
  if (typeof mammoth === 'undefined') {
    throw new Error('mammoth.js not loaded — DOCX extraction unavailable');
  }
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractPdf(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('pdf.js not loaded — PDF extraction unavailable');
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    pages.push(text);
  }
  return pages.join('\n\n');
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  const list = document.getElementById('file-list');
  if (!list) return;
  list.innerHTML = '';
  uploadedFiles.forEach((f, i) => {
    const li = document.createElement('li');
    const sizeKb = (f.size / 1024).toFixed(1);
    li.innerHTML = '<span class="file-name">📄 ' + escHtml(f.name) + '</span>'
      + '<span class="file-size">' + sizeKb + ' KB · ' + f.text.length.toLocaleString() + ' chars</span>'
      + '<button class="file-remove" onclick="removeFile(' + i + ')" title="Remove">✕</button>';
    list.appendChild(li);
  });
}

// ── GATHER INPUT ──
function gatherOpportunities() {
  const pastedText = (document.getElementById('opportunities-text')?.value || '').trim();
  const fileTexts = uploadedFiles.map(f => f.text).filter(Boolean);
  const parts = [];
  if (pastedText) parts.push(pastedText);
  if (fileTexts.length > 0) parts.push(...fileTexts);
  return parts.join('\n\n---\n\n');
}

// ── RUN SCAN ──
async function runScan() {
  const context = (document.getElementById('project-context')?.value || '').trim();
  const opportunities = gatherOpportunities();
  const scanFocus = document.getElementById('scan-focus')?.value || 'all';
  const otherFocusText = (document.getElementById('other-focus-text')?.value || '').trim();
  projectSlug = (document.getElementById('project-slug')?.value || '').trim();

  // Validate
  if (!context) {
    showToast('Please enter a project context.');
    document.getElementById('project-context')?.focus();
    return;
  }
  if (!opportunities) {
    showToast('Please enter opportunities or upload a file.');
    document.getElementById('opportunities-text')?.focus();
    return;
  }
  if (scanFocus === 'other' && !otherFocusText) {
    showToast('Please describe your custom scan focus.');
    document.getElementById('other-focus-text')?.focus();
    return;
  }
  if (!hasCredentials()) {
    showToast('Please configure your API settings first.');
    openSettings();
    return;
  }

  // Disable button, clear output
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Running…';
  clearStatus();
  clearOutput();

  try {
    lastResult = await runPipeline(context, opportunities, scanFocus, otherFocusText, onStatus);
    // Initialise cumulative usage from pipeline
    cumulativeUsage = {
      prompt_tokens: lastResult.usage?.prompt_tokens || 0,
      completion_tokens: lastResult.usage?.completion_tokens || 0,
      total_tokens: lastResult.usage?.total_tokens || 0,
      validationTokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    renderOutput(lastResult);
    enableExportButtons(true);
  } catch (e) {
    onStatus('Pipeline failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Run Ideation Scan';
  }
}

// ── STATUS DISPLAY ──
function onStatus(message, type) {
  const container = document.getElementById('status');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'status-' + type;
  div.textContent = message;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  // Update progress bar — handles multi-batch Stage 2
  const bar = document.getElementById('progress-fill');
  if (bar) {
    if (type === 'step' && message.includes('Stage 1')) bar.style.width = '10%';
    else if (type === 'done' && message.includes('Stage 1 complete')) bar.style.width = '40%';
    else if (type === 'step' && message.includes('Stage 2')) {
      // Parse batch info if present
      const batchMatch = message.match(/batch (\d+)\/(\d+)/);
      if (batchMatch) {
        const batchNum = parseInt(batchMatch[1]);
        const totalBatches = parseInt(batchMatch[2]);
        bar.style.width = (40 + (batchNum - 1) / totalBatches * 50) + '%';
      } else {
        bar.style.width = '45%';
      }
    }
    else if (type === 'done' && message.includes('Stage 2') && message.includes('complete')) {
      const batchMatch = message.match(/batch (\d+)\/(\d+)/);
      if (batchMatch) {
        const batchNum = parseInt(batchMatch[1]);
        const totalBatches = parseInt(batchMatch[2]);
        bar.style.width = (40 + batchNum / totalBatches * 50) + '%';
      } else {
        bar.style.width = '90%';
      }
    }
    else if (type === 'done' && message.includes('Pipeline complete')) bar.style.width = '100%';
    else if (type === 'done' && message.includes('All batches merged')) bar.style.width = '95%';
    else if (type === 'error') {
      bar.style.width = bar.style.width; // Keep current position on error
    }
  }
}

function clearStatus() {
  const container = document.getElementById('status');
  if (container) container.innerHTML = '';
  const bar = document.getElementById('progress-fill');
  if (bar) bar.style.width = '0%';
}

// ── TAB SWITCHING ──
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(tc => {
    tc.classList.toggle('active', tc.id === tabId);
  });
}

// ── OUTPUT RENDERING ──
function clearOutput() {
  document.getElementById('tab-scan').innerHTML = '';
  document.getElementById('tab-solution').innerHTML = '';
  enableExportButtons(false);
  lastResult = null;
  lastValidation = null;
  validationMap = {};
  cumulativeUsage = null;

  // Hide validation banner
  const banner = document.getElementById('validation-banner');
  if (banner) banner.style.display = 'none';

  // Show empty state
  document.getElementById('tab-scan').innerHTML = '<div class="output-empty"><div class="empty-icon">🔍</div>Run an ideation scan to see innovation insights here…</div>';
  document.getElementById('tab-solution').innerHTML = '<div class="output-empty"><div class="empty-icon">💡</div>Unpacked solution concepts will appear here…</div>';
}

function enableExportButtons(enabled) {
  document.querySelectorAll('.export-btn').forEach(btn => btn.disabled = !enabled);
}

function renderOutput(result) {
  renderStage1(result.stage1);
  renderStage2(result.stage2);
  renderUsageStats();

  // Switch to first tab
  switchTab('tab-scan');
}

/**
 * Render the usage stats bar with cumulative totals.
 */
function renderUsageStats() {
  const usageEl = document.getElementById('usage-stats');
  if (!usageEl || !lastResult) return;

  const pipelineInput = lastResult.usage?.prompt_tokens || 0;
  const pipelineOutput = lastResult.usage?.completion_tokens || 0;
  const pipelineTotal = lastResult.usage?.total_tokens || 0;
  const pipelineCost = estimateCost(lastResult.model, pipelineInput, pipelineOutput);

  let html = '<strong>Model:</strong> ' + escHtml(lastResult.model)
    + ' · <strong>Input:</strong> ' + pipelineInput.toLocaleString() + ' tokens'
    + ' · <strong>Output:</strong> ' + pipelineOutput.toLocaleString() + ' tokens'
    + ' · <strong>Total:</strong> ' + pipelineTotal.toLocaleString() + ' tokens'
    + ' · <strong>Est. cost:</strong> ~$' + pipelineCost.toFixed(4)
    + ' · <strong>Time:</strong> ' + (lastResult.elapsed || '');

  // Add validation usage if present
  if (cumulativeUsage && cumulativeUsage.validationTokens.total_tokens > 0) {
    const valInput = cumulativeUsage.validationTokens.prompt_tokens;
    const valOutput = cumulativeUsage.validationTokens.completion_tokens;
    const valTotal = cumulativeUsage.validationTokens.total_tokens;
    // Estimate validation cost — may use different models (Opus for deep validation)
    const valCost = estimateCost(lastResult.model, valInput * 0.5, valOutput * 0.5)
      + estimateCost('claude-opus-4-6', valInput * 0.5, valOutput * 0.5);

    const sessionInput = pipelineInput + valInput;
    const sessionOutput = pipelineOutput + valOutput;
    const sessionTotal = pipelineTotal + valTotal;
    const sessionCost = pipelineCost + valCost;

    html += '<br><strong>+ Validation:</strong> '
      + 'Input: ' + valInput.toLocaleString()
      + ' · Output: ' + valOutput.toLocaleString()
      + ' · Total: ' + valTotal.toLocaleString()
      + ' · Est. cost: ~$' + valCost.toFixed(4);

    html += '<br><strong>= Session Total:</strong> '
      + sessionTotal.toLocaleString() + ' tokens'
      + ' · ~$' + sessionCost.toFixed(4);
  }

  usageEl.innerHTML = html;
}

/**
 * Estimate cost based on model and token counts.
 * Prices are approximate per-1M-token rates (USD).
 */
function estimateCost(model, inputTokens, outputTokens) {
  const PRICING = {
    'claude-sonnet-4-6':        { input: 3.00,  output: 15.00 },
    'claude-sonnet-4-5':        { input: 3.00,  output: 15.00 },
    'claude-haiku-4-5':         { input: 0.80,  output: 4.00 },
    'claude-opus-4-6':          { input: 15.00, output: 75.00 },
    'claude-opus-4-7':          { input: 15.00, output: 75.00 },
    'gemini-flash-2-5':         { input: 0.15,  output: 0.60 },
    'gemini-pro-2-5':           { input: 1.25,  output: 10.00 },
    'gemini-3-1-pro-preview':   { input: 1.25,  output: 10.00 },
  };

  let pricing = null;
  const modelLower = (model || '').toLowerCase();
  for (const [key, val] of Object.entries(PRICING)) {
    if (modelLower.includes(key.toLowerCase()) || key.toLowerCase().includes(modelLower)) {
      pricing = val;
      break;
    }
  }

  if (!pricing) {
    pricing = PRICING['claude-sonnet-4-6'];
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

// ── LINK RENDERING HELPER ──

/**
 * Render a url_hint as a clickable link with optional validation badge and inline annotation.
 * - If it starts with http:// or https://, render as a direct link.
 * - Otherwise, render as a Google search link.
 * - If validationStatus is provided, append a ✅/⚠️/❌ badge.
 * - If validationDetail is provided, render an inline annotation beneath the link.
 * Returns an HTML string.
 */
function renderLink(urlHint, validationStatus, validationDetail) {
  if (!urlHint) return '';
  const escaped = escHtml(urlHint);
  let linkHtml;
  if (/^https?:\/\//i.test(urlHint)) {
    linkHtml = '<a href="' + escaped + '" target="_blank" rel="noopener noreferrer" class="source-link" title="Open source reference">' + escaped + '</a>';
  } else {
    const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(urlHint);
    linkHtml = '<a href="' + searchUrl + '" target="_blank" rel="noopener noreferrer" class="source-link search-link" title="Search for: ' + escaped + '">🔎 ' + escaped + '</a>';
  }

  // Append validation badge if status is known
  if (validationStatus === 'likely_valid') {
    linkHtml += ' <span class="val-badge val-badge-valid" title="Source confirmed">✅</span>';
  } else if (validationStatus === 'uncertain') {
    linkHtml += ' <span class="val-badge val-badge-uncertain" title="Source uncertain — may not be accessible">⚠️</span>';
  } else if (validationStatus === 'likely_invalid') {
    linkHtml += ' <span class="val-badge val-badge-invalid" title="Source flagged — may be incorrect">❌</span>';
  }

  // Append inline validation annotation if detail is provided
  if (validationDetail && validationStatus === 'likely_valid') {
    linkHtml += '<div class="val-inline val-inline-valid">'
      + '<span class="val-inline-icon">✅</span> confirmed'
      + '</div>';
  } else if (validationDetail && validationStatus === 'uncertain') {
    linkHtml += '<div class="val-inline val-inline-uncertain">'
      + '<span class="val-inline-icon">⚠️</span> '
      + escHtml(validationDetail.reason || '')
      + (validationDetail.suggested_fix ? ' <em class="val-inline-fix">→ ' + escHtml(validationDetail.suggested_fix) + '</em>' : '')
      + '</div>';
  } else if (validationDetail && validationStatus === 'likely_invalid') {
    linkHtml += '<div class="val-inline val-inline-invalid">'
      + '<span class="val-inline-icon">❌</span> '
      + escHtml(validationDetail.reason || '')
      + (validationDetail.suggested_fix ? ' <em class="val-inline-fix">→ ' + escHtml(validationDetail.suggested_fix) + '</em>' : '')
      + '</div>';
  }

  return linkHtml;
}

/**
 * Render a compact link icon for inline use (e.g. in tables).
 */
function renderLinkCompact(urlHint) {
  if (!urlHint) return '';
  const escaped = escHtml(urlHint);
  if (/^https?:\/\//i.test(urlHint)) {
    return ' <a href="' + escaped + '" target="_blank" rel="noopener noreferrer" class="source-link-icon" title="' + escaped + '">🔗</a>';
  }
  const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(urlHint);
  return ' <a href="' + searchUrl + '" target="_blank" rel="noopener noreferrer" class="source-link-icon search-link" title="Search: ' + escaped + '">🔎</a>';
}

/**
 * Look up the validation status for a given section, index, field, and optional feature index.
 * For solution_concepts features, falls back to concept-level key if feature-level key not found.
 */
function getValidationStatus(section, index, field, featureIndex) {
  if (featureIndex != null) {
    // Try feature-level key first
    const featureKey = section + ':' + index + ':' + field + ':' + featureIndex;
    if (validationMap[featureKey]) return validationMap[featureKey];
    // Fall back to concept-level key (AI may have omitted feature_index)
    const conceptKey = section + ':' + index + ':' + field;
    return validationMap[conceptKey] || null;
  }
  const key = section + ':' + index + ':' + field;
  return validationMap[key] || null;
}

/**
 * Look up the full validation flag detail for a given section, index, field, and optional feature index.
 * Normalizes field names so 'url' matches 'url_hint' or 'best_practice_url'.
 * For solution_concepts: if the AI omits feature_index, the flag matches any feature in that concept.
 * Returns the flag object { status, reason, suggested_fix, ... } or null.
 */
function getValidationDetail(section, index, field, featureIndex) {
  if (!lastValidation || !lastValidation.flags) return null;
  return lastValidation.flags.find(f => {
    if (f.section !== section || f.item_index !== index) return false;
    // Normalize the flag's field name before comparing
    const normalizedFlagField = normalizeValidationField(f.section, f.field);
    if (normalizedFlagField !== field) return false;
    // For solution_concepts features: if the flag has a feature_index, it must match exactly.
    // If the flag has NO feature_index but we're looking for a specific feature, still match
    // (the AI sometimes omits feature_index for concept-level URL flags).
    if (featureIndex != null && f.feature_index != null && f.feature_index !== featureIndex) return false;
    if (featureIndex == null && f.feature_index != null) return false;
    return true;
  }) || null;
}

/**
 * Render an inline validation annotation for a non-URL field (e.g. title).
 * Returns an HTML string or empty string if no validation detail exists.
 */
function renderFieldValidation(section, index, field) {
  const status = getValidationStatus(section, index, field);
  const detail = getValidationDetail(section, index, field);
  if (!status || !detail) return '';

  const icon = status === 'likely_valid' ? '✅' : status === 'uncertain' ? '⚠️' : '❌';
  const cls = status === 'likely_valid' ? 'val-inline-valid' : status === 'uncertain' ? 'val-inline-uncertain' : 'val-inline-invalid';

  if (status === 'likely_valid') {
    return '<div class="val-inline ' + cls + '"><span class="val-inline-icon">' + icon + '</span> confirmed</div>';
  }

  return '<div class="val-inline ' + cls + '"><span class="val-inline-icon">' + icon + '</span> '
    + escHtml(detail.reason || '')
    + (detail.suggested_fix ? ' <em class="val-inline-fix">→ ' + escHtml(detail.suggested_fix) + '</em>' : '')
    + '</div>';
}

// ── STAGE 1 RENDERING ──

function renderStage1(data) {
  const container = document.getElementById('tab-scan');
  container.innerHTML = '';

  // Scan Summary
  const summary = document.createElement('div');
  summary.className = 'summary-card blue';
  summary.innerHTML = '<strong>🌐 Scan Summary:</strong> ' + escHtml(data.scan_summary || '');
  container.appendChild(summary);

  // Best Practices
  container.appendChild(sectionHeader('🏆', 'Best Practices'));
  const bpGrid = document.createElement('div');
  bpGrid.className = 'card-grid';
  (data.best_practices || []).forEach((bp, i) => {
    bpGrid.appendChild(bestPracticeCard(bp, i));
  });
  container.appendChild(bpGrid);

  // Analogous Solutions
  container.appendChild(sectionHeader('🔄', 'Analogous Solutions'));
  const asGrid = document.createElement('div');
  asGrid.className = 'card-grid';
  (data.analogous_solutions || []).forEach((as, i) => {
    asGrid.appendChild(analogousCard(as, i));
  });
  container.appendChild(asGrid);

  // Design Trends
  container.appendChild(sectionHeader('📈', 'Design Trends'));
  const dtGrid = document.createElement('div');
  dtGrid.className = 'trend-grid';
  (data.design_trends || []).forEach((dt, i) => {
    dtGrid.appendChild(trendCard(dt, i));
  });
  container.appendChild(dtGrid);

  // Inspiration Sources
  container.appendChild(sectionHeader('📚', 'Inspiration Sources'));
  const inspList = document.createElement('ul');
  inspList.className = 'inspiration-list';
  (data.inspiration_sources || []).forEach((is, i) => {
    const li = document.createElement('li');
    const valStatus = getValidationStatus('inspiration_sources', i, 'url_hint');
    const valDetail = getValidationDetail('inspiration_sources', i, 'url_hint');
    const nameValHtml = renderFieldValidation('inspiration_sources', i, 'title');
    li.innerHTML = '<span class="insp-type">' + escHtml(is.type || 'Resource') + '</span>'
      + '<span><span class="insp-name">' + escHtml(is.name || '') + '</span>'
      + nameValHtml
      + ' — <span class="insp-why">' + escHtml(is.why_relevant || '') + '</span>'
      + (is.url_hint ? '<div class="card-link">' + renderLink(is.url_hint, valStatus, valDetail) + '</div>' : '')
      + '</span>';
    inspList.appendChild(li);
  });
  container.appendChild(inspList);
}

function renderStage2(data) {
  const container = document.getElementById('tab-solution');
  container.innerHTML = '';

  // Solution Overview
  const summary = document.createElement('div');
  summary.className = 'summary-card green';
  summary.innerHTML = '<strong>💡 Solution Overview:</strong> ' + escHtml(data.solution_overview || '');
  container.appendChild(summary);

  // Solution Concepts
  container.appendChild(sectionHeader('🧩', 'Solution Concepts'));
  (data.solution_concepts || []).forEach((concept, ci) => {
    container.appendChild(conceptCard(concept, ci));
  });

  // Cross-Cutting Themes
  if (data.cross_cutting_themes && data.cross_cutting_themes.length > 0) {
    container.appendChild(sectionHeader('🔗', 'Cross-Cutting Themes'));
    const themeList = document.createElement('div');
    themeList.className = 'theme-list';
    data.cross_cutting_themes.forEach((t, i) => {
      const chip = document.createElement('div');
      chip.className = 'theme-chip';
      const valStatus = getValidationStatus('cross_cutting_themes', i, 'url_hint');
      const valDetail = getValidationDetail('cross_cutting_themes', i, 'url_hint');
      const themeValHtml = renderFieldValidation('cross_cutting_themes', i, 'title');
      chip.innerHTML = '<div class="theme-name">' + escHtml(t.theme || '') + '</div>'
        + themeValHtml
        + '<div class="theme-desc">' + escHtml(t.description || '') + '</div>'
        + (t.url_hint ? '<div class="theme-link">' + renderLink(t.url_hint, valStatus, valDetail) + '</div>' : '');
      themeList.appendChild(chip);
    });
    container.appendChild(themeList);
  }

  // Risks & Considerations
  if (data.risks_and_considerations && data.risks_and_considerations.length > 0) {
    container.appendChild(sectionHeader('⚠️', 'Risks & Considerations'));
    const riskList = document.createElement('div');
    riskList.className = 'risk-list';
    data.risks_and_considerations.forEach(r => {
      const card = document.createElement('div');
      card.className = 'risk-card';
      card.innerHTML = '<div class="risk-title">⚠ ' + escHtml(r.risk || '') + '</div>'
        + '<div class="risk-mitigation"><strong>Mitigation:</strong> ' + escHtml(r.mitigation || '') + '</div>';
      riskList.appendChild(card);
    });
    container.appendChild(riskList);
  }
}

// ── CARD BUILDERS ──
function sectionHeader(icon, text) {
  const h = document.createElement('div');
  h.className = 'section-header';
  h.innerHTML = '<span class="section-icon">' + icon + '</span> ' + escHtml(text);
  return h;
}

function bestPracticeCard(bp, index) {
  const card = document.createElement('div');
  card.className = 'insight-card';
  const valStatus = getValidationStatus('best_practices', index, 'url_hint');
  const valDetail = getValidationDetail('best_practices', index, 'url_hint');
  const titleValHtml = renderFieldValidation('best_practices', index, 'title');
  card.innerHTML = '<div class="card-title">' + escHtml(bp.title || '') + '</div>'
    + titleValHtml
    + '<span class="card-badge badge-domain">' + escHtml(bp.source_domain || '') + '</span>'
    + '<div class="card-desc">' + escHtml(bp.description || '') + '</div>'
    + '<div class="card-relevance">💡 ' + escHtml(bp.relevance || '') + '</div>'
    + (bp.url_hint ? '<div class="card-link">' + renderLink(bp.url_hint, valStatus, valDetail) + '</div>' : '');
  return card;
}

function analogousCard(as, index) {
  const card = document.createElement('div');
  card.className = 'insight-card';
  const valStatus = getValidationStatus('analogous_solutions', index, 'url_hint');
  const valDetail = getValidationDetail('analogous_solutions', index, 'url_hint');
  const titleValHtml = renderFieldValidation('analogous_solutions', index, 'title');
  card.innerHTML = '<div class="card-title">' + escHtml(as.title || '') + '</div>'
    + titleValHtml
    + '<span class="card-badge badge-sector">' + escHtml(as.sector || '') + '</span>'
    + '<div class="card-desc">' + escHtml(as.description || '') + '</div>'
    + '<div class="card-relevance">🔄 ' + escHtml(as.transferable_insight || '') + '</div>'
    + (as.url_hint ? '<div class="card-link">' + renderLink(as.url_hint, valStatus, valDetail) + '</div>' : '');
  return card;
}

function trendCard(dt, index) {
  const card = document.createElement('div');
  card.className = 'trend-card';
  const valStatus = getValidationStatus('design_trends', index, 'url_hint');
  const valDetail = getValidationDetail('design_trends', index, 'url_hint');
  const trendValHtml = renderFieldValidation('design_trends', index, 'title');
  card.innerHTML = '<div class="trend-name">' + escHtml(dt.trend || '') + '</div>'
    + trendValHtml
    + '<div class="trend-desc">' + escHtml(dt.description || '') + '</div>'
    + '<div class="trend-app">→ ' + escHtml(dt.application || '') + '</div>'
    + (dt.url_hint ? '<div class="card-link">' + renderLink(dt.url_hint, valStatus, valDetail) + '</div>' : '');
  return card;
}

function conceptCard(concept, index) {
  const card = document.createElement('div');
  card.className = 'concept-card open';

  const header = document.createElement('div');
  header.className = 'concept-header';
  const conceptValHtml = renderFieldValidation('solution_concepts', index, 'title');
  header.innerHTML = '<div>'
    + '<span class="concept-title">Concept ' + (index + 1) + ': ' + escHtml(concept.concept_name || '') + '</span>'
    + '<span class="concept-meta"> · ' + (concept.features?.length || 0) + ' features</span>'
    + conceptValHtml
    + '</div>'
    + '<span class="chevron">▼</span>';
  header.addEventListener('click', () => card.classList.toggle('open'));
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'concept-body';

  if (concept.opportunity_source) {
    body.innerHTML += '<div class="concept-source">📌 Opportunity: ' + escHtml(concept.opportunity_source) + '</div>';
  }
  body.innerHTML += '<div class="concept-desc">' + escHtml(concept.concept_description || '') + '</div>';

  // Feature table
  if (concept.features && concept.features.length > 0) {
    const table = document.createElement('table');
    table.className = 'feature-table';
    table.innerHTML = '<thead><tr>'
      + '<th>Feature</th>'
      + '<th>Description</th>'
      + '<th>HCD Value</th>'
      + '<th>Best Practice Ref</th>'
      + '<th>Complexity</th>'
      + '</tr></thead>';

    const tbody = document.createElement('tbody');
    concept.features.forEach((f, fi) => {
      const cx = (f.implementation_complexity || 'Medium').toLowerCase();
      const cxClass = cx === 'low' ? 'complexity-low' : cx === 'high' ? 'complexity-high' : 'complexity-medium';
      // Look up validation status for this feature's best_practice_url
      // Uses fallback: tries feature-level key first, then concept-level key
      const featureValStatus = getValidationStatus('solution_concepts', index, 'best_practice_url', fi);
      const featureValDetail = getValidationDetail('solution_concepts', index, 'best_practice_url', fi);
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="feat-name">' + escHtml(f.feature_name || '') + '</td>'
        + '<td>' + escHtml(f.description || '') + '</td>'
        + '<td class="feat-hcd">' + escHtml(f.hcd_value_proposition || '') + '</td>'
        + '<td class="feat-ref">' + escHtml(f.best_practice_reference || '')
          + (f.best_practice_url ? '<div class="feat-ref-link">' + renderLink(f.best_practice_url, featureValStatus, featureValDetail) + '</div>' : '') + '</td>'
        + '<td><span class="complexity-badge ' + cxClass + '">' + escHtml(f.implementation_complexity || 'Medium') + '</span></td>';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
  }

  card.appendChild(body);
  return card;
}

// ── VALIDATE SOURCES ──

/**
 * Normalize validation field names to match the data model.
 * The AI validation agent sometimes returns 'url' instead of 'url_hint' or 'best_practice_url',
 * and 'title' instead of the section-specific name field (e.g. 'theme', 'trend', 'name').
 */
function normalizeValidationField(section, field) {
  // For solution_concepts features, 'url' should map to 'best_practice_url'
  if (section === 'solution_concepts' && (field === 'url' || field === 'url_hint')) {
    return 'best_practice_url';
  }
  // For all other sections, 'url' should map to 'url_hint'
  if (field === 'url') {
    return 'url_hint';
  }
  // Normalize 'title' to the section-specific name field
  // The AI agent often uses 'title' generically, but each section has its own field name
  if (field === 'title') {
    if (section === 'cross_cutting_themes') return 'title';  // keep as 'title' — canonical lookup key
    if (section === 'design_trends') return 'title';
    if (section === 'inspiration_sources') return 'title';
    if (section === 'solution_concepts') return 'title';
    // best_practices and analogous_solutions already use 'title' in the data model
    return 'title';
  }
  // Also normalize section-specific name fields to 'title' for consistent lookup
  if (field === 'theme' && section === 'cross_cutting_themes') return 'title';
  if (field === 'trend' && section === 'design_trends') return 'title';
  if (field === 'name' && section === 'inspiration_sources') return 'title';
  if (field === 'concept_name' && section === 'solution_concepts') return 'title';
  if (field === 'feature_name' && section === 'solution_concepts') return 'title';
  return field;
}

/**
 * Build a validation lookup map from validation flags.
 * Keys: 'section:index:field' for standard items
 *        'solution_concepts:index:best_practice_url:feature_index' for features
 * Field names are normalized so 'url' maps to 'url_hint' or 'best_practice_url'.
 */
function buildValidationMap(flags) {
  const map = {};
  (flags || []).forEach(f => {
    const normalizedField = normalizeValidationField(f.section, f.field);
    if (f.section === 'solution_concepts' && f.feature_index != null) {
      // Feature-level key
      const key = f.section + ':' + f.item_index + ':' + normalizedField + ':' + f.feature_index;
      map[key] = f.status;
    } else {
      const key = f.section + ':' + f.item_index + ':' + normalizedField;
      map[key] = f.status;
    }
  });
  return map;
}

async function doValidateSources() {
  if (!lastResult) {
    showToast('No scan results to validate. Run a scan first.');
    return;
  }
  if (!hasCredentials()) {
    showToast('Please configure your API settings first.');
    openSettings();
    return;
  }

  const btn = document.getElementById('validate-btn');
  btn.disabled = true;
  btn.textContent = '🔍 Validating (Pass 1)…';

  let totalValUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  try {
    // ── Pass 1: Initial validation ──
    const pass1 = await runValidation(lastResult.stage1, lastResult.stage2, onStatus);
    totalValUsage.prompt_tokens += (pass1.usage?.prompt_tokens || 0);
    totalValUsage.completion_tokens += (pass1.usage?.completion_tokens || 0);
    totalValUsage.total_tokens += (pass1.usage?.total_tokens || 0);

    let finalValidation = pass1.validation;

    // ── Pass 2: Deep validation if there are uncertain/flagged items ──
    const problemCount = (pass1.validation.flags || []).filter(
      f => f.status === 'uncertain' || f.status === 'likely_invalid'
    ).length;

    if (problemCount > 0) {
      btn.textContent = '🔍 Deep-checking (Pass 2)…';
      onStatus('Found ' + problemCount + ' uncertain/flagged items — running deep validation with Opus…', 'update');

      await sleep(1500); // Brief pause before deep validation

      const pass2 = await runDeepValidation(
        lastResult.stage1, lastResult.stage2, pass1.validation, onStatus
      );
      totalValUsage.prompt_tokens += (pass2.usage?.prompt_tokens || 0);
      totalValUsage.completion_tokens += (pass2.usage?.completion_tokens || 0);
      totalValUsage.total_tokens += (pass2.usage?.total_tokens || 0);

      finalValidation = pass2.validation;

      if (pass2.replacementsApplied > 0) {
        onStatus('✅ ' + pass2.replacementsApplied + ' URLs replaced with better references.', 'done');
      }
    } else {
      onStatus('All sources passed initial validation — no deep check needed.', 'update');
    }

    // ── Store results and update UI ──
    lastValidation = finalValidation;
    validationMap = buildValidationMap(finalValidation.flags);

    // Update cumulative usage
    if (cumulativeUsage) {
      cumulativeUsage.validationTokens.prompt_tokens += totalValUsage.prompt_tokens;
      cumulativeUsage.validationTokens.completion_tokens += totalValUsage.completion_tokens;
      cumulativeUsage.validationTokens.total_tokens += totalValUsage.total_tokens;
    }

    // Re-render output with inline validation badges
    renderStage1(lastResult.stage1);
    renderStage2(lastResult.stage2);

    // Render validation banner
    renderValidationResults(finalValidation);

    // Update usage stats with validation tokens
    renderUsageStats();

    showToast('✅ Validation complete — ' + (finalValidation.flags || []).length + ' items checked');
  } catch (e) {
    onStatus('Validation failed: ' + e.message, 'error');
    showToast('Validation failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Validate Sources';
  }
}

/**
 * Render validation results as a summary banner.
 */
function renderValidationResults(validation) {
  if (!validation) return;

  const banner = document.getElementById('validation-banner');
  if (!banner) return;

  const flags = validation.flags || [];
  const valid = flags.filter(f => f.status === 'likely_valid').length;
  const uncertain = flags.filter(f => f.status === 'uncertain').length;
  const invalid = flags.filter(f => f.status === 'likely_invalid').length;
  const total = flags.length;
  const score = validation.confidence_score != null ? Math.round(validation.confidence_score * 100) : null;

  let html = '<div class="validation-summary">';
  html += '<strong>🔍 Source Validation:</strong> ';
  html += '<span class="val-valid">✅ ' + valid + ' confirmed</span>';
  if (uncertain > 0) html += ' · <span class="val-uncertain">⚠️ ' + uncertain + ' uncertain</span>';
  if (invalid > 0) html += ' · <span class="val-invalid">❌ ' + invalid + ' flagged</span>';
  html += ' · <span class="val-total">' + total + ' total checked</span>';
  if (score !== null) html += ' · <span class="val-score">Confidence: ' + score + '%</span>';
  html += '</div>';

  if (validation.validation_summary) {
    html += '<div class="validation-detail">' + escHtml(validation.validation_summary) + '</div>';
  }

  // Expandable details section — lists ALL flags so users can always find every flagged item
  if (flags.length > 0) {
    html += '<details class="validation-flags-details">';
    html += '<summary class="validation-flags-toggle">Show all ' + flags.length + ' validation results</summary>';
    html += '<div class="validation-flags-list">';
    flags.forEach((f, i) => {
      const icon = f.status === 'likely_valid' ? '✅' : f.status === 'uncertain' ? '⚠️' : '❌';
      const statusLabel = f.status === 'likely_valid' ? 'confirmed' : f.status === 'uncertain' ? 'uncertain' : 'flagged';
      const sectionLabel = (f.section || '').replace(/_/g, ' ');
      const featureLabel = f.feature_index != null ? ' → feature ' + (f.feature_index + 1) : '';
      html += '<div class="validation-flag-item val-flag-' + f.status.replace('likely_', '') + '">';
      html += '<span class="val-flag-icon">' + icon + '</span> ';
      html += '<strong>' + escHtml(sectionLabel) + ' #' + (f.item_index + 1) + featureLabel + '</strong>';
      html += ' · <span class="val-flag-field">' + escHtml(f.field || '') + '</span>';
      html += ' · <em>' + statusLabel + '</em>';
      if (f.reason) html += '<div class="val-flag-reason">' + escHtml(f.reason) + '</div>';
      if (f.suggested_fix) html += '<div class="val-flag-fix">→ ' + escHtml(f.suggested_fix) + '</div>';
      html += '</div>';
    });
    html += '</div></details>';
  }

  banner.innerHTML = html;
  banner.style.display = '';
}

// ── EXPORT HANDLERS ──
function doExportMd() {
  if (!lastResult) return;
  exportMarkdown(lastResult.stage1, lastResult.stage2, projectSlug);
}

function doExportDocx() {
  if (!lastResult) return;
  exportDocx(lastResult.stage1, lastResult.stage2, projectSlug);
}

function doExportPptx() {
  if (!lastResult) return;
  exportPptx(lastResult.stage1, lastResult.stage2, projectSlug);
}

function doCopy() {
  if (!lastResult) return;
  copyToClipboard(lastResult.stage1, lastResult.stage2, projectSlug);
}

// ── JSON SAVE / LOAD HANDLERS ──
function doExportJSON() {
  exportJSON(projectSlug, lastResult);
}

function doImportJSON(evt) {
  const file = evt.target.files[0];
  if (!file) return;

  importJSON(file, (template) => {
    // Restore input fields
    if (template.projectSlug !== undefined) {
      const slugEl = document.getElementById('project-slug');
      if (slugEl) slugEl.value = template.projectSlug;
      projectSlug = template.projectSlug;
    }
    if (template.projectContext !== undefined) {
      const ctxEl = document.getElementById('project-context');
      if (ctxEl) {
        ctxEl.value = template.projectContext;
        // Update char count
        const ctxCount = document.getElementById('context-chars');
        if (ctxCount) ctxCount.textContent = template.projectContext.length.toLocaleString() + ' chars';
      }
    }
    if (template.opportunitiesText !== undefined) {
      const oppsEl = document.getElementById('opportunities-text');
      if (oppsEl) {
        oppsEl.value = template.opportunitiesText;
        // Update char count
        const oppsCount = document.getElementById('opps-chars');
        if (oppsCount) oppsCount.textContent = template.opportunitiesText.length.toLocaleString() + ' chars';
      }
    }
    if (template.scanFocus !== undefined) {
      const focusEl = document.getElementById('scan-focus');
      if (focusEl) {
        focusEl.value = template.scanFocus;
        // Show/hide other focus group
        const otherGroup = document.getElementById('other-focus-group');
        if (otherGroup) otherGroup.style.display = template.scanFocus === 'other' ? '' : 'none';
      }
    }
    if (template.otherFocusText !== undefined) {
      const otherEl = document.getElementById('other-focus-text');
      if (otherEl) otherEl.value = template.otherFocusText;
    }

    // Show uploaded file names (informational — actual file content is not stored in JSON)
    if (template.uploadedFileNames && template.uploadedFileNames.length > 0) {
      uploadedFiles = template.uploadedFileNames.map(name => ({
        name: name,
        size: 0,
        text: ''
      }));
      renderFileList();
      showToast('ℹ File names restored. Re-upload files if you need their content for a new scan.');
    }

    // Restore results if present
    if (template.results && template.results.stage1 && template.results.stage2) {
      lastResult = {
        stage1: template.results.stage1,
        stage2: template.results.stage2,
        model: template.results.model || '',
        elapsed: template.results.elapsed || '',
        usage: template.results.usage || null,
      };
      // Initialise cumulative usage
      cumulativeUsage = {
        prompt_tokens: lastResult.usage?.prompt_tokens || 0,
        completion_tokens: lastResult.usage?.completion_tokens || 0,
        total_tokens: lastResult.usage?.total_tokens || 0,
        validationTokens: template.results.validationUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      // Restore validation state if present
      if (template.validation) {
        lastValidation = template.validation;
        validationMap = template.validationMap || buildValidationMap(template.validation.flags);
      } else {
        lastValidation = null;
        validationMap = {};
      }

      renderOutput(lastResult);
      enableExportButtons(true);

      // Render validation banner and usage stats if validation was saved
      if (lastValidation) {
        renderValidationResults(lastValidation);
        renderUsageStats();
      }
    }

    const savedAtMsg = template.savedAt
      ? ' (saved ' + new Date(template.savedAt).toLocaleString() + ')'
      : '';
    showToast('📂 Loaded ' + file.name + savedAtMsg);
  });

  // Reset input so the same file can be re-imported
  evt.target.value = '';
}

// ── UTILITIES ──
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
