// ============================================================
// PROGRESS BAR
// ============================================================
function updateProgress() {
  const required = [
    formData.projectName, formData.version, formData.status,
    formData.authors, formData.date,
    formData.projectSponsorName, formData.projectSponsorRole,
    formData.execSponsors?.[0]?.name,
    formData.projectTeam?.[0]?.name,
    formData.hmwQuestion || formData.problemRaw,
    formData.strategicObjective || formData.strategicContext,
    formData.programMeasures?.[0],
    formData.projectMeasures?.[0],
    formData.inScope?.[0],
    formData.outScope?.[0],
    formData.risks?.[0]?.risk,
    formData.phases?.[0]?.phase,
    formData.dependencies?.[0],
    formData.stakeholders?.[0]?.name
  ];
  const filled = required.filter(v => v && v.toString().trim() !== '').length;
  const pct = Math.round((filled / required.length) * 100);
  document.getElementById('progress-bar-fill').style.width = pct + '%';
  document.getElementById('progress-pct').textContent = pct + '%';
}

// ============================================================
// ACCORDION
// ============================================================
function toggleSection(id) {
  const header = document.getElementById('header-' + id);
  const body   = document.getElementById('body-' + id);
  const isOpen = body.classList.contains('open');
  // Close all
  document.querySelectorAll('.section-body').forEach(b => b.classList.remove('open'));
  document.querySelectorAll('.section-header').forEach(h => h.classList.remove('open'));
  // Open clicked if it was closed
  if (!isOpen) {
    body.classList.add('open');
    header.classList.add('open');
  }
}

function openSection(id) {
  document.getElementById('body-' + id).classList.add('open');
  document.getElementById('header-' + id).classList.add('open');
}

// TOAST
// ============================================================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3800);
}

// ============================================================
// MODAL
// ============================================================
let modalCallback = null;

function showModal(title, message, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-overlay').classList.add('open');
  modalCallback = onConfirm;
}

document.getElementById('modal-cancel').onclick = () => {
  document.getElementById('modal-overlay').classList.remove('open');
  modalCallback = null;
};

document.getElementById('modal-confirm').onclick = () => {
  document.getElementById('modal-overlay').classList.remove('open');
  if (modalCallback) modalCallback();
  modalCallback = null;
};
