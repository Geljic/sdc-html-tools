// ============================================================
// SDC Stakeholder Mapper — orgchart.js
// D3.js hierarchical org chart renderer
// Populated from AI image extraction or manual entry
// Nodes are clickable to edit label / parent relationship
// ============================================================

let _ocSvg       = null;
let _ocZoom      = null;
let _ocZoomGroup = null;
let _ocWidth     = 0;
let _ocHeight    = 0;

// Currently editing node id
let _ocEditingId = null;

const OC_NODE_W  = 160;
const OC_NODE_H  = 48;
const OC_NODE_RX = 6;
const OC_H_GAP   = 40;   // horizontal gap between siblings
const OC_V_GAP   = 80;   // vertical gap between levels

// ── Render ─────────────────────────────────────────────────

/**
 * Render or re-render the org chart.
 * Called when switching to the Org Chart view or when data changes.
 */
function smRenderOrgChart() {
  const container = document.getElementById('sm-orgchart-container');
  if (!container) return;

  const nodes = smState.orgChart.nodes;

  // Show/hide empty state
  const emptyEl = document.getElementById('sm-orgchart-empty');
  if (!nodes || nodes.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (_ocSvg) { _ocSvg.remove(); _ocSvg = null; }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Measure container
  const rect = container.getBoundingClientRect();
  _ocWidth  = rect.width  || 800;
  _ocHeight = rect.height || 500;

  // Remove existing SVG
  d3.select(container).select('svg').remove();

  // Create SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width',  _ocWidth)
    .attr('height', _ocHeight)
    .attr('aria-label', 'Org Chart');

  _ocSvg = svg;

  // Zoom behaviour
  _ocZoom = d3.zoom()
    .scaleExtent([0.2, 3])
    .on('zoom', (event) => {
      _ocZoomGroup.attr('transform', event.transform);
    });
  svg.call(_ocZoom);

  // Zoom group
  _ocZoomGroup = svg.append('g').attr('class', 'oc-zoom-group');

  // Build D3 hierarchy from flat node list
  const hierarchyData = ocBuildHierarchy(nodes);
  if (!hierarchyData) {
    // Fallback: no valid root — show all as flat list
    ocRenderFlat(nodes);
    return;
  }

  // D3 tree layout
  const treeLayout = d3.tree()
    .nodeSize([OC_NODE_W + OC_H_GAP, OC_NODE_H + OC_V_GAP]);

  const root = d3.hierarchy(hierarchyData);
  treeLayout(root);

  // Centre the tree in the SVG
  const treeNodes = root.descendants();
  const minX = d3.min(treeNodes, d => d.x) - OC_NODE_W / 2;
  const maxX = d3.max(treeNodes, d => d.x) + OC_NODE_W / 2;
  const minY = d3.min(treeNodes, d => d.y);
  const maxY = d3.max(treeNodes, d => d.y) + OC_NODE_H;

  const treeW = maxX - minX;
  const treeH = maxY - minY;

  const offsetX = (_ocWidth  - treeW) / 2 - minX;
  const offsetY = 40;

  _ocZoomGroup.attr('transform', `translate(${offsetX},${offsetY})`);

  // ── Links ─────────────────────────────────────────────────
  _ocZoomGroup.append('g').attr('class', 'oc-links')
    .selectAll('.oc-link')
    .data(root.links())
    .enter()
    .append('path')
    .attr('class', 'oc-link')
    .attr('d', d3.linkVertical()
      .x(d => d.x)
      .y(d => d.y + OC_NODE_H / 2)
    );

  // ── Nodes ─────────────────────────────────────────────────
  const nodeGroups = _ocZoomGroup.append('g').attr('class', 'oc-nodes')
    .selectAll('.oc-node')
    .data(treeNodes)
    .enter()
    .append('g')
    .attr('class', 'oc-node')
    .attr('transform', d => `translate(${d.x - OC_NODE_W / 2},${d.y})`)
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation();
      smOcNodeOpen(d.data.id);
    });

  // Node rectangle
  nodeGroups.append('rect')
    .attr('class', d => 'oc-node-rect' + (d.depth === 0 ? ' oc-node-root' : ''))
    .attr('width',  OC_NODE_W)
    .attr('height', OC_NODE_H)
    .attr('rx', OC_NODE_RX)
    .attr('ry', OC_NODE_RX);

  // Node label (wrapped to 2 lines if needed)
  nodeGroups.each(function(d) {
    const g = d3.select(this);
    const label = d.data.label || '';
    const words = label.split(/\s+/);
    const maxCharsPerLine = 18;

    // Simple word-wrap into max 2 lines
    let line1 = '', line2 = '';
    for (const word of words) {
      if ((line1 + ' ' + word).trim().length <= maxCharsPerLine) {
        line1 = (line1 + ' ' + word).trim();
      } else if ((line2 + ' ' + word).trim().length <= maxCharsPerLine) {
        line2 = (line2 + ' ' + word).trim();
      } else {
        line2 = line2 ? line2.substring(0, maxCharsPerLine - 1) + '…' : word.substring(0, maxCharsPerLine - 1) + '…';
      }
    }

    if (line2) {
      g.append('text')
        .attr('class', 'oc-node-label')
        .attr('x', OC_NODE_W / 2)
        .attr('y', OC_NODE_H / 2 - 7)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .text(line1);
      g.append('text')
        .attr('class', 'oc-node-label')
        .attr('x', OC_NODE_W / 2)
        .attr('y', OC_NODE_H / 2 + 9)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .text(line2);
    } else {
      g.append('text')
        .attr('class', 'oc-node-label')
        .attr('x', OC_NODE_W / 2)
        .attr('y', OC_NODE_H / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .text(line1);
    }
  });

  // Add child button (+) on each node
  nodeGroups.append('text')
    .attr('class', 'oc-add-child-btn')
    .attr('x', OC_NODE_W - 10)
    .attr('y', 10)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', 14)
    .attr('fill', '#6B7280')
    .attr('title', 'Add child node')
    .text('+')
    .on('click', (event, d) => {
      event.stopPropagation();
      smOcAddChildNode(d.data.id);
    });

  // Click on SVG background to deselect
  svg.on('click', () => {});
}

// ── Hierarchy builder ──────────────────────────────────────

/**
 * Convert flat node list [{id, label, parentId}] to a D3 hierarchy object.
 * Finds the root (parentId === null or parentId not in node set).
 * If multiple roots exist, creates a virtual root.
 * @param {Array} nodes
 * @returns {object} D3-compatible hierarchy data
 */
function ocBuildHierarchy(nodes) {
  if (!nodes || nodes.length === 0) return null;

  const nodeMap = {};
  for (const n of nodes) {
    nodeMap[n.id] = { id: n.id, label: n.label, children: [] };
  }

  const roots = [];
  for (const n of nodes) {
    if (!n.parentId || !nodeMap[n.parentId]) {
      roots.push(nodeMap[n.id]);
    } else {
      nodeMap[n.parentId].children.push(nodeMap[n.id]);
    }
  }

  if (roots.length === 0) return null;
  if (roots.length === 1) return roots[0];

  // Multiple roots — wrap in a virtual root
  return { id: '__root__', label: '', children: roots };
}

/**
 * Render nodes as a flat list when no valid hierarchy exists.
 */
function ocRenderFlat(nodes) {
  const g = _ocZoomGroup.append('g').attr('class', 'oc-flat');
  nodes.forEach((n, i) => {
    const x = 20;
    const y = 20 + i * (OC_NODE_H + 12);
    const ng = g.append('g')
      .attr('transform', `translate(${x},${y})`)
      .style('cursor', 'pointer')
      .on('click', () => smOcNodeOpen(n.id));

    ng.append('rect')
      .attr('class', 'oc-node-rect')
      .attr('width', OC_NODE_W)
      .attr('height', OC_NODE_H)
      .attr('rx', OC_NODE_RX);

    ng.append('text')
      .attr('class', 'oc-node-label')
      .attr('x', OC_NODE_W / 2)
      .attr('y', OC_NODE_H / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .text(n.label.length > 22 ? n.label.substring(0, 20) + '…' : n.label);
  });
}

// ── Controls ───────────────────────────────────────────────

function smOcReset() {
  if (!_ocSvg || !_ocZoom) return;
  _ocSvg.transition().duration(400)
    .call(_ocZoom.transform, d3.zoomIdentity);
}

/**
 * Add a root-level node (no parent).
 */
function smOcAddRootNode() {
  const label = prompt('Node label:', 'New Team');
  if (!label || !label.trim()) return;
  smOrgChartAddNode(label.trim(), null);
  smRenderOrgChart();
  smToast('Node added. Click it to edit or set a parent.');
}

/**
 * Add a child node under the given parent.
 */
function smOcAddChildNode(parentId) {
  const label = prompt('Child node label:', 'New Team');
  if (!label || !label.trim()) return;
  smOrgChartAddNode(label.trim(), parentId);
  smRenderOrgChart();
  smToast('Child node added.');
}

// ── Node edit modal ────────────────────────────────────────

function smOcNodeOpen(id) {
  const node = smState.orgChart.nodes.find(n => n.id === id);
  if (!node) return;
  _ocEditingId = id;

  // Populate label
  const labelInput = document.getElementById('oc-node-label');
  if (labelInput) labelInput.value = node.label || '';

  // Populate parent select
  const parentSelect = document.getElementById('oc-node-parent');
  if (parentSelect) {
    parentSelect.innerHTML = '<option value="">(none — root node)</option>';
    for (const n of smState.orgChart.nodes) {
      if (n.id === id) continue; // can't be own parent
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = n.label || n.id;
      if (n.id === node.parentId) opt.selected = true;
      parentSelect.appendChild(opt);
    }
  }

  // Show/hide delete button (always show for non-root)
  const deleteBtn = document.getElementById('oc-node-delete-btn');
  if (deleteBtn) deleteBtn.style.display = 'inline-flex';

  // Show modal
  document.getElementById('sm-orgchart-node-modal')?.classList.remove('hidden');
  setTimeout(() => labelInput?.focus(), 50);
}

function smOcNodeClose() {
  _ocEditingId = null;
  document.getElementById('sm-orgchart-node-modal')?.classList.add('hidden');
}

function smOcNodeSave() {
  if (!_ocEditingId) return;

  const label    = document.getElementById('oc-node-label')?.value?.trim() || '';
  const parentId = document.getElementById('oc-node-parent')?.value || null;

  smOrgChartUpdateNode(_ocEditingId, {
    label:    label || 'Unnamed',
    parentId: parentId || null,
  });

  smOcNodeClose();
  smRenderOrgChart();
  smToast('Node updated.');
}

function smOcNodeDelete() {
  if (!_ocEditingId) return;
  const node = smState.orgChart.nodes.find(n => n.id === _ocEditingId);
  const label = node ? node.label : 'this node';
  if (!confirm(`Delete "${label}"? Its children will be re-parented to its parent.`)) return;

  smOrgChartRemoveNode(_ocEditingId);
  smOcNodeClose();
  smRenderOrgChart();
  smToast('Node deleted.');
}
