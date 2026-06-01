// ============================================================
// APP — Orchestrator
// Upload → Parse → 3 API batches → Preview → Copy
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  initSettings();
  initDropZone();
  initCopyButtons();
  checkCredentials();
});

// ── Settings Modal ───────────────────────────────────────────

function initSettings() {
  const btn     = document.getElementById('btn-settings');
  const modal   = document.getElementById('settings-modal');
  const overlay = document.getElementById('settings-overlay');
  const form    = document.getElementById('settings-form');
  const closeBtn = document.getElementById('btn-settings-close');

  function openModal() {
    document.getElementById('input-endpoint').value = localStorage.getItem('casestudy_api_endpoint') || '';
    document.getElementById('input-apikey').value   = localStorage.getItem('casestudy_api_key') || '';
    document.getElementById('input-model').value    = localStorage.getItem('casestudy_api_model') || 'claude-sonnet-4-6';
    modal.classList.add('open');
    overlay.classList.add('open');
  }

  function closeModal() {
    modal.classList.remove('open');
    overlay.classList.remove('open');
  }

  btn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const endpoint = document.getElementById('input-endpoint').value.trim();
    const apiKey   = document.getElementById('input-apikey').value.trim();
    const model    = document.getElementById('input-model').value.trim();
    saveApiCredentials(endpoint, apiKey, model);
    closeModal();
    checkCredentials();
    showToast('Settings saved.', 'success');
  });
}

function checkCredentials() {
  const banner = document.getElementById('credentials-banner');
  if (!hasCredentials()) {
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

// ── Drop Zone ────────────────────────────────────────────────

function initDropZone() {
  const zone    = document.getElementById('drop-zone');
  const input   = document.getElementById('file-input');
  const btnOpen = document.getElementById('btn-open-settings-from-banner');

  if (btnOpen) {
    btnOpen.addEventListener('click', function () {
      document.getElementById('btn-settings').click();
    });
  }

  zone.addEventListener('click', function () {
    input.click();
  });

  zone.addEventListener('dragover', function (e) {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', function () {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', function (e) {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  input.addEventListener('change', function () {
    if (input.files[0]) handleFile(input.files[0]);
    input.value = '';
  });
}

// ── File Handling ────────────────────────────────────────────

async function handleFile(file) {
  if (!file.name.match(/\.pptx$/i)) {
    showToast('Please upload a .pptx file.', 'error');
    return;
  }

  if (!hasCredentials()) {
    showToast('Please configure your API key in Settings before extracting.', 'error');
    document.getElementById('btn-settings').click();
    return;
  }

  // Reset state
  CaseStudyState.reset();
  hidePreview();
  showProgress(true);
  setProgressStep(0, 'Reading presentation…');

  // Step 1: Parse PPTX
  let slides;
  try {
    slides = await PptxParser.parsePptx(file);
  } catch (err) {
    showProgress(false);
    showToast('Could not parse file: ' + err.message, 'error');
    return;
  }

  CaseStudyState.setFile(file.name, slides);
  CaseStudyState.setStatus('extracting');

  updateFileInfo(file.name, slides.length);

  // Step 2: Run 3 API batches sequentially
  const rawText = CaseStudyState.getRawText();
  const totalBatches = CASE_STUDY_BATCHES.length;

  for (let i = 0; i < totalBatches; i++) {
    const batch = CASE_STUDY_BATCHES[i];
    setProgressStep(i + 1, batch.label, totalBatches + 1);

    let result;
    try {
      result = await callApiJson(
        CASE_STUDY_SYSTEM_PROMPT,
        batch.buildPrompt(rawText)
      );
    } catch (err) {
      showProgress(false);
      CaseStudyState.setStatus('error');
      showToast('Extraction failed during "' + batch.label + '": ' + err.message, 'error');
      return;
    }

    // Store each slide's data from the batch result
    batch.slides.forEach(function (slideKey) {
      if (result[slideKey] !== undefined) {
        CaseStudyState.setExtracted(slideKey, result[slideKey]);
      } else {
        CaseStudyState.setExtracted(slideKey, {});
      }
    });
  }

  // Step 3: Render preview
  setProgressStep(totalBatches + 1, 'Rendering preview…', totalBatches + 1);
  CaseStudyState.setStatus('done');

  setTimeout(function () {
    showProgress(false);
    renderPreview();
    showToast('Extraction complete! Review the content below.', 'success');
  }, 300);
}

// ── Progress ─────────────────────────────────────────────────

function showProgress(visible) {
  const el = document.getElementById('progress-section');
  el.style.display = visible ? 'block' : 'none';
}

function setProgressStep(step, label, total) {
  total = total || 4;
  const pct = Math.round((step / total) * 100);
  document.getElementById('progress-label').textContent = label;
  document.getElementById('progress-bar-fill').style.width = pct + '%';
  document.getElementById('progress-bar-fill').setAttribute('aria-valuenow', pct);
}

// ── File Info ────────────────────────────────────────────────

function updateFileInfo(filename, slideCount) {
  const el = document.getElementById('file-info');
  el.style.display = 'flex';
  document.getElementById('file-info-name').textContent = filename;
  document.getElementById('file-info-slides').textContent = slideCount + ' slides detected';
}

// ── Preview ──────────────────────────────────────────────────

function renderPreview() {
  const container = document.getElementById('preview-container');
  const section   = document.getElementById('preview-section');

  container.innerHTML = CaseStudyPreview.render();
  section.style.display = 'block';

  // Scroll to preview
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Attach per-slide copy buttons
  container.querySelectorAll('.btn-copy-slide').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const slideKey = btn.dataset.slide;
      const text = CaseStudyPreview.buildPlainText(slideKey);
      copyToClipboard(text, btn);
    });
  });
}

function hidePreview() {
  document.getElementById('preview-section').style.display = 'none';
  document.getElementById('file-info').style.display = 'none';
  document.getElementById('preview-container').innerHTML = '';
}

// ── Copy Buttons ─────────────────────────────────────────────

function initCopyButtons() {
  const btnCopyAll = document.getElementById('btn-copy-all');
  if (btnCopyAll) {
    btnCopyAll.addEventListener('click', function () {
      const text = CaseStudyPreview.buildAllPlainText();
      copyToClipboard(text, btnCopyAll);
    });
  }
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(function () {
    const original = btn.textContent;
    btn.textContent = '✅ Copied!';
    btn.disabled = true;
    setTimeout(function () {
      btn.textContent = original;
      btn.disabled = false;
    }, 2000);
  }).catch(function () {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Copied to clipboard.', 'success');
  });
}

// ── Toast ────────────────────────────────────────────────────

function showToast(message, type) {
  type = type || 'info';
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast toast--' + type;
  toast.textContent = message;
  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(function () {
    toast.classList.add('toast--visible');
  });

  setTimeout(function () {
    toast.classList.remove('toast--visible');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4000);
}
