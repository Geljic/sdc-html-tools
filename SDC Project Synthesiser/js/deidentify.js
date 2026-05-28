window.Synth = window.Synth || {};

Synth.deidentify = (function () {

  var state = {
    originalTurns: null,
    currentTurns: null,
    preApplyTurns: null,
    onComplete: null,
    onCancel: null,
    facNames: [],
    projectId: null,
    participantDimensions: [],
    existingParticipantIds: new Set(),
    nextParticipantNumber: 1,
    findTerm: '',
    replaceTerm: '',
    matches: [],
    currentMatch: -1,
    editingTurnIndex: -1
  };

  // --- Data Functions ---

  function detectNames(turns, facilitatorNames) {
    var facSet = new Set((facilitatorNames || []).map(function (n) { return n.toLowerCase().trim(); }));
    var counts = {};
    for (var i = 0; i < turns.length; i++) {
      var s = turns[i].speaker;
      counts[s] = (counts[s] || 0) + 1;
    }

    var speakers = Object.entries(counts)
      .sort(function (a, b) { return b[1] - a[1]; })
      .map(function (entry) { return { name: entry[0], turnCount: entry[1] }; });

    var nonFac = speakers.filter(function (s) { return !facSet.has(s.name.toLowerCase()); });
    var participantNum = 0;

    return speakers.map(function (s) {
      var isFac = facSet.has(s.name.toLowerCase());
      var defaultReplacement;
      if (isFac) {
        defaultReplacement = s.name;
      } else {
        participantNum++;
        defaultReplacement = nonFac.length === 1 ? 'Participant' : 'Participant ' + participantNum;
      }
      return {
        name: s.name,
        turnCount: s.turnCount,
        isFacilitator: isFac,
        defaultReplacement: defaultReplacement
      };
    });
  }

  function applyNameReplacements(turns, replacements) {
    var map = {};
    for (var i = 0; i < replacements.length; i++) {
      if (replacements[i].original !== replacements[i].replacement) {
        map[replacements[i].original] = replacements[i].replacement;
      }
    }

    return turns.map(function (t) {
      var newSpeaker = map[t.speaker] !== undefined ? map[t.speaker] : t.speaker;
      var newContent = t.content;

      for (var orig in map) {
        var regex = new RegExp('\\b' + escapeRegex(orig) + '\\b', 'gi');
        newContent = newContent.replace(regex, map[orig]);
      }

      return { speaker: newSpeaker, timestamp: t.timestamp, content: newContent };
    });
  }

  function applyFindReplace(turns, rules) {
    if (!rules || rules.length === 0) return turns;

    return turns.map(function (t) {
      var newContent = t.content;
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (!r.find) continue;
        var regex = new RegExp('\\b' + escapeRegex(r.find) + '\\b', 'gi');
        newContent = newContent.replace(regex, r.replace || '');
      }
      return { speaker: t.speaker, timestamp: t.timestamp, content: newContent };
    });
  }

  function rebuildRawText(turns) {
    return turns.map(function (t) {
      return t.speaker + ' ' + t.timestamp + ' ' + t.content;
    }).join('\n');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // --- Search / Find & Replace ---

  function performSearch(term) {
    state.findTerm = term;
    state.matches = [];
    state.currentMatch = -1;

    if (!term.trim()) {
      updateMatchCount();
      renderPreview();
      return;
    }

    var regex = new RegExp(escapeRegex(term), 'gi');
    for (var i = 0; i < state.currentTurns.length; i++) {
      var content = state.currentTurns[i].content;
      var m;
      while ((m = regex.exec(content)) !== null) {
        state.matches.push({
          turnIndex: i,
          startPos: m.index,
          endPos: m.index + m[0].length
        });
      }
    }

    if (state.matches.length > 0) state.currentMatch = 0;
    updateMatchCount();
    renderPreview();

    if (state.matches.length > 0) scrollToCurrentMatch();
  }

  function navigateMatch(direction) {
    if (state.matches.length === 0) return;
    state.currentMatch += direction;
    if (state.currentMatch >= state.matches.length) state.currentMatch = 0;
    if (state.currentMatch < 0) state.currentMatch = state.matches.length - 1;
    updateMatchCount();
    renderPreview();
    scrollToCurrentMatch();
  }

  function scrollToCurrentMatch() {
    if (state.currentMatch < 0) return;
    var el = document.querySelector('.deid-match-current');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function replaceCurrentMatch() {
    if (state.currentMatch < 0 || state.matches.length === 0) return;
    var match = state.matches[state.currentMatch];
    var turn = state.currentTurns[match.turnIndex];
    var replacement = state.replaceTerm;

    turn.content = turn.content.substring(0, match.startPos) + replacement + turn.content.substring(match.endPos);

    performSearch(state.findTerm);
  }

  function replaceAllMatches() {
    if (state.matches.length === 0) return;
    var term = state.findTerm;
    var replacement = state.replaceTerm;
    var regex = new RegExp(escapeRegex(term), 'gi');
    var count = state.matches.length;

    for (var i = 0; i < state.currentTurns.length; i++) {
      state.currentTurns[i].content = state.currentTurns[i].content.replace(regex, replacement);
    }

    performSearch(state.findTerm);
    showDeidStatus('success', count + ' replacement(s) made.');
  }

  function updateMatchCount() {
    var el = document.getElementById('subpage-deid-match-count');
    if (!el) return;
    if (state.matches.length === 0 && state.findTerm.trim()) {
      el.textContent = 'No matches';
    } else if (state.matches.length > 0) {
      el.textContent = (state.currentMatch + 1) + ' of ' + state.matches.length;
    } else {
      el.textContent = '';
    }
  }

  function refreshParticipantReplaceDropdown() {
    var sel = document.getElementById('subpage-deid-replace-participant');
    sel.innerHTML = '<option value="">— Select participant —</option>';
    var rows = document.querySelectorAll('.deid-name-row');
    rows.forEach(function (row) {
      var roleSelect = row.querySelector('.deid-role-select');
      if (!roleSelect || roleSelect.value !== 'participant') return;
      var span = row.querySelector('.deid-name-replacement');
      var ppRealname = row.querySelector('.deid-pp-realname');
      if (!span) return;
      var replacementName = span.textContent.trim();
      var realName = ppRealname ? ppRealname.value.trim() : '';
      var label = realName ? replacementName + ' (' + realName + ')' : replacementName;
      sel.innerHTML += '<option value="' + escapeHtml(replacementName) + '">' + escapeHtml(label) + '</option>';
    });
  }

  function renderContentWithHighlights(content, turnIndex) {
    var escaped = escapeHtml(content);
    if (!state.findTerm.trim() || state.matches.length === 0) return escaped;

    var turnMatches = state.matches.filter(function (m) { return m.turnIndex === turnIndex; });
    if (turnMatches.length === 0) return escaped;

    var escapedTerm = escapeHtml(state.findTerm);
    var regex = new RegExp('(' + escapeRegex(escapedTerm) + ')', 'gi');

    var globalMatchIndex = 0;
    for (var i = 0; i < state.matches.length; i++) {
      if (state.matches[i].turnIndex === turnIndex) break;
      globalMatchIndex++;
    }

    var localIndex = 0;
    return escaped.replace(regex, function (match) {
      var isCurrentMatch = (globalMatchIndex + localIndex) === state.currentMatch;
      localIndex++;
      if (isCurrentMatch) {
        return '<mark class="deid-match-current">' + match + '</mark>';
      }
      return '<mark class="deid-match">' + match + '</mark>';
    });
  }

  // --- Facilitator Toggle (via role dropdown) ---

  async function saveFacilitatorsToFramework() {
    if (!state.projectId || state.facNames.length === 0) return;
    try {
      var fw = await Synth.db.getFramework(state.projectId);
      if (!fw) return;
      var existing = (fw.facilitator_names || []).map(function (n) { return n.toLowerCase().trim(); });
      var changed = false;
      for (var i = 0; i < state.facNames.length; i++) {
        if (existing.indexOf(state.facNames[i].toLowerCase().trim()) < 0) {
          fw.facilitator_names.push(state.facNames[i]);
          changed = true;
        }
      }
      if (changed) await Synth.db.saveFramework(fw);
    } catch (e) {
      console.error('Failed to save facilitators to framework:', e);
    }
  }

  // --- Inline Turn Editing ---

  function startEditingTurn(index) {
    state.editingTurnIndex = index;
    renderPreview();
    var textarea = document.querySelector('.deid-turn-textarea');
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }

  function saveEditingTurn(index) {
    var textarea = document.querySelector('.deid-turn-textarea');
    if (textarea) {
      state.currentTurns[index].content = textarea.value;
    }
    state.editingTurnIndex = -1;
    if (state.findTerm.trim()) performSearch(state.findTerm);
    else renderPreview();
  }

  function cancelEditingTurn() {
    state.editingTurnIndex = -1;
    renderPreview();
  }

  // --- UI Functions ---

  function show(pendingParse, facNames, projectId, participantDimensions, existingParticipantIds, nextPpNum, onComplete, onCancel) {
    state.originalTurns = pendingParse.result.turns.map(function (t) {
      return { speaker: t.speaker, timestamp: t.timestamp, content: t.content };
    });
    state.currentTurns = state.originalTurns.map(function (t) {
      return { speaker: t.speaker, timestamp: t.timestamp, content: t.content };
    });
    state.onComplete = onComplete;
    state.onCancel = onCancel;
    state.facNames = (facNames || []).slice();
    state.projectId = projectId || null;
    state.participantDimensions = (participantDimensions || []).slice();
    state.existingParticipantIds = new Set(existingParticipantIds || []);
    state.nextParticipantNumber = nextPpNum || 1;
    state.preApplyTurns = null;
    state.findTerm = '';
    state.replaceTerm = '';
    state.matches = [];
    state.currentMatch = -1;
    state.editingTurnIndex = -1;

    var card = document.getElementById('subpage-deidentify');
    document.getElementById('subpage-deid-filename').textContent = pendingParse.file.name;

    document.getElementById('subpage-deid-step1').classList.remove('hidden');
    document.getElementById('subpage-deid-step2').classList.add('hidden');

    renderNameTable();

    card.classList.remove('hidden');
  }

  function hide() {
    document.getElementById('subpage-deidentify').classList.add('hidden');
  }

  function getReplacementForRole(role, participantNum, totalParticipants) {
    if (role === 'facilitator') return 'Facilitator';
    if (role === 'observer') return 'Observer';
    if (role === 'exclude') return '[Excluded]';
    return totalParticipants === 1 ? 'Participant' : 'Participant ' + participantNum;
  }

  function renderNameTable() {
    var detected = detectNames(state.currentTurns, state.facNames);
    var container = document.getElementById('subpage-deid-name-list');
    container.innerHTML = '';

    var assignedNum = state.nextParticipantNumber;
    var usedIds = new Set(state.existingParticipantIds);

    var totalParticipants = detected.filter(function (d) { return !d.isFacilitator; }).length;
    var participantNum = 0;

    detected.forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'deid-name-row';

      var defaultRole = d.isFacilitator ? 'facilitator' : 'participant';
      if (defaultRole === 'participant') participantNum++;
      var replacement = getReplacementForRole(defaultRole, participantNum, totalParticipants);

      row.innerHTML =
        '<div class="deid-name-header">' +
          '<span class="deid-name-original">' + escapeHtml(d.name) +
          '<span class="deid-name-turns">(' + d.turnCount + ' turns)</span></span>' +
          '<select class="deid-role-select" data-name="' + escapeHtml(d.name) + '">' +
            '<option value="participant"' + (defaultRole === 'participant' ? ' selected' : '') + '>Participant</option>' +
            '<option value="facilitator"' + (defaultRole === 'facilitator' ? ' selected' : '') + '>Facilitator</option>' +
            '<option value="observer">Observer</option>' +
            '<option value="exclude">Exclude</option>' +
          '</select>' +
          '<span class="deid-arrow">&rarr;</span>' +
          '<span class="deid-name-replacement" data-original="' + escapeHtml(d.name) + '">' + escapeHtml(replacement) + '</span>' +
        '</div>';

      if (defaultRole === 'participant') {
        var nextId = 'P-' + String(assignedNum).padStart(2, '0');
        while (usedIds.has(nextId)) { assignedNum++; nextId = 'P-' + String(assignedNum).padStart(2, '0'); }
        usedIds.add(nextId);
        assignedNum++;
        row.appendChild(buildParticipantFields(d.name, nextId));
      }

      container.appendChild(row);
    });
  }

  function buildParticipantFields(originalName, autoId) {
    var div = document.createElement('div');
    div.className = 'deid-pp-fields';
    div.dataset.name = originalName;
    var dimHtml = buildDimensionSelectsHtml();
    div.innerHTML =
      '<label class="deid-pp-label">ID</label>' +
      '<span class="deid-pp-id">' + escapeHtml(autoId) + '</span>' +
      '<label class="deid-pp-label">Name <span class="deid-pp-hint">(reference only — not sent to AI)</span></label>' +
      '<input type="text" class="deid-pp-realname" value="' + escapeHtml(originalName) + '">' +
      dimHtml;
    return div;
  }

  function buildDimensionSelectsHtml() {
    if (state.participantDimensions.length === 0) return '';
    var html = '<div class="deid-pp-dimensions">';
    state.participantDimensions.forEach(function (dim) {
      html += '<label class="deid-pp-dim-label">' + escapeHtml(dim.label);
      html += '<select class="deid-pp-dim" data-dim-id="' + escapeHtml(dim.dimension_id) + '">';
      html += '<option value="">— None —</option>';
      dim.tags.forEach(function (tag) {
        html += '<option value="' + escapeHtml(tag.tag_id) + '">' + escapeHtml(tag.label) + '</option>';
      });
      html += '</select></label>';
    });
    html += '</div>';
    return html;
  }

  function getRoleAssignments() {
    var roleMap = {};
    var spans = document.querySelectorAll('.deid-name-replacement');

    spans.forEach(function (span) {
      var original = span.dataset.original;
      var replacement = span.textContent.trim() || original;
      var roleSelect = document.querySelector('.deid-role-select[data-name="' + original + '"]');
      var role = roleSelect ? roleSelect.value : 'participant';
      roleMap[replacement] = role;
    });

    return roleMap;
  }

  function getParticipantDetails() {
    var participants = [];
    var rows = document.querySelectorAll('.deid-name-row');

    rows.forEach(function (row) {
      var roleSelect = row.querySelector('.deid-role-select');
      if (!roleSelect || roleSelect.value !== 'participant') return;

      var replacementSpan = row.querySelector('.deid-name-replacement');
      var replacementName = replacementSpan ? replacementSpan.textContent.trim() : '';

      var ppId = row.querySelector('.deid-pp-id');
      var ppRealname = row.querySelector('.deid-pp-realname');

      var dimTags = {};
      row.querySelectorAll('.deid-pp-dim').forEach(function (sel) {
        if (sel.value) dimTags[sel.dataset.dimId] = sel.value;
      });

      participants.push({
        display_id: ppId ? ppId.textContent.trim() : '',
        replacement_name: replacementName,
        real_name: ppRealname ? ppRealname.value.trim() : '',
        dimension_tags: dimTags
      });
    });

    return participants;
  }

  function renderPreview() {
    var previewDiv = document.getElementById('subpage-deid-preview');
    previewDiv.innerHTML = '';

    state.currentTurns.forEach(function (t, i) {
      var div = document.createElement('div');
      div.className = 'turn';
      div.dataset.index = i;

      if (state.editingTurnIndex === i) {
        div.innerHTML =
          '<div class="turn-header">' + escapeHtml(t.speaker) +
          '<span class="turn-timestamp">' + escapeHtml(t.timestamp) + '</span></div>' +
          '<textarea class="deid-turn-textarea" rows="3">' + escapeHtml(t.content) + '</textarea>' +
          '<div class="deid-turn-edit-actions">' +
          '<button class="btn btn-primary btn-sm deid-turn-save" data-index="' + i + '">Save</button>' +
          '<button class="btn btn-secondary btn-sm deid-turn-cancel">Cancel</button>' +
          '</div>';
      } else {
        var contentHtml = renderContentWithHighlights(t.content, i);
        div.innerHTML =
          '<div class="turn-header">' + escapeHtml(t.speaker) +
          '<span class="turn-timestamp">' + escapeHtml(t.timestamp) + '</span>' +
          '<button class="deid-turn-edit-btn" data-index="' + i + '" title="Edit this turn">&#9998;</button>' +
          '</div>' +
          '<div class="turn-content">' + contentHtml + '</div>';
      }

      previewDiv.appendChild(div);
    });
  }

  function readNameReplacements() {
    var spans = document.querySelectorAll('.deid-name-replacement');
    var replacements = [];
    spans.forEach(function (span) {
      var role = '';
      var roleSelect = document.querySelector('.deid-role-select[data-name="' + span.dataset.original + '"]');
      if (roleSelect) role = roleSelect.value;
      if (role === 'exclude') return;
      replacements.push({
        original: span.dataset.original,
        replacement: span.textContent.trim() || span.dataset.original
      });
    });
    return replacements;
  }

  function applyAndAdvance() {
    state.preApplyTurns = state.currentTurns.map(function (t) {
      return { speaker: t.speaker, timestamp: t.timestamp, content: t.content };
    });

    var nameReplacements = readNameReplacements();
    state.currentTurns = applyNameReplacements(state.currentTurns, nameReplacements);

    resetStep2State();
    renderPreview();
    updateProceedState();

    document.getElementById('subpage-deid-step1').classList.add('hidden');
    document.getElementById('subpage-deid-step2').classList.remove('hidden');
    showDeidStatus('', '');
  }

  function goBackToStep1() {
    if (state.preApplyTurns) {
      state.currentTurns = state.preApplyTurns;
      state.preApplyTurns = null;
    }
    state.editingTurnIndex = -1;

    renderNameTable();

    document.getElementById('subpage-deid-step2').classList.add('hidden');
    document.getElementById('subpage-deid-step1').classList.remove('hidden');
    showDeidStatus('', '');
  }

  function resetStep2State() {
    state.findTerm = '';
    state.replaceTerm = '';
    state.matches = [];
    state.currentMatch = -1;
    state.editingTurnIndex = -1;

    var findInput = document.getElementById('subpage-deid-find-input');
    var replaceInput = document.getElementById('subpage-deid-replace-input');
    var replaceMode = document.getElementById('subpage-deid-replace-mode');
    var replacePpSelect = document.getElementById('subpage-deid-replace-participant');
    if (findInput) findInput.value = '';
    if (replaceInput) { replaceInput.value = ''; replaceInput.classList.remove('hidden'); }
    if (replaceMode) replaceMode.value = 'text';
    if (replacePpSelect) { replacePpSelect.classList.add('hidden'); replacePpSelect.innerHTML = ''; }
    document.getElementById('subpage-deid-confirm-checkbox').checked = false;
    updateMatchCount();
  }

  function resetToOriginal() {
    state.currentTurns = state.originalTurns.map(function (t) {
      return { speaker: t.speaker, timestamp: t.timestamp, content: t.content };
    });
    state.preApplyTurns = null;

    renderNameTable();

    document.getElementById('subpage-deid-step2').classList.add('hidden');
    document.getElementById('subpage-deid-step1').classList.remove('hidden');
    showDeidStatus('info', 'Transcript reset to original.');
  }

  function updateProceedState() {
    var checked = document.getElementById('subpage-deid-confirm-checkbox').checked;
    document.getElementById('btn-subpage-deid-proceed').disabled = !checked;
  }

  async function handleProceed() {
    if (state.editingTurnIndex >= 0) {
      saveEditingTurn(state.editingTurnIndex);
    }

    var participantDetails = getParticipantDetails();

    await saveFacilitatorsToFramework();

    var participantMap = {};
    participantDetails.forEach(function (pd) {
      participantMap[pd.replacement_name] = pd.display_id;
    });

    var result = {
      turns: state.currentTurns,
      raw_text: rebuildRawText(state.currentTurns),
      participant_map: participantMap,
      participant_details: participantDetails
    };

    hide();
    if (state.onComplete) state.onComplete(result);
  }

  function handleCancel() {
    hide();
    if (state.onCancel) state.onCancel();
  }

  function updateParticipantFields() {
    var rows = document.querySelectorAll('.deid-name-row');
    var assignedNum = state.nextParticipantNumber;
    var usedIds = new Set(state.existingParticipantIds);

    rows.forEach(function (row) {
      var existingId = row.querySelector('.deid-pp-id');
      if (existingId && existingId.textContent.trim()) {
        usedIds.add(existingId.textContent.trim());
      }
    });

    var totalParticipants = 0;
    rows.forEach(function (row) {
      var rs = row.querySelector('.deid-role-select');
      if (rs && rs.value === 'participant') totalParticipants++;
    });

    var participantNum = 0;
    rows.forEach(function (row) {
      var roleSelect = row.querySelector('.deid-role-select');
      var existingFields = row.querySelector('.deid-pp-fields');
      var originalName = roleSelect ? roleSelect.dataset.name : '';
      var role = roleSelect ? roleSelect.value : 'participant';

      if (role === 'participant') participantNum++;
      var replacementSpan = row.querySelector('.deid-name-replacement');
      if (replacementSpan) {
        replacementSpan.textContent = getReplacementForRole(role, participantNum, totalParticipants);
      }

      if (role === 'participant') {
        if (!existingFields) {
          var nextId = 'P-' + String(assignedNum).padStart(2, '0');
          while (usedIds.has(nextId)) { assignedNum++; nextId = 'P-' + String(assignedNum).padStart(2, '0'); }
          usedIds.add(nextId);
          assignedNum++;
          row.appendChild(buildParticipantFields(originalName, nextId));
        }
      } else {
        if (existingFields) existingFields.remove();
      }
    });
  }

  function showDeidStatus(type, message) {
    var el = document.getElementById('subpage-deid-status');
    el.className = 'status-msg ' + type;
    el.textContent = message;
  }

  // --- Event Binding ---

  function initEvents() {
    document.getElementById('btn-subpage-apply-names').addEventListener('click', applyAndAdvance);
    document.getElementById('btn-subpage-deid-proceed').addEventListener('click', handleProceed);
    document.getElementById('btn-subpage-deid-cancel').addEventListener('click', handleCancel);
    document.getElementById('btn-subpage-deid-cancel-step1').addEventListener('click', handleCancel);
    document.getElementById('btn-subpage-deid-back').addEventListener('click', goBackToStep1);
    document.getElementById('btn-subpage-deid-reset').addEventListener('click', resetToOriginal);
    document.getElementById('subpage-deid-confirm-checkbox').addEventListener('change', updateProceedState);

    document.getElementById('subpage-deid-name-list').addEventListener('change', function (e) {
      var sel = e.target.closest('.deid-role-select');
      if (!sel) return;
      var name = sel.dataset.name;
      var lowerName = name.toLowerCase().trim();
      if (sel.value === 'facilitator') {
        if (!state.facNames.some(function (n) { return n.toLowerCase().trim() === lowerName; })) {
          state.facNames.push(name);
        }
      } else {
        state.facNames = state.facNames.filter(function (n) { return n.toLowerCase().trim() !== lowerName; });
      }
      updateParticipantFields();
    });

    // Find & Replace
    document.getElementById('subpage-deid-find-input').addEventListener('input', function (e) {
      performSearch(e.target.value);
    });

    document.getElementById('subpage-deid-replace-input').addEventListener('input', function (e) {
      state.replaceTerm = e.target.value;
    });

    document.getElementById('subpage-deid-replace-participant').addEventListener('change', function (e) {
      state.replaceTerm = e.target.value;
    });

    document.getElementById('subpage-deid-replace-mode').addEventListener('change', function (e) {
      var textInput = document.getElementById('subpage-deid-replace-input');
      var ppSelect = document.getElementById('subpage-deid-replace-participant');
      if (e.target.value === 'participant') {
        textInput.classList.add('hidden');
        ppSelect.classList.remove('hidden');
        refreshParticipantReplaceDropdown();
        state.replaceTerm = ppSelect.value || '';
      } else {
        ppSelect.classList.add('hidden');
        textInput.classList.remove('hidden');
        state.replaceTerm = textInput.value;
      }
    });

    document.getElementById('btn-subpage-deid-prev').addEventListener('click', function () {
      navigateMatch(-1);
    });

    document.getElementById('btn-subpage-deid-next').addEventListener('click', function () {
      navigateMatch(1);
    });

    document.getElementById('btn-subpage-deid-replace').addEventListener('click', function () {
      replaceCurrentMatch();
    });

    document.getElementById('btn-subpage-deid-replace-all').addEventListener('click', function () {
      replaceAllMatches();
    });

    // Inline turn editing (delegated)
    document.getElementById('subpage-deid-preview').addEventListener('click', function (e) {
      var editBtn = e.target.closest('.deid-turn-edit-btn');
      if (editBtn) {
        startEditingTurn(parseInt(editBtn.dataset.index, 10));
        return;
      }

      var saveBtn = e.target.closest('.deid-turn-save');
      if (saveBtn) {
        saveEditingTurn(parseInt(saveBtn.dataset.index, 10));
        return;
      }

      var cancelBtn = e.target.closest('.deid-turn-cancel');
      if (cancelBtn) {
        cancelEditingTurn();
        return;
      }
    });
  }

  return { show, hide, initEvents, detectNames, applyNameReplacements, applyFindReplace, rebuildRawText, getRoleAssignments, getParticipantDetails };
})();
