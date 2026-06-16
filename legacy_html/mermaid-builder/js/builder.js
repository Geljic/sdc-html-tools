// ============================================================
// Mermaid Diagram Builder — builder.js
// Visual form builder for Flowchart, Sequence, Journey, Gantt
// Each builder maintains its own state and generates Mermaid code
// ============================================================

// ── Shared state ───────────────────────────────────────────
const builderState = {
  flowchart: {
    direction: 'TD',
    nodes: [],   // { id, label, shape }
    edges: [],   // { from, to, label, type }
  },
  sequence: {
    participants: [],  // { name, type: 'actor'|'participant' }
    messages: [],      // { from, to, label, arrow: '->>'|'-->>'|'->'|'-->' }
  },
  journey: {
    title: '',
    sections: [],  // { name, tasks: [{ label, actor, score }] }
  },
  gantt: {
    title: '',
    dateFormat: 'YYYY-MM-DD',
    sections: [],  // { name, tasks: [{ label, status, id, start, duration }] }
  },
};

let _builderNodeCounter = 1;
let _builderEdgeCounter = 1;
let _builderTaskCounter = 1;

// ── Flowchart Builder ──────────────────────────────────────

function fcInit() {
  // Default starter diagram
  builderState.flowchart = {
    direction: 'TD',
    nodes: [
      { id: 'A', label: 'Start', shape: 'stadium' },
      { id: 'B', label: 'Process step', shape: 'rect' },
      { id: 'C', label: 'Decision?', shape: 'diamond' },
      { id: 'D', label: 'End', shape: 'stadium' },
    ],
    edges: [
      { from: 'A', to: 'B', label: '', type: '-->' },
      { from: 'B', to: 'C', label: '', type: '-->' },
      { from: 'C', to: 'D', label: 'Yes', type: '-->' },
    ],
  };
  _builderNodeCounter = 5;
  fcRender();
}

function fcRender() {
  const panel = document.getElementById('fc-builder');
  if (!panel) return;

  const { direction, nodes, edges } = builderState.flowchart;

  panel.innerHTML = `
    <div class="form-section-title">Direction</div>
    <div class="fc-direction-row">
      <label>Flow direction:</label>
      <select onchange="fcSetDirection(this.value)">
        <option value="TD" ${direction==='TD'?'selected':''}>Top → Down</option>
        <option value="LR" ${direction==='LR'?'selected':''}>Left → Right</option>
        <option value="BT" ${direction==='BT'?'selected':''}>Bottom → Top</option>
        <option value="RL" ${direction==='RL'?'selected':''}>Right → Left</option>
      </select>
    </div>

    <div class="form-section-title" style="margin-top:14px">Nodes</div>
    <div class="node-list" id="fc-node-list">
      ${nodes.map((n, i) => fcNodeHtml(n, i)).join('')}
    </div>
    <button class="btn btn-add btn-sm" style="margin-top:8px" onclick="fcAddNode()">+ Add node</button>

    <div class="form-section-title" style="margin-top:14px">Connections</div>
    <div class="edge-list" id="fc-edge-list">
      ${edges.map((e, i) => fcEdgeHtml(e, i, nodes)).join('')}
    </div>
    <button class="btn btn-add btn-sm" style="margin-top:8px" onclick="fcAddEdge()">+ Add connection</button>
  `;

  fcUpdateCode();
}

function fcNodeHtml(node, idx) {
  return `
    <div class="node-item">
      <span class="item-drag-handle" title="Node ID: ${escapeAttr(node.id)}">⠿</span>
      <input type="text" value="${escapeAttr(node.label)}" placeholder="Label"
        oninput="fcUpdateNode(${idx},'label',this.value)" style="flex:2">
      <select onchange="fcUpdateNode(${idx},'shape',this.value)" style="flex:1;min-width:90px">
        <option value="rect"    ${node.shape==='rect'?'selected':''}>Rectangle</option>
        <option value="diamond" ${node.shape==='diamond'?'selected':''}>Diamond</option>
        <option value="stadium" ${node.shape==='stadium'?'selected':''}>Rounded</option>
        <option value="circle"  ${node.shape==='circle'?'selected':''}>Circle</option>
        <option value="hex"     ${node.shape==='hex'?'selected':''}>Hexagon</option>
      </select>
      <span style="font-size:11px;color:var(--muted);min-width:20px">${escapeHtml(node.id)}</span>
      <button class="btn-icon" onclick="fcRemoveNode(${idx})" title="Remove node">✕</button>
    </div>`;
}

function fcEdgeHtml(edge, idx, nodes) {
  const opts = nodes.map(n =>
    `<option value="${escapeAttr(n.id)}" ${edge.from===n.id?'selected':''}>${escapeHtml(n.id)}: ${escapeHtml(n.label)}</option>`
  ).join('');
  const optsTo = nodes.map(n =>
    `<option value="${escapeAttr(n.id)}" ${edge.to===n.id?'selected':''}>${escapeHtml(n.id)}: ${escapeHtml(n.label)}</option>`
  ).join('');

  return `
    <div class="edge-item">
      <select onchange="fcUpdateEdge(${idx},'from',this.value)" style="flex:1;min-width:80px">${opts}</select>
      <select onchange="fcUpdateEdge(${idx},'type',this.value)" style="min-width:80px">
        <option value="-->"  ${edge.type==='-->'?'selected':''}>──▶</option>
        <option value="---"  ${edge.type==='---'?'selected':''}>────</option>
        <option value="-.->  " ${edge.type==='-.->'?'selected':''}>·-·▶</option>
        <option value="==>"  ${edge.type==='==>'?'selected':''}>══▶</option>
      </select>
      <select onchange="fcUpdateEdge(${idx},'to',this.value)" style="flex:1;min-width:80px">${optsTo}</select>
      <input type="text" value="${escapeAttr(edge.label)}" placeholder="Label (optional)"
        oninput="fcUpdateEdge(${idx},'label',this.value)" style="flex:1;min-width:60px">
      <button class="btn-icon" onclick="fcRemoveEdge(${idx})" title="Remove connection">✕</button>
    </div>`;
}

function fcSetDirection(dir) {
  builderState.flowchart.direction = dir;
  fcUpdateCode();
}

function fcUpdateNode(idx, field, value) {
  builderState.flowchart.nodes[idx][field] = value;
  fcUpdateCode();
  // Re-render edge selects to reflect label changes
  const edgeList = document.getElementById('fc-edge-list');
  if (edgeList) {
    edgeList.innerHTML = builderState.flowchart.edges
      .map((e, i) => fcEdgeHtml(e, i, builderState.flowchart.nodes)).join('');
  }
}

function fcUpdateEdge(idx, field, value) {
  builderState.flowchart.edges[idx][field] = value;
  fcUpdateCode();
}

function fcAddNode() {
  const id = String.fromCharCode(64 + _builderNodeCounter); // A, B, C...
  _builderNodeCounter++;
  builderState.flowchart.nodes.push({ id, label: 'New node', shape: 'rect' });
  fcRender();
}

function fcRemoveNode(idx) {
  const removed = builderState.flowchart.nodes.splice(idx, 1)[0];
  // Remove edges referencing this node
  builderState.flowchart.edges = builderState.flowchart.edges.filter(
    e => e.from !== removed.id && e.to !== removed.id
  );
  fcRender();
}

function fcAddEdge() {
  const nodes = builderState.flowchart.nodes;
  if (nodes.length < 2) { showToast('Add at least 2 nodes first', 'error'); return; }
  builderState.flowchart.edges.push({
    from: nodes[0].id,
    to: nodes[1].id,
    label: '',
    type: '-->',
  });
  fcRender();
}

function fcRemoveEdge(idx) {
  builderState.flowchart.edges.splice(idx, 1);
  fcRender();
}

function fcUpdateCode() {
  const { direction, nodes, edges } = builderState.flowchart;
  const lines = [`flowchart ${direction}`];

  // Node definitions
  nodes.forEach(n => {
    const label = n.label || n.id;
    switch (n.shape) {
      case 'diamond': lines.push(`    ${n.id}{${label}}`); break;
      case 'stadium': lines.push(`    ${n.id}([${label}])`); break;
      case 'circle':  lines.push(`    ${n.id}((${label}))`); break;
      case 'hex':     lines.push(`    ${n.id}{{${label}}}`); break;
      default:        lines.push(`    ${n.id}[${label}]`); break;
    }
  });

  // Edge definitions
  edges.forEach(e => {
    if (e.label) {
      lines.push(`    ${e.from} ${e.type}|${e.label}| ${e.to}`);
    } else {
      lines.push(`    ${e.from} ${e.type} ${e.to}`);
    }
  });

  const code = lines.join('\n');
  setCodeAndRender(code);
}

// ── Sequence Diagram Builder ───────────────────────────────

function seqInit() {
  builderState.sequence = {
    participants: [
      { name: 'User', type: 'actor' },
      { name: 'System', type: 'participant' },
      { name: 'Database', type: 'participant' },
    ],
    messages: [
      { from: 'User', to: 'System', label: 'Submit request', arrow: '->>' },
      { from: 'System', to: 'Database', label: 'Query data', arrow: '->>' },
      { from: 'Database', to: 'System', label: 'Return results', arrow: '-->>' },
      { from: 'System', to: 'User', label: 'Show response', arrow: '-->>' },
    ],
  };
  seqRender();
}

function seqRender() {
  const panel = document.getElementById('seq-builder');
  if (!panel) return;

  const { participants, messages } = builderState.sequence;

  panel.innerHTML = `
    <div class="form-section-title">Participants</div>
    <div class="actor-list" id="seq-actor-list">
      ${participants.map((p, i) => seqParticipantHtml(p, i)).join('')}
    </div>
    <button class="btn btn-add btn-sm" style="margin-top:8px" onclick="seqAddParticipant()">+ Add participant</button>

    <div class="form-section-title" style="margin-top:14px">Messages</div>
    <div class="msg-list" id="seq-msg-list">
      ${messages.map((m, i) => seqMessageHtml(m, i, participants)).join('')}
    </div>
    <button class="btn btn-add btn-sm" style="margin-top:8px" onclick="seqAddMessage()">+ Add message</button>
  `;

  seqUpdateCode();
}

function seqParticipantHtml(p, idx) {
  return `
    <div class="actor-item">
      <input type="text" value="${escapeAttr(p.name)}" placeholder="Name"
        oninput="seqUpdateParticipant(${idx},'name',this.value)">
      <select onchange="seqUpdateParticipant(${idx},'type',this.value)">
        <option value="participant" ${p.type==='participant'?'selected':''}>Participant</option>
        <option value="actor"       ${p.type==='actor'?'selected':''}>Actor (person)</option>
      </select>
      <button class="btn-icon" onclick="seqRemoveParticipant(${idx})" title="Remove">✕</button>
    </div>`;
}

function seqMessageHtml(msg, idx, participants) {
  const opts = participants.map(p =>
    `<option value="${escapeAttr(p.name)}" ${msg.from===p.name?'selected':''}>${escapeHtml(p.name)}</option>`
  ).join('');
  const optsTo = participants.map(p =>
    `<option value="${escapeAttr(p.name)}" ${msg.to===p.name?'selected':''}>${escapeHtml(p.name)}</option>`
  ).join('');

  return `
    <div class="msg-item">
      <select onchange="seqUpdateMessage(${idx},'from',this.value)" style="flex:1">${opts}</select>
      <select onchange="seqUpdateMessage(${idx},'arrow',this.value)" style="min-width:80px">
        <option value="->>"  ${msg.arrow==='->>'?'selected':''}>──▶ solid</option>
        <option value="-->>" ${msg.arrow==='-->>'?'selected':''}>··▶ dashed</option>
        <option value="->"   ${msg.arrow==='->'?'selected':''}>──▷ open</option>
        <option value="-->"  ${msg.arrow==='-->'?'selected':''}>··▷ open dashed</option>
      </select>
      <select onchange="seqUpdateMessage(${idx},'to',this.value)" style="flex:1">${optsTo}</select>
      <input type="text" value="${escapeAttr(msg.label)}" placeholder="Message label"
        oninput="seqUpdateMessage(${idx},'label',this.value)" style="flex:2">
      <button class="btn-icon" onclick="seqRemoveMessage(${idx})" title="Remove">✕</button>
    </div>`;
}

function seqUpdateParticipant(idx, field, value) {
  const oldName = builderState.sequence.participants[idx].name;
  builderState.sequence.participants[idx][field] = value;
  // Update message references if name changed
  if (field === 'name') {
    builderState.sequence.messages.forEach(m => {
      if (m.from === oldName) m.from = value;
      if (m.to === oldName) m.to = value;
    });
  }
  seqUpdateCode();
  // Re-render message selects
  const msgList = document.getElementById('seq-msg-list');
  if (msgList) {
    msgList.innerHTML = builderState.sequence.messages
      .map((m, i) => seqMessageHtml(m, i, builderState.sequence.participants)).join('');
  }
}

function seqUpdateMessage(idx, field, value) {
  builderState.sequence.messages[idx][field] = value;
  seqUpdateCode();
}

function seqAddParticipant() {
  builderState.sequence.participants.push({ name: 'New Actor', type: 'participant' });
  seqRender();
}

function seqRemoveParticipant(idx) {
  const removed = builderState.sequence.participants.splice(idx, 1)[0];
  builderState.sequence.messages = builderState.sequence.messages.filter(
    m => m.from !== removed.name && m.to !== removed.name
  );
  seqRender();
}

function seqAddMessage() {
  const ps = builderState.sequence.participants;
  if (ps.length < 2) { showToast('Add at least 2 participants first', 'error'); return; }
  builderState.sequence.messages.push({
    from: ps[0].name, to: ps[1].name, label: 'Message', arrow: '->>',
  });
  seqRender();
}

function seqRemoveMessage(idx) {
  builderState.sequence.messages.splice(idx, 1);
  seqRender();
}

function seqUpdateCode() {
  const { participants, messages } = builderState.sequence;
  const lines = ['sequenceDiagram'];

  participants.forEach(p => {
    lines.push(`    ${p.type} ${p.name}`);
  });

  messages.forEach(m => {
    lines.push(`    ${m.from}${m.arrow}${m.to}: ${m.label}`);
  });

  setCodeAndRender(lines.join('\n'));
}

// ── User Journey Builder ───────────────────────────────────

function journeyInit() {
  builderState.journey = {
    title: 'My User Journey',
    sections: [
      {
        name: 'Awareness',
        tasks: [
          { label: 'Discovers service', actor: 'User', score: 3 },
          { label: 'Reads information', actor: 'User', score: 4 },
        ],
      },
      {
        name: 'Application',
        tasks: [
          { label: 'Fills in form', actor: 'User', score: 2 },
          { label: 'Submits application', actor: 'User', score: 3 },
        ],
      },
      {
        name: 'Outcome',
        tasks: [
          { label: 'Receives decision', actor: 'User', score: 4 },
        ],
      },
    ],
  };
  journeyRender();
}

function journeyRender() {
  const panel = document.getElementById('journey-builder');
  if (!panel) return;

  const { title, sections } = builderState.journey;

  panel.innerHTML = `
    <div class="form-group" style="margin-bottom:12px">
      <label>Journey title</label>
      <input type="text" value="${escapeAttr(title)}" placeholder="e.g. Student Scholarship Application"
        oninput="journeySetTitle(this.value)"
        style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px">
    </div>

    <div class="form-section-title">Sections &amp; Tasks</div>
    <div id="journey-sections">
      ${sections.map((s, si) => journeySectionHtml(s, si)).join('')}
    </div>
    <button class="btn btn-add btn-sm" style="margin-top:8px" onclick="journeyAddSection()">+ Add section</button>
  `;

  journeyUpdateCode();
}

function journeySectionHtml(section, si) {
  return `
    <div class="journey-section">
      <div class="journey-section-header">
        <input type="text" value="${escapeAttr(section.name)}" placeholder="Section name"
          oninput="journeyUpdateSection(${si},'name',this.value)">
        <button class="btn-icon" onclick="journeyAddTask(${si})" title="Add task">+</button>
        <button class="btn-icon" onclick="journeyRemoveSection(${si})" title="Remove section">✕</button>
      </div>
      <div class="journey-tasks">
        ${section.tasks.map((t, ti) => journeyTaskHtml(t, si, ti)).join('')}
        ${section.tasks.length === 0 ? '<div style="font-size:12px;color:var(--muted);padding:4px 0">No tasks — click + to add</div>' : ''}
      </div>
    </div>`;
}

function journeyTaskHtml(task, si, ti) {
  return `
    <div class="journey-task">
      <input type="text" value="${escapeAttr(task.label)}" placeholder="Task label"
        oninput="journeyUpdateTask(${si},${ti},'label',this.value)">
      <input type="text" class="actor-input" value="${escapeAttr(task.actor)}" placeholder="Actor"
        oninput="journeyUpdateTask(${si},${ti},'actor',this.value)">
      <input type="number" value="${task.score}" min="1" max="5" title="Score 1-5"
        oninput="journeyUpdateTask(${si},${ti},'score',parseInt(this.value)||3)">
      <button class="btn-icon" onclick="journeyRemoveTask(${si},${ti})" title="Remove task">✕</button>
    </div>`;
}

function journeySetTitle(value) {
  builderState.journey.title = value;
  journeyUpdateCode();
}

function journeyUpdateSection(si, field, value) {
  builderState.journey.sections[si][field] = value;
  journeyUpdateCode();
}

function journeyUpdateTask(si, ti, field, value) {
  builderState.journey.sections[si].tasks[ti][field] = value;
  journeyUpdateCode();
}

function journeyAddSection() {
  builderState.journey.sections.push({ name: 'New Section', tasks: [] });
  journeyRender();
}

function journeyRemoveSection(si) {
  builderState.journey.sections.splice(si, 1);
  journeyRender();
}

function journeyAddTask(si) {
  builderState.journey.sections[si].tasks.push({ label: 'New task', actor: 'User', score: 3 });
  journeyRender();
}

function journeyRemoveTask(si, ti) {
  builderState.journey.sections[si].tasks.splice(ti, 1);
  journeyRender();
}

function journeyUpdateCode() {
  const { title, sections } = builderState.journey;
  const lines = ['journey'];
  if (title) lines.push(`    title ${title}`);

  sections.forEach(s => {
    lines.push(`    section ${s.name}`);
    s.tasks.forEach(t => {
      const score = Math.min(5, Math.max(1, t.score || 3));
      lines.push(`        ${t.label}: ${score}: ${t.actor}`);
    });
  });

  setCodeAndRender(lines.join('\n'));
}

// ── Gantt Builder ──────────────────────────────────────────

function ganttInit() {
  const today = new Date();
  const startDate = today.toISOString().split('T')[0];

  builderState.gantt = {
    title: 'Project Timeline',
    dateFormat: 'YYYY-MM-DD',
    sections: [
      {
        name: 'Discovery',
        tasks: [
          { label: 'Stakeholder interviews', status: '', id: 'a1', start: startDate, duration: '7d' },
          { label: 'Research synthesis', status: '', id: 'a2', start: 'after a1', duration: '5d' },
        ],
      },
      {
        name: 'Design',
        tasks: [
          { label: 'Prototype', status: 'active', id: 'b1', start: 'after a2', duration: '10d' },
        ],
      },
    ],
  };
  ganttRender();
}

function ganttRender() {
  const panel = document.getElementById('gantt-builder');
  if (!panel) return;

  const { title, dateFormat, sections } = builderState.gantt;

  panel.innerHTML = `
    <div class="form-group" style="margin-bottom:8px">
      <label>Project title</label>
      <input type="text" value="${escapeAttr(title)}" placeholder="e.g. Project Timeline"
        oninput="ganttSetTitle(this.value)"
        style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px">
    </div>

    <div class="form-section-title">Sections &amp; Tasks</div>
    <div id="gantt-sections">
      ${sections.map((s, si) => ganttSectionHtml(s, si)).join('')}
    </div>
    <button class="btn btn-add btn-sm" style="margin-top:8px" onclick="ganttAddSection()">+ Add section</button>
  `;

  ganttUpdateCode();
}

function ganttSectionHtml(section, si) {
  return `
    <div class="gantt-section">
      <div class="gantt-section-header">
        <input type="text" value="${escapeAttr(section.name)}" placeholder="Section name"
          oninput="ganttUpdateSection(${si},'name',this.value)">
        <button class="btn-icon" onclick="ganttAddTask(${si})" title="Add task">+</button>
        <button class="btn-icon" onclick="ganttRemoveSection(${si})" title="Remove section">✕</button>
      </div>
      <div class="gantt-tasks">
        ${section.tasks.map((t, ti) => ganttTaskHtml(t, si, ti)).join('')}
        ${section.tasks.length === 0 ? '<div style="font-size:12px;color:var(--muted);padding:4px 0">No tasks — click + to add</div>' : ''}
      </div>
    </div>`;
}

function ganttTaskHtml(task, si, ti) {
  return `
    <div class="gantt-task">
      <input type="text" value="${escapeAttr(task.label)}" placeholder="Task name"
        oninput="ganttUpdateTask(${si},${ti},'label',this.value)">
      <select onchange="ganttUpdateTask(${si},${ti},'status',this.value)">
        <option value=""        ${task.status===''?'selected':''}>Normal</option>
        <option value="done"    ${task.status==='done'?'selected':''}>Done</option>
        <option value="active"  ${task.status==='active'?'selected':''}>Active</option>
        <option value="crit"    ${task.status==='crit'?'selected':''}>Critical</option>
        <option value="milestone" ${task.status==='milestone'?'selected':''}>Milestone</option>
      </select>
      <input type="text" value="${escapeAttr(task.id)}" placeholder="ID (e.g. a1)"
        oninput="ganttUpdateTask(${si},${ti},'id',this.value)" style="max-width:60px">
      <input type="text" value="${escapeAttr(task.start)}" placeholder="Start (YYYY-MM-DD or after id)"
        oninput="ganttUpdateTask(${si},${ti},'start',this.value)">
      <input type="text" value="${escapeAttr(task.duration)}" placeholder="Duration (e.g. 7d)"
        oninput="ganttUpdateTask(${si},${ti},'duration',this.value)" style="max-width:70px">
      <button class="btn-icon" onclick="ganttRemoveTask(${si},${ti})" title="Remove task">✕</button>
    </div>`;
}

function ganttSetTitle(value) {
  builderState.gantt.title = value;
  ganttUpdateCode();
}

function ganttUpdateSection(si, field, value) {
  builderState.gantt.sections[si][field] = value;
  ganttUpdateCode();
}

function ganttUpdateTask(si, ti, field, value) {
  builderState.gantt.sections[si].tasks[ti][field] = value;
  ganttUpdateCode();
}

function ganttAddSection() {
  builderState.gantt.sections.push({ name: 'New Section', tasks: [] });
  ganttRender();
}

function ganttRemoveSection(si) {
  builderState.gantt.sections.splice(si, 1);
  ganttRender();
}

function ganttAddTask(si) {
  const today = new Date().toISOString().split('T')[0];
  builderState.gantt.sections[si].tasks.push({
    label: 'New task', status: '', id: 't' + _builderTaskCounter++, start: today, duration: '5d',
  });
  ganttRender();
}

function ganttRemoveTask(si, ti) {
  builderState.gantt.sections[si].tasks.splice(ti, 1);
  ganttRender();
}

function ganttUpdateCode() {
  const { title, dateFormat, sections } = builderState.gantt;
  const lines = ['gantt'];
  if (title) lines.push(`    title ${title}`);
  lines.push(`    dateFormat ${dateFormat}`);

  sections.forEach(s => {
    lines.push(`    section ${s.name}`);
    s.tasks.forEach(t => {
      const statusPart = t.status ? t.status + ', ' : '';
      lines.push(`        ${t.label} :${statusPart}${t.id}, ${t.start}, ${t.duration}`);
    });
  });

  setCodeAndRender(lines.join('\n'));
}

// ── Shared helpers ─────────────────────────────────────────

/**
 * Set the code textarea value and trigger a preview render.
 * Called by all builder update functions.
 */
function setCodeAndRender(code) {
  const input = document.getElementById('mermaid-code-input');
  if (input) input.value = code;
  previewScheduleRender(code, 150);
}

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// escapeHtml is also defined in preview.js — safe to call from here
// since both files are loaded in the same page scope.

// ── Load builder state from Mermaid code ───────────────────
/**
 * When a user switches from code editor to form builder,
 * attempt to parse the current code back into builder state.
 * Falls back to default init if parsing fails.
 */
function builderLoadFromCode(code, diagramType) {
  try {
    switch (diagramType) {
      case 'flowchart': fcInit(); break;  // TODO: parse flowchart code
      case 'sequence':  seqInit(); break; // TODO: parse sequence code
      case 'journey':   journeyInit(); break;
      case 'gantt':     ganttInit(); break;
      default:          fcInit(); break;
    }
  } catch (e) {
    console.warn('Could not parse code into builder state, using defaults:', e);
  }
}

// ── Init the correct builder for a diagram type ────────────
function builderInitForType(diagramType) {
  switch (diagramType) {
    case 'flowchart': fcInit(); break;
    case 'sequence':  seqInit(); break;
    case 'journey':   journeyInit(); break;
    case 'gantt':     ganttInit(); break;
    default:          fcInit(); break;
  }
}
