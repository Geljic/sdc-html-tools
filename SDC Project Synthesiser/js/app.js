window.Synth = window.Synth || {};

Synth.app = (function () {
  let currentTab = 'project';
  let activeProjectId = null;
  let pendingParse = null;
  let selectedThemes = new Set();
  let cachedRqMap = {};

  async function init() {
    initNavigation();
    initSettingsModal();
    initProjectsView();
    initProjectTab();
    initSettingsTab();
    initParticipantsTab();
    Synth.deidentify.initEvents();
    initSynthesisControls();
    initThemesTab();
    initExportTab();
    initNudges();
    loadSavedCredentials();

    try {
      await Synth.db.open();
      await Synth.db.migrateToV5();
      await loadProjectList();
    } catch (e) {
      console.error('IndexedDB failed to open:', e);
      showStatus('api-status', 'error',
        'Database failed to initialise: ' + e.message +
        '. Some features may not work. Try a Chromium-based browser (Chrome, Edge).'
      );
    }
  }

  // ========== Navigation ==========

  function initNavigation() {
    document.querySelectorAll('#workspace-nav .tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });

    document.getElementById('btn-back-projects').addEventListener('click', exitProject);
  }

  function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('#workspace-nav .tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'tab-' + tabId);
    });
    if (tabId === 'themes') refreshThemes();
    if (tabId === 'participants') refreshSessionList();
    if (tabId === 'settings') loadSettingsTab();
    if (tabId === 'export') loadExportDefaults();
  }

  function enterProject(projectId, projectName) {
    activeProjectId = projectId;
    document.getElementById('view-projects').classList.remove('active');
    document.getElementById('workspace-nav').classList.remove('hidden');
    document.getElementById('btn-back-projects').classList.remove('hidden');
    updateProjectIndicator(projectName);
    switchTab('project');
    loadFramework();
  }

  function exitProject() {
    activeProjectId = null;
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('workspace-nav').classList.add('hidden');
    document.getElementById('btn-back-projects').classList.add('hidden');
    document.getElementById('view-projects').classList.add('active');
    updateProjectIndicator('');
    loadProjectList();
  }

  function updateProjectIndicator(name) {
    document.getElementById('project-indicator').textContent = name ? name : '';
  }

  // ========== Settings Modal ==========

  function initSettingsModal() {
    document.getElementById('btn-settings').addEventListener('click', function () {
      document.getElementById('settings-modal').classList.remove('hidden');
    });
    document.getElementById('btn-close-settings').addEventListener('click', function () {
      document.getElementById('settings-modal').classList.add('hidden');
    });
    document.getElementById('settings-modal').addEventListener('click', function (e) {
      if (e.target === this) this.classList.add('hidden');
    });
    document.getElementById('btn-save-api').addEventListener('click', saveCredentials);
    document.getElementById('btn-test-api').addEventListener('click', testConnection);
  }

  function loadSavedCredentials() {
    var endpoint = Synth.api.getEndpoint();
    var key = Synth.api.getApiKey();
    if (endpoint) document.getElementById('api-endpoint').value = endpoint;
    if (key) document.getElementById('api-key').value = key;
  }

  function saveCredentials() {
    var endpoint = document.getElementById('api-endpoint').value.trim();
    var key = document.getElementById('api-key').value.trim();
    if (!endpoint) { showStatus('api-status', 'error', 'Please enter a gateway endpoint.'); return; }
    if (!key) { showStatus('api-status', 'error', 'Please enter an API key.'); return; }
    Synth.api.saveCredentials(endpoint, key);
    showStatus('api-status', 'success', 'Credentials saved.');
  }

  async function testConnection() {
    var endpoint = document.getElementById('api-endpoint').value.trim();
    var key = document.getElementById('api-key').value.trim();
    if (!endpoint || !key) { showStatus('api-status', 'error', 'Enter your endpoint and API key first.'); return; }
    Synth.api.saveCredentials(endpoint, key);

    var btn = document.getElementById('btn-test-api');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Testing…';
    showStatus('api-status', 'info', 'Connecting to gateway…');

    try {
      var result = await Synth.api.testConnection();
      showStatus('api-status', 'success',
        'Connected. Found ' + result.models.length + ' model(s) (' + result.anthropic.length + ' Anthropic).');
      renderModelList(result.models);
    } catch (e) {
      showStatus('api-status', 'error', e.message);
      document.getElementById('api-models-card').classList.add('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test Connection';
    }
  }

  function renderModelList(models) {
    var list = document.getElementById('api-models-list');
    list.innerHTML = '';
    models.forEach(function (id) {
      var li = document.createElement('li');
      li.textContent = id;
      if (/claude|sonnet|haiku|opus/i.test(id)) li.classList.add('anthropic');
      list.appendChild(li);
    });
    document.getElementById('api-models-card').classList.remove('hidden');
  }

  // ========== Projects View ==========

  function initProjectsView() {
    document.getElementById('btn-new-project').addEventListener('click', function () {
      document.getElementById('new-project-form').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-project').addEventListener('click', function () {
      document.getElementById('new-project-form').classList.add('hidden');
    });
    document.getElementById('btn-create-project').addEventListener('click', createProject);
  }

  async function loadProjectList() {
    var projects = await Synth.db.getProjects();
    var container = document.getElementById('projects-list');
    var empty = document.getElementById('projects-empty');

    if (projects.length === 0) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    container.innerHTML = '';

    projects.forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'project-list-item';
      div.dataset.id = p.project_id;
      div.innerHTML =
        '<span class="project-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="project-meta">' + formatDate(p.created) + '</span>' +
        '<span class="project-arrow">&rsaquo;</span>';
      div.addEventListener('click', function () {
        enterProject(p.project_id, p.name);
      });
      container.appendChild(div);
    });
  }

  async function createProject() {
    var name = document.getElementById('new-project-name').value.trim();
    if (!name) { showStatus('project-status', 'error', 'Enter a project name.'); return; }

    var project = await Synth.db.createProject(name);
    await Synth.db.createDefaultFramework(project.project_id);
    document.getElementById('new-project-form').classList.add('hidden');
    document.getElementById('new-project-name').value = '';

    enterProject(project.project_id, name);
  }

  // ========== Project Info Tab ==========

  var bgSaveTimer = null;
  var bgDocFile = null;
  var bgImageFiles = [];
  var activeBgMethod = null;

  function initProjectTab() {
    document.getElementById('btn-add-rq').addEventListener('click', addResearchQuestion);
    document.getElementById('btn-add-dimension').addEventListener('click', function () {
      document.getElementById('dimension-add-form').classList.remove('hidden');
      document.getElementById('btn-add-dimension').classList.add('hidden');
      document.getElementById('new-dimension-label').focus();
    });
    document.getElementById('btn-cancel-dimension').addEventListener('click', function () {
      document.getElementById('dimension-add-form').classList.add('hidden');
      document.getElementById('btn-add-dimension').classList.remove('hidden');
      document.getElementById('new-dimension-label').value = '';
    });
    document.getElementById('btn-create-dimension').addEventListener('click', addDimension);
    document.getElementById('new-dimension-label').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addDimension(); }
      if (e.key === 'Escape') {
        document.getElementById('dimension-add-form').classList.add('hidden');
        document.getElementById('btn-add-dimension').classList.remove('hidden');
        document.getElementById('new-dimension-label').value = '';
      }
    });
    document.getElementById('new-rq-label').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addResearchQuestion(); }
    });

    // Auto-save background on typing
    document.getElementById('fw-background').addEventListener('input', function () {
      clearTimeout(bgSaveTimer);
      bgSaveTimer = setTimeout(autoSaveBackground, 1500);
    });

    // Section summary/edit toggles
    document.getElementById('btn-bg-edit').addEventListener('click', function () { setSectionView('bg', 'edit'); });
    document.getElementById('btn-bg-done').addEventListener('click', function () { setSectionView('bg', 'summary'); });
    document.getElementById('btn-rq-edit').addEventListener('click', function () { setSectionView('rq', 'edit'); });
    document.getElementById('btn-rq-done').addEventListener('click', function () { setSectionView('rq', 'summary'); });
    document.getElementById('btn-dim-edit').addEventListener('click', function () { setSectionView('dim', 'edit'); });
    document.getElementById('btn-dim-done').addEventListener('click', function () { setSectionView('dim', 'summary'); });

    // Show more/less for background summary
    document.getElementById('btn-bg-show-more').addEventListener('click', function () {
      var body = document.getElementById('bg-summary-text');
      var isExpanded = !body.classList.contains('truncated');
      body.classList.toggle('truncated', isExpanded);
      this.textContent = isExpanded ? 'Show more' : 'Show less';
    });

    initBgModal();
  }

  // ========== Section Summary/Edit ==========

  function setSectionView(section, view) {
    var summaryEl = document.getElementById(section + '-summary');
    var editEl = document.getElementById(section + '-edit');
    if (view === 'summary') {
      refreshSectionSummary(section);
      summaryEl.classList.remove('hidden');
      editEl.classList.add('hidden');
    } else {
      summaryEl.classList.add('hidden');
      editEl.classList.remove('hidden');
    }
  }

  async function refreshSectionSummary(section) {
    if (!activeProjectId) return;
    var fw = await Synth.db.getFramework(activeProjectId);
    if (!fw) return;

    if (section === 'bg') {
      var text = fw.background || '';
      var summaryText = document.getElementById('bg-summary-text');
      summaryText.textContent = text;
      summaryText.classList.add('truncated');
      document.getElementById('btn-bg-show-more').textContent = 'Show more';
      document.getElementById('btn-bg-show-more').classList.toggle('hidden', text.length < 300);
    }

    if (section === 'rq') {
      var rqs = fw.research_questions || [];
      document.getElementById('rq-summary-heading').textContent = 'Research Questions (' + rqs.length + ')';
      var list = document.getElementById('rq-summary-list');
      list.innerHTML = '';
      rqs.forEach(function (rq) {
        var li = document.createElement('li');
        li.textContent = rq.label;
        list.appendChild(li);
      });
    }

    if (section === 'dim') {
      var dims = fw.participant_dimensions || [];
      document.getElementById('dim-summary-heading').textContent = 'Participant Dimensions (' + dims.length + ')';
      var container = document.getElementById('dim-summary-list');
      container.innerHTML = '';
      if (dims.length === 0) {
        container.innerHTML = '<p class="text-secondary text-small">None defined (optional)</p>';
      } else {
        dims.forEach(function (dim) {
          var div = document.createElement('div');
          div.className = 'dim-summary-item';
          var tagLabels = dim.tags.map(function (t) { return t.label; }).join(', ');
          div.innerHTML = '<span class="dim-summary-label">' + escapeHtml(dim.label) + ':</span> ' +
            '<span class="dim-summary-tags">' + (tagLabels ? escapeHtml(tagLabels) : '<em>no tags yet</em>') + '</span>';
          container.appendChild(div);
        });
      }
    }
  }

  function updateCompletenessIndicator(fw) {
    var el = document.getElementById('project-info-status');
    var hasBg = !!(fw.background && fw.background.trim());
    var hasRq = !!(fw.research_questions && fw.research_questions.length > 0);
    var hasDim = !!(fw.participant_dimensions && fw.participant_dimensions.length > 0);

    el.innerHTML =
      '<span class="status-item">' +
        '<span class="' + (hasBg ? 'status-check' : 'status-empty') + '">' + (hasBg ? '&#10003;' : '&#9675;') + '</span> Background' +
      '</span>' +
      '<span class="status-item">' +
        '<span class="' + (hasRq ? 'status-check' : 'status-empty') + '">' + (hasRq ? '&#10003;' : '&#9675;') + '</span> Research Questions' +
      '</span>' +
      '<span class="status-item">' +
        '<span class="' + (hasDim ? 'status-check' : 'status-empty') + '">' + (hasDim ? '&#10003;' : '&mdash;') + '</span> Dimensions' +
      '</span>';
  }

  function updateDoneButtons(fw) {
    var hasBg = !!(fw.background && fw.background.trim());
    var hasRq = !!(fw.research_questions && fw.research_questions.length > 0);
    var hasDim = !!(fw.participant_dimensions && fw.participant_dimensions.length > 0);
    document.getElementById('btn-bg-done').classList.toggle('hidden', !hasBg);
    document.getElementById('btn-rq-done').classList.toggle('hidden', !hasRq);
    document.getElementById('btn-dim-done').classList.toggle('hidden', !hasDim);
  }

  // ========== Auto-save ==========

  async function autoSaveBackground() {
    if (!activeProjectId) return;
    var fw = await Synth.db.getFramework(activeProjectId);
    fw.background = document.getElementById('fw-background').value.trim();
    await Synth.db.saveFramework(fw);
    updateCompletenessIndicator(fw);
    updateDoneButtons(fw);

    var indicator = document.getElementById('bg-autosave-indicator');
    indicator.classList.remove('hidden', 'fading');
    indicator.textContent = 'Saved';
    setTimeout(function () {
      indicator.classList.add('fading');
      setTimeout(function () { indicator.classList.add('hidden'); }, 300);
    }, 2000);
  }

  // ========== Background Generator (Modal) ==========

  function initBgModal() {
    // Method cards (both in edit and summary views)
    document.querySelectorAll('.bg-method-card').forEach(function (card) {
      card.addEventListener('click', function () {
        openBgModal(card.dataset.bgMethod);
      });
    });

    // Modal close
    document.getElementById('btn-close-bg-modal').addEventListener('click', closeBgModal);
    document.getElementById('bg-modal').addEventListener('click', function (e) {
      if (e.target === this) closeBgModal();
    });

    // Generation buttons
    document.getElementById('btn-bg-generate').addEventListener('click', generateBgFromQuestions);
    document.getElementById('btn-bg-extract').addEventListener('click', generateBgFromDocument);
    document.getElementById('btn-bg-img-generate').addEventListener('click', generateBgFromImages);
    document.getElementById('btn-bg-use').addEventListener('click', useBgPreview);
    document.getElementById('btn-bg-regenerate').addEventListener('click', regenerateBg);

    // Document dropzone
    initDocDropzone();

    // Image dropzone
    initImgDropzone();
  }

  function openBgModal(method) {
    activeBgMethod = method;
    var modal = document.getElementById('bg-modal');
    var titles = { questions: 'Answer a few questions', document: 'Upload a document', images: 'Upload screenshots' };
    document.getElementById('bg-modal-title').textContent = titles[method] || 'Generate Background';

    // Show the right path
    document.querySelectorAll('.bg-modal-path').forEach(function (p) { p.classList.add('hidden'); });
    var pathEl = document.getElementById('bg-modal-' + method);
    if (pathEl) pathEl.classList.remove('hidden');

    // Reset preview
    document.getElementById('bg-preview-panel').classList.add('hidden');
    document.getElementById('bg-modal-status').className = '';
    document.getElementById('bg-modal-status').textContent = '';

    modal.classList.remove('hidden');
  }

  function closeBgModal() {
    document.getElementById('bg-modal').classList.add('hidden');
  }

  // --- Document dropzone ---

  function initDocDropzone() {
    var dropzone = document.getElementById('bg-doc-dropzone');
    var fileInput = document.getElementById('bg-doc-input');

    dropzone.addEventListener('click', function (e) {
      if (e.target.closest('.upload-file-remove')) return;
      if (dropzone.classList.contains('has-file')) {
        fileInput.click();
      } else {
        fileInput.click();
      }
    });
    dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      handleBgDocFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files[0]) handleBgDocFile(fileInput.files[0]);
      fileInput.value = '';
    });
  }

  function handleBgDocFile(file) {
    if (!file) return;
    var ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'docx' && ext !== 'pptx') {
      showStatus('bg-modal-status', 'error', 'Unsupported file type. Please upload a .docx or .pptx file.');
      return;
    }
    bgDocFile = file;
    renderDocFileCard();
    document.getElementById('btn-bg-extract').disabled = false;
  }

  function renderDocFileCard() {
    var dropzone = document.getElementById('bg-doc-dropzone');
    var sizeKb = Math.round(bgDocFile.size / 1024);
    dropzone.classList.add('has-file');
    dropzone.innerHTML =
      '<div class="upload-file-card">' +
        '<span class="upload-file-icon">&#128196;</span>' +
        '<div class="upload-file-info">' +
          '<div class="upload-file-name">' + escapeHtml(bgDocFile.name) + '</div>' +
          '<div class="upload-file-size">' + sizeKb + ' KB</div>' +
        '</div>' +
        '<button class="upload-file-remove" type="button" title="Remove file">&times;</button>' +
      '</div>' +
      '<input type="file" id="bg-doc-input" accept=".docx,.pptx" class="hidden">';

    // Re-bind remove
    dropzone.querySelector('.upload-file-remove').addEventListener('click', function (e) {
      e.stopPropagation();
      clearDocFile();
    });
    // Re-bind file input
    var newInput = dropzone.querySelector('#bg-doc-input');
    newInput.addEventListener('change', function () {
      if (newInput.files[0]) handleBgDocFile(newInput.files[0]);
      newInput.value = '';
    });
  }

  function clearDocFile() {
    bgDocFile = null;
    var dropzone = document.getElementById('bg-doc-dropzone');
    dropzone.classList.remove('has-file');
    dropzone.innerHTML =
      '<p class="upload-zone-prompt">Drop a .docx or .pptx file here, or click to browse</p>' +
      '<input type="file" id="bg-doc-input" accept=".docx,.pptx" class="hidden">';
    document.getElementById('btn-bg-extract').disabled = true;
    initDocDropzone();
  }

  // --- Image dropzone ---

  function initImgDropzone() {
    var dropzone = document.getElementById('bg-img-dropzone');
    var fileInput = document.getElementById('bg-img-input');

    dropzone.addEventListener('click', function (e) {
      if (e.target.closest('.upload-thumb-remove') || e.target.closest('.upload-img-add')) return;
      fileInput.click();
    });
    dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      addBgImages(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener('change', function () {
      addBgImages(Array.from(fileInput.files));
      fileInput.value = '';
    });
  }

  function addBgImages(files) {
    var imageFiles = files.filter(function (f) { return f.type.startsWith('image/'); });
    if (!imageFiles.length) {
      showStatus('bg-modal-status', 'error', 'Please upload image files (PNG, JPG, or WebP).');
      return;
    }
    var remaining = 6 - bgImageFiles.length;
    if (remaining <= 0) {
      showStatus('bg-modal-status', 'error', 'Maximum 6 images allowed.');
      return;
    }
    var toAdd = imageFiles.slice(0, remaining);
    toAdd.forEach(function (f) {
      bgImageFiles.push({ file: f, objectUrl: URL.createObjectURL(f) });
    });
    if (imageFiles.length > remaining) {
      showStatus('bg-modal-status', 'info', 'Only added ' + toAdd.length + ' — maximum 6 images.');
    }
    renderImgThumbs();
    document.getElementById('btn-bg-img-generate').disabled = bgImageFiles.length === 0;
  }

  function removeBgImage(index) {
    var item = bgImageFiles[index];
    if (item && item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    bgImageFiles.splice(index, 1);
    renderImgThumbs();
    document.getElementById('btn-bg-img-generate').disabled = bgImageFiles.length === 0;
  }

  function renderImgThumbs() {
    var dropzone = document.getElementById('bg-img-dropzone');

    if (bgImageFiles.length === 0) {
      dropzone.classList.remove('has-file');
      dropzone.innerHTML =
        '<p class="upload-zone-prompt">Drop images here, or click to browse</p>' +
        '<input type="file" id="bg-img-input" accept="image/png,image/jpeg,image/webp" multiple class="hidden">';
      initImgDropzone();
      return;
    }

    dropzone.classList.add('has-file');
    var thumbsHtml = bgImageFiles.map(function (item, i) {
      return '<div class="upload-thumb">' +
        '<img src="' + item.objectUrl + '" alt="Image ' + (i + 1) + '">' +
        '<button class="upload-thumb-remove" data-img-index="' + i + '" type="button" title="Remove">&times;</button>' +
      '</div>';
    }).join('');

    var canAdd = bgImageFiles.length < 6;
    dropzone.innerHTML =
      '<div class="upload-thumb-grid">' + thumbsHtml + '</div>' +
      '<div class="upload-img-meta">' +
        '<span>' + bgImageFiles.length + ' of 6 images</span>' +
        (canAdd ? '<button class="upload-img-add" type="button">+ Add more</button>' : '') +
      '</div>' +
      '<input type="file" id="bg-img-input" accept="image/png,image/jpeg,image/webp" multiple class="hidden">';

    // Bind remove buttons
    dropzone.querySelectorAll('.upload-thumb-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        removeBgImage(parseInt(btn.dataset.imgIndex, 10));
      });
    });

    // Bind add more
    var addMoreBtn = dropzone.querySelector('.upload-img-add');
    if (addMoreBtn) {
      addMoreBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        dropzone.querySelector('#bg-img-input').click();
      });
    }

    // Re-bind file input
    var newInput = dropzone.querySelector('#bg-img-input');
    newInput.addEventListener('change', function () {
      addBgImages(Array.from(newInput.files));
      newInput.value = '';
    });
  }

  // --- Generation functions ---

  function getBgModel() {
    var sel = document.getElementById('default-synth-model');
    return (sel && sel.value) ? sel.value : 'claude-sonnet-4-6';
  }

  async function getFrameworkForBg() {
    if (!activeProjectId) return null;
    return await Synth.db.getFramework(activeProjectId);
  }

  async function generateBgFromQuestions() {
    if (!Synth.api.hasCredentials()) {
      showStatus('bg-modal-status', 'error', 'Configure your API credentials in Settings first.');
      return;
    }
    var project = document.getElementById('bg-q-project').value.trim();
    var goal = document.getElementById('bg-q-goal').value.trim();
    var method = document.getElementById('bg-q-method').value.trim();
    if (!project || !goal || !method) {
      showStatus('bg-modal-status', 'error', 'Please fill in at least the first three fields.');
      return;
    }
    var answers = {
      project: project,
      goal: goal,
      method: method,
      participants: document.getElementById('bg-q-participants').value.trim(),
      domain: document.getElementById('bg-q-domain').value.trim()
    };

    var fw = await getFrameworkForBg();
    var existing = document.getElementById('fw-background').value.trim();
    var userPrompt = Synth.prompts.buildBgFromQuestionnaire(answers, fw);
    if (existing) userPrompt += '\n\nExisting background (for reference):\n' + existing;

    await callBgGeneration([{ role: 'user', content: userPrompt }]);
  }

  async function generateBgFromDocument() {
    if (!Synth.api.hasCredentials()) {
      showStatus('bg-modal-status', 'error', 'Configure your API credentials in Settings first.');
      return;
    }
    if (!bgDocFile) {
      showStatus('bg-modal-status', 'error', 'Please upload a document first.');
      return;
    }

    var btn = document.getElementById('btn-bg-extract');
    btn.disabled = true;
    btn.textContent = 'Reading document...';
    showStatus('bg-modal-status', 'info', 'Extracting text from document...');

    try {
      var ext = bgDocFile.name.split('.').pop().toLowerCase();
      var text;
      if (ext === 'pptx') {
        text = await Synth.parser.extractPptxText(bgDocFile);
      } else {
        text = await Synth.parser.extractDocxText(bgDocFile);
      }

      if (!text || text.trim().length < 20) {
        showStatus('bg-modal-status', 'error', 'Could not extract enough text from the document. Try a different file.');
        return;
      }

      var maxChars = 24000;
      if (text.length > maxChars) {
        text = text.substring(0, maxChars);
      }

      var fw = await getFrameworkForBg();
      var note = document.getElementById('bg-doc-note').value.trim();
      var userPrompt = Synth.prompts.buildBgFromDocument(text, note, fw);

      await callBgGeneration([{ role: 'user', content: userPrompt }]);
    } catch (err) {
      showStatus('bg-modal-status', 'error', 'Failed to read document: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate background';
    }
  }

  async function generateBgFromImages() {
    if (!Synth.api.hasCredentials()) {
      showStatus('bg-modal-status', 'error', 'Configure your API credentials in Settings first.');
      return;
    }
    if (bgImageFiles.length === 0) {
      showStatus('bg-modal-status', 'error', 'Please upload at least one image.');
      return;
    }

    var btn = document.getElementById('btn-bg-img-generate');
    btn.disabled = true;
    btn.textContent = 'Reading images...';
    showStatus('bg-modal-status', 'info', 'Processing ' + bgImageFiles.length + ' image(s)...');

    try {
      var base64Promises = bgImageFiles.map(function (item) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = reject;
          reader.readAsDataURL(item.file);
        });
      });
      var base64Images = await Promise.all(base64Promises);

      var fw = await getFrameworkForBg();
      var note = document.getElementById('bg-img-note').value.trim();
      var textPrompt = Synth.prompts.buildBgFromImages(note, fw);

      var content = [{ type: 'text', text: textPrompt }];
      base64Images.forEach(function (b64) {
        content.push({ type: 'image_url', image_url: { url: b64 } });
      });

      await callBgGeneration([{ role: 'user', content: content }]);
    } catch (err) {
      showStatus('bg-modal-status', 'error', 'Failed to process images: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate background';
    }
  }

  async function callBgGeneration(userMessages) {
    var allBtns = ['btn-bg-generate', 'btn-bg-extract', 'btn-bg-img-generate'];
    allBtns.forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.disabled = true;
    });
    showStatus('bg-modal-status', 'info', 'Generating background...');

    try {
      var model = getBgModel();
      var messages = [{ role: 'system', content: Synth.prompts.BG_GENERATOR_SYSTEM }].concat(userMessages);
      var result = await Synth.api.chatCompletion(model, messages, { max_tokens: 1024 });

      var text = result.content.trim();
      document.getElementById('bg-preview-text').value = text;
      document.getElementById('bg-preview-panel').classList.remove('hidden');
      showStatus('bg-modal-status', 'success', 'Background generated. Review the preview below.');
    } catch (err) {
      showStatus('bg-modal-status', 'error', 'Generation failed: ' + err.message);
    } finally {
      document.getElementById('btn-bg-generate').disabled = false;
      document.getElementById('btn-bg-extract').disabled = !bgDocFile;
      document.getElementById('btn-bg-img-generate').disabled = bgImageFiles.length === 0;
    }
  }

  async function useBgPreview() {
    var text = document.getElementById('bg-preview-text').value.trim();
    if (!text) return;
    document.getElementById('fw-background').value = text;
    closeBgModal();

    // Immediate save
    if (activeProjectId) {
      var fw = await Synth.db.getFramework(activeProjectId);
      fw.background = text;
      await Synth.db.saveFramework(fw);
      updateCompletenessIndicator(fw);
      updateDoneButtons(fw);

      // Switch to summary view if coming from summary
      setSectionView('bg', 'summary');
    }
  }

  function regenerateBg() {
    document.getElementById('bg-preview-panel').classList.add('hidden');
    if (activeBgMethod === 'document') {
      generateBgFromDocument();
    } else if (activeBgMethod === 'images') {
      generateBgFromImages();
    } else {
      generateBgFromQuestions();
    }
  }

  // ========== Settings Tab ==========

  function initSettingsTab() {
    document.getElementById('btn-save-model-defaults').addEventListener('click', saveModelDefaults);
    document.getElementById('btn-reset-synthesis').addEventListener('click', resetSynthesis);
    document.getElementById('btn-delete-project').addEventListener('click', deleteProject);
    document.getElementById('btn-save-prompts').addEventListener('click', savePrompts);
    document.getElementById('btn-reset-synthesis-prompt').addEventListener('click', function () {
      document.getElementById('custom-synthesis-prompt').value = '';
      showStatus('prompt-settings-status', 'info', 'Synthesis prompt reverted to default. Save to apply.');
    });
    document.getElementById('btn-reset-consolidation-prompt').addEventListener('click', function () {
      document.getElementById('custom-consolidation-prompt').value = '';
      showStatus('prompt-settings-status', 'info', 'Consolidation prompt reverted to default. Save to apply.');
    });
    document.getElementById('btn-preview-synthesis-prompt').addEventListener('click', function () { previewPrompt('synthesis'); });
    document.getElementById('btn-preview-consolidation-prompt').addEventListener('click', function () { previewPrompt('consolidation'); });
    document.getElementById('btn-close-prompt-preview').addEventListener('click', function () {
      document.getElementById('prompt-preview-panel').classList.add('hidden');
    });
  }

  async function loadSettingsTab() {
    if (!activeProjectId) return;
    var fw = await Synth.db.getFramework(activeProjectId);
    if (!fw) return;

    document.getElementById('default-synth-model').value = fw.default_synth_model || 'claude-sonnet-4-6';
    document.getElementById('default-consolidation-model').value = fw.default_consolidation_model || '';

    document.getElementById('custom-synthesis-prompt').value = fw.custom_synthesis_prompt || '';
    document.getElementById('custom-consolidation-prompt').value = fw.custom_consolidation_prompt || '';

    // Show current effective prompt status
    var synthCurrent = document.getElementById('synthesis-prompt-current');
    var consolCurrent = document.getElementById('consolidation-prompt-current');

    if (fw.custom_synthesis_prompt) {
      synthCurrent.textContent = 'Using custom prompt. Edit below or revert to default.';
      synthCurrent.className = 'prompt-current-preview custom';
    } else {
      synthCurrent.textContent = 'Using default prompt. Edit below to customise.';
      synthCurrent.className = 'prompt-current-preview default';
    }

    if (fw.custom_consolidation_prompt) {
      consolCurrent.textContent = 'Using custom prompt. Edit below or revert to default.';
      consolCurrent.className = 'prompt-current-preview custom';
    } else {
      consolCurrent.textContent = 'Using default prompt. Edit below to customise.';
      consolCurrent.className = 'prompt-current-preview default';
    }
  }

  async function saveModelDefaults() {
    if (!activeProjectId) return;
    var fw = await Synth.db.getFramework(activeProjectId);
    fw.default_synth_model = document.getElementById('default-synth-model').value || 'claude-sonnet-4-6';
    fw.default_consolidation_model = document.getElementById('default-consolidation-model').value || '';
    await Synth.db.saveFramework(fw);
    showStatus('model-defaults-status', 'success', 'Model defaults saved.');
  }

  async function resetSynthesis() {
    if (!activeProjectId) return;
    if (!confirm('This will delete all themes and reset all participant synthesis statuses. Transcripts are kept. Continue?')) return;

    // Delete all themes for this project
    var themes = await Synth.db.getThemesByProject(activeProjectId);
    for (var i = 0; i < themes.length; i++) {
      await Synth.db.deleteTheme(themes[i].theme_id);
    }

    // Delete all session syntheses for this project
    var syntheses = await Synth.db.getSessionSynthesesByProject(activeProjectId);
    for (var i = 0; i < syntheses.length; i++) {
      await Synth.db.deleteSessionSynthesis(syntheses[i].synthesis_id);
    }

    // Reset participant statuses and transcript statuses
    var participants = await Synth.db.getParticipantsByProject(activeProjectId);
    for (var i = 0; i < participants.length; i++) {
      var pp = participants[i];
      if (pp.transcript_id) {
        pp.synthesis_status = 'pending';
        var tx = await Synth.db.getTranscript(pp.transcript_id);
        if (tx) {
          tx.status = 'uploaded';
          await Synth.db.saveTranscript(tx);
        }
      }
      await Synth.db.saveParticipant(pp);
    }

    showStatus('reset-synthesis-status', 'success', 'Cleared ' + themes.length + ' theme(s). All participants reset to pending.');
  }

  async function deleteProject() {
    if (!activeProjectId) return;
    var project = await Synth.db.getProject(activeProjectId);
    var projectName = project ? project.name : 'this project';
    if (!confirm('Permanently delete "' + projectName + '" and all its data? This cannot be undone.')) return;
    if (!confirm('Are you sure? All sessions, participants, transcripts, themes, and syntheses will be lost.')) return;

    // Delete all themes
    var themes = await Synth.db.getThemesByProject(activeProjectId);
    for (var i = 0; i < themes.length; i++) {
      await Synth.db.deleteTheme(themes[i].theme_id);
    }

    // Delete all session syntheses
    var syntheses = await Synth.db.getSessionSynthesesByProject(activeProjectId);
    for (var i = 0; i < syntheses.length; i++) {
      await Synth.db.deleteSessionSynthesis(syntheses[i].synthesis_id);
    }

    var sessions = await Synth.db.getSessionsByProject(activeProjectId);
    for (var i = 0; i < sessions.length; i++) {
      var sess = sessions[i];
      if (sess.transcript_id) {
        await Synth.db.deleteTranscript(sess.transcript_id);
      }
      var sessionKey = activeProjectId + '_' + sess.session_id;
      var inquiries = await Synth.db.getInquiriesBySession(sessionKey);
      for (var q = 0; q < inquiries.length; q++) {
        await Synth.db.deleteInquiry(inquiries[q].inquiry_id);
      }
      await Synth.db.deleteSession(sess.session_id);
    }

    var participants = await Synth.db.getParticipantsByProject(activeProjectId);
    for (var i = 0; i < participants.length; i++) {
      await Synth.db.deleteParticipant(participants[i].participant_id);
    }

    // Delete framework and project
    await Synth.db.saveFramework({ project_id: activeProjectId });
    await Synth.db.deleteProject(activeProjectId);

    exitProject();
  }

  async function loadFramework() {
    if (!activeProjectId) return;

    var fw = await Synth.db.getFramework(activeProjectId);
    if (!fw) {
      fw = await Synth.db.createDefaultFramework(activeProjectId);
    }

    document.getElementById('fw-background').value = fw.background || '';
    renderResearchQuestions(fw.research_questions || []);
    renderParticipantDimensions(fw.participant_dimensions || []);
    updateRqDropdowns(fw.research_questions || []);
    updateCompletenessIndicator(fw);
    updateDoneButtons(fw);

    // Set initial summary/edit state per section
    var hasBg = !!(fw.background && fw.background.trim());
    var hasRq = !!(fw.research_questions && fw.research_questions.length > 0);
    var hasDim = !!(fw.participant_dimensions && fw.participant_dimensions.length > 0);

    setSectionView('bg', hasBg ? 'summary' : 'edit');
    setSectionView('rq', hasRq ? 'summary' : 'edit');
    setSectionView('dim', hasDim ? 'summary' : 'edit');
  }

  async function savePrompts() {
    if (!activeProjectId) return;
    var fw = await Synth.db.getFramework(activeProjectId);
    var synthVal = document.getElementById('custom-synthesis-prompt').value.trim();
    var consolVal = document.getElementById('custom-consolidation-prompt').value.trim();
    fw.custom_synthesis_prompt = synthVal || null;
    fw.custom_consolidation_prompt = consolVal || null;
    await Synth.db.saveFramework(fw);
    showStatus('prompt-settings-status', 'success', 'Prompt settings saved.');
  }

  async function previewPrompt(type) {
    if (!activeProjectId) return;
    var fw = await Synth.db.getFramework(activeProjectId);
    var previewFw = Object.assign({}, fw);
    previewFw.custom_synthesis_prompt = document.getElementById('custom-synthesis-prompt').value.trim() || null;
    previewFw.custom_consolidation_prompt = document.getElementById('custom-consolidation-prompt').value.trim() || null;

    var title, content;
    if (type === 'synthesis') {
      title = 'Full Per-Session Synthesis System Prompt';
      content = Synth.prompts.buildSynthesisSystem(previewFw);
    } else {
      title = 'Full Consolidation System Prompt';
      content = Synth.prompts.buildConsolidationSystem(previewFw);
    }

    document.getElementById('prompt-preview-title').textContent = title;
    document.getElementById('prompt-preview-content').textContent = content;
    document.getElementById('prompt-preview-panel').classList.remove('hidden');
  }

  // --- Facilitators ---

  // --- Research Questions ---

  function renderResearchQuestions(rqs) {
    var container = document.getElementById('rq-list');
    container.innerHTML = '';
    rqs.forEach(function (rq, i) {
      var div = document.createElement('div');
      div.className = 'fw-item';
      div.innerHTML =
        '<div class="fw-item-content">' +
          '<div class="fw-item-label">' + escapeHtml(rq.label) + '</div>' +
        '</div>' +
        '<div class="fw-item-actions">' +
          '<button class="btn-icon btn-icon-edit" data-action="edit-rq" data-index="' + i + '" title="Edit">&#9998;</button>' +
          '<button class="btn-icon" data-action="remove-rq" data-index="' + i + '" title="Remove">&times;</button>' +
        '</div>';
      container.appendChild(div);
    });
    container.addEventListener('click', handleRqAction);
  }

  async function addResearchQuestion() {
    var label = document.getElementById('new-rq-label').value.trim();
    if (!label || !activeProjectId) return;

    var fw = await Synth.db.getFramework(activeProjectId);
    var order = fw.research_questions.length + 1;
    var rq = {
      rq_id: 'rq_' + String(order).padStart(3, '0'),
      label: label,
      order: order
    };
    fw.research_questions.push(rq);
    await Synth.db.saveFramework(fw);

    document.getElementById('new-rq-label').value = '';
    renderResearchQuestions(fw.research_questions);
    updateRqDropdowns(fw.research_questions);
    updateCompletenessIndicator(fw);
    updateDoneButtons(fw);
  }

  async function handleRqAction(e) {
    var editBtn = e.target.closest('[data-action="edit-rq"]');
    var removeBtn = e.target.closest('[data-action="remove-rq"]');

    if (editBtn && activeProjectId) {
      var idx = parseInt(editBtn.dataset.index, 10);
      var fw = await Synth.db.getFramework(activeProjectId);
      var rq = fw.research_questions[idx];
      if (!rq) return;

      var item = editBtn.closest('.fw-item');
      var content = item.querySelector('.fw-item-content');
      var actions = item.querySelector('.fw-item-actions');

      content.innerHTML =
        '<input type="text" class="rq-edit-input" value="' + escapeHtml(rq.label) + '" style="width:100%">';
      actions.innerHTML =
        '<button class="btn btn-sm btn-primary" data-action="save-rq" data-index="' + idx + '">Save</button>' +
        '<button class="btn btn-sm btn-secondary" data-action="cancel-rq">Cancel</button>';

      var input = content.querySelector('.rq-edit-input');
      input.focus();
      input.addEventListener('keydown', async function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          await saveRqEdit(idx, input.value.trim());
        } else if (ev.key === 'Escape') {
          renderResearchQuestions(fw.research_questions);
        }
      });
      return;
    }

    var saveBtn = e.target.closest('[data-action="save-rq"]');
    if (saveBtn) {
      var idx = parseInt(saveBtn.dataset.index, 10);
      var input = saveBtn.closest('.fw-item').querySelector('.rq-edit-input');
      await saveRqEdit(idx, input.value.trim());
      return;
    }

    var cancelBtn = e.target.closest('[data-action="cancel-rq"]');
    if (cancelBtn && activeProjectId) {
      var fw = await Synth.db.getFramework(activeProjectId);
      renderResearchQuestions(fw.research_questions);
      return;
    }

    if (removeBtn && activeProjectId) {
      var idx = parseInt(removeBtn.dataset.index, 10);
      var fw = await Synth.db.getFramework(activeProjectId);
      fw.research_questions.splice(idx, 1);
      await Synth.db.saveFramework(fw);
      renderResearchQuestions(fw.research_questions);
      updateRqDropdowns(fw.research_questions);
      updateCompletenessIndicator(fw);
      updateDoneButtons(fw);
    }
  }

  async function saveRqEdit(idx, newLabel) {
    if (!newLabel || !activeProjectId) return;
    var fw = await Synth.db.getFramework(activeProjectId);
    if (!fw.research_questions[idx]) return;
    fw.research_questions[idx].label = newLabel;
    await Synth.db.saveFramework(fw);
    renderResearchQuestions(fw.research_questions);
    updateRqDropdowns(fw.research_questions);
  }

  // --- Participant Dimensions ---

  var nextDimCounter = 1;
  var nextTagCounter = 1;

  function renderParticipantDimensions(dimensions) {
    var container = document.getElementById('dimensions-list');
    container.innerHTML = '';
    dimensions.forEach(function (dim, dimIdx) {
      var section = document.createElement('div');
      section.className = 'dimension-section';

      var tagsHtml = dim.tags.map(function (tag, tagIdx) {
        return '<span class="dimension-tag" data-dim="' + dimIdx + '" data-tag="' + tagIdx + '">' +
          escapeHtml(tag.label) +
          '<button class="dimension-tag-remove" data-dim="' + dimIdx + '" data-tag="' + tagIdx + '" title="Remove tag">&times;</button>' +
        '</span>';
      }).join('');

      section.innerHTML =
        '<div class="dimension-header">' +
          '<span class="dimension-label">' + escapeHtml(dim.label) + '</span>' +
          '<button class="btn-icon" data-action="remove-dimension" data-dim="' + dimIdx + '" title="Remove dimension">&times;</button>' +
        '</div>' +
        '<div class="dimension-tags">' + tagsHtml + '</div>' +
        '<div class="dimension-tag-add">' +
          '<input type="text" class="dimension-tag-input" data-dim="' + dimIdx + '" placeholder="Add a tag...">' +
          '<button class="btn btn-secondary btn-sm" data-action="add-tag" data-dim="' + dimIdx + '">Add</button>' +
        '</div>';
      container.appendChild(section);
    });

    container.onclick = handleDimensionAction;
    container.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList.contains('dimension-tag-input')) {
        e.preventDefault();
        var dimIdx = parseInt(e.target.dataset.dim, 10);
        addDimensionTag(dimIdx);
      }
    });
  }

  async function addDimension() {
    var label = document.getElementById('new-dimension-label').value.trim();
    if (!label || !activeProjectId) return;

    var fw = await Synth.db.getFramework(activeProjectId);
    var dims = fw.participant_dimensions || [];
    var dimId = 'dim_' + String(nextDimCounter++).padStart(3, '0');
    while (dims.some(function (d) { return d.dimension_id === dimId; })) {
      dimId = 'dim_' + String(nextDimCounter++).padStart(3, '0');
    }

    dims.push({ dimension_id: dimId, label: label, tags: [] });
    fw.participant_dimensions = dims;
    await Synth.db.saveFramework(fw);

    document.getElementById('new-dimension-label').value = '';
    document.getElementById('dimension-add-form').classList.add('hidden');
    document.getElementById('btn-add-dimension').classList.remove('hidden');
    renderParticipantDimensions(fw.participant_dimensions);
    updateCompletenessIndicator(fw);
    updateDoneButtons(fw);
  }

  async function addDimensionTag(dimIdx) {
    if (!activeProjectId) return;
    var input = document.querySelector('.dimension-tag-input[data-dim="' + dimIdx + '"]');
    if (!input) return;
    var label = input.value.trim();
    if (!label) return;

    var fw = await Synth.db.getFramework(activeProjectId);
    var dim = (fw.participant_dimensions || [])[dimIdx];
    if (!dim) return;

    var tagId = 'tag_' + String(nextTagCounter++).padStart(3, '0');
    while (dim.tags.some(function (t) { return t.tag_id === tagId; })) {
      tagId = 'tag_' + String(nextTagCounter++).padStart(3, '0');
    }

    dim.tags.push({ tag_id: tagId, label: label });
    await Synth.db.saveFramework(fw);
    renderParticipantDimensions(fw.participant_dimensions);
  }

  async function handleDimensionAction(e) {
    var removeBtn = e.target.closest('[data-action="remove-dimension"]');
    if (removeBtn && activeProjectId) {
      var dimIdx = parseInt(removeBtn.dataset.dim, 10);
      var fw = await Synth.db.getFramework(activeProjectId);
      fw.participant_dimensions.splice(dimIdx, 1);
      await Synth.db.saveFramework(fw);
      renderParticipantDimensions(fw.participant_dimensions);
      updateCompletenessIndicator(fw);
      updateDoneButtons(fw);
      return;
    }

    var tagRemoveBtn = e.target.closest('.dimension-tag-remove');
    if (tagRemoveBtn && activeProjectId) {
      var dimIdx = parseInt(tagRemoveBtn.dataset.dim, 10);
      var tagIdx = parseInt(tagRemoveBtn.dataset.tag, 10);
      var fw = await Synth.db.getFramework(activeProjectId);
      var dim = (fw.participant_dimensions || [])[dimIdx];
      if (!dim) return;
      dim.tags.splice(tagIdx, 1);
      await Synth.db.saveFramework(fw);
      renderParticipantDimensions(fw.participant_dimensions);
      return;
    }

    var addTagBtn = e.target.closest('[data-action="add-tag"]');
    if (addTagBtn) {
      var dimIdx = parseInt(addTagBtn.dataset.dim, 10);
      addDimensionTag(dimIdx);
      return;
    }
  }

  // --- Dropdown helpers ---

  function updateRqDropdowns(rqs) {
    var sel = document.getElementById('theme-filter-rq');
    if (!sel) return;
    var val = sel.value;
    sel.innerHTML = '<option value="">All RQs</option>';
    rqs.forEach(function (rq) {
      var opt = document.createElement('option');
      opt.value = rq.rq_id;
      opt.textContent = rq.label;
      sel.appendChild(opt);
    });
    sel.value = val;
  }

  // ========== Sessions Tab ==========

  var currentSessionId = null;
  var isNewSession = false;
  var currentSessionParticipants = [];

  function initParticipantsTab() {
    document.getElementById('btn-add-session').addEventListener('click', addNewSession);
    document.getElementById('btn-back-to-list').addEventListener('click', backToSessionList);
    document.getElementById('btn-run-pp-synthesis').addEventListener('click', runSessionSynthesis);

    document.getElementById('session-participants-table').addEventListener('click', function (e) {
      var editBtn = e.target.closest('.session-pp-edit-btn');
      if (editBtn) { toggleParticipantEdit(parseInt(editBtn.dataset.index, 10)); return; }
      var saveBtn = e.target.closest('.session-pp-save-btn');
      if (saveBtn) { saveParticipantRow(parseInt(saveBtn.dataset.index, 10)); return; }
      var cancelBtn = e.target.closest('.session-pp-cancel-btn');
      if (cancelBtn) { cancelParticipantEdit(parseInt(cancelBtn.dataset.index, 10)); return; }
    });

    initSessionMetaEditing();
    document.getElementById('btn-submit-inquiry').addEventListener('click', submitInquiry);
    document.getElementById('btn-reupload-transcript').addEventListener('click', function () {
      document.getElementById('subpage-transcript-view').classList.add('hidden');
      document.getElementById('subpage-transcript-upload').classList.remove('hidden');
    });

    // Sub-page nav
    document.querySelectorAll('.subpage-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('disabled')) return;
        switchSubpage(btn.dataset.subpage);
      });
    });

    // Drop zone for transcript upload (existing session re-upload)
    var dropZone = document.getElementById('subpage-drop-zone');
    var fileInput = document.getElementById('subpage-file-input');

    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      handleFile(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function () { handleFile(fileInput.files); fileInput.value = ''; });

    // Drop zone for new session creation
    var newDropZone = document.getElementById('new-session-drop-zone');
    var newFileInput = document.getElementById('new-session-file-input');

    newDropZone.addEventListener('dragover', function (e) { e.preventDefault(); newDropZone.classList.add('drag-over'); });
    newDropZone.addEventListener('dragleave', function () { newDropZone.classList.remove('drag-over'); });
    newDropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      newDropZone.classList.remove('drag-over');
      handleFile(e.dataTransfer.files);
    });
    newFileInput.addEventListener('change', function () { handleFile(newFileInput.files); newFileInput.value = ''; });
  }

  function switchSubpage(name) {
    document.querySelectorAll('.subpage-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.subpage === name);
    });
    document.querySelectorAll('.subpage-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'subpage-' + name);
    });
  }

  function updateSubpageAccess(session) {
    var transcriptBtn = document.querySelector('.subpage-btn[data-subpage="transcript"]');
    var synthesisBtn = document.querySelector('.subpage-btn[data-subpage="synthesis"]');
    var inquiryBtn = document.querySelector('.subpage-btn[data-subpage="inquiry"]');

    var detailsSaved = !!session;
    var hasTranscript = detailsSaved && !!session.transcript_id;

    transcriptBtn.classList.toggle('disabled', !detailsSaved);
    synthesisBtn.classList.toggle('disabled', !hasTranscript);
    inquiryBtn.classList.toggle('disabled', !hasTranscript);
  }

  function resetSubpageState() {
    // Reset transcript sub-page
    document.getElementById('subpage-transcript-upload').classList.remove('hidden');
    document.getElementById('subpage-deidentify').classList.add('hidden');
    document.getElementById('subpage-transcript-view').classList.add('hidden');
    document.getElementById('subpage-transcript-preview').innerHTML = '';
    document.getElementById('subpage-upload-status').className = '';
    document.getElementById('subpage-upload-status').textContent = '';

    // Reset synthesis sub-page
    document.getElementById('pp-synthesis-results').classList.add('hidden');
    document.getElementById('pp-rq-findings').innerHTML = '';
    document.getElementById('pp-emergent-findings').innerHTML = '';
    document.getElementById('pp-theme-summary').classList.add('hidden');
    document.getElementById('pp-theme-blocks').innerHTML = '';
    document.getElementById('btn-run-pp-synthesis').textContent = 'Run Synthesis';
    showStatus('pp-synthesis-status', '', '');
    showStatus('session-detail-status', '', '');

    // Reset inquiry sub-page
    document.getElementById('inquiry-input').value = '';
    document.getElementById('inquiry-history').innerHTML = '';
    document.getElementById('inquiry-empty').classList.add('hidden');
    showStatus('inquiry-status', '', '');

    // Reset pending parse
    pendingParse = null;
  }

  async function addNewSession() {
    if (!activeProjectId) return;
    isNewSession = true;
    currentSessionId = null;
    currentSessionParticipants = [];

    var nextSessionNum = await Synth.db.getNextSessionNumber(activeProjectId);
    document.getElementById('session-detail-label').textContent = 'Session ' + nextSessionNum;

    document.getElementById('new-session-upload-section').classList.remove('hidden');
    document.getElementById('session-participants-section').classList.add('hidden');
    document.getElementById('session-metadata-section').classList.add('hidden');
    showStatus('new-session-upload-status', '', '');

    document.getElementById('session-subpage-title').textContent = 'New Session';
    resetSubpageState();
    updateSubpageAccess(null);
    switchSubpage('details');

    document.querySelector('.subpage-nav').classList.add('hidden');

    document.getElementById('session-list-card').classList.add('hidden');
    document.getElementById('synthesis-controls-card').classList.add('hidden');
    document.getElementById('session-subpages').classList.remove('hidden');
  }

  var cachedDimensions = [];

  function renderParticipantTable(dimensions) {
    cachedDimensions = dimensions;
    var container = document.getElementById('session-participants-table');
    container.innerHTML = '';
    currentSessionParticipants.forEach(function (pp, idx) {
      container.appendChild(renderParticipantRow(pp, idx, dimensions, false));
    });
  }

  function renderParticipantRow(pp, idx, dimensions, editMode) {
    var row = document.createElement('div');
    row.className = 'session-pp-row';
    row.dataset.index = idx;
    var dimTags = pp.dimension_tags || {};

    if (editMode) {
      var dimSelectsHtml = '';
      if (dimensions.length > 0) {
        dimSelectsHtml = '<div class="pp-edit-dimensions">';
        dimensions.forEach(function (dim) {
          var opts = '<option value="">— None —</option>';
          dim.tags.forEach(function (tag) {
            var sel = (dimTags[dim.dimension_id] === tag.tag_id) ? ' selected' : '';
            opts += '<option value="' + escapeHtml(tag.tag_id) + '"' + sel + '>' + escapeHtml(tag.label) + '</option>';
          });
          dimSelectsHtml += '<label class="pp-dim-label">' + escapeHtml(dim.label) +
            '<select class="pp-edit-dim" data-dim-id="' + escapeHtml(dim.dimension_id) + '">' + opts + '</select></label>';
        });
        dimSelectsHtml += '</div>';
      }
      row.innerHTML =
        '<span class="session-pp-id">' + escapeHtml(pp.display_id) + '</span>' +
        '<div class="session-pp-edit-body">' +
          '<div class="session-pp-edit-fields">' +
            '<input type="text" class="pp-edit-name" value="' + escapeHtml(pp.real_name || '') + '" placeholder="Name">' +
            '<input type="text" class="pp-edit-desc" value="' + escapeHtml(pp.description || '') + '" placeholder="Description">' +
          '</div>' +
          dimSelectsHtml +
        '</div>' +
        '<div class="session-pp-edit-actions">' +
          '<button class="btn btn-primary btn-sm session-pp-save-btn" data-index="' + idx + '">Save</button>' +
          '<button class="btn btn-secondary btn-sm session-pp-cancel-btn" data-index="' + idx + '">Cancel</button>' +
        '</div>';
    } else {
      var tagLabels = [];
      dimensions.forEach(function (dim) {
        var tagId = dimTags[dim.dimension_id];
        if (tagId) {
          var tag = dim.tags.find(function (t) { return t.tag_id === tagId; });
          if (tag) tagLabels.push(tag.label);
        }
      });
      var displayParts = [];
      if (pp.real_name) displayParts.push('<span class="session-pp-display-name">' + escapeHtml(pp.real_name) + '</span>');
      if (tagLabels.length > 0) displayParts.push('<span class="session-pp-display-item">' + escapeHtml(tagLabels.join(' · ')) + '</span>');
      if (pp.description) displayParts.push('<span class="session-pp-display-item">' + escapeHtml(pp.description) + '</span>');
      row.innerHTML =
        '<span class="session-pp-id">' + escapeHtml(pp.display_id) + '</span>' +
        '<div class="session-pp-display">' + (displayParts.length > 0 ? displayParts.join('') : '<span class="session-pp-display-item">No details</span>') + '</div>' +
        '<button class="session-pp-edit-btn" data-index="' + idx + '" title="Edit">&#9998;</button>';
    }
    return row;
  }

  function toggleParticipantEdit(idx) {
    var container = document.getElementById('session-participants-table');
    var oldRow = container.querySelector('.session-pp-row[data-index="' + idx + '"]');
    if (!oldRow) return;
    var newRow = renderParticipantRow(currentSessionParticipants[idx], idx, cachedDimensions, true);
    container.replaceChild(newRow, oldRow);
    var nameInput = newRow.querySelector('.pp-edit-name');
    if (nameInput) nameInput.focus();
  }

  function cancelParticipantEdit(idx) {
    var container = document.getElementById('session-participants-table');
    var oldRow = container.querySelector('.session-pp-row[data-index="' + idx + '"]');
    if (!oldRow) return;
    var newRow = renderParticipantRow(currentSessionParticipants[idx], idx, cachedDimensions, false);
    container.replaceChild(newRow, oldRow);
  }

  async function saveParticipantRow(idx) {
    var container = document.getElementById('session-participants-table');
    var row = container.querySelector('.session-pp-row[data-index="' + idx + '"]');
    if (!row) return;

    var pp = currentSessionParticipants[idx];
    pp.real_name = row.querySelector('.pp-edit-name').value.trim();
    pp.description = row.querySelector('.pp-edit-desc').value.trim();

    var dimTags = {};
    row.querySelectorAll('.pp-edit-dim').forEach(function (sel) {
      if (sel.value) dimTags[sel.dataset.dimId] = sel.value;
    });
    pp.dimension_tags = dimTags;

    var storageKey = activeProjectId + '_' + pp.display_id;
    var existing = await Synth.db.getParticipant(storageKey);
    await Synth.db.saveParticipant({
      participant_id: storageKey,
      display_id: pp.display_id,
      project_id: activeProjectId,
      real_name: pp.real_name,
      description: pp.description,
      dimension_tags: pp.dimension_tags,
      created: existing ? existing.created : new Date().toISOString()
    });

    var newRow = renderParticipantRow(pp, idx, cachedDimensions, false);
    container.replaceChild(newRow, row);
    showStatus('session-detail-status', 'success', 'Participant updated.');
  }

  async function openSessionSubpages(sessionId) {
    var session = await Synth.db.getSession(sessionId);
    if (!session) return;

    isNewSession = false;
    currentSessionId = sessionId;

    resetSubpageState();

    document.getElementById('new-session-upload-section').classList.add('hidden');
    document.getElementById('session-participants-section').classList.remove('hidden');
    document.getElementById('session-metadata-section').classList.remove('hidden');
    document.querySelector('.subpage-nav').classList.remove('hidden');

    document.getElementById('session-detail-label').textContent = session.label || '';

    var allParticipants = await Synth.db.getParticipantsByProject(activeProjectId);
    currentSessionParticipants = (session.participant_ids || []).map(function (pid) {
      var pp = allParticipants.find(function (p) { return p.display_id === pid || p.participant_id === activeProjectId + '_' + pid; });
      return {
        display_id: pid,
        real_name: pp ? pp.real_name || '' : '',
        description: pp ? pp.description || '' : '',
        dimension_tags: pp ? pp.dimension_tags || {} : {}
      };
    });

    var fw = await Synth.db.getFramework(activeProjectId);
    renderParticipantTable(fw ? fw.participant_dimensions || [] : []);
    renderSessionMetadata(session);

    document.getElementById('session-subpage-title').textContent = session.label || sessionId;
    updateSubpageAccess(session);

    if (session.transcript_id) {
      await loadTranscriptView(session);
    } else {
      document.getElementById('subpage-transcript-upload').classList.remove('hidden');
      document.getElementById('subpage-deidentify').classList.add('hidden');
      document.getElementById('subpage-transcript-view').classList.add('hidden');
    }

    await loadSynthesisView(session);

    if (session.transcript_id) {
      var sessionKey = activeProjectId + '_' + sessionId;
      await loadInquiryHistory(sessionKey);
    }

    switchSubpage('details');

    document.getElementById('session-list-card').classList.add('hidden');
    document.getElementById('synthesis-controls-card').classList.add('hidden');
    document.getElementById('session-subpages').classList.remove('hidden');
  }

  async function loadTranscriptView(session) {
    var tx = await Synth.db.getTranscript(session.transcript_id);
    if (tx) {
      document.getElementById('subpage-transcript-upload').classList.add('hidden');
      document.getElementById('subpage-deidentify').classList.add('hidden');
      document.getElementById('subpage-transcript-view').classList.remove('hidden');
      renderTranscriptPreviewInto(document.getElementById('subpage-transcript-preview'), tx.turns, tx.speaker_roles);
    }
  }

  async function loadSynthesisView(session) {
    var sessionId = session.session_id;
    var resultsContainer = document.getElementById('pp-synthesis-results');
    var rqContainer = document.getElementById('pp-rq-findings');
    var emergentContainer = document.getElementById('pp-emergent-findings');
    var themeSection = document.getElementById('pp-theme-summary');
    var themeBlocks = document.getElementById('pp-theme-blocks');
    var synthBtn = document.getElementById('btn-run-pp-synthesis');

    resultsContainer.classList.add('hidden');
    rqContainer.innerHTML = '';
    emergentContainer.innerHTML = '';
    themeSection.classList.add('hidden');
    themeBlocks.innerHTML = '';

    var logEl = document.getElementById('pp-synthesis-log');
    if (logEl) { logEl.innerHTML = ''; logEl.classList.add('hidden'); }

    var fw = await Synth.db.getFramework(activeProjectId);
    var modelSelect = document.getElementById('pp-synth-model');
    if (fw && fw.default_synth_model) {
      modelSelect.value = fw.default_synth_model;
    } else {
      modelSelect.value = 'claude-sonnet-4-6';
    }

    var synthesis = await Synth.db.getSessionSynthesis(activeProjectId + '_' + sessionId);

    if (!synthesis) {
      synthBtn.textContent = 'Run Synthesis';
      showStatus('pp-synthesis-status', '', '');
      return;
    }

    synthBtn.textContent = 'Re-run Synthesis';

    var rqMap = {};
    if (fw && fw.research_questions) {
      fw.research_questions.forEach(function (rq) { rqMap[rq.rq_id] = rq.label; });
    }

    (synthesis.rq_findings || []).forEach(function (rqGroup) {
      var section = document.createElement('div');
      section.className = 'rq-findings-section';

      var header = document.createElement('div');
      header.className = 'theme-rq-header';
      header.innerHTML =
        '<div class="theme-rq-label">' + escapeHtml(rqMap[rqGroup.rq_id] || rqGroup.rq_id) + '</div>';
      section.appendChild(header);

      (rqGroup.findings || []).forEach(function (f) {
        section.appendChild(renderFindingCard(f, session));
      });

      rqContainer.appendChild(section);
    });

    if (synthesis.emergent_findings && synthesis.emergent_findings.length > 0) {
      var emergentSection = document.createElement('div');
      emergentSection.className = 'rq-findings-section';

      var emergentHeader = document.createElement('div');
      emergentHeader.className = 'theme-rq-header';
      emergentHeader.innerHTML =
        '<div class="theme-rq-id">Emergent</div>' +
        '<div class="theme-rq-label">Findings not mapped to a research question</div>';
      emergentSection.appendChild(emergentHeader);

      synthesis.emergent_findings.forEach(function (f) {
        emergentSection.appendChild(renderFindingCard(f, session));
      });

      emergentContainer.appendChild(emergentSection);
    }

    var themes = await Synth.db.getThemesByProject(activeProjectId);
    var sessionThemes = [];
    themes.forEach(function (t) {
      if (t.supporting_evidence) {
        var evidence = t.supporting_evidence.filter(function (ev) { return ev.session_id === sessionId; });
        if (evidence.length > 0) {
          sessionThemes.push({ theme: t, evidence: evidence });
        }
      }
    });

    if (sessionThemes.length > 0) {
      themeSection.classList.remove('hidden');
      sessionThemes.forEach(function (item) {
        var block = document.createElement('button');
        block.className = 'theme-block';
        block.textContent = item.theme.label;
        block.addEventListener('click', function () {
          showQuoteInContextByEvidence(session, item.theme.label, item.evidence[0]);
        });
        themeBlocks.appendChild(block);
      });
    }

    resultsContainer.classList.remove('hidden');
    showStatus('pp-synthesis-status', 'success', 'Synthesised ' + new Date(synthesis.synthesised_at).toLocaleString());
  }

  function renderFindingCard(finding, session) {
    var card = document.createElement('div');
    card.className = 'finding-card';

    var matchHtml = '';
    if (finding.theme_match) {
      matchHtml = '<div class="finding-match"><span class="match-tag">' + escapeHtml(finding.theme_match) + '</span> ' + escapeHtml(finding.theme_match_rationale || '') + '</div>';
    } else {
      matchHtml = '<div class="finding-match"><span class="match-tag new-tag">New theme</span> ' + escapeHtml(finding.theme_match_rationale || '') + '</div>';
    }

    card.innerHTML =
      '<div class="finding-label">' + escapeHtml(finding.label) + '</div>' +
      '<div class="finding-analysis">' + escapeHtml(finding.analysis || '') + '</div>' +
      matchHtml +
      '<div class="finding-evidence"></div>';

    var evidenceContainer = card.querySelector('.finding-evidence');
    (finding.supporting_evidence || []).forEach(function (ev) {
      var item = document.createElement('div');
      item.className = 'evidence-item';
      var vClass = ev.verification_status || 'pending';
      item.innerHTML =
        '<div class="evidence-quote">"' + escapeHtml(ev.quote) + '"</div>' +
        '<div class="evidence-meta">' + escapeHtml(ev.speaker || '') + ' at ' + escapeHtml(ev.timestamp || '') +
        '<span class="evidence-verification ' + vClass + '">' + vClass + '</span></div>';
      item.addEventListener('click', function () {
        showQuoteInContextByEvidence(session, finding.label, ev);
      });
      evidenceContainer.appendChild(item);
    });

    return card;
  }

  async function showQuoteInContextByEvidence(session, findingLabel, evidence) {
    if (!session || !session.transcript_id) return;
    var tx = await Synth.db.getTranscript(session.transcript_id);
    if (!tx) return;

    document.getElementById('quote-modal-title').textContent = findingLabel + ' — ' + (session.label || session.session_id);
    var body = document.getElementById('quote-modal-body');
    body.innerHTML = '';

    var highlightIndex = -1;
    var quote = evidence.quote || '';

    if (quote) {
      for (var i = 0; i < tx.turns.length; i++) {
        if (tx.turns[i].content.indexOf(quote.substring(0, 50)) !== -1) {
          highlightIndex = i;
          break;
        }
      }
    }

    tx.turns.forEach(function (t, i) {
      var role = tx.speaker_roles[t.speaker] || 'unassigned';
      var div = document.createElement('div');
      div.className = 'turn role-' + role + (i === highlightIndex ? ' quote-highlight' : '');
      div.dataset.index = i;
      div.innerHTML =
        '<div class="turn-header">' + escapeHtml(t.speaker) +
        '<span class="turn-timestamp">' + escapeHtml(t.timestamp) + '</span></div>' +
        '<div class="turn-content">' + escapeHtml(t.content) + '</div>';
      body.appendChild(div);
    });

    document.getElementById('quote-modal').classList.remove('hidden');

    if (highlightIndex >= 0) {
      setTimeout(function () {
        var el = body.querySelector('.quote-highlight');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    document.getElementById('btn-close-quote-modal').onclick = function () {
      document.getElementById('quote-modal').classList.add('hidden');
    };
    document.getElementById('quote-modal').onclick = function (e) {
      if (e.target === this) this.classList.add('hidden');
    };
  }

  function renderSessionMetadata(session) {
    var dateDisplay = document.getElementById('session-date-display');
    var notesDisplay = document.getElementById('session-notes-display');
    var dateInput = document.getElementById('session-date-input');
    var notesInput = document.getElementById('session-notes-input');

    if (session.session_date) {
      dateDisplay.textContent = formatDate(session.session_date);
      dateDisplay.classList.remove('session-meta-placeholder');
    } else {
      dateDisplay.textContent = 'Not set';
      dateDisplay.classList.add('session-meta-placeholder');
    }

    if (session.session_notes) {
      notesDisplay.textContent = session.session_notes;
      notesDisplay.classList.remove('session-meta-placeholder');
    } else {
      notesDisplay.textContent = 'No notes';
      notesDisplay.classList.add('session-meta-placeholder');
    }

    dateInput.value = session.session_date || '';
    notesInput.value = session.session_notes || '';
    dateInput.classList.add('hidden');
    notesInput.classList.add('hidden');
    dateDisplay.classList.remove('hidden');
    notesDisplay.classList.remove('hidden');
  }

  function initSessionMetaEditing() {
    var dateDisplay = document.getElementById('session-date-display');
    var dateInput = document.getElementById('session-date-input');
    var notesDisplay = document.getElementById('session-notes-display');
    var notesInput = document.getElementById('session-notes-input');

    dateDisplay.addEventListener('click', function () {
      dateDisplay.classList.add('hidden');
      dateInput.classList.remove('hidden');
      dateInput.focus();
    });

    dateInput.addEventListener('change', async function () {
      if (!currentSessionId) return;
      var session = await Synth.db.getSession(currentSessionId);
      if (!session) return;
      session.session_date = dateInput.value || null;
      await Synth.db.saveSession(session);
      renderSessionMetadata(session);
      showStatus('session-detail-status', 'success', 'Date updated.');
    });

    dateInput.addEventListener('blur', function () {
      dateInput.classList.add('hidden');
      dateDisplay.classList.remove('hidden');
    });

    notesDisplay.addEventListener('click', function () {
      notesDisplay.classList.add('hidden');
      notesInput.classList.remove('hidden');
      notesInput.focus();
    });

    notesInput.addEventListener('blur', async function () {
      if (!currentSessionId) return;
      var session = await Synth.db.getSession(currentSessionId);
      if (!session) return;
      session.session_notes = notesInput.value.trim() || null;
      await Synth.db.saveSession(session);
      renderSessionMetadata(session);
      showStatus('session-detail-status', 'success', 'Notes updated.');
    });
  }

  function backToSessionList() {
    document.getElementById('session-subpages').classList.add('hidden');
    document.getElementById('session-list-card').classList.remove('hidden');
    currentSessionId = null;
    isNewSession = false;
    showSynthesisControlsIfNeeded();
    refreshSessionList();
  }

  async function handleFile(fileList) {
    var statusEl = isNewSession ? 'new-session-upload-status' : 'subpage-upload-status';
    var files = Array.from(fileList).filter(function (f) { return f.name.toLowerCase().endsWith('.docx'); });
    if (files.length === 0) { showStatus(statusEl, 'error', 'Please select a .docx file.'); return; }

    var file = files[0];
    showStatus(statusEl, 'info', 'Parsing ' + file.name + '…');

    try {
      var result = await Synth.parser.parseDocx(file);

      var fw = await Synth.db.getFramework(activeProjectId);
      var facNames = fw ? fw.facilitator_names || [] : [];
      var participantDimensions = fw ? fw.participant_dimensions || [] : [];

      var existingPps = await Synth.db.getParticipantsByProject(activeProjectId);
      var existingIds = new Set(existingPps.map(function (p) { return p.display_id; }));
      var nextPpNum = await Synth.db.getNextParticipantNumber(activeProjectId);

      pendingParse = { file: file, result: result, speakers: null };
      showStatus(statusEl, 'success', 'Parsed ' + result.turns.length + ' speaker turns. De-identify before saving.');

      if (isNewSession) {
        document.getElementById('new-session-upload-section').classList.add('hidden');
      } else {
        document.getElementById('subpage-transcript-upload').classList.add('hidden');
      }

      Synth.deidentify.show(
        pendingParse,
        facNames,
        activeProjectId,
        participantDimensions,
        existingIds,
        nextPpNum,
        async function (deidentifiedResult) {
          await finishTranscriptSave(deidentifiedResult);
        },
        function () {
          pendingParse = null;
          document.getElementById('subpage-deidentify').classList.add('hidden');
          if (isNewSession) {
            document.getElementById('new-session-upload-section').classList.remove('hidden');
            showStatus('new-session-upload-status', 'info', 'De-identification cancelled.');
          } else {
            document.getElementById('subpage-transcript-upload').classList.remove('hidden');
            showStatus('subpage-upload-status', 'info', 'De-identification cancelled.');
          }
        }
      );
    } catch (e) {
      showStatus(statusEl, 'error', 'Failed to parse ' + file.name + ': ' + e.message);
    }
  }

  async function finishTranscriptSave(deidentifiedResult) {
    var file = pendingParse.file;
    var roleMap = Synth.deidentify.getRoleAssignments();
    var participantMap = deidentifiedResult.participant_map || {};
    var participantDetails = deidentifiedResult.participant_details || [];

    var newParticipantIds = [];
    for (var i = 0; i < participantDetails.length; i++) {
      var pd = participantDetails[i];
      var storageKey = activeProjectId + '_' + pd.display_id;
      var existing = await Synth.db.getParticipant(storageKey);
      var participant = {
        participant_id: storageKey,
        display_id: pd.display_id,
        project_id: activeProjectId,
        real_name: pd.real_name || '',
        description: '',
        dimension_tags: pd.dimension_tags || {},
        created: existing ? existing.created : new Date().toISOString()
      };
      await Synth.db.saveParticipant(participant);
      newParticipantIds.push(pd.display_id);
    }

    var session;
    if (isNewSession) {
      var label = document.getElementById('session-detail-label').textContent.trim() || 'Session';
      var sessionId = 'sess_' + Date.now();
      session = {
        session_id: sessionId,
        project_id: activeProjectId,
        label: label,
        transcript_id: null,
        participant_ids: newParticipantIds,
        synthesis_status: 'pending',
        created: new Date().toISOString()
      };
      currentSessionId = sessionId;
      isNewSession = false;
    } else {
      session = await Synth.db.getSession(currentSessionId);
      if (!session) return;
      var merged = session.participant_ids || [];
      newParticipantIds.forEach(function (pid) {
        if (merged.indexOf(pid) === -1) merged.push(pid);
      });
      session.participant_ids = merged;
    }

    var transcript = {
      transcript_id: 'tx_' + Date.now(),
      project_id: activeProjectId || '',
      session_id: currentSessionId,
      filename: file.name,
      participant_map: participantMap,
      metadata: pendingParse.result.metadata,
      turns: deidentifiedResult.turns,
      raw_text: deidentifiedResult.raw_text,
      speaker_roles: roleMap,
      status: 'uploaded',
      created: new Date().toISOString()
    };

    session.transcript_id = transcript.transcript_id;
    await Synth.db.saveSession(session);
    await Synth.db.saveTranscript(transcript);
    pendingParse = null;

    await openSessionSubpages(currentSessionId);
  }

  async function runSessionSynthesis() {
    if (!currentSessionId || !activeProjectId) return;
    if (!Synth.api.hasCredentials()) {
      showStatus('pp-synthesis-status', 'error', 'Configure your API credentials in Settings first.');
      return;
    }

    var session = await Synth.db.getSession(currentSessionId);
    if (!session || !session.transcript_id) {
      showStatus('pp-synthesis-status', 'error', 'No transcript found. Upload one first.');
      return;
    }

    var transcript = await Synth.db.getTranscript(session.transcript_id);
    if (!transcript) {
      showStatus('pp-synthesis-status', 'error', 'Transcript not found in database.');
      return;
    }

    var framework = await Synth.db.getFramework(activeProjectId);
    if (!framework) {
      showStatus('pp-synthesis-status', 'error', 'No research framework found. Set one up in the Project Info tab.');
      return;
    }

    var btn = document.getElementById('btn-run-pp-synthesis');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running…';

    var modelSelect = document.getElementById('pp-synth-model');
    var modelOverride = modelSelect.value || null;

    var themes = await Synth.db.getThemesByProject(activeProjectId);

    var logEl = document.getElementById('pp-synthesis-log');
    logEl.innerHTML = '';
    logEl.classList.remove('hidden');
    showStatus('pp-synthesis-status', '', '');
    var activeLine = null;

    var result = await Synth.pipeline.processTranscript(transcript, framework, themes, function (msg, type) {
      if (type === 'step') {
        if (activeLine) {
          activeLine.classList.remove('active');
          activeLine.classList.add('done');
        }
        activeLine = document.createElement('div');
        activeLine.className = 'log-line active';
        activeLine.textContent = msg;
        logEl.appendChild(activeLine);
        logEl.scrollTop = logEl.scrollHeight;
      } else if (type === 'update') {
        if (activeLine) {
          activeLine.setAttribute('data-label', activeLine.getAttribute('data-label') || activeLine.textContent);
          activeLine.textContent = activeLine.getAttribute('data-label') + ' — ' + msg;
        }
      } else if (type === 'done') {
        if (activeLine) {
          activeLine.classList.remove('active');
          activeLine.classList.add('done');
          activeLine.textContent = msg;
          activeLine = null;
        }
      } else if (type === 'error') {
        if (activeLine) {
          activeLine.classList.remove('active');
          activeLine.classList.add('error');
          activeLine.textContent = msg;
          activeLine = null;
        }
      }
    }, modelOverride);

    btn.disabled = false;

    if (result.success) {
      session.synthesis_status = 'synthesised';
      await Synth.db.saveSession(session);
      transcript.status = 'processed';
      await Synth.db.saveTranscript(transcript);
      btn.textContent = 'Re-run Synthesis';

      var summary = (result.stats.themes_new || 0) + ' new theme(s), ' +
        (result.stats.themes_updated || 0) + ' updated, ' +
        (result.stats.quotes_total || 0) + ' quote(s).';
      if (result.flagged) summary += ' FLAGGED for review.';
      showStatus('pp-synthesis-status', 'success', summary);

      await loadSynthesisView(session);
    } else {
      session.synthesis_status = 'failed';
      await Synth.db.saveSession(session);
      btn.textContent = 'Run Synthesis';
      showStatus('pp-synthesis-status', 'error', result.error);
    }
  }

  // ========== Inquiry ==========

  async function submitInquiry() {
    if (!currentSessionId || !activeProjectId) return;

    var question = document.getElementById('inquiry-input').value.trim();
    if (!question) {
      showStatus('inquiry-status', 'error', 'Please enter a question.');
      return;
    }

    if (!Synth.api.hasCredentials()) {
      showStatus('inquiry-status', 'error', 'Configure your API credentials in Settings first.');
      return;
    }

    var session = await Synth.db.getSession(currentSessionId);
    if (!session || !session.transcript_id) {
      showStatus('inquiry-status', 'error', 'No transcript found for this session.');
      return;
    }

    var transcript = await Synth.db.getTranscript(session.transcript_id);
    if (!transcript) {
      showStatus('inquiry-status', 'error', 'Transcript not found in database.');
      return;
    }

    var framework = await Synth.db.getFramework(activeProjectId);
    var sessionKey = activeProjectId + '_' + currentSessionId;
    var participantMap = transcript.participant_map || {};

    var btn = document.getElementById('btn-submit-inquiry');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Asking…';
    showStatus('inquiry-status', 'info', 'Sending question…');

    try {
      var userPrompt = Synth.prompts.buildInquiryUser(framework || {}, transcript.raw_text, participantMap, question);
      var result = await Synth.api.chatCompletion('claude-sonnet-4-6', [
        { role: 'system', content: Synth.prompts.INQUIRY_SYSTEM },
        { role: 'user', content: userPrompt }
      ], { max_tokens: 4096, temperature: 0 });

      var inquiry = {
        inquiry_id: 'inq_' + Date.now(),
        session_key: sessionKey,
        project_id: activeProjectId,
        session_id: currentSessionId,
        question: question,
        response: result.content,
        model: result.model || 'claude-sonnet-4-6',
        created: new Date().toISOString()
      };

      await Synth.db.saveInquiry(inquiry);
      document.getElementById('inquiry-input').value = '';
      showStatus('inquiry-status', 'success', 'Response received.');
      await loadInquiryHistory(sessionKey);
    } catch (e) {
      showStatus('inquiry-status', 'error', 'Inquiry failed: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ask';
    }
  }

  async function loadInquiryHistory(sessionKey) {
    var container = document.getElementById('inquiry-history');
    var emptyMsg = document.getElementById('inquiry-empty');
    container.innerHTML = '';

    var inquiries = await Synth.db.getInquiriesBySession(sessionKey);
    inquiries.sort(function (a, b) { return new Date(b.created) - new Date(a.created); });

    if (inquiries.length === 0) {
      emptyMsg.classList.remove('hidden');
      return;
    }

    emptyMsg.classList.add('hidden');
    inquiries.forEach(function (inq) {
      container.appendChild(renderInquiryCard(inq));
    });
  }

  function renderInquiryCard(inquiry) {
    var card = document.createElement('div');
    card.className = 'inquiry-card';

    var date = new Date(inquiry.created);
    var timeStr = date.toLocaleString();

    card.innerHTML =
      '<div class="inquiry-question-row">' +
        '<strong>Q:</strong> ' + escapeHtml(inquiry.question) +
        '<button class="btn btn-danger btn-sm inquiry-delete-btn" data-inquiry-id="' + escapeHtml(inquiry.inquiry_id) + '" title="Delete">×</button>' +
      '</div>' +
      '<div class="inquiry-response">' + formatMarkdown(inquiry.response) + '</div>' +
      '<div class="inquiry-meta">' + escapeHtml(timeStr) + ' · ' + escapeHtml(inquiry.model || '') + '</div>';

    card.querySelector('.inquiry-delete-btn').addEventListener('click', async function () {
      if (confirm('Delete this inquiry?')) {
        await Synth.db.deleteInquiry(inquiry.inquiry_id);
        var sessionKey = activeProjectId + '_' + currentSessionId;
        await loadInquiryHistory(sessionKey);
      }
    });

    return card;
  }

  function formatMarkdown(text) {
    if (!text) return '';
    var escaped = escapeHtml(text);
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/`(.*?)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
  }

  async function refreshSessionList() {
    if (!activeProjectId) return;

    var sessions = await Synth.db.getSessionsByProject(activeProjectId);
    var container = document.getElementById('session-list');
    var empty = document.getElementById('sessions-empty');

    if (sessions.length === 0) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    container.innerHTML = '';

    var themes = await Synth.db.getThemesByProject(activeProjectId);
    var allParticipants = await Synth.db.getParticipantsByProject(activeProjectId);
    var ppLookup = {};
    allParticipants.forEach(function (p) { ppLookup[p.display_id] = p; });

    sessions.forEach(function (s) {
      var themeCount = 0;
      themes.forEach(function (t) {
        if (t.supporting_evidence) {
          var hasEvidence = t.supporting_evidence.some(function (ev) { return ev.session_id === s.session_id; });
          if (hasEvidence) themeCount++;
        }
      });

      var statusClass = 'status-pending';
      var statusText = 'No transcript';
      if (s.synthesis_status === 'synthesised') {
        statusClass = 'status-synthesised';
        statusText = 'Synthesised';
      } else if (s.synthesis_status === 'failed') {
        statusClass = 'status-failed';
        statusText = 'Failed';
      } else if (s.transcript_id) {
        statusClass = 'status-uploaded';
        statusText = 'Transcript uploaded';
      }

      var metaLines = '';
      if (s.session_date) {
        metaLines += '<div class="participant-meta">' + escapeHtml(formatDate(s.session_date)) + '</div>';
      }
      var ppLabels = (s.participant_ids || []).map(function (pid) {
        var p = ppLookup[pid];
        return p && p.real_name ? pid + ' ' + p.real_name : pid;
      });
      if (ppLabels.length > 0) {
        metaLines += '<div class="participant-meta">' + escapeHtml(ppLabels.join(' · ')) + '</div>';
      }

      var div = document.createElement('div');
      div.className = 'participant-item';
      div.innerHTML =
        '<div class="participant-info" data-id="' + escapeHtml(s.session_id) + '">' +
          '<div class="participant-id">' + escapeHtml(s.label || s.session_id) + '</div>' +
          metaLines +
        '</div>' +
        '<span class="participant-status ' + statusClass + '">' + statusText + '</span>' +
        (themeCount > 0 ? '<span class="badge badge-count">' + themeCount + ' themes</span>' : '') +
        '<div class="participant-actions">' +
          '<button class="btn btn-secondary btn-sm" data-action="view-session" data-id="' + escapeHtml(s.session_id) + '">View</button>' +
          '<button class="btn btn-danger btn-sm" data-action="delete-session" data-id="' + escapeHtml(s.session_id) + '">Delete</button>' +
        '</div>';
      container.appendChild(div);
    });

    container.onclick = handleSessionAction;
    showSynthesisControlsIfNeeded();
  }

  async function handleSessionAction(e) {
    var btn = e.target.closest('[data-action]');
    var infoEl = e.target.closest('.participant-info');

    if (btn) {
      var id = btn.dataset.id;
      if (btn.dataset.action === 'view-session') {
        await openSessionSubpages(id);
      } else if (btn.dataset.action === 'delete-session') {
        if (confirm('Delete this session? This will also delete its transcript, synthesis, and inquiries.')) {
          var session = await Synth.db.getSession(id);
          if (session && session.transcript_id) {
            await Synth.db.deleteTranscript(session.transcript_id);
          }
          var synthId = activeProjectId + '_' + id;
          await Synth.db.deleteSessionSynthesis(synthId).catch(function () {});
          var sessionKey = activeProjectId + '_' + id;
          var inquiries = await Synth.db.getInquiriesBySession(sessionKey);
          for (var q = 0; q < inquiries.length; q++) {
            await Synth.db.deleteInquiry(inquiries[q].inquiry_id);
          }
          if (session && session.participant_ids) {
            for (var p = 0; p < session.participant_ids.length; p++) {
              var ppKey = activeProjectId + '_' + session.participant_ids[p];
              await Synth.db.deleteParticipant(ppKey).catch(function () {});
            }
          }
          await Synth.db.deleteSession(id);
          await refreshSessionList();
        }
      }
    } else if (infoEl) {
      await openSessionSubpages(infoEl.dataset.id);
    }
  }

  async function showQuoteInContext(sessionId, theme, evidence) {
    var session = await Synth.db.getSession(sessionId);
    if (!session || !session.transcript_id) return;

    var tx = await Synth.db.getTranscript(session.transcript_id);
    if (!tx) return;

    document.getElementById('quote-modal-title').textContent = theme.label + ' — ' + (session.label || sessionId);
    var body = document.getElementById('quote-modal-body');
    body.innerHTML = '';

    var highlightIndex = -1;
    var quote = evidence.quote || '';

    if (quote) {
      for (var i = 0; i < tx.turns.length; i++) {
        if (tx.turns[i].content.indexOf(quote.substring(0, 50)) !== -1) {
          highlightIndex = i;
          break;
        }
      }
    }

    tx.turns.forEach(function (t, i) {
      var role = tx.speaker_roles[t.speaker] || 'unassigned';
      var div = document.createElement('div');
      div.className = 'turn role-' + role + (i === highlightIndex ? ' quote-highlight' : '');
      div.dataset.index = i;
      div.innerHTML =
        '<div class="turn-header">' + escapeHtml(t.speaker) +
        '<span class="turn-timestamp">' + escapeHtml(t.timestamp) + '</span></div>' +
        '<div class="turn-content">' + escapeHtml(t.content) + '</div>';
      body.appendChild(div);
    });

    document.getElementById('quote-modal').classList.remove('hidden');

    if (highlightIndex >= 0) {
      setTimeout(function () {
        var el = body.querySelector('.quote-highlight');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    document.getElementById('btn-close-quote-modal').onclick = function () {
      document.getElementById('quote-modal').classList.add('hidden');
    };
    document.getElementById('quote-modal').onclick = function (e) {
      if (e.target === this) this.classList.add('hidden');
    };
  }

  function renderTranscriptPreviewInto(container, turns, speakerRoles) {
    container.innerHTML = '';
    turns.forEach(function (t) {
      var role = speakerRoles[t.speaker] || 'unassigned';
      var div = document.createElement('div');
      div.className = 'turn role-' + role;
      div.innerHTML =
        '<div class="turn-header">' + escapeHtml(t.speaker) +
        '<span class="turn-timestamp">' + escapeHtml(t.timestamp) + '</span></div>' +
        '<div class="turn-content">' + escapeHtml(t.content) + '</div>';
      container.appendChild(div);
    });
  }

  async function showSynthesisControlsIfNeeded() {
    if (!activeProjectId) return;
    if (currentSessionId || isNewSession) return;
    var transcripts = await Synth.db.getTranscriptsByProject(activeProjectId);
    var hasPending = transcripts.some(function (t) { return t.status === 'uploaded'; });
    var card = document.getElementById('synthesis-controls-card');
    if (hasPending) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  }

  // ========== Synthesis ==========

  var synthesisRunning = false;

  function initSynthesisControls() {
    document.getElementById('btn-run-synthesis').addEventListener('click', runSynthesis);
  }

  async function runSynthesis() {
    if (!activeProjectId) {
      showStatus('synthesis-status', 'error', 'No project selected.');
      return;
    }
    if (!Synth.api.hasCredentials()) {
      showStatus('synthesis-status', 'error', 'Configure your API credentials in Settings first.');
      return;
    }
    if (synthesisRunning) return;
    synthesisRunning = true;

    var btn = document.getElementById('btn-run-synthesis');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running…';

    var logCard = document.getElementById('synthesis-log-card');
    var logDiv = document.getElementById('synthesis-log');
    var progressCard = document.getElementById('synthesis-progress-card');
    var progressDiv = document.getElementById('synthesis-progress');

    logCard.classList.remove('hidden');
    progressCard.classList.remove('hidden');
    logDiv.innerHTML = '';
    progressDiv.innerHTML = '<div class="progress-bar"><div class="progress-bar-fill" id="synth-bar" style="width:0%"></div></div><div class="progress-text" id="synth-progress-text">Starting…</div>';

    showStatus('synthesis-status', 'info', 'Synthesis running…');

    await Synth.pipeline.processAll(
      activeProjectId,
      function (current, total, pid, msg) {
        var pct = Math.round((current - 1) / total * 100);
        var bar = document.getElementById('synth-bar');
        var text = document.getElementById('synth-progress-text');
        if (bar) bar.style.width = pct + '%';
        if (text) text.textContent = 'Transcript ' + current + ' of ' + total + ' (' + pid + '): ' + msg;

        addLogEntry(pid, msg);
      },
      async function (stats) {
        var bar = document.getElementById('synth-bar');
        if (bar) bar.style.width = '100%';

        if (stats.message) {
          showStatus('synthesis-status', 'warning', stats.message);
        } else {
          var summary = stats.processed + ' of ' + stats.total + ' transcript(s) processed.';
          if (stats.flagged > 0) summary += ' ' + stats.flagged + ' flagged for review.';
          if (stats.failed > 0) summary += ' ' + stats.failed + ' failed.';
          showStatus('synthesis-status', stats.failed > 0 ? 'warning' : 'success', summary);
        }

        var sessions = await Synth.db.getSessionsByProject(activeProjectId);
        var transcripts = await Synth.db.getTranscriptsByProject(activeProjectId);
        for (var i = 0; i < sessions.length; i++) {
          var sess = sessions[i];
          if (sess.transcript_id) {
            var stx = transcripts.find(function (t) { return t.transcript_id === sess.transcript_id; });
            if (stx && stx.status === 'processed') {
              sess.synthesis_status = 'synthesised';
              await Synth.db.saveSession(sess);
            } else if (stx && stx.status === 'failed') {
              sess.synthesis_status = 'failed';
              await Synth.db.saveSession(sess);
            }
          }
        }

        synthesisRunning = false;
        btn.disabled = false;
        btn.textContent = 'Synthesise All Pending';
        await refreshSessionList();

        var allThemes = await Synth.db.getThemesByProject(activeProjectId);
        if (allThemes.length > 30) {
          var nudge = document.getElementById('synthesis-theme-nudge');
          var nudgeText = document.getElementById('synthesis-nudge-text');
          nudgeText.textContent = 'You have ' + allThemes.length + ' themes. Consider reviewing to consolidate related findings.';
          nudge.classList.remove('hidden');
        }
      }
    );
  }

  function addLogEntry(pid, msg) {
    var logDiv = document.getElementById('synthesis-log');
    var entry = document.createElement('div');
    var cls = 'log-entry';
    if (msg.indexOf('FAILED') !== -1) cls += ' log-error';
    else if (msg.indexOf('Done') !== -1) cls += ' log-success';
    else if (msg.indexOf('FLAGGED') !== -1 || msg.indexOf('fabricated') !== -1) cls += ' log-warning';

    entry.className = cls;
    entry.innerHTML = '<span class="log-label">' + escapeHtml(pid) + '</span><span class="log-msg">' + escapeHtml(msg) + '</span>';
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  // ========== Themes Tab ==========

  function updateDimensionFilters(dimensions) {
    var container = document.getElementById('theme-dimension-filters');
    if (!container) return;

    var currentFilters = {};
    container.querySelectorAll('.theme-dim-filter').forEach(function (sel) {
      if (sel.value) currentFilters[sel.dataset.dimId] = sel.value;
    });

    container.innerHTML = '';
    dimensions.forEach(function (dim) {
      if (dim.tags.length === 0) return;
      var sel = document.createElement('select');
      sel.className = 'theme-dim-filter';
      sel.dataset.dimId = dim.dimension_id;
      sel.innerHTML = '<option value="">All ' + escapeHtml(dim.label) + '</option>';
      dim.tags.forEach(function (tag) {
        var opt = document.createElement('option');
        opt.value = tag.tag_id;
        opt.textContent = tag.label;
        sel.appendChild(opt);
      });
      if (currentFilters[dim.dimension_id]) sel.value = currentFilters[dim.dimension_id];
      sel.addEventListener('change', refreshThemes);
      container.appendChild(sel);
    });
  }

  function resolveDimensionLabels(dimTags, dimensions) {
    var labels = [];
    if (!dimTags) return labels;
    dimensions.forEach(function (dim) {
      var tagId = dimTags[dim.dimension_id];
      if (tagId) {
        var tag = dim.tags.find(function (t) { return t.tag_id === tagId; });
        if (tag) labels.push(tag.label);
      }
    });
    return labels;
  }

  function updateGroupByDropdown(fw) {
    var sel = document.getElementById('theme-group-by');
    var currentVal = sel.value;
    sel.innerHTML = '<option value="none">No grouping</option>';

    if (fw && fw.research_questions && fw.research_questions.length > 0) {
      sel.innerHTML += '<option value="rq">Research Question</option>';
    }

    (fw ? fw.participant_dimensions || [] : []).forEach(function (dim) {
      if (dim.tags.length > 0) {
        sel.innerHTML += '<option value="dim_' + escapeHtml(dim.dimension_id) + '">' + escapeHtml(dim.label) + '</option>';
      }
    });

    if (sel.querySelector('option[value="' + currentVal + '"]')) {
      sel.value = currentVal;
    } else {
      sel.value = 'none';
    }
  }

  function initThemesTab() {
    document.getElementById('theme-filter-rq').addEventListener('change', refreshThemes);
    document.getElementById('theme-filter-significance').addEventListener('change', refreshThemes);
    document.getElementById('theme-group-by').addEventListener('change', refreshThemes);
    document.getElementById('theme-sort').addEventListener('change', refreshThemes);
    document.getElementById('btn-merge-themes').addEventListener('click', mergeSelectedThemes);
    document.getElementById('btn-cancel-merge').addEventListener('click', function () {
      selectedThemes.clear();
      refreshThemes();
    });
    document.getElementById('btn-review-themes').addEventListener('click', startThemeReview);
    document.getElementById('btn-close-review').addEventListener('click', closeThemeReview);

    document.getElementById('btn-export-themes').addEventListener('click', function () { openThemeExportModal('toolbar'); });
    document.getElementById('btn-export-selected').addEventListener('click', function () { openThemeExportModal('selected'); });
    document.getElementById('btn-close-theme-export').addEventListener('click', closeThemeExportModal);
    document.getElementById('btn-cancel-theme-export').addEventListener('click', closeThemeExportModal);
    document.getElementById('btn-run-theme-export').addEventListener('click', runThemeExport);
    document.getElementById('theme-export-modal').addEventListener('click', function (e) {
      if (e.target === this) closeThemeExportModal();
    });
  }

  function initNudges() {
    document.getElementById('btn-synthesis-nudge-review').addEventListener('click', function () {
      Synth.app.switchTab('themes');
      startThemeReview();
    });
    document.getElementById('btn-dismiss-synthesis-nudge').addEventListener('click', function () {
      document.getElementById('synthesis-theme-nudge').classList.add('hidden');
    });
    document.getElementById('btn-export-nudge-review').addEventListener('click', function () {
      Synth.app.switchTab('themes');
      startThemeReview();
    });
    document.getElementById('btn-dismiss-export-nudge').addEventListener('click', function () {
      document.getElementById('export-theme-nudge').classList.add('hidden');
    });
  }

  async function refreshThemes() {
    if (!activeProjectId) {
      document.getElementById('themes-empty').classList.remove('hidden');
      document.getElementById('theme-cards').innerHTML = '';
      document.getElementById('theme-summary').textContent = '';
      return;
    }

    var fw = await Synth.db.getFramework(activeProjectId);
    cachedDimensions = fw ? fw.participant_dimensions || [] : [];
    updateDimensionFilters(cachedDimensions);

    updateGroupByDropdown(fw);

    var themes = await Synth.db.getThemesByProject(activeProjectId);
    var filterRq = document.getElementById('theme-filter-rq').value;
    var filterSig = document.getElementById('theme-filter-significance').value;
    var sortBy = document.getElementById('theme-sort').value;

    if (filterRq) themes = themes.filter(function (t) { return t.rq_mappings && t.rq_mappings.includes(filterRq); });
    if (filterSig) themes = themes.filter(function (t) { return (t.significance || 'major') === filterSig; });

    var dimFilterEls = document.querySelectorAll('.theme-dim-filter');
    dimFilterEls.forEach(function (sel) {
      var dimId = sel.dataset.dimId;
      var tagId = sel.value;
      if (tagId) {
        themes = themes.filter(function (t) {
          return (t.supporting_evidence || []).some(function (ev) {
            return ev.participant_dimensions && ev.participant_dimensions[dimId] === tagId;
          });
        });
      }
    });

    themes = sortThemes(themes, sortBy);

    var emptyEl = document.getElementById('themes-empty');
    if (themes.length === 0) {
      emptyEl.classList.remove('hidden');
      document.getElementById('theme-cards').innerHTML = '';
      document.getElementById('theme-summary').textContent = '';
      return;
    }
    emptyEl.classList.add('hidden');

    var totalEvidence = themes.reduce(function (sum, t) { return sum + (t.supporting_evidence ? t.supporting_evidence.length : 0); }, 0);
    var majorCount = themes.filter(function (t) { return (t.significance || 'major') === 'major'; }).length;
    var minorCount = themes.length - majorCount;
    var summaryText = themes.length + ' theme(s), ' + totalEvidence + ' piece(s) of evidence';
    if (minorCount > 0) summaryText += ' (' + majorCount + ' major, ' + minorCount + ' minor)';
    document.getElementById('theme-summary').textContent = summaryText;

    renderThemeCards(themes, fw);
    updateMergeBar();

    var allThemes = await Synth.db.getThemesByProject(activeProjectId);
    var reviewSection = document.getElementById('theme-review-section');
    if (reviewSection) reviewSection.style.display = allThemes.length >= 20 ? '' : 'none';
  }

  function sortThemes(themes, sortBy) {
    switch (sortBy) {
      case 'participants':
        return themes.sort(function (a, b) { return getParticipantCount(b) - getParticipantCount(a); });
      case 'quotes':
        return themes.sort(function (a, b) { return getQuoteCount(b) - getQuoteCount(a); });
      case 'label':
        return themes.sort(function (a, b) { return a.label.localeCompare(b.label); });
      default:
        return themes;
    }
  }

  function getParticipantCount(theme) {
    if (!theme.supporting_evidence) return 0;
    return new Set(theme.supporting_evidence.map(function (e) { return e.participant_id; })).size;
  }

  function getQuoteCount(theme) {
    return theme.supporting_evidence ? theme.supporting_evidence.length : 0;
  }

  function renderThemeCards(themes, framework) {
    var container = document.getElementById('theme-cards');
    container.innerHTML = '';

    if (framework && framework.research_questions && framework.research_questions.length > 0) {
      cachedRqMap = {};
      framework.research_questions.forEach(function (rq) { cachedRqMap[rq.rq_id] = rq.label; });
    }

    var groupBy = document.getElementById('theme-group-by').value;

    if (groupBy === 'rq') {
      renderGroupedByRq(container, themes, framework);
      return;
    }

    if (groupBy.indexOf('dim_') === 0) {
      var dimId = groupBy.substring(4);
      renderGroupedByDimension(container, themes, dimId);
      return;
    }

    themes.forEach(function (theme) {
      container.appendChild(buildThemeCard(theme));
    });
  }

  function renderGroupedByRq(container, themes, framework) {
    var rqs = framework && framework.research_questions ? framework.research_questions : [];

    var grouped = {};
    var unmapped = [];
    themes.forEach(function (theme) {
      var mapped = false;
      (theme.rq_mappings || []).forEach(function (rqId) {
        if (!grouped[rqId]) grouped[rqId] = [];
        grouped[rqId].push(theme);
        mapped = true;
      });
      if (!mapped) unmapped.push(theme);
    });

    rqs.forEach(function (rq) {
      var rqThemes = grouped[rq.rq_id];
      if (!rqThemes || rqThemes.length === 0) return;
      appendGroupHeader(container, rq.label);
      rqThemes.forEach(function (theme) {
        container.appendChild(buildThemeCard(theme));
      });
    });

    if (unmapped.length > 0) {
      appendGroupHeader(container, 'Themes not mapped to a research question', 'Emergent');
      unmapped.forEach(function (theme) {
        container.appendChild(buildThemeCard(theme));
      });
    }
  }

  function renderGroupedByDimension(container, themes, dimId) {
    var dim = cachedDimensions.find(function (d) { return d.dimension_id === dimId; });
    if (!dim) return;

    var grouped = {};
    var untagged = [];
    var seen = {};

    themes.forEach(function (theme) {
      var themeTagIds = new Set();
      (theme.supporting_evidence || []).forEach(function (ev) {
        var tagId = (ev.participant_dimensions || {})[dimId];
        if (tagId) themeTagIds.add(tagId);
      });

      if (themeTagIds.size === 0) {
        untagged.push(theme);
      } else {
        themeTagIds.forEach(function (tagId) {
          if (!grouped[tagId]) grouped[tagId] = [];
          grouped[tagId].push(theme);
        });
      }
    });

    dim.tags.forEach(function (tag) {
      var tagThemes = grouped[tag.tag_id];
      if (!tagThemes || tagThemes.length === 0) return;
      appendGroupHeader(container, tag.label, tagThemes.length + ' theme' + (tagThemes.length === 1 ? '' : 's'));
      tagThemes.forEach(function (theme) {
        container.appendChild(buildThemeCard(theme));
      });
    });

    if (untagged.length > 0) {
      appendGroupHeader(container, 'No ' + dim.label + ' tagged');
      untagged.forEach(function (theme) {
        container.appendChild(buildThemeCard(theme));
      });
    }
  }

  function appendGroupHeader(container, label, subtitle) {
    var header = document.createElement('div');
    header.className = 'theme-rq-header';
    header.innerHTML =
      (subtitle ? '<div class="theme-rq-id">' + escapeHtml(subtitle) + '</div>' : '') +
      '<div class="theme-rq-label">' + escapeHtml(label) + '</div>';
    container.appendChild(header);
  }

  function collectDimensionTags(theme) {
    var tagIds = {};
    (theme.supporting_evidence || []).forEach(function (ev) {
      var dims = ev.participant_dimensions || {};
      for (var dimId in dims) {
        if (!tagIds[dimId]) tagIds[dimId] = new Set();
        tagIds[dimId].add(dims[dimId]);
      }
    });
    var labels = [];
    cachedDimensions.forEach(function (dim) {
      var ids = tagIds[dim.dimension_id];
      if (!ids) return;
      dim.tags.forEach(function (tag) {
        if (ids.has(tag.tag_id)) labels.push(tag.label);
      });
    });
    return labels;
  }

  function buildThemeCard(theme) {
      var card = document.createElement('div');
      var isMinor = theme.significance === 'minor';
      card.className = 'theme-card' + (selectedThemes.has(theme.theme_id) ? ' selected' : '') + (isMinor ? ' minor' : '');
      card.dataset.id = theme.theme_id;

      var pCount = getParticipantCount(theme);
      var eCount = theme.supporting_evidence ? theme.supporting_evidence.length : 0;

      var sourceBadge = theme.source === 'merged' ? '<span class="badge badge-merged">merged</span>' : '';
      var minorBadge = isMinor ? '<span class="badge badge-minor">minor</span>' : '';
      var rqLabels = (theme.rq_mappings || []).map(function (id) { return cachedRqMap[id] || id; }).join(', ');

      var dimTags = collectDimensionTags(theme);
      var dimTagsHtml = '';
      if (dimTags.length > 0) {
        dimTagsHtml = '<div class="theme-dim-tags">' +
          dimTags.map(function (l) { return '<span class="theme-dim-tag">' + escapeHtml(l) + '</span>'; }).join('') +
        '</div>';
      }

      card.innerHTML =
        '<div class="theme-card-header">' +
          '<span class="theme-label">' + escapeHtml(theme.label) + '</span>' +
          '<div class="theme-badges">' +
            sourceBadge +
            minorBadge +
            '<span class="theme-stat" title="Participants"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + pCount + '</span>' +
            '<span class="theme-stat" title="Quotes"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> ' + eCount + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="theme-desc">' + escapeHtml(theme.current_description || '') + '</div>' +
        (rqLabels ? '<div class="theme-meta"><span>RQ: ' + escapeHtml(rqLabels) + '</span></div>' : '') +
        dimTagsHtml +
        '<div class="theme-evidence hidden"></div>';

      card.addEventListener('click', function (e) {
        if (e.shiftKey) {
          toggleThemeSelection(theme.theme_id, card);
        } else {
          toggleThemeExpand(theme, card);
        }
      });

      return card;
  }

  function toggleThemeExpand(theme, card) {
    var evidenceDiv = card.querySelector('.theme-evidence');
    if (evidenceDiv.classList.contains('hidden')) {
      evidenceDiv.classList.remove('hidden');
      evidenceDiv.innerHTML = '';

      if (!theme.supporting_evidence || theme.supporting_evidence.length === 0) {
        evidenceDiv.innerHTML = '<div class="text-secondary text-small">No evidence yet.</div>';
        return;
      }

      theme.supporting_evidence.forEach(function (ev) {
        var div = document.createElement('div');
        div.className = 'evidence-item clickable';
        var vClass = ev.verification_status || 'pending';
        var dimLabels = resolveDimensionLabels(ev.participant_dimensions, cachedDimensions);
        var dimHtml = dimLabels.length > 0 ? ' · ' + escapeHtml(dimLabels.join(' · ')) : '';
        var ctxHtml = ev.evidence_context ? '<span class="evidence-context ' + ev.evidence_context + '">' + ev.evidence_context + '</span>' : '';
        div.innerHTML =
          '<div class="evidence-quote">"' + escapeHtml(ev.quote) + '"</div>' +
          '<div class="evidence-attr">' +
            escapeHtml(ev.speaker || '') + ' (' + escapeHtml(ev.participant_id || '') + ')' +
            ' at ' + escapeHtml(ev.timestamp || '') +
            dimHtml +
            '<span class="evidence-verification ' + vClass + '">' + vClass + '</span>' +
            ctxHtml +
          '</div>';
        div.addEventListener('click', function (e) {
          e.stopPropagation();
          openQuoteFromTheme(theme, ev);
        });
        evidenceDiv.appendChild(div);
      });
    } else {
      evidenceDiv.classList.add('hidden');
    }
  }

  async function openQuoteFromTheme(theme, evidence) {
    if (!evidence.session_id) return;

    var session = await Synth.db.getSession(evidence.session_id);
    if (!session || !session.transcript_id) return;

    var tx = await Synth.db.getTranscript(session.transcript_id);
    if (!tx) return;

    document.getElementById('quote-modal-title').textContent = theme.label + ' — ' + (evidence.participant_id || session.label || evidence.session_id);
    var body = document.getElementById('quote-modal-body');
    body.innerHTML = '';

    var highlightIndex = -1;
    var quote = evidence.quote || '';

    if (quote) {
      for (var i = 0; i < tx.turns.length; i++) {
        if (tx.turns[i].content.indexOf(quote.substring(0, 50)) !== -1) {
          highlightIndex = i;
          break;
        }
      }
    }

    tx.turns.forEach(function (t, i) {
      var role = tx.speaker_roles[t.speaker] || 'unassigned';
      var div = document.createElement('div');
      div.className = 'turn role-' + role + (i === highlightIndex ? ' quote-highlight' : '');
      div.dataset.index = i;
      div.innerHTML =
        '<div class="turn-header">' + escapeHtml(t.speaker) +
        '<span class="turn-timestamp">' + escapeHtml(t.timestamp) + '</span></div>' +
        '<div class="turn-content">' + escapeHtml(t.content) + '</div>';
      body.appendChild(div);
    });

    document.getElementById('quote-modal').classList.remove('hidden');

    if (highlightIndex >= 0) {
      setTimeout(function () {
        var el = body.querySelector('.quote-highlight');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    document.getElementById('btn-close-quote-modal').onclick = function () {
      document.getElementById('quote-modal').classList.add('hidden');
    };
    document.getElementById('quote-modal').onclick = function (e) {
      if (e.target === this) this.classList.add('hidden');
    };
  }

  function toggleThemeSelection(themeId, card) {
    if (selectedThemes.has(themeId)) {
      selectedThemes.delete(themeId);
      card.classList.remove('selected');
    } else {
      selectedThemes.add(themeId);
      card.classList.add('selected');
    }
    updateMergeBar();
  }

  function updateMergeBar() {
    var bar = document.getElementById('merge-bar');
    var count = selectedThemes.size;
    if (count > 0) {
      document.getElementById('merge-label').textContent = count + ' theme' + (count === 1 ? '' : 's') + ' selected';
      document.getElementById('btn-merge-themes').disabled = count !== 2;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  }

  // ========== Theme Export Modal ==========

  function hasActiveFilters() {
    if (document.getElementById('theme-filter-rq').value) return true;
    if (document.getElementById('theme-filter-significance').value) return true;
    var dimFilters = document.querySelectorAll('.theme-dim-filter');
    for (var i = 0; i < dimFilters.length; i++) {
      if (dimFilters[i].value) return true;
    }
    return false;
  }

  async function getFilteredThemes() {
    var themes = await Synth.db.getThemesByProject(activeProjectId);
    var filterRq = document.getElementById('theme-filter-rq').value;
    var filterSig = document.getElementById('theme-filter-significance').value;

    if (filterRq) themes = themes.filter(function (t) { return t.rq_mappings && t.rq_mappings.includes(filterRq); });
    if (filterSig) themes = themes.filter(function (t) { return (t.significance || 'major') === filterSig; });

    var dimFilterEls = document.querySelectorAll('.theme-dim-filter');
    dimFilterEls.forEach(function (sel) {
      var dimId = sel.dataset.dimId;
      var tagId = sel.value;
      if (tagId) {
        themes = themes.filter(function (t) {
          return (t.supporting_evidence || []).some(function (ev) {
            return ev.participant_dimensions && ev.participant_dimensions[dimId] === tagId;
          });
        });
      }
    });

    return themes;
  }

  async function openThemeExportModal(source) {
    if (!activeProjectId) return;

    var allThemes = await Synth.db.getThemesByProject(activeProjectId);
    var filteredThemes = await getFilteredThemes();
    var filtersActive = hasActiveFilters();

    document.getElementById('export-count-all').textContent = allThemes.length;

    var filteredOption = document.getElementById('export-scope-filtered-option');
    if (filtersActive) {
      document.getElementById('export-count-filtered').textContent = filteredThemes.length;
      filteredOption.style.display = '';
    } else {
      filteredOption.style.display = 'none';
    }

    var selectedOption = document.getElementById('export-scope-selected-option');
    if (selectedThemes.size > 0) {
      document.getElementById('export-count-selected').textContent = selectedThemes.size;
      selectedOption.style.display = '';
    } else {
      selectedOption.style.display = 'none';
    }

    var defaultScope = 'all';
    if (source === 'selected' && selectedThemes.size > 0) {
      defaultScope = 'selected';
    } else if (filtersActive) {
      defaultScope = 'filtered';
    }
    var radios = document.querySelectorAll('input[name="export-scope"]');
    radios.forEach(function (r) { r.checked = r.value === defaultScope; });

    document.getElementById('theme-export-status').textContent = '';
    document.getElementById('theme-export-modal').classList.remove('hidden');
  }

  function closeThemeExportModal() {
    document.getElementById('theme-export-modal').classList.add('hidden');
  }

  async function runThemeExport() {
    if (!activeProjectId) return;

    var scope = document.querySelector('input[name="export-scope"]:checked').value;
    var format = document.querySelector('input[name="export-format"]:checked').value;
    var statusEl = document.getElementById('theme-export-status');

    var themes;
    if (scope === 'selected') {
      var allThemes = await Synth.db.getThemesByProject(activeProjectId);
      themes = allThemes.filter(function (t) { return selectedThemes.has(t.theme_id); });
    } else if (scope === 'filtered') {
      themes = await getFilteredThemes();
    } else {
      themes = await Synth.db.getThemesByProject(activeProjectId);
    }

    if (themes.length === 0) {
      statusEl.textContent = 'No themes to export.';
      statusEl.className = 'status-msg error';
      return;
    }

    var fw = await Synth.db.getFramework(activeProjectId);
    var projectName = '';
    if (fw && fw.project_name) {
      projectName = fw.project_name;
    } else {
      var proj = await Synth.db.getProject(activeProjectId);
      projectName = proj ? proj.name : 'themes';
    }

    var sessions = await Synth.db.getSessionsByProject(activeProjectId);
    var sessionMap = {};
    sessions.forEach(function (s) { sessionMap[s.session_id] = s.label || s.session_id; });

    var rqMap = {};
    if (fw && fw.research_questions) {
      fw.research_questions.forEach(function (rq) { rqMap[rq.rq_id] = rq.label; });
    }

    try {
      if (format === 'docx') {
        await Synth.export.exportThemesDocx(themes, projectName, sessionMap, rqMap);
      } else {
        Synth.export.exportThemesXlsx(themes, projectName, sessionMap, rqMap);
      }
      statusEl.textContent = 'Exported ' + themes.length + ' theme' + (themes.length === 1 ? '' : 's') + '.';
      statusEl.className = 'status-msg success';
      setTimeout(closeThemeExportModal, 1200);
    } catch (err) {
      statusEl.textContent = 'Export failed: ' + err.message;
      statusEl.className = 'status-msg error';
    }
  }

  async function mergeSelectedThemes() {
    if (selectedThemes.size !== 2) return;
    var ids = Array.from(selectedThemes);
    var theme1 = await Synth.db.getTheme(ids[0]);
    var theme2 = await Synth.db.getTheme(ids[1]);
    if (!theme1 || !theme2) return;

    var mergedLabel = prompt('Enter label for merged theme:', theme1.label + ' + ' + theme2.label);
    if (!mergedLabel) return;

    var mergedDesc = prompt('Enter description for merged theme:',
      theme1.current_description + ' ' + theme2.current_description);
    if (mergedDesc === null) return;

    await Synth.pipeline.applyThemeMerge(activeProjectId, ids, mergedLabel, mergedDesc);
    selectedThemes.clear();
    await refreshThemes();
  }

  // ========== Theme Review ==========

  async function startThemeReview() {
    if (!activeProjectId) return;
    if (!Synth.api.hasCredentials()) {
      showStatus('review-log', 'error', 'Configure your API credentials first.');
      return;
    }

    document.getElementById('theme-review-panel').classList.remove('hidden');
    document.getElementById('theme-cards').classList.add('hidden');
    document.getElementById('themes-empty').classList.add('hidden');
    document.getElementById('merge-bar').classList.add('hidden');

    var logEl = document.getElementById('review-log');
    logEl.innerHTML = '';
    logEl.classList.remove('hidden');
    document.getElementById('review-summary').classList.add('hidden');
    document.getElementById('review-clusters').innerHTML = '';
    document.getElementById('review-weak-themes').classList.add('hidden');

    var activeLine = null;

    var result = await Synth.pipeline.reviewThemes(activeProjectId, function (msg, type) {
      if (type === 'step') {
        if (activeLine) { activeLine.classList.remove('active'); activeLine.classList.add('done'); }
        activeLine = document.createElement('div');
        activeLine.className = 'log-line active';
        activeLine.textContent = msg;
        logEl.appendChild(activeLine);
        logEl.scrollTop = logEl.scrollHeight;
      } else if (type === 'update') {
        if (activeLine) {
          activeLine.setAttribute('data-label', activeLine.getAttribute('data-label') || activeLine.textContent);
          activeLine.textContent = activeLine.getAttribute('data-label') + ' — ' + msg;
        }
      } else if (type === 'done') {
        if (activeLine) { activeLine.classList.remove('active'); activeLine.classList.add('done'); activeLine.textContent = msg; activeLine = null; }
      } else if (type === 'error') {
        if (activeLine) { activeLine.classList.remove('active'); activeLine.classList.add('error'); activeLine.textContent = msg; activeLine = null; }
      }
    });

    if (!result.success) {
      return;
    }

    if (result.summary) {
      var summaryEl = document.getElementById('review-summary');
      summaryEl.textContent = result.summary;
      summaryEl.classList.remove('hidden');
    }

    await renderReviewClusters(result.clusters);
    renderWeakThemes(result.weak_themes);
  }

  async function renderReviewClusters(clusters) {
    var container = document.getElementById('review-clusters');
    container.innerHTML = '';

    if (!clusters || clusters.length === 0) {
      container.innerHTML = '<div class="card"><p>No theme clusters identified. Your themes appear distinct.</p></div>';
      return;
    }

    for (var i = 0; i < clusters.length; i++) {
      var card = await buildClusterCard(clusters[i], i);
      container.appendChild(card);
    }
  }

  async function buildClusterCard(cluster, idx) {
    var card = document.createElement('div');
    card.className = 'cluster-card';

    var recClass = (cluster.recommendation || '').replace(/ /g, '_');
    var recLabel = cluster.recommendation === 'merge' ? 'Merge' :
                   cluster.recommendation === 'group' ? 'Group as Sub-themes' :
                   cluster.recommendation === 'keep_separate' ? 'Keep Separate' : cluster.recommendation;

    var html = '<span class="cluster-recommendation ' + escapeHtml(recClass) + '">' + escapeHtml(recLabel) + '</span>';
    html += '<span class="cluster-confidence">' + escapeHtml(cluster.confidence || '') + ' confidence</span>';
    html += '<div class="cluster-rationale">' + escapeHtml(cluster.rationale || '') + '</div>';

    html += '<div class="cluster-themes">';
    for (var i = 0; i < (cluster.theme_ids || []).length; i++) {
      var theme = await Synth.db.getTheme(cluster.theme_ids[i]);
      if (!theme) continue;
      var pCount = getParticipantCount(theme);
      var eCount = theme.supporting_evidence ? theme.supporting_evidence.length : 0;
      html += '<div class="cluster-theme-item">';
      html += '<div class="theme-label">' + escapeHtml(theme.label) + '</div>';
      html += '<div class="theme-desc">' + escapeHtml(theme.current_description || '') + '</div>';
      html += '<div class="theme-meta">' + pCount + ' participant(s), ' + eCount + ' quote(s)';
      if (theme.rq_mappings && theme.rq_mappings.length) html += ' · RQ: ' + theme.rq_mappings.map(function (id) { return cachedRqMap[id] || id; }).join(', ');
      html += '</div></div>';
    }
    html += '</div>';

    if (cluster.recommendation !== 'keep_separate' && cluster.suggested_label) {
      html += '<div class="cluster-suggestion">';
      html += '<strong>Suggested label:</strong> ' + escapeHtml(cluster.suggested_label) + '<br>';
      html += '<strong>Suggested description:</strong> ' + escapeHtml(cluster.suggested_description || '');
      html += '</div>';
    }

    html += '<div class="cluster-actions">';
    if (cluster.recommendation === 'merge') {
      html += '<button class="btn btn-primary btn-sm" data-action="merge">Accept Merge</button>';
      html += '<button class="btn btn-secondary btn-sm" data-action="reject">Keep Separate</button>';
    } else if (cluster.recommendation === 'group') {
      html += '<button class="btn btn-primary btn-sm" data-action="merge">Merge</button>';
      html += '<button class="btn btn-secondary btn-sm" data-action="reject">Keep Separate</button>';
    } else {
      html += '<button class="btn btn-secondary btn-sm" data-action="merge">Merge Anyway</button>';
      html += '<button class="btn btn-primary btn-sm" data-action="reject">Confirmed Separate</button>';
    }
    html += '<button class="btn btn-secondary btn-sm" data-action="skip">Skip</button>';
    html += '</div>';

    card.innerHTML = html;

    card.querySelector('[data-action="merge"]').addEventListener('click', function () {
      handleClusterMerge(cluster, card);
    });
    card.querySelector('[data-action="reject"]').addEventListener('click', function () {
      card.classList.add('resolved');
    });
    card.querySelector('[data-action="skip"]').addEventListener('click', function () {
      card.classList.add('resolved');
    });

    return card;
  }

  async function handleClusterMerge(cluster, card) {
    var label = cluster.suggested_label || cluster.theme_ids.join(' + ');
    var desc = cluster.suggested_description || '';

    var userLabel = prompt('Label for merged theme:', label);
    if (!userLabel) return;
    var userDesc = prompt('Description for merged theme:', desc);
    if (userDesc === null) return;

    try {
      var merged = await Synth.pipeline.applyThemeMerge(activeProjectId, cluster.theme_ids, userLabel, userDesc);
      if (merged) {
        card.classList.add('resolved');
      }
    } catch (e) {
      alert('Merge failed: ' + e.message);
    }
  }

  function renderWeakThemes(weakThemes) {
    var container = document.getElementById('review-weak-themes');
    var list = document.getElementById('review-weak-list');
    list.innerHTML = '';

    if (!weakThemes || weakThemes.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    weakThemes.forEach(function (wt) {
      var div = document.createElement('div');
      div.className = 'weak-theme-item';
      div.innerHTML = '<div class="theme-label">' + escapeHtml(wt.label || wt.theme_id) + '</div>' +
        '<div class="weak-reason">' + escapeHtml(wt.reason || '') + '</div>';
      list.appendChild(div);
    });
  }

  function closeThemeReview() {
    document.getElementById('theme-review-panel').classList.add('hidden');
    document.getElementById('theme-cards').classList.remove('hidden');
    refreshThemes();
  }

  // ========== Export Tab ==========

  var lastReport = null;
  var showingRaw = false;

  function initExportTab() {
    document.getElementById('btn-consolidate').addEventListener('click', runConsolidation);
    document.getElementById('btn-download-md').addEventListener('click', downloadReport);
    document.getElementById('btn-toggle-raw').addEventListener('click', toggleRawView);
    document.getElementById('btn-export-json').addEventListener('click', exportJson);
    document.getElementById('import-json-input').addEventListener('change', importJson);
  }

  async function loadExportDefaults() {
    if (!activeProjectId) return;
    var fw = await Synth.db.getFramework(activeProjectId);
    if (fw && fw.default_consolidation_model) {
      document.getElementById('consolidation-model').value = fw.default_consolidation_model;
    }
    await loadConsolidationStats();

    var themes = await Synth.db.getThemesByProject(activeProjectId);
    var exportNudge = document.getElementById('export-theme-nudge');
    if (themes.length > 30 && exportNudge) {
      document.getElementById('export-nudge-text').textContent =
        'You have ' + themes.length + ' themes. Reviewing themes before generating a report can improve the final synthesis.';
      exportNudge.classList.remove('hidden');
    } else if (exportNudge) {
      exportNudge.classList.add('hidden');
    }
  }

  async function loadConsolidationStats() {
    var statsEl = document.getElementById('consolidation-stats');
    if (!statsEl || !activeProjectId) { if (statsEl) statsEl.classList.add('hidden'); return; }

    var themes = await Synth.db.getThemesByProject(activeProjectId);
    var syntheses = await Synth.db.getSessionSynthesesByProject(activeProjectId);

    if (themes.length === 0 && syntheses.length === 0) {
      statsEl.classList.add('hidden');
      return;
    }

    var totalQuotes = 0;
    var verifiedQuotes = 0;
    var uniqueParticipants = {};
    themes.forEach(function (t) {
      (t.supporting_evidence || []).forEach(function (e) {
        totalQuotes++;
        if (e.verification_status === 'verified' || e.verification_status === 'confirmed') verifiedQuotes++;
        if (e.participant_id) uniqueParticipants[e.participant_id] = true;
      });
    });
    var participantCount = Object.keys(uniqueParticipants).length;

    statsEl.innerHTML = '<strong>' + themes.length + '</strong> themes &middot; <strong>' + participantCount + '</strong> participants &middot; <strong>' + syntheses.length + '</strong> sessions &middot; <strong>' + totalQuotes + '</strong> quotes (' + verifiedQuotes + ' verified)';
    statsEl.classList.remove('hidden');
  }

  async function runConsolidation() {
    if (!activeProjectId) {
      showStatus('consolidation-status', 'error', 'No project selected.');
      return;
    }
    if (!Synth.api.hasCredentials()) {
      showStatus('consolidation-status', 'error', 'Configure your API credentials in Settings first.');
      return;
    }

    var modelSelect = document.getElementById('consolidation-model');
    var modelOverride = modelSelect.value || null;

    var btn = document.getElementById('btn-consolidate');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating…';

    var logEl = document.getElementById('consolidation-log');
    logEl.innerHTML = '';
    logEl.classList.remove('hidden');
    showStatus('consolidation-status', '', '');
    var activeLine = null;

    var result = await Synth.pipeline.consolidate(
      activeProjectId,
      modelOverride,
      function (msg, type) {
        if (type === 'step') {
          if (activeLine) {
            activeLine.classList.remove('active');
            activeLine.classList.add('done');
          }
          activeLine = document.createElement('div');
          activeLine.className = 'log-line active';
          activeLine.textContent = msg;
          logEl.appendChild(activeLine);
          logEl.scrollTop = logEl.scrollHeight;
        } else if (type === 'update') {
          if (activeLine) {
            activeLine.setAttribute('data-label', activeLine.getAttribute('data-label') || activeLine.textContent);
            activeLine.textContent = activeLine.getAttribute('data-label') + ' — ' + msg;
          }
        } else if (type === 'done') {
          if (activeLine) {
            activeLine.classList.remove('active');
            activeLine.classList.add('done');
            activeLine.textContent = msg;
            activeLine = null;
          }
        } else if (type === 'error') {
          if (activeLine) {
            activeLine.classList.remove('active');
            activeLine.classList.add('error');
            activeLine.textContent = msg;
            activeLine = null;
          }
        }
      }
    );

    btn.disabled = false;
    btn.textContent = 'Generate Report';

    if (!result.success) {
      showStatus('consolidation-status', 'error', result.error);
      return;
    }

    lastReport = result.report;
    showingRaw = false;

    var previewCard = document.getElementById('report-preview-card');
    var previewDiv = document.getElementById('report-preview');
    var rawDiv = document.getElementById('report-raw');

    previewDiv.innerHTML = Synth.export.renderMarkdownPreview(result.report);
    rawDiv.textContent = result.report;
    previewDiv.classList.remove('hidden');
    rawDiv.classList.add('hidden');
    previewCard.classList.remove('hidden');

    var tokenInfo = '';
    if (result.usage && result.usage.total_tokens) {
      tokenInfo = ' (' + result.usage.total_tokens + ' tokens)';
    }
    showStatus('consolidation-status', 'success', 'Report generated with ' + result.model + tokenInfo + '.');
  }

  function downloadReport() {
    if (!lastReport) return;
    var projectName = document.getElementById('project-indicator').textContent || 'report';
    Synth.export.downloadMarkdown(lastReport, projectName);
  }

  function toggleRawView() {
    var previewDiv = document.getElementById('report-preview');
    var rawDiv = document.getElementById('report-raw');
    var btn = document.getElementById('btn-toggle-raw');

    showingRaw = !showingRaw;
    if (showingRaw) {
      previewDiv.classList.add('hidden');
      rawDiv.classList.remove('hidden');
      btn.textContent = 'View Preview';
    } else {
      previewDiv.classList.remove('hidden');
      rawDiv.classList.add('hidden');
      btn.textContent = 'View Raw';
    }
  }

  async function exportJson() {
    if (!activeProjectId) {
      showStatus('export-status', 'error', 'No project selected.');
      return;
    }
    var project = await Synth.db.getProject(activeProjectId);
    var count = await Synth.export.exportThemeDatabase(activeProjectId, project ? project.name : '');
    showStatus('export-status', 'success', 'Exported ' + count + ' theme(s).');
  }

  async function importJson() {
    var input = document.getElementById('import-json-input');
    var file = input.files[0];
    if (!file) return;
    input.value = '';

    if (!activeProjectId) {
      showStatus('export-status', 'error', 'No project selected.');
      return;
    }

    try {
      var text = await file.text();
      var result = await Synth.export.importThemeDatabase(activeProjectId, text);
      showStatus('export-status', 'success',
        'Imported ' + result.imported + ' theme(s). ' +
        (result.skipped > 0 ? result.skipped + ' skipped (duplicates or invalid).' : '')
      );
      refreshThemes();
    } catch (e) {
      showStatus('export-status', 'error', 'Import failed: ' + e.message);
    }
  }

  // ========== Helpers ==========

  function showStatus(elementId, type, message) {
    var el = document.getElementById(elementId);
    if (!el) return;
    el.className = 'status-msg ' + type;
    el.textContent = message;
  }

  function escapeHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    return d.toLocaleDateString();
  }

  return { init, switchTab, getActiveProjectId: function () { return activeProjectId; } };
})();

document.addEventListener('DOMContentLoaded', function () {
  Synth.app.init().catch(function (e) {
    console.error('Failed to initialise app:', e);
    var el = document.getElementById('api-status');
    if (el) {
      el.className = 'status-msg error';
      el.textContent = 'App failed to start: ' + e.message;
    }
  });
});
