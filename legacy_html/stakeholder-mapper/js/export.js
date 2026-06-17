// ============================================================
// SDC Stakeholder Mapper — export.js
// SVG, PNG, PowerPoint, CSV, JSON, Mermaid exports
// ============================================================

// ── NSW Gov branding constants ─────────────────────────────
const EX = {
  NAVY:    '002664',
  RED:     'D7153A',
  WHITE:   'FFFFFF',
  FONT:    'Public Sans',
  FONT_FB: 'Arial',
};

// ── SVG export ─────────────────────────────────────────────

/**
 * Serialise the current D3 SVG to a downloadable SVG file.
 * Embeds font-face and inline styles for portability.
 */
function smExportSvg() {
  const svgEl = document.querySelector('#sm-matrix-container svg');
  if (!svgEl) {
    smToast('Switch to the Power/Interest Matrix view first.', 'error');
    return;
  }

  const clone = svgEl.cloneNode(true);

  // Add XML namespace
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  // Embed minimal CSS for portability
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `
    text { font-family: 'Public Sans', Arial, sans-serif; }
    .quadrant-label { font-size: 11px; font-weight: 700; fill: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .axis-label { font-size: 11px; fill: #6b7280; font-weight: 600; }
    .stakeholder-label { font-size: 11px; fill: #1a1a2e; }
    .leader-line { stroke: #d1d5db; stroke-width: 1; }
    .axis-line { stroke: #d1d5db; stroke-width: 1; }
    .divider-line { stroke: #e5e7eb; stroke-width: 1; stroke-dasharray: 4,4; }
    .stakeholder-circle { stroke: rgba(255,255,255,0.6); stroke-width: 1.5; }
  `;
  clone.insertBefore(style, clone.firstChild);

  const serialiser = new XMLSerializer();
  const svgStr = serialiser.serializeToString(clone);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  smDownload(blob, smFilename('svg'));
  smToast('SVG downloaded — imports cleanly into Miro, Figma, Confluence.');
}

// ── PNG export ─────────────────────────────────────────────

/**
 * Convert the SVG to a high-res PNG via canvas.
 */
async function smExportPng() {
  const svgEl = document.querySelector('#sm-matrix-container svg');
  if (!svgEl) {
    smToast('Switch to the Power/Interest Matrix view first.', 'error');
    return;
  }

  try {
    smToast('Generating PNG…');
    const scale = 2; // retina
    const w = parseInt(svgEl.getAttribute('width'))  || 800;
    const h = parseInt(svgEl.getAttribute('height')) || 600;

    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      text { font-family: Arial, sans-serif; }
      .quadrant-label { font-size: 11px; font-weight: 700; fill: #9ca3af; }
      .axis-label { font-size: 11px; fill: #6b7280; font-weight: 600; }
      .stakeholder-label { font-size: 11px; fill: #1a1a2e; }
      .leader-line { stroke: #d1d5db; stroke-width: 1; }
      .axis-line { stroke: #d1d5db; stroke-width: 1; }
      .divider-line { stroke: #e5e7eb; stroke-width: 1; stroke-dasharray: 4,4; }
      .stakeholder-circle { stroke: rgba(255,255,255,0.6); stroke-width: 1.5; }
    `;
    clone.insertBefore(style, clone.firstChild);

    const svgStr = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(blob => {
        smDownload(blob, smFilename('png'));
        smToast('PNG downloaded.');
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      smToast('PNG export failed. Try SVG instead.', 'error');
    };
    img.src = url;
  } catch (err) {
    smToast('PNG export failed: ' + err.message, 'error');
  }
}

// ── PowerPoint export ──────────────────────────────────────

/**
 * Export the current view as a PowerPoint slide with NSW Gov branding.
 * Uses pptxgenjs (loaded from lib/pptxgen.bundle.js).
 */
async function smExportPptx() {
  if (typeof PptxGenJS === 'undefined') {
    smToast('PowerPoint library not loaded.', 'error');
    return;
  }

  const svgEl = document.querySelector('#sm-matrix-container svg');
  if (!svgEl) {
    smToast('Switch to the Power/Interest Matrix view first.', 'error');
    return;
  }

  try {
    smToast('Generating PowerPoint…');

    // Serialise SVG to data URI
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `text { font-family: Arial, sans-serif; } .quadrant-label { font-size: 11px; font-weight: 700; fill: #9ca3af; } .axis-label { font-size: 11px; fill: #6b7280; } .stakeholder-label { font-size: 11px; fill: #1a1a2e; } .leader-line { stroke: #d1d5db; stroke-width: 1; } .axis-line { stroke: #d1d5db; stroke-width: 1; } .divider-line { stroke: #e5e7eb; stroke-width: 1; stroke-dasharray: 4,4; } .stakeholder-circle { stroke: rgba(255,255,255,0.6); stroke-width: 1.5; }`;
    clone.insertBefore(style, clone.firstChild);
    const svgStr = new XMLSerializer().serializeToString(clone);
    const svgDataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33" × 7.5"

    const slide = pptx.addSlide();

    // Navy header bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: 0.65,
      fill: { color: EX.NAVY },
    });

    // Tool name in header
    slide.addText('SDC Stakeholder Mapper', {
      x: 0.3, y: 0.08, w: 8, h: 0.5,
      fontSize: 14, bold: true, color: EX.WHITE,
      fontFace: EX.FONT_FB,
    });

    // NSW Gov label right
    slide.addText('NSW Department of Education', {
      x: 9, y: 0.08, w: 4, h: 0.5,
      fontSize: 11, color: EX.WHITE, align: 'right',
      fontFace: EX.FONT_FB,
    });

    // Diagram title
    const title = smState.projectTitle
      ? smState.projectTitle + ' — Stakeholder Power/Interest Matrix'
      : 'Stakeholder Power/Interest Matrix';
    slide.addText(title, {
      x: 0.3, y: 0.75, w: 12.7, h: 0.4,
      fontSize: 13, bold: true, color: EX.NAVY,
      fontFace: EX.FONT_FB,
    });

    // SVG diagram image
    slide.addImage({
      data: svgDataUri,
      x: 0.3, y: 1.2, w: 12.7, h: 5.6,
    });

    // Footer
    const dateStr = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    slide.addText(`Generated by SDC Stakeholder Mapper · ${dateStr}`, {
      x: 0.3, y: 7.1, w: 12.7, h: 0.3,
      fontSize: 9, color: '9ca3af', align: 'left',
      fontFace: EX.FONT_FB,
    });

    await pptx.writeFile({ fileName: smFilename('pptx') });
    smToast('PowerPoint downloaded.');
  } catch (err) {
    smToast('PowerPoint export failed: ' + err.message, 'error');
  }
}

// ── CSV export ─────────────────────────────────────────────

/**
 * Export the RACI matrix as a CSV file.
 */
function smExportCsv() {
  const stakeholders = smState.stakeholders;
  const phases = smState.phases;

  if (stakeholders.length === 0) {
    smToast('No stakeholders to export.', 'error');
    return;
  }

  const headers = ['Name', 'Team', 'Group', 'Power (0-10)', 'Interest (0-10)', ...phases, 'Notes'];
  const rows = stakeholders.map(s => [
    csvEscape(s.name),
    csvEscape(s.team),
    csvEscape(smGroupLabel(s.group)),
    Math.round(s.power * 10),
    Math.round(s.interest * 10),
    ...phases.map(p => csvEscape(s.raci[p.toLowerCase()] || '—')),
    csvEscape(s.notes),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  smDownload(blob, smFilename('csv'));
  smToast('RACI CSV downloaded — opens in Excel.');
}

function csvEscape(val) {
  const str = String(val || '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ── JSON export ────────────────────────────────────────────

/**
 * Save the full stakeholder map as a JSON file for reload.
 */
function smExportJson() {
  const data = smSerialise();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  smDownload(blob, smFilename('json'));
  smToast('Map saved as JSON — load it next time with "Load saved map".');
}

// ── Mermaid export ─────────────────────────────────────────

/**
 * Copy a simplified Mermaid quadrantChart to clipboard.
 * Lossy — group colours and interactivity are not preserved.
 */
function smExportMermaid() {
  const code = smGenerateMermaid(smState.stakeholders, smState.projectTitle);
  navigator.clipboard.writeText(code).then(() => {
    smToast('Mermaid code copied — paste into Confluence or a markdown doc. Note: simplified version only.');
  }).catch(() => {
    // Fallback: show in a prompt
    window.prompt('Copy this Mermaid code:', code);
  });
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Trigger a file download.
 * @param {Blob} blob
 * @param {string} filename
 */
function smDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Generate a filename with project title and date.
 * @param {string} ext  — file extension without dot
 * @returns {string}
 */
function smFilename(ext) {
  const title = (smState.projectTitle || 'stakeholder-map')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
  const date = new Date().toISOString().split('T')[0];
  return `${title}-${date}.${ext}`;
}

// ── Export menu toggle ─────────────────────────────────────

function smCloseExportMenu() {
  document.getElementById('sm-export-menu')?.classList.remove('open');
  document.getElementById('sm-export-btn')?.setAttribute('aria-expanded', 'false');
}

function smSetupExportDropdown() {
  const btn  = document.getElementById('sm-export-btn');
  const menu = document.getElementById('sm-export-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    menu.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('click', () => smCloseExportMenu());
}
