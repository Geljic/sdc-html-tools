// ============================================================
// SDC Stakeholder Mapper — raci.js
// RACI / Engagement Matrix — interactive HTML table renderer
// D3 used for data binding and cell colour transitions
// ============================================================

// ── Render ─────────────────────────────────────────────────

/**
 * Render or re-render the RACI table.
 * Called whenever stakeholder data or phases change.
 */
function smRenderRaci() {
  const container = document.getElementById('sm-raci-container');
  if (!container) return;

  const stakeholders = smState.stakeholders;
  const phases = smState.phases;

  // Show/hide empty state
  const emptyEl = document.getElementById('sm-raci-empty');
  if (stakeholders.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    const existing = container.querySelector('table');
    if (existing) existing.remove();
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Remove existing table
  const existing = container.querySelector('table');
  if (existing) existing.remove();

  // Build table using D3
  const table = d3.select(container)
    .append('table')
    .attr('class', 'sm-raci-table')
    .attr('aria-label', 'RACI Engagement Matrix');

  // ── Header ────────────────────────────────────────────────
  const thead = table.append('thead');
  const headerRow = thead.append('tr');

  headerRow.append('th')
    .attr('scope', 'col')
    .text('Stakeholder');

  for (const phase of phases) {
    headerRow.append('th')
      .attr('scope', 'col')
      .attr('class', 'phase-col')
      .text(phase);
  }

  // ── Body ──────────────────────────────────────────────────
  const tbody = table.append('tbody');

  // Group stakeholders
  const grouped = smGetGroupedStakeholders();

  for (const group of grouped) {
    // Group header row
    const groupRow = tbody.append('tr')
      .attr('class', 'sm-raci-group-row');

    groupRow.append('td')
      .attr('colspan', phases.length + 1)
      .html(`<span style="display:inline-flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${group.colour};display:inline-block"></span>
        ${escHtml(group.label)}
      </span>`);

    // Stakeholder rows
    for (const sh of group.stakeholders) {
      const row = tbody.append('tr')
        .attr('data-id', sh.id);

      // Name cell
      row.append('td')
        .html(`
          <div class="sm-raci-name-cell">
            <span class="sm-raci-dot" style="background:${smGroupColour(sh.group)}"></span>
            <div>
              <div class="sm-raci-name">${escHtml(sh.name)}</div>
              ${sh.team ? `<div class="sm-raci-team">${escHtml(sh.team)}</div>` : ''}
            </div>
          </div>
        `);

      // Phase cells
      for (const phase of phases) {
        const key  = phase.toLowerCase();
        const code = sh.raci[key] || '—';

        row.append('td')
          .attr('class', 'sm-raci-cell')
          .attr('title', `Click to change ${sh.name} — ${phase}`)
          .attr('aria-label', `${sh.name}, ${phase}: ${code}`)
          .html(raciCellHtml(code))
          .on('click', function() {
            const next = smCycleRaci(sh.id, phase);
            d3.select(this)
              .html(raciCellHtml(next))
              .attr('aria-label', `${sh.name}, ${phase}: ${next}`);
          });
      }
    }
  }
}

// ── Cell HTML ──────────────────────────────────────────────

/**
 * Generate the HTML for a RACI cell badge.
 * @param {string} code  — L | A | C | I | E | —
 * @returns {string}
 */
function raciCellHtml(code) {
  if (!code || code === '—' || code === '-') {
    return `<span class="raci-badge raci-empty" title="Not involved">—</span>`;
  }
  return `<span class="raci-badge raci-${escHtml(code)}" title="${raciCodeLabel(code)}">${escHtml(code)}</span>`;
}

/**
 * Human-readable label for a RACI code.
 * @param {string} code
 * @returns {string}
 */
function raciCodeLabel(code) {
  const labels = {
    L: 'Lead — owns this phase',
    A: 'Accountable — signs off',
    C: 'Consult — input required',
    I: 'Inform — kept updated',
    E: 'Engage — active participant',
    '—': 'Not involved',
  };
  return labels[code] || code;
}

// ── Utility ────────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
