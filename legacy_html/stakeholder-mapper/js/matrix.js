// ============================================================
// SDC Stakeholder Mapper — matrix.js
// D3.js Power/Interest Matrix renderer
// Circles at exact (interest, power) positions
// Labels use force simulation for collision avoidance
// ============================================================

let _matrixSvg       = null;
let _matrixZoom      = null;
let _matrixZoomGroup = null;
let _matrixWidth     = 0;
let _matrixHeight    = 0;
let _matrixSpreadActive = false;
let _matrixSimulation   = null;

const MARGIN = { top: 48, right: 32, bottom: 56, left: 56 };

// Quadrant definitions (x1,y1 = data coords of bottom-left corner)
const QUADRANTS = [
  { x1: 0.5, y1: 0.5, label: 'Manage Closely',  fill: '#EEF2FF', labelAnchor: 'end',   lx: 0.98, ly: 0.98 },
  { x1: 0,   y1: 0.5, label: 'Keep Satisfied',   fill: '#FFF7ED', labelAnchor: 'start', lx: 0.02, ly: 0.98 },
  { x1: 0.5, y1: 0,   label: 'Keep Informed',    fill: '#F0FDF4', labelAnchor: 'end',   lx: 0.98, ly: 0.02 },
  { x1: 0,   y1: 0,   label: 'Monitor',           fill: '#F9FAFB', labelAnchor: 'start', lx: 0.02, ly: 0.02 },
];

// ── Init / render ──────────────────────────────────────────

/**
 * Render or re-render the Power/Interest Matrix.
 * Called whenever stakeholder data changes or view is switched.
 */
function smRenderMatrix() {
  const container = document.getElementById('sm-matrix-container');
  if (!container) return;

  const stakeholders = smState.stakeholders;

  // Show/hide empty state
  const emptyEl = document.getElementById('sm-matrix-empty');
  if (stakeholders.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (_matrixSvg) { _matrixSvg.remove(); _matrixSvg = null; }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Measure container
  const rect = container.getBoundingClientRect();
  _matrixWidth  = rect.width  || 700;
  _matrixHeight = rect.height || 500;

  const innerW = _matrixWidth  - MARGIN.left - MARGIN.right;
  const innerH = _matrixHeight - MARGIN.top  - MARGIN.bottom;

  // Remove existing SVG
  d3.select(container).select('svg').remove();

  // Create SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width',  _matrixWidth)
    .attr('height', _matrixHeight)
    .attr('aria-label', 'Stakeholder Power/Interest Matrix');

  _matrixSvg = svg;

  // Zoom behaviour
  _matrixZoom = d3.zoom()
    .scaleExtent([0.4, 6])
    .on('zoom', (event) => {
      _matrixZoomGroup.attr('transform', event.transform);
    });
  svg.call(_matrixZoom);

  // Zoom group (everything inside this gets transformed)
  _matrixZoomGroup = svg.append('g')
    .attr('class', 'zoom-group')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  // Scales
  const xScale = d3.scaleLinear().domain([0, 1]).range([0, innerW]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

  // ── Quadrant backgrounds ──────────────────────────────────
  for (const q of QUADRANTS) {
    // x1,y1 are data-space bottom-left corners of each quadrant
    const qX = xScale(q.x1);
    const qY = yScale(q.y1 + 0.5);  // top of quadrant in SVG coords (y is inverted)
    _matrixZoomGroup.append('rect')
      .attr('class', 'quadrant-bg')
      .attr('x', qX)
      .attr('y', qY)
      .attr('width',  innerW / 2)
      .attr('height', innerH / 2)
      .attr('fill', q.fill);
  }

  // ── Quadrant labels ───────────────────────────────────────
  for (const q of QUADRANTS) {
    _matrixZoomGroup.append('text')
      .attr('class', 'quadrant-label')
      .attr('x', xScale(q.lx))
      .attr('y', yScale(q.ly))
      .attr('text-anchor', q.labelAnchor)
      .attr('dominant-baseline', q.ly > 0.5 ? 'hanging' : 'auto')
      .text(q.label);
  }

  // ── Divider lines ─────────────────────────────────────────
  // Vertical centre
  _matrixZoomGroup.append('line')
    .attr('class', 'divider-line')
    .attr('x1', xScale(0.5)).attr('y1', 0)
    .attr('x2', xScale(0.5)).attr('y2', innerH);
  // Horizontal centre
  _matrixZoomGroup.append('line')
    .attr('class', 'divider-line')
    .attr('x1', 0).attr('y1', yScale(0.5))
    .attr('x2', innerW).attr('y2', yScale(0.5));

  // ── Axes ──────────────────────────────────────────────────
  // X axis
  _matrixZoomGroup.append('line')
    .attr('class', 'axis-line')
    .attr('x1', 0).attr('y1', innerH)
    .attr('x2', innerW).attr('y2', innerH);
  // Y axis
  _matrixZoomGroup.append('line')
    .attr('class', 'axis-line')
    .attr('x1', 0).attr('y1', 0)
    .attr('x2', 0).attr('y2', innerH);

  // Axis labels
  _matrixZoomGroup.append('text')
    .attr('class', 'axis-label')
    .attr('x', innerW / 2).attr('y', innerH + 36)
    .attr('text-anchor', 'middle')
    .text('← Low Interest · · · · · · · · · · · · · · · · · · High Interest →');

  _matrixZoomGroup.append('text')
    .attr('class', 'axis-label')
    .attr('transform', `translate(-40, ${innerH / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .text('← Low Power · · · · · · · · · · · · · · · · · · High Power →');

  // ── Stakeholder circles ───────────────────────────────────
  const circleR = Math.max(8, Math.min(14, innerW / (stakeholders.length * 3 + 5)));

  // Exact positions for circles
  const circleData = stakeholders.map(s => ({
    ...s,
    cx: xScale(Math.min(0.97, Math.max(0.03, s.interest))),
    cy: yScale(Math.min(0.97, Math.max(0.03, s.power))),
  }));

  // Leader lines (drawn before circles so circles appear on top)
  const leaderGroup = _matrixZoomGroup.append('g').attr('class', 'leaders');

  // Circles
  const circleGroup = _matrixZoomGroup.append('g').attr('class', 'circles');
  circleGroup.selectAll('.stakeholder-circle')
    .data(circleData)
    .enter()
    .append('circle')
    .attr('class', 'stakeholder-circle')
    .attr('cx', d => d.cx)
    .attr('cy', d => d.cy)
    .attr('r', circleR)
    .attr('fill', d => smGroupColour(d.group))
    .on('mouseover', (event, d) => smMatrixShowTooltip(event, d))
    .on('mousemove', (event, d) => smMatrixMoveTooltip(event))
    .on('mouseout', () => smMatrixHideTooltip())
    .on('click', (event, d) => { event.stopPropagation(); smOpenEdit(d.id); });

  // ── Label force simulation ────────────────────────────────
  // Labels are free to move; circles stay fixed
  const labelData = circleData.map(d => ({
    id: d.id,
    name: d.name,
    group: d.group,
    cx: d.cx,  // anchor (circle position)
    cy: d.cy,
    x: d.cx + circleR + 4,  // initial label position
    y: d.cy,
  }));

  const labelSim = d3.forceSimulation(labelData)
    .force('x', d3.forceX(d => d.cx + circleR + 6).strength(0.4))
    .force('y', d3.forceY(d => d.cy).strength(0.4))
    .force('collide', d3.forceCollide(10).strength(0.8))
    .stop();

  // Run ticks synchronously (no animation needed for labels)
  for (let i = 0; i < 200; i++) labelSim.tick();

  // Clamp labels to inner bounds
  for (const d of labelData) {
    d.x = Math.max(4, Math.min(innerW - 4, d.x));
    d.y = Math.max(10, Math.min(innerH - 4, d.y));
  }

  // Draw leader lines
  leaderGroup.selectAll('.leader-line')
    .data(labelData)
    .enter()
    .append('line')
    .attr('class', 'leader-line')
    .attr('x1', d => d.cx)
    .attr('y1', d => d.cy)
    .attr('x2', d => d.x - 2)
    .attr('y2', d => d.y)
    .attr('opacity', d => {
      const dist = Math.hypot(d.x - d.cx, d.y - d.cy);
      return dist > circleR + 8 ? 0.5 : 0;
    });

  // Draw labels
  _matrixZoomGroup.append('g').attr('class', 'labels')
    .selectAll('.stakeholder-label')
    .data(labelData)
    .enter()
    .append('text')
    .attr('class', 'stakeholder-label')
    .attr('x', d => d.x)
    .attr('y', d => d.y)
    .attr('dominant-baseline', 'middle')
    .text(d => d.name.length > 22 ? d.name.substring(0, 20) + '…' : d.name);

  // ── Legend ────────────────────────────────────────────────
  smRenderMatrixLegend();

  // Click on SVG background to deselect
  svg.on('click', () => smMatrixHideTooltip());
}

// ── Legend ─────────────────────────────────────────────────

function smRenderMatrixLegend() {
  const legendEl = document.getElementById('sm-matrix-legend');
  if (!legendEl) return;

  const groups = [...new Set(smState.stakeholders.map(s => s.group))];
  legendEl.innerHTML = groups.map(g => `
    <span class="sm-legend-item">
      <span class="sm-legend-dot" style="background:${smGroupColour(g)}"></span>
      ${smGroupLabel(g)}
    </span>
  `).join('');
}

// ── Tooltip ────────────────────────────────────────────────

function smMatrixShowTooltip(event, d) {
  const tooltip = document.getElementById('sm-matrix-tooltip');
  if (!tooltip) return;

  const raciSummary = smState.phases
    .map(p => {
      const code = d.raci[p.toLowerCase()] || '—';
      return `${p}: ${code}`;
    })
    .join(' · ');

  tooltip.innerHTML = `
    <div class="sm-tooltip-name">${escHtml(d.name)}</div>
    <div class="sm-tooltip-row">
      <span class="sm-tooltip-label">Team</span>
      <span class="sm-tooltip-val">${escHtml(d.team || '—')}</span>
    </div>
    <div class="sm-tooltip-row">
      <span class="sm-tooltip-label">Power</span>
      <span class="sm-tooltip-val">${Math.round(d.power * 10)}/10</span>
    </div>
    <div class="sm-tooltip-row">
      <span class="sm-tooltip-label">Interest</span>
      <span class="sm-tooltip-val">${Math.round(d.interest * 10)}/10</span>
    </div>
    <div class="sm-tooltip-row">
      <span class="sm-tooltip-label">Group</span>
      <span class="sm-tooltip-val">${smGroupLabel(d.group)}</span>
    </div>
    ${d.notes ? `<div style="margin-top:6px;font-size:11px;color:rgba(255,255,255,0.8)">${escHtml(d.notes)}</div>` : ''}
    <div style="margin-top:6px;font-size:10px;color:rgba(255,255,255,0.6)">${escHtml(raciSummary)}</div>
    <div style="margin-top:6px;font-size:10px;color:rgba(255,255,255,0.5)">Click to edit</div>
  `;

  tooltip.style.display = 'block';
  smMatrixMoveTooltip(event);
}

function smMatrixMoveTooltip(event) {
  const tooltip = document.getElementById('sm-matrix-tooltip');
  if (!tooltip) return;
  const container = document.getElementById('sm-matrix-container');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  let x = event.clientX - rect.left + 14;
  let y = event.clientY - rect.top  - 10;
  // Keep tooltip within container
  if (x + 250 > rect.width)  x = event.clientX - rect.left - 260;
  if (y + 160 > rect.height) y = event.clientY - rect.top  - 170;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

function smMatrixHideTooltip() {
  const tooltip = document.getElementById('sm-matrix-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

// ── Controls ───────────────────────────────────────────────

/**
 * Apply D3 force repulsion to spread overlapping circles.
 * Circles move from their exact positions — toggle to reset.
 */
function smMatrixSpread() {
  if (!_matrixSvg) return;
  _matrixSpreadActive = !_matrixSpreadActive;

  if (!_matrixSpreadActive) {
    // Re-render to reset positions
    smRenderMatrix();
    return;
  }

  const container = document.getElementById('sm-matrix-container');
  const rect = container.getBoundingClientRect();
  const innerW = (rect.width  || 700)  - MARGIN.left - MARGIN.right;
  const innerH = (rect.height || 500) - MARGIN.top  - MARGIN.bottom;

  const xScale = d3.scaleLinear().domain([0, 1]).range([0, innerW]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

  const circleR = Math.max(8, Math.min(14, innerW / (smState.stakeholders.length * 3 + 5)));

  const nodes = smState.stakeholders.map(s => ({
    id: s.id,
    x: xScale(Math.min(0.97, Math.max(0.03, s.interest))),
    y: yScale(Math.min(0.97, Math.max(0.03, s.power))),
    ox: xScale(Math.min(0.97, Math.max(0.03, s.interest))),
    oy: yScale(Math.min(0.97, Math.max(0.03, s.power))),
  }));

  const sim = d3.forceSimulation(nodes)
    .force('collide', d3.forceCollide(circleR + 4).strength(1))
    .force('x', d3.forceX(d => d.ox).strength(0.3))
    .force('y', d3.forceY(d => d.oy).strength(0.3))
    .on('tick', () => {
      _matrixZoomGroup.selectAll('.stakeholder-circle')
        .attr('cx', (d, i) => nodes[i] ? nodes[i].x : d.cx)
        .attr('cy', (d, i) => nodes[i] ? nodes[i].y : d.cy);
    });

  _matrixSimulation = sim;
}

/**
 * Reset zoom to default.
 */
function smMatrixReset() {
  if (!_matrixSvg || !_matrixZoom) return;
  _matrixSpreadActive = false;
  _matrixSvg.transition().duration(400)
    .call(_matrixZoom.transform, d3.zoomIdentity);
}

// ── Utility ────────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
