// ============================================================
// Mermaid Diagram Builder — preview.js
// Mermaid rendering + SVG/PNG/PPTX/copy export
// ============================================================

let _previewDebounceTimer = null;
let _currentSvg = '';
let _currentTheme = 'default';
let _zoomLevel = 1.0;

// ── Mermaid initialisation ─────────────────────────────────
function previewInit() {
  mermaid.initialize({
    startOnLoad: false,
    theme: _currentTheme,
    securityLevel: 'loose',
    fontFamily: "'Public Sans', 'Segoe UI', sans-serif",
    flowchart: { useMaxWidth: false, htmlLabels: true },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
  });
}

// ── Set theme and re-render ────────────────────────────────
function previewSetTheme(theme) {
  _currentTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    theme: _currentTheme,
    securityLevel: 'loose',
    fontFamily: "'Public Sans', 'Segoe UI', sans-serif",
    flowchart: { useMaxWidth: false, htmlLabels: true },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
  });
  // Re-render with current code
  const code = document.getElementById('mermaid-code-input')?.value || '';
  if (code.trim()) previewRender(code);
}

// ── Debounced render (called on keyup) ─────────────────────
function previewScheduleRender(code, delayMs) {
  if (delayMs === undefined) delayMs = 350;
  clearTimeout(_previewDebounceTimer);
  _previewDebounceTimer = setTimeout(() => previewRender(code), delayMs);
}

// ── Core render function ───────────────────────────────────
async function previewRender(code) {
  const output = document.getElementById('diagram-output');
  const errorBar = document.getElementById('code-error-bar');
  if (!output) return;

  const trimmed = (code || '').trim();
  if (!trimmed) {
    output.innerHTML = `
      <div class="preview-empty">
        <div class="preview-empty-icon">📊</div>
        <div>Your diagram will appear here</div>
      </div>`;
    _currentSvg = '';
    if (errorBar) { errorBar.textContent = ''; errorBar.classList.remove('visible'); }
    return;
  }

  try {
    // Unique ID to avoid mermaid caching issues
    const id = 'mermaid-render-' + Date.now();
    const { svg } = await mermaid.render(id, trimmed);
    _currentSvg = svg;
    output.innerHTML = svg;

    // Fix SVG sizing — preserve viewBox aspect ratio, don't collapse height
    const svgEl = output.querySelector('svg');
    if (svgEl) {
      // Get natural dimensions from viewBox or width/height attributes
      let vbW = 0, vbH = 0;
      const vb = svgEl.getAttribute('viewBox');
      if (vb) {
        const parts = vb.trim().split(/[\s,]+/);
        if (parts.length === 4) { vbW = parseFloat(parts[2]); vbH = parseFloat(parts[3]); }
      }
      if (!vbW) vbW = parseFloat(svgEl.getAttribute('width')) || 800;
      if (!vbH) vbH = parseFloat(svgEl.getAttribute('height')) || 400;

      // Set viewBox if missing so aspect ratio is preserved
      if (!vb && vbW && vbH) {
        svgEl.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
      }

      // Remove fixed pixel dimensions — let CSS control display size
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.style.width = '100%';
      svgEl.style.height = 'auto';
      svgEl.style.display = 'block';
    }

    // Apply current zoom
    previewApplyZoom();

    if (errorBar) { errorBar.textContent = ''; errorBar.classList.remove('visible'); }
  } catch (err) {
    _currentSvg = '';
    output.innerHTML = `
      <div class="preview-error">
        <strong>⚠️ Diagram error</strong><br>
        ${escapeHtml(err.message || String(err))}
      </div>`;
    if (errorBar) {
      errorBar.textContent = '⚠️ ' + (err.message || 'Syntax error in diagram');
      errorBar.classList.add('visible');
    }
  }
}

// ── Get current SVG string ─────────────────────────────────
function previewGetSvg() {
  return _currentSvg;
}

// ── Zoom controls ──────────────────────────────────────────
function previewZoomIn() {
  _zoomLevel = Math.min(4.0, _zoomLevel + 0.25);
  previewApplyZoom();
}

function previewZoomOut() {
  _zoomLevel = Math.max(0.25, _zoomLevel - 0.25);
  previewApplyZoom();
}

function previewZoomFit() {
  _zoomLevel = 1.0;
  previewApplyZoom();
}

function previewApplyZoom() {
  const svgEl = document.querySelector('#diagram-output svg');
  if (!svgEl) return;
  svgEl.style.transform = `scale(${_zoomLevel})`;
  svgEl.style.transformOrigin = 'top center';
  // Update zoom label
  const label = document.getElementById('zoom-label');
  if (label) label.textContent = Math.round(_zoomLevel * 100) + '%';
}

// ── Export: Copy Mermaid code ──────────────────────────────
function exportCopyCode() {
  const code = document.getElementById('mermaid-code-input')?.value || '';
  if (!code.trim()) { showToast('Nothing to copy — diagram is empty', 'error'); return; }
  navigator.clipboard.writeText(code.trim()).then(() => {
    showToast('✓ Mermaid code copied to clipboard');
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = code.trim();
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✓ Mermaid code copied to clipboard');
  });
}

// ── Export: Download .mmd file ─────────────────────────────
function exportDownloadMmd() {
  const code = document.getElementById('mermaid-code-input')?.value || '';
  if (!code.trim()) { showToast('Nothing to export — diagram is empty', 'error'); return; }
  const title = getDiagramTitle();
  const filename = slugify(title || 'diagram') + '.mmd';
  downloadBlob(new Blob([code.trim()], { type: 'text/plain' }), filename);
  showToast('✓ Downloaded ' + filename);
}

// ── Export: Download SVG ───────────────────────────────────
function exportDownloadSvg() {
  if (!_currentSvg) { showToast('Render a diagram first', 'error'); return; }
  const title = getDiagramTitle();
  const filename = slugify(title || 'diagram') + '.svg';

  // Add XML declaration and namespace if missing
  let svgContent = _currentSvg;
  if (!svgContent.includes('xmlns=')) {
    svgContent = svgContent.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  }

  downloadBlob(new Blob([svgContent], { type: 'image/svg+xml' }), filename);
  showToast('✓ Downloaded ' + filename);
}

// ── Export: Download PNG ───────────────────────────────────
async function exportDownloadPng() {
  if (!_currentSvg) { showToast('Render a diagram first', 'error'); return; }

  try {
    showToast('⏳ Generating PNG…');
    const png = await svgToPngDataUrl(_currentSvg, 2);
    const title = getDiagramTitle();
    const filename = slugify(title || 'diagram') + '.png';
    downloadDataUrl(png, filename);
    showToast('✓ Downloaded ' + filename);
  } catch (err) {
    showToast('PNG export failed: ' + err.message, 'error');
  }
}

// ── Export: PowerPoint ─────────────────────────────────────
async function exportDownloadPptx() {
  if (!_currentSvg) { showToast('Render a diagram first', 'error'); return; }
  if (typeof PptxGenJS === 'undefined') {
    showToast('PowerPoint library not loaded', 'error');
    return;
  }

  try {
    showToast('⏳ Generating PowerPoint…');

    const title = getDiagramTitle() || 'Diagram';
    const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

    // Convert SVG to PNG data URL for embedding
    const pngDataUrl = await svgToPngDataUrl(_currentSvg, 2);

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33" × 7.5"

    const slide = pptx.addSlide();

    // ── Navy header bar ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 13.33, h: 0.65,
      fill: { color: '1A3A5C' },
      line: { color: '1A3A5C' },
    });

    // Tool name in header
    slide.addText('Mermaid Diagram Builder', {
      x: 0.2, y: 0, w: 8, h: 0.65,
      fontSize: 16,
      bold: true,
      color: 'FFFFFF',
      fontFace: 'Calibri',
      valign: 'middle',
    });

    // NSW Gov branding in header (right side)
    slide.addText('NSW Department of Education · HCD Pilot', {
      x: 7, y: 0, w: 6.13, h: 0.65,
      fontSize: 10,
      color: 'AABBCC',
      fontFace: 'Calibri',
      valign: 'middle',
      align: 'right',
    });

    // ── Diagram title ──
    slide.addText(title, {
      x: 0.3, y: 0.75, w: 12.73, h: 0.45,
      fontSize: 18,
      bold: true,
      color: '1A3A5C',
      fontFace: 'Calibri',
    });

    // ── Diagram image ──
    // Calculate dimensions to fit within 12.5" × 5.4" area, centred
    const maxW = 12.5;
    const maxH = 5.4;
    const svgEl = document.querySelector('#diagram-output svg');
    let imgW = maxW;
    let imgH = maxH;

    if (svgEl) {
      const vb = svgEl.viewBox?.baseVal;
      const naturalW = vb?.width || svgEl.getBoundingClientRect().width || 800;
      const naturalH = vb?.height || svgEl.getBoundingClientRect().height || 600;
      const ratio = naturalW / naturalH;
      if (ratio > maxW / maxH) {
        imgW = maxW;
        imgH = maxW / ratio;
      } else {
        imgH = maxH;
        imgW = maxH * ratio;
      }
    }

    const imgX = (13.33 - imgW) / 2;
    const imgY = 1.3 + (maxH - imgH) / 2;

    slide.addImage({
      data: pngDataUrl,
      x: imgX, y: imgY, w: imgW, h: imgH,
    });

    // ── Footer ──
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 7.22, w: 13.33, h: 0.28,
      fill: { color: 'E8EAF0' },
      line: { color: 'D0D4E0' },
    });
    slide.addText(`${title}  ·  Generated by SDC Mermaid Builder  ·  ${today}`, {
      x: 0.2, y: 7.22, w: 12.93, h: 0.28,
      fontSize: 8,
      color: '6B7280',
      fontFace: 'Calibri',
      valign: 'middle',
    });

    const filename = slugify(title) + '.pptx';
    await pptx.writeFile({ fileName: filename });
    showToast('✓ Downloaded ' + filename);
  } catch (err) {
    console.error('PPTX export error:', err);
    showToast('PowerPoint export failed: ' + err.message, 'error');
  }
}

// ── Export: Save JSON ──────────────────────────────────────
function exportSaveJson() {
  const code = document.getElementById('mermaid-code-input')?.value || '';
  if (!code.trim()) { showToast('Nothing to save — diagram is empty', 'error'); return; }

  const title = getDiagramTitle();
  const diagramType = mdDetectDiagramType(code);

  const payload = {
    _tool: 'sdc-mermaid-builder',
    _version: '1.0',
    title: title || 'Untitled Diagram',
    diagramType,
    mermaidCode: code.trim(),
    theme: _currentTheme,
    savedAt: new Date().toISOString(),
  };

  const filename = slugify(title || 'diagram') + '-' + new Date().toISOString().split('T')[0] + '.json';
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    filename
  );
  showToast('✓ Saved ' + filename);
}

// ── Load from JSON ─────────────────────────────────────────
function previewLoadJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.mermaidCode) throw new Error('No mermaidCode field found in JSON');

      // Set code
      const codeInput = document.getElementById('mermaid-code-input');
      if (codeInput) codeInput.value = data.mermaidCode;

      // Set title
      const titleInput = document.getElementById('diagram-title-input');
      if (titleInput && data.title) titleInput.value = data.title;

      // Set theme
      if (data.theme) {
        _currentTheme = data.theme;
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) themeSelect.value = data.theme;
        previewSetTheme(data.theme);
      }

      // Render
      previewRender(data.mermaidCode);

      // Switch to editor screen
      appShowEditor();
      showToast('✓ Diagram loaded');
    } catch (err) {
      showToast('Failed to load JSON: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ── Helpers ────────────────────────────────────────────────

function getDiagramTitle() {
  return (document.getElementById('diagram-title-input')?.value || '').trim();
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'diagram';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 500);
}

/**
 * Convert an SVG string to a PNG data URL via canvas.
 * @param {string} svgString
 * @param {number} scale  pixel density multiplier (2 = 2x for retina)
 * @returns {Promise<string>} data URL
 */
function svgToPngDataUrl(svgString, scale) {
  scale = scale || 2;
  return new Promise((resolve, reject) => {
    // Ensure SVG has xmlns
    let svg = svgString;
    if (!svg.includes('xmlns=')) {
      svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }

    // Parse dimensions from SVG
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) { reject(new Error('Could not parse SVG')); return; }

    let w = parseFloat(svgEl.getAttribute('width')) || 800;
    let h = parseFloat(svgEl.getAttribute('height')) || 600;

    // Try viewBox if width/height are missing or tiny
    const vb = svgEl.getAttribute('viewBox');
    if (vb && (w < 10 || h < 10)) {
      const parts = vb.split(/[\s,]+/);
      if (parts.length === 4) { w = parseFloat(parts[2]); h = parseFloat(parts[3]); }
    }

    // Clamp to reasonable max
    const maxDim = 4000;
    if (w > maxDim) { h = h * maxDim / w; w = maxDim; }
    if (h > maxDim) { w = w * maxDim / h; h = maxDim; }

    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG as image'));
    };
    img.src = url;
  });
}

// ── Toast notification ─────────────────────────────────────
function showToast(message, type) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'show' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = ''; }, 3000);
}
