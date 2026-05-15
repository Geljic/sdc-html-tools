// ============================================================
// SDC Weekly Status Report — app.js
// Form logic · SVG preview · PPTX export · localStorage · JSON I/O
// ============================================================

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'sdc-status-report-v1';

// PPTX slide dimensions (inches, LAYOUT_WIDE 13.33 × 7.5)
const SW = 13.33, SH = 7.5;

// Logo — top-right on WHITE background (not on navy bar), DoE style guide compliant
// Logo sits in the OFFICIAL strip area + a little below, on white
const LOGO_W = 0.55, LOGO_H = 0.62;
const LOGO_X = SW - LOGO_W - 0.08;  // 12.70"
const LOGO_Y = 0.04;                 // just below top edge, on white

// Table spans full slide width
const TABLE_W = SW;  // 13.33"

// Column layout (inches)
const COL_LABEL_X = 0,    COL_LABEL_W = 2.0;
const COL_ACH_X   = 2.0,  COL_ACH_W   = 5.665;
const COL_NEXT_X  = 7.665, COL_NEXT_W  = 5.665;

// Row heights
const HDR_ROW_H   = 0.65;  // column header row
const TITLE_H     = 0.50;  // slide title bar — compact, logo is above on white
const LEGEND_H    = 0.38;  // legend bar at bottom
const OFFICIAL_H  = 0.22;  // OFFICIAL text strip
const SUPPORT_H   = 0.80;  // support required section (when shown)
const MIN_ROW_H   = 0.70;  // minimum stream row height

// DoE brand colours (no # prefix for pptxgenjs) — NSW DoE official palette
const C = {
  navy:     '1A3A5C',   // DOE_NAVY — primary header/section background
  navyMid:  '2E4070',
  red:      'D7153A',   // DOE_RED — NSW Gov primary accent, OFFICIAL text
  white:    'FFFFFF',
  dark:     '22272B',   // body text (near-black)
  lightBlue:'EBF4FF',   // alternating rows, legend background
  accent:   '4A90D9',   // borders, secondary accents
  green:    '5CB85C',   // DOE_GREEN — on track
  amber:    'F0AD4E',   // DOE_AMBER — at risk
  riskRed:  'D9534F',   // DOE_RISK_RED — off track / blocked
  offWhite: 'F8F9FA',
  border:   'D0D4E0',
};

const RAG_COLOURS = {
  green: C.green,
  amber: C.amber,
  red:   C.riskRed,
  navy:  C.navy,
};

const RAG_LABELS = {
  green: 'On track',
  amber: 'At risk',
  red:   'Off track / blocked',
  navy:  'Info / FYI',
};

// Fonts — Public Sans (DoE brand)
const F = { heading: 'Public Sans', body: 'Public Sans' };

// SVG preview scale: viewBox is 1333×750 (100× the inch dimensions)
const PX = 100; // 1 inch = 100px in SVG

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  projectName: 'Q+ Service Design and Change',
  weekDate: '',
  nextWeekDate: '',
  streams: [],
  supportText: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m-1]} ${y}`;
}

function addDays(iso, n) {
  if (!iso) return '';
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Get the Monday of the current week (or next Monday if today is weekend)
function thisMonday() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon … 6=Sat
  // If Mon, use today; if Sun, go forward 1; otherwise go back to last Mon
  let diff;
  if (day === 1) diff = 0;
  else if (day === 0) diff = 1;  // Sunday → next Monday
  else diff = 1 - day;           // Tue–Sat → back to Monday
  today.setDate(today.getDate() + diff);
  return today.toISOString().slice(0, 10);
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (type === 'error' ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 2800);
}

// Auto-prefix lines with bullet if they don't already have one
function autoBullet(text) {
  if (!text || !text.trim()) return text;
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    // Already has a bullet, dash, asterisk, or sub-bullet marker
    if (/^[•\-\*◦○▪▸►]/.test(trimmed) || /^\s+o\s/.test(line)) return line;
    return '• ' + trimmed;
  }).join('\n');
}

// ── Default stream factory ────────────────────────────────────────────────────
function newStream(name = '') {
  return {
    id: uid(),
    name,
    rag: 'green',
    subSections: false,
    achieved: '',
    next: '',
    achievedProjectDev: '',
    achievedGovernance: '',
    nextProjectDev: '',
    nextGovernance: '',
  };
}

// ── localStorage ──────────────────────────────────────────────────────────────
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch(e) {}
}

// ── JSON export / import ──────────────────────────────────────────────────────
function exportJSON() {
  collectFormState();
  const filename = `status-report-${state.weekDate || 'draft'}.json`;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast('💾 Saved ' + filename);
}

function importJSON(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      state = { ...state, ...parsed };
      saveState();
      populateForm();
      renderStreams();
      drawPreview();
      showToast('📂 Loaded ' + file.name);
    } catch(err) {
      showToast('❌ Invalid JSON file', 'error');
    }
  };
  reader.readAsText(file);
  evt.target.value = '';
}

// ── Collect form → state ──────────────────────────────────────────────────────
function collectFormState() {
  state.projectName  = document.getElementById('project-name').value.trim();
  state.weekDate     = document.getElementById('week-date').value;
  state.nextWeekDate = document.getElementById('next-week-date').value;
  state.supportText  = document.getElementById('support-text').value.trim();

  state.streams = state.streams.map(s => {
    const card = document.querySelector(`[data-stream-id="${s.id}"]`);
    if (!card) return s;
    return {
      ...s,
      name:                card.querySelector('.stream-name-input').value.trim(),
      rag:                 card.querySelector('.rag-select').value,
      subSections:         card.querySelector('.subsection-cb').checked,
      achieved:            (card.querySelector('.achieved-simple') || {}).value || '',
      next:                (card.querySelector('.next-simple') || {}).value || '',
      achievedProjectDev:  (card.querySelector('.achieved-projdev') || {}).value || '',
      achievedGovernance:  (card.querySelector('.achieved-gov') || {}).value || '',
      nextProjectDev:      (card.querySelector('.next-projdev') || {}).value || '',
      nextGovernance:      (card.querySelector('.next-gov') || {}).value || '',
    };
  });
}

// ── Populate form from state ──────────────────────────────────────────────────
function populateForm() {
  document.getElementById('project-name').value   = state.projectName || '';
  document.getElementById('week-date').value      = state.weekDate || '';
  document.getElementById('next-week-date').value = state.nextWeekDate || '';
  document.getElementById('support-text').value   = state.supportText || '';
}

// ── Render stream cards ───────────────────────────────────────────────────────
function renderStreams() {
  const container = document.getElementById('streams-container');
  container.innerHTML = '';
  state.streams.forEach((s, idx) => {
    container.appendChild(buildStreamCard(s, idx));
  });
}

function buildStreamCard(s, idx) {
  const card = document.createElement('div');
  card.className = 'stream-card';
  card.dataset.streamId = s.id;

  const ragClass = `rag-${s.rag}`;

  card.innerHTML = `
    <div class="stream-card-header">
      <span class="stream-num">Stream ${idx + 1}</span>
      <input class="stream-name-input" type="text" placeholder="Stream name (e.g. Solution 1 – Digital walk through)" value="${escHtml(s.name)}" />
      <select class="rag-select ${ragClass}">
        <option value="green" ${s.rag==='green'?'selected':''}>🟢 On track</option>
        <option value="amber" ${s.rag==='amber'?'selected':''}>🟡 At risk</option>
        <option value="red"   ${s.rag==='red'  ?'selected':''}>🔴 Off track</option>
        <option value="navy"  ${s.rag==='navy' ?'selected':''}>🔵 Info / FYI</option>
      </select>
      <label class="subsection-toggle">
        <input type="checkbox" class="subsection-cb" ${s.subSections?'checked':''} />
        Sub-sections
      </label>
      <button class="btn btn-danger btn-sm" onclick="removeStream('${s.id}')" title="Remove stream">✕</button>
    </div>
    <div class="stream-card-body">
      <div class="stream-cols">
        <div class="stream-col">
          <label>✅ Achieved this week <span style="font-weight:400;color:var(--muted);font-size:11px;">(one item per line — bullets added automatically)</span></label>
          ${s.subSections ? buildSubSectionFields('achieved', s) : `<textarea class="achieved-simple" rows="4" placeholder="Change and comm artefacts in draft&#10;Content being input to UAT&#10;Functional testing with PAS team continues">${escHtml(s.achieved)}</textarea>`}
        </div>
        <div class="stream-col">
          <label>🔜 Next week <span style="font-weight:400;color:var(--muted);font-size:11px;">(one item per line)</span></label>
          ${s.subSections ? buildSubSectionFields('next', s) : `<textarea class="next-simple" rows="4" placeholder="Ongoing development team standups&#10;Functional testing continues&#10;Go live approvals for Release 1">${escHtml(s.next)}</textarea>`}
        </div>
      </div>
    </div>
  `;

  // Wire up RAG select colour change
  const ragSel = card.querySelector('.rag-select');
  ragSel.addEventListener('change', () => {
    ragSel.className = `rag-select rag-${ragSel.value}`;
    onChange();
  });

  // Wire up sub-section toggle
  // IMPORTANT: must read DOM values BEFORE re-rendering, then migrate text
  // between simple/sub-section fields so nothing is lost on toggle.
  const cb = card.querySelector('.subsection-cb');
  cb.addEventListener('change', () => {
    // 1. Capture all current DOM values into state first
    collectFormState();

    // 2. Find the stream and apply the new toggle value
    const stream = state.streams.find(x => x.id === s.id);
    if (!stream) return;
    const turningOn = cb.checked;
    stream.subSections = turningOn;

    // 3. Migrate text so the user doesn't lose content on toggle
    if (turningOn) {
      // Simple → Sub-sections: move simple bullets into Project/Dev if sub-section fields are empty
      if (!stream.achievedProjectDev && stream.achieved) {
        stream.achievedProjectDev = stream.achieved;
        stream.achieved = '';
      }
      if (!stream.nextProjectDev && stream.next) {
        stream.nextProjectDev = stream.next;
        stream.next = '';
      }
    } else {
      // Sub-sections → Simple: move Project/Dev text back into simple field if simple is empty
      if (!stream.achieved && stream.achievedProjectDev) {
        stream.achieved = stream.achievedProjectDev;
        stream.achievedProjectDev = '';
      }
      if (!stream.next && stream.nextProjectDev) {
        stream.next = stream.nextProjectDev;
        stream.nextProjectDev = '';
      }
    }

    // 4. Re-render with updated state
    renderStreams();
    drawPreview();
    saveState();
  });

  // Wire up all inputs
  card.querySelectorAll('input[type="text"], textarea, select').forEach(el => {
    el.addEventListener('input', onChange);
  });

  return card;
}

function buildSubSectionFields(prefix, s) {
  const projVal = prefix === 'achieved' ? escHtml(s.achievedProjectDev) : escHtml(s.nextProjectDev);
  const govVal  = prefix === 'achieved' ? escHtml(s.achievedGovernance)  : escHtml(s.nextGovernance);
  return `
    <div class="subsection-fields">
      <div class="subsection-label">Project / Development: <span style="font-weight:400;color:var(--muted);font-size:11px;">(one item per line)</span></div>
      <textarea class="${prefix}-projdev" rows="3" placeholder="Content document in progress with Janette&#10;Venus has shared 23 user testing nominations&#10;Nick continues drafting the BRD">${projVal}</textarea>
      <div class="subsection-label">Governance &amp; Related Artefacts:</div>
      <textarea class="${prefix}-gov" rows="2" placeholder="N/A">${govVal}</textarea>
    </div>
  `;
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Add / remove streams ──────────────────────────────────────────────────────
function addStream() {
  collectFormState();
  state.streams.push(newStream());
  renderStreams();
  drawPreview();
  saveState();
}

function removeStream(id) {
  collectFormState();
  state.streams = state.streams.filter(s => s.id !== id);
  renderStreams();
  drawPreview();
  saveState();
}

// ── onChange handler ──────────────────────────────────────────────────────────
function onChange() {
  collectFormState();
  drawPreview();
  saveState();
}

// ── Auto-calculate next week date when week-date changes ─────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('week-date').addEventListener('change', e => {
    // Always auto-update next week to +7 days when week-date changes
    document.getElementById('next-week-date').value = addDays(e.target.value, 7);
    onChange();
  });
});

// ── SVG PREVIEW ───────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs, text) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, String(v)));
  if (text !== undefined) el.textContent = text;
  return el;
}

function svgRect(svg, x, y, w, h, fill, stroke, sw2) {
  svg.appendChild(svgEl('rect', {
    x: x*PX, y: y*PX, width: w*PX, height: h*PX,
    fill: '#'+fill,
    ...(stroke ? { stroke: '#'+stroke, 'stroke-width': (sw2||1) } : {}),
  }));
}

function svgText(svg, txt, x, y, opts) {
  if (!txt) return;
  const o = opts || {};
  const el = svgEl('text', {
    x: x*PX,
    y: y*PX,
    fill: '#' + (o.fill || C.dark),
    'font-family': '"Public Sans", "Public Sans SemiBold", Arial, sans-serif',
    'font-size': (o.sz || 10),
    'font-weight': o.bold ? '700' : '400',
    'font-style': o.italic ? 'italic' : 'normal',
    'text-anchor': o.anchor || 'start',
    'dominant-baseline': o.base || 'middle',
  }, txt);
  svg.appendChild(el);
}

function svgLine(svg, x1, y1, x2, y2, stroke, sw2) {
  svg.appendChild(svgEl('line', {
    x1: x1*PX, y1: y1*PX, x2: x2*PX, y2: y2*PX,
    stroke: '#'+stroke, 'stroke-width': sw2||1,
  }));
}

// Wrap text into lines for SVG (simple word-wrap)
function wrapLines(text, maxChars) {
  if (!text) return [];
  const lines = [];
  text.split('\n').forEach(para => {
    if (para.trim() === '') return;
    let cur = '';
    para.split(' ').forEach(word => {
      if ((cur + ' ' + word).trim().length > maxChars) {
        if (cur) lines.push(cur.trim());
        cur = word;
      } else {
        cur = (cur + ' ' + word).trim();
      }
    });
    if (cur) lines.push(cur.trim());
  });
  return lines;
}

// Ensure each non-empty line starts with a bullet for display
function ensureBullets(text) {
  return autoBullet(text || '');
}

function drawPreview() {
  const svg = document.getElementById('preview-svg');
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const s = state;
  const weekLabel     = s.weekDate     ? `w/c ${fmtDate(s.weekDate)}`     : 'w/c [date]';
  const nextWeekLabel = s.nextWeekDate ? `w/c ${fmtDate(s.nextWeekDate)}` : 'w/c [next date]';
  const title = `${s.projectName || 'Project'} update: Week beginning ${fmtDate(s.weekDate) || '[date]'}`;

  // Background
  svgRect(svg, 0, 0, SW, SH, C.white);

  // OFFICIAL top (red, centred)
  svgText(svg, 'OFFICIAL', SW/2, OFFICIAL_H/2, { fill: C.red, bold: true, sz: 9, anchor: 'middle' });

  // NSW Gov logo — top-right on WHITE background (DoE style guide: never on coloured bg)
  if (typeof NSW_LOGO_B64 !== 'undefined' && NSW_LOGO_B64) {
    const img = svgEl('image', {
      href: NSW_LOGO_B64,
      x: LOGO_X * PX, y: LOGO_Y * PX,
      width: LOGO_W * PX, height: LOGO_H * PX,
      preserveAspectRatio: 'xMidYMid meet',
    });
    svg.appendChild(img);
  } else {
    // Fallback placeholder
    svgRect(svg, LOGO_X, LOGO_Y, LOGO_W, LOGO_H, 'F0F2F5', C.border, 0.5);
    svgText(svg, 'NSW', LOGO_X + LOGO_W/2, LOGO_Y + LOGO_H * 0.38, { fill: C.red, sz: 7, anchor: 'middle', bold: true });
    svgText(svg, 'Gov', LOGO_X + LOGO_W/2, LOGO_Y + LOGO_H * 0.68, { fill: C.navy, sz: 6, anchor: 'middle' });
  }

  // Title bar (navy, compact) — sits below OFFICIAL strip, logo is above on white
  svgRect(svg, 0, OFFICIAL_H, SW, TITLE_H, C.navy);
  // Title text — full width (logo is above the bar, not overlapping)
  svgText(svg, title, 0.25, OFFICIAL_H + TITLE_H/2, { fill: C.white, bold: true, sz: 13, anchor: 'start' });

  // Column header row
  const hdrY = OFFICIAL_H + TITLE_H;
  svgRect(svg, COL_LABEL_X, hdrY, COL_LABEL_W, HDR_ROW_H, 'F0F2F5', C.border, 0.5);
  svgText(svg, 'traffic rating reflects', COL_LABEL_X + COL_LABEL_W/2, hdrY + 0.22, { fill: '555555', sz: 8, anchor: 'middle', italic: true });
  svgText(svg, 'likelihood of delivery',  COL_LABEL_X + COL_LABEL_W/2, hdrY + 0.44, { fill: '555555', sz: 8, anchor: 'middle', italic: true });

  svgRect(svg, COL_ACH_X, hdrY, COL_ACH_W, HDR_ROW_H, C.navy, C.navy, 0.5);
  svgText(svg, `What was achieved in the ${weekLabel}`, COL_ACH_X + COL_ACH_W/2, hdrY + HDR_ROW_H/2, { fill: C.white, bold: true, sz: 10, anchor: 'middle' });

  svgRect(svg, COL_NEXT_X, hdrY, COL_NEXT_W, HDR_ROW_H, C.navy, C.navy, 0.5);
  svgText(svg, `What will be achieved in the ${nextWeekLabel}`, COL_NEXT_X + COL_NEXT_W/2, hdrY + HDR_ROW_H/2, { fill: C.white, bold: true, sz: 10, anchor: 'middle' });

  // Calculate available height for stream rows
  const hasSupportText = (s.supportText || '').trim().length > 0;
  const bottomReserved = OFFICIAL_H + LEGEND_H + (hasSupportText ? SUPPORT_H : 0);
  const availH = SH - hdrY - HDR_ROW_H - bottomReserved;
  const numStreams = s.streams.length || 1;
  const rowH = Math.max(MIN_ROW_H, availH / numStreams);

  let curY = hdrY + HDR_ROW_H;

  s.streams.forEach(stream => {
    const ragHex = RAG_COLOURS[stream.rag] || C.navy;

    // Label column (RAG coloured)
    svgRect(svg, COL_LABEL_X, curY, COL_LABEL_W, rowH, ragHex, C.border, 0.5);
    const nameLines = wrapLines(stream.name || 'Stream name', 18);
    const lineH = 0.18;
    const totalTextH = nameLines.length * lineH;
    const textStartY = curY + rowH/2 - totalTextH/2 + lineH/2;
    nameLines.forEach((line, i) => {
      svgText(svg, line, COL_LABEL_X + COL_LABEL_W/2, textStartY + i*lineH, {
        fill: C.white, bold: true, sz: 9, anchor: 'middle',
      });
    });

    // Achieved column
    svgRect(svg, COL_ACH_X, curY, COL_ACH_W, rowH, C.white, C.border, 0.5);
    drawBullets(svg, stream.subSections,
      ensureBullets(stream.achieved), stream.achievedProjectDev, stream.achievedGovernance,
      COL_ACH_X + 0.12, curY + 0.12, COL_ACH_W - 0.2, rowH - 0.16);

    // Next week column
    svgRect(svg, COL_NEXT_X, curY, COL_NEXT_W, rowH, C.white, C.border, 0.5);
    drawBullets(svg, stream.subSections,
      ensureBullets(stream.next), stream.nextProjectDev, stream.nextGovernance,
      COL_NEXT_X + 0.12, curY + 0.12, COL_NEXT_W - 0.2, rowH - 0.16);

    curY += rowH;
  });

  // Support required (optional)
  if (hasSupportText) {
    svgRect(svg, 0, curY, TABLE_W * 0.65, 0.32, C.red, C.red, 0);
    svgText(svg, 'Support required from directors', 0.15, curY + 0.16, { fill: C.white, bold: true, sz: 10 });
    svgRect(svg, 0, curY + 0.32, TABLE_W * 0.65, SUPPORT_H - 0.32, C.white, C.border, 0.5);
    const supportLines = wrapLines(s.supportText, 95);
    supportLines.slice(0, 3).forEach((line, i) => {
      svgText(svg, line, 0.15, curY + 0.32 + 0.18 + i * 0.18, { fill: C.dark, sz: 8 });
    });
    curY += SUPPORT_H;
  }

  // Legend bar (full width)
  const legendY = SH - OFFICIAL_H - LEGEND_H;
  svgRect(svg, 0, legendY, SW, LEGEND_H, C.lightBlue, C.border, 0.5);
  svgText(svg, 'Traffic rating:', 0.2, legendY + LEGEND_H/2, { fill: C.dark, bold: true, sz: 8 });
  const legendItems = [
    { color: C.green,   label: 'On track' },
    { color: C.amber,   label: 'At risk' },
    { color: C.riskRed, label: 'Off track / blocked' },
    { color: C.navy,    label: 'Info / FYI' },
  ];
  let lx = 1.4;
  legendItems.forEach(item => {
    svg.appendChild(svgEl('circle', {
      cx: (lx + 0.1) * PX,
      cy: (legendY + LEGEND_H/2) * PX,
      r: 6,
      fill: '#' + item.color,
    }));
    svgText(svg, item.label, lx + 0.25, legendY + LEGEND_H/2, { fill: C.dark, sz: 8 });
    lx += 1.9;
  });

  // OFFICIAL bottom
  svgText(svg, 'OFFICIAL', SW/2, SH - OFFICIAL_H/2, { fill: C.red, bold: true, sz: 9, anchor: 'middle' });

  // Vertical column separators
  svgLine(svg, COL_ACH_X,  OFFICIAL_H + TITLE_H, COL_ACH_X,  legendY, C.border, 0.5);
  svgLine(svg, COL_NEXT_X, OFFICIAL_H + TITLE_H, COL_NEXT_X, legendY, C.border, 0.5);
}

function drawBullets(svg, subSections, simple, projDev, governance, x, y, w, maxH) {
  const lineH = 0.16;
  const maxLines = Math.floor(maxH / lineH);
  let drawn = 0;

  if (subSections) {
    svgText(svg, 'Project/Development:', x, y + drawn * lineH, { fill: C.dark, bold: true, sz: 8 });
    drawn++;
    const pdLines = wrapLines(ensureBullets(projDev) || '• N/A', Math.floor(w / 0.065));
    pdLines.forEach(line => {
      if (drawn >= maxLines) return;
      svgText(svg, line, x + 0.05, y + drawn * lineH, { fill: C.dark, sz: 8 });
      drawn++;
    });
    if (drawn < maxLines) {
      svgText(svg, 'Governance & Related Artefacts:', x, y + drawn * lineH, { fill: C.dark, bold: true, sz: 8 });
      drawn++;
    }
    const govLines = wrapLines(ensureBullets(governance) || '• N/A', Math.floor(w / 0.065));
    govLines.forEach(line => {
      if (drawn >= maxLines) return;
      svgText(svg, line, x + 0.05, y + drawn * lineH, { fill: C.dark, sz: 8 });
      drawn++;
    });
  } else {
    const lines = wrapLines(simple || '', Math.floor(w / 0.065));
    lines.forEach(line => {
      if (drawn >= maxLines) return;
      svgText(svg, line, x, y + drawn * lineH, { fill: C.dark, sz: 8 });
      drawn++;
    });
  }
}

// ── PPTX EXPORT ───────────────────────────────────────────────────────────────
function exportPPTX() {
  if (typeof PptxGenJS === 'undefined') {
    showToast('❌ PptxGenJS not loaded', 'error');
    return;
  }
  collectFormState();
  const s = state;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5

  const weekLabel     = s.weekDate     ? `w/c ${fmtDate(s.weekDate)}`     : 'w/c [date]';
  const nextWeekLabel = s.nextWeekDate ? `w/c ${fmtDate(s.nextWeekDate)}` : 'w/c [next date]';
  const slideTitle    = `${s.projectName || 'Project'} update: Week beginning ${fmtDate(s.weekDate) || '[date]'}`;

  const slide = pptx.addSlide();
  slide.background = { color: C.white };

  // ── OFFICIAL top ──────────────────────────────────────────
  slide.addText('OFFICIAL', {
    x: 0, y: 0.02, w: SW, h: OFFICIAL_H,
    align: 'center', valign: 'middle',
    fontSize: 9, bold: true, color: C.red, fontFace: F.heading,
  });

  // ── NSW Gov logo — top-right on WHITE (DoE style guide compliant) ──
  // Logo sits on the white slide background, above the navy title bar.
  if (typeof NSW_LOGO_B64 !== 'undefined' && NSW_LOGO_B64) {
    slide.addImage({
      data: NSW_LOGO_B64,
      x: LOGO_X, y: LOGO_Y, w: LOGO_W, h: LOGO_H,
    });
  }

  // ── Title bar (compact navy) — below OFFICIAL strip ───────
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: OFFICIAL_H, w: SW, h: TITLE_H,
    fill: { color: C.navy }, line: { color: C.navy },
  });
  // Title text — full width (logo is above the bar on white, not overlapping)
  slide.addText(slideTitle, {
    x: 0.25, y: OFFICIAL_H, w: SW - 0.4, h: TITLE_H,
    valign: 'middle', fontSize: 18, bold: true,
    color: C.white, fontFace: F.heading,
  });

  // ── Column header row ─────────────────────────────────────
  const hdrY = OFFICIAL_H + TITLE_H;

  // Label header (grey, italic)
  slide.addShape(pptx.ShapeType.rect, {
    x: COL_LABEL_X, y: hdrY, w: COL_LABEL_W, h: HDR_ROW_H,
    fill: { color: 'F0F2F5' }, line: { color: C.border, pt: 0.5 },
  });
  slide.addText('traffic rating reflects\nlikelihood of delivery', {
    x: COL_LABEL_X + 0.05, y: hdrY, w: COL_LABEL_W - 0.1, h: HDR_ROW_H,
    align: 'center', valign: 'middle',
    fontSize: 9, italic: true, color: '555555', fontFace: F.body,
  });

  // Achieved header (navy)
  slide.addShape(pptx.ShapeType.rect, {
    x: COL_ACH_X, y: hdrY, w: COL_ACH_W, h: HDR_ROW_H,
    fill: { color: C.navy }, line: { color: C.navy },
  });
  slide.addText(`What was achieved in the ${weekLabel}`, {
    x: COL_ACH_X + 0.1, y: hdrY, w: COL_ACH_W - 0.2, h: HDR_ROW_H,
    align: 'center', valign: 'middle',
    fontSize: 11, bold: true, color: C.white, fontFace: F.heading,
  });

  // Next week header (navy)
  slide.addShape(pptx.ShapeType.rect, {
    x: COL_NEXT_X, y: hdrY, w: COL_NEXT_W, h: HDR_ROW_H,
    fill: { color: C.navy }, line: { color: C.navy },
  });
  slide.addText(`What will be achieved in the ${nextWeekLabel}`, {
    x: COL_NEXT_X + 0.1, y: hdrY, w: COL_NEXT_W - 0.2, h: HDR_ROW_H,
    align: 'center', valign: 'middle',
    fontSize: 11, bold: true, color: C.white, fontFace: F.heading,
  });

  // ── Stream rows ───────────────────────────────────────────
  const hasSupportText = (s.supportText || '').trim().length > 0;
  const bottomReserved = OFFICIAL_H + LEGEND_H + (hasSupportText ? SUPPORT_H : 0);
  const availH = SH - hdrY - HDR_ROW_H - bottomReserved;
  const numStreams = s.streams.length || 1;
  const rowH = Math.max(MIN_ROW_H, availH / numStreams);

  let curY = hdrY + HDR_ROW_H;

  s.streams.forEach(stream => {
    const ragHex = RAG_COLOURS[stream.rag] || C.navy;

    // Label column (RAG colour)
    slide.addShape(pptx.ShapeType.rect, {
      x: COL_LABEL_X, y: curY, w: COL_LABEL_W, h: rowH,
      fill: { color: ragHex }, line: { color: C.border, pt: 0.5 },
    });
    slide.addText(stream.name || 'Stream', {
      x: COL_LABEL_X + 0.05, y: curY, w: COL_LABEL_W - 0.1, h: rowH,
      align: 'center', valign: 'middle',
      fontSize: 10, bold: true, color: C.white, fontFace: F.heading,
      wrap: true,
    });

    // Achieved column
    slide.addShape(pptx.ShapeType.rect, {
      x: COL_ACH_X, y: curY, w: COL_ACH_W, h: rowH,
      fill: { color: C.white }, line: { color: C.border, pt: 0.5 },
    });
    addCellContent(slide, stream, 'achieved', COL_ACH_X, curY, COL_ACH_W, rowH);

    // Next week column
    slide.addShape(pptx.ShapeType.rect, {
      x: COL_NEXT_X, y: curY, w: COL_NEXT_W, h: rowH,
      fill: { color: C.white }, line: { color: C.border, pt: 0.5 },
    });
    addCellContent(slide, stream, 'next', COL_NEXT_X, curY, COL_NEXT_W, rowH);

    curY += rowH;
  });

  // ── Support required (optional) ───────────────────────────
  if (hasSupportText) {
    const suppW = TABLE_W * 0.65;
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: curY, w: suppW, h: 0.32,
      fill: { color: C.red }, line: { color: C.red },
    });
    slide.addText('Support required from directors', {
      x: 0.12, y: curY, w: suppW - 0.2, h: 0.32,
      valign: 'middle', fontSize: 10, bold: true,
      color: C.white, fontFace: F.heading,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: curY + 0.32, w: suppW, h: SUPPORT_H - 0.32,
      fill: { color: C.white }, line: { color: C.border, pt: 0.5 },
    });
    slide.addText(s.supportText, {
      x: 0.12, y: curY + 0.32, w: suppW - 0.2, h: SUPPORT_H - 0.32,
      valign: 'top', fontSize: 9, color: C.dark, fontFace: F.body,
      wrap: true,
    });
    curY += SUPPORT_H;
  }

  // ── Legend bar (full width) ───────────────────────────────
  const legendY = SH - OFFICIAL_H - LEGEND_H;
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: legendY, w: SW, h: LEGEND_H,
    fill: { color: C.lightBlue }, line: { color: C.border, pt: 0.5 },
  });
  slide.addText('Traffic rating:', {
    x: 0.15, y: legendY, w: 1.1, h: LEGEND_H,
    valign: 'middle', fontSize: 8, bold: true,
    color: C.dark, fontFace: F.heading,
  });

  const legendItems = [
    { color: C.green,   label: 'On track' },
    { color: C.amber,   label: 'At risk' },
    { color: C.riskRed, label: 'Off track / blocked' },
    { color: C.navy,    label: 'Info / FYI' },
  ];
  let lx = 1.35;
  legendItems.forEach(item => {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: lx, y: legendY + (LEGEND_H - 0.16) / 2,
      w: 0.16, h: 0.16,
      fill: { color: item.color }, line: { color: item.color },
    });
    slide.addText(item.label, {
      x: lx + 0.2, y: legendY, w: 1.6, h: LEGEND_H,
      valign: 'middle', fontSize: 8,
      color: C.dark, fontFace: F.body,
    });
    lx += 1.9;
  });

  // ── OFFICIAL bottom ───────────────────────────────────────
  slide.addText('OFFICIAL', {
    x: 0, y: SH - OFFICIAL_H, w: SW, h: OFFICIAL_H,
    align: 'center', valign: 'middle',
    fontSize: 9, bold: true, color: C.red, fontFace: F.heading,
  });

  // ── Write file ────────────────────────────────────────────
  const filename = `Status-Report-${s.weekDate || 'draft'}.pptx`;
  pptx.writeFile({ fileName: filename })
    .then(() => showToast('✅ Downloaded ' + filename))
    .catch(err => { console.error(err); showToast('❌ Export failed', 'error'); });
}

// ── Add cell content (bullets or sub-sections) ────────────────────────────────
function addCellContent(slide, stream, col, x, y, w, h) {
  const pad = 0.12;
  const cx = x + pad, cw = w - pad * 2;

  if (stream.subSections) {
    const projDev = col === 'achieved' ? stream.achievedProjectDev : stream.nextProjectDev;
    const gov     = col === 'achieved' ? stream.achievedGovernance  : stream.nextGovernance;
    const halfH   = (h - pad * 2) / 2;

    // Project/Dev section
    const pdRuns = buildBulletRuns(projDev, 'Project/Development:');
    slide.addText(pdRuns, {
      x: cx, y: y + pad, w: cw, h: halfH,
      valign: 'top', wrap: true,
    });

    // Governance section
    const govRuns = buildBulletRuns(gov, 'Governance & Related Artefacts:');
    slide.addText(govRuns, {
      x: cx, y: y + pad + halfH, w: cw, h: halfH,
      valign: 'top', wrap: true,
    });
  } else {
    const text = col === 'achieved' ? stream.achieved : stream.next;
    if (text && text.trim()) {
      const lines = text.split('\n').filter(l => l.trim());
      const runs = lines.map(line => ({
        text: line.replace(/^[•\-\*◦○▪▸►]\s*/, '') + '\n',
        options: {
          bullet: { type: 'bullet' },
          fontSize: 9, color: C.dark, fontFace: F.body,
        },
      }));
      slide.addText(runs, {
        x: cx, y: y + pad, w: cw, h: h - pad * 2,
        valign: 'top', wrap: true,
      });
    }
  }
}

// Build pptxgenjs text runs for a sub-section (heading + bullets)
function buildBulletRuns(text, heading) {
  const runs = [
    {
      text: heading + '\n',
      options: { bold: true, fontSize: 9, color: C.dark, fontFace: F.heading },
    },
  ];
  const lines = (text || 'N/A').split('\n').filter(l => l.trim());
  lines.forEach(line => {
    runs.push({
      text: line.replace(/^[•\-\*◦○▪▸►]\s*/, '') + '\n',
      options: {
        bullet: { type: 'bullet' },
        fontSize: 9, color: C.dark, fontFace: F.body,
      },
    });
  });
  return runs;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  loadState();

  // Always recalculate default dates to this Monday + next Monday
  // (override stale localStorage dates from previous weeks)
  const monday = thisMonday();
  const nextMonday = addDays(monday, 7);

  // Only apply defaults if no state was loaded or dates are missing
  if (!state.weekDate) {
    state.weekDate = monday;
    state.nextWeekDate = nextMonday;
  }

  // Seed default streams if none
  if (!state.streams || state.streams.length === 0) {
    state.streams = [
      newStream('Solution 1 – Digital walk through'),
      newStream('Solution 2 – Additional Workspaces'),
    ];
    state.streams[0].rag = 'green';
    state.streams[1].rag = 'green';
  }

  populateForm();
  renderStreams();
  drawPreview();

  // Wire up metadata fields
  ['project-name', 'week-date', 'next-week-date', 'support-text'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', onChange);
  });
}

document.addEventListener('DOMContentLoaded', init);
