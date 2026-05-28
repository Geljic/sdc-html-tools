window.Synth = window.Synth || {};

Synth.db = (function () {
  const DB_NAME = 'research-synthesiser';
  const DB_VERSION = 5;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        const tx = e.target.transaction;

        if (!d.objectStoreNames.contains('projects')) {
          const store = d.createObjectStore('projects', { keyPath: 'project_id' });
          store.createIndex('name', 'name', { unique: false });
        }

        if (!d.objectStoreNames.contains('frameworks')) {
          d.createObjectStore('frameworks', { keyPath: 'project_id' });
        }

        if (!d.objectStoreNames.contains('transcripts')) {
          const store = d.createObjectStore('transcripts', { keyPath: 'transcript_id' });
          store.createIndex('project_id', 'project_id', { unique: false });
          store.createIndex('session_id', 'session_id', { unique: false });
          store.createIndex('status', 'status', { unique: false });
        } else {
          const txStore = tx.objectStore('transcripts');
          if (!txStore.indexNames.contains('session_id')) {
            txStore.createIndex('session_id', 'session_id', { unique: false });
          }
          if (txStore.indexNames.contains('participant_id')) {
            txStore.deleteIndex('participant_id');
          }
        }

        if (!d.objectStoreNames.contains('themes')) {
          const store = d.createObjectStore('themes', { keyPath: 'theme_id' });
          store.createIndex('project_id', 'project_id', { unique: false });
          store.createIndex('source', 'source', { unique: false });
        }

        if (!d.objectStoreNames.contains('participants')) {
          const store = d.createObjectStore('participants', { keyPath: 'participant_id' });
          store.createIndex('project_id', 'project_id', { unique: false });
        }

        if (!d.objectStoreNames.contains('sessions')) {
          const store = d.createObjectStore('sessions', { keyPath: 'session_id' });
          store.createIndex('project_id', 'project_id', { unique: false });
        }

        if (!d.objectStoreNames.contains('session_syntheses')) {
          const store = d.createObjectStore('session_syntheses', { keyPath: 'synthesis_id' });
          store.createIndex('project_id', 'project_id', { unique: false });
          store.createIndex('session_id', 'session_id', { unique: false });
        } else {
          const txStore = tx.objectStore('session_syntheses');
          if (!txStore.indexNames.contains('session_id')) {
            txStore.createIndex('session_id', 'session_id', { unique: false });
          }
        }

        if (!d.objectStoreNames.contains('inquiries')) {
          const store = d.createObjectStore('inquiries', { keyPath: 'inquiry_id' });
          store.createIndex('session_key', 'session_key', { unique: false });
          store.createIndex('project_id', 'project_id', { unique: false });
        } else {
          const txStore = tx.objectStore('inquiries');
          if (!txStore.indexNames.contains('session_key')) {
            txStore.createIndex('session_key', 'session_key', { unique: false });
          }
          if (txStore.indexNames.contains('participant_key')) {
            txStore.deleteIndex('participant_key');
          }
        }

        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };

      req.onerror = (e) => {
        reject(new Error('Failed to open database: ' + e.target.error?.message));
      };
    });
  }

  function tx(storeName, mode) {
    const transaction = db.transaction(storeName, mode || 'readonly');
    return transaction.objectStore(storeName);
  }

  function txMulti(storeNames, mode) {
    const transaction = db.transaction(storeNames, mode || 'readonly');
    return transaction;
  }

  function promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(req.error?.message || 'IndexedDB request failed'));
    });
  }

  function promisifyTx(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(transaction.error?.message || 'Transaction failed'));
    });
  }

  // --- Generic CRUD ---

  function put(storeName, record) {
    return promisify(tx(storeName, 'readwrite').put(record));
  }

  function get(storeName, key) {
    return promisify(tx(storeName, 'readonly').get(key));
  }

  function getAll(storeName) {
    return promisify(tx(storeName, 'readonly').getAll());
  }

  function del(storeName, key) {
    return promisify(tx(storeName, 'readwrite').delete(key));
  }

  function getAllByIndex(storeName, indexName, value) {
    const store = tx(storeName, 'readonly');
    const index = store.index(indexName);
    return promisify(index.getAll(value));
  }

  // --- Projects ---

  function createProject(name) {
    const project = {
      project_id: 'proj_' + Date.now(),
      name: name,
      created: new Date().toISOString(),
      active: true
    };
    return put('projects', project).then(() => project);
  }

  function getProjects() {
    return getAll('projects');
  }

  function getProject(projectId) {
    return get('projects', projectId);
  }

  function updateProject(project) {
    return put('projects', project);
  }

  function deleteProject(projectId) {
    return del('projects', projectId);
  }

  // --- Frameworks ---

  function getFramework(projectId) {
    return get('frameworks', projectId);
  }

  function saveFramework(framework) {
    return put('frameworks', framework);
  }

  function createDefaultFramework(projectId) {
    const framework = {
      project_id: projectId,
      background: '',
      facilitator_names: [],
      research_questions: [],
      participant_dimensions: []
    };
    return put('frameworks', framework).then(() => framework);
  }

  // --- Sessions ---

  function saveSession(session) {
    return put('sessions', session);
  }

  function getSession(sessionId) {
    return get('sessions', sessionId);
  }

  function getSessionsByProject(projectId) {
    return getAllByIndex('sessions', 'project_id', projectId);
  }

  function deleteSession(sessionId) {
    return del('sessions', sessionId);
  }

  async function getNextSessionNumber(projectId) {
    var sessions = await getSessionsByProject(projectId);
    var max = 0;
    for (var i = 0; i < sessions.length; i++) {
      var num = parseInt(sessions[i].label.replace(/^Session\s*/i, ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
    return max + 1;
  }

  // --- Transcripts ---

  function saveTranscript(transcript) {
    return put('transcripts', transcript);
  }

  function getTranscript(transcriptId) {
    return get('transcripts', transcriptId);
  }

  function getTranscriptsByProject(projectId) {
    return getAllByIndex('transcripts', 'project_id', projectId);
  }

  function deleteTranscript(transcriptId) {
    return del('transcripts', transcriptId);
  }

  // --- Participants ---

  function saveParticipant(participant) {
    return put('participants', participant);
  }

  function getParticipant(participantId) {
    return get('participants', participantId);
  }

  function getParticipantsByProject(projectId) {
    return getAllByIndex('participants', 'project_id', projectId);
  }

  function deleteParticipant(participantId) {
    return del('participants', participantId);
  }

  async function getNextParticipantNumber(projectId) {
    var participants = await getParticipantsByProject(projectId);
    var max = 0;
    for (var i = 0; i < participants.length; i++) {
      var displayId = participants[i].display_id || participants[i].participant_id;
      var num = parseInt(displayId.replace(/^P-/, ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
    return max + 1;
  }

  // --- Themes ---

  function saveTheme(theme) {
    return put('themes', theme);
  }

  function getTheme(themeId) {
    return get('themes', themeId);
  }

  function getThemesByProject(projectId) {
    return getAllByIndex('themes', 'project_id', projectId);
  }

  function deleteTheme(themeId) {
    return del('themes', themeId);
  }

  function getNextThemeId() {
    return getAll('themes').then((themes) => {
      let max = 0;
      for (const t of themes) {
        const num = parseInt(t.theme_id.replace('theme_', ''), 10);
        if (num > max) max = num;
      }
      return 'theme_' + String(max + 1).padStart(3, '0');
    });
  }

  // --- Session Syntheses ---

  function saveSessionSynthesis(synthesis) {
    return put('session_syntheses', synthesis);
  }

  function getSessionSynthesis(synthesisId) {
    return get('session_syntheses', synthesisId);
  }

  function getSessionSynthesesByProject(projectId) {
    return getAllByIndex('session_syntheses', 'project_id', projectId);
  }

  function getSessionSynthesesBySession(sessionId) {
    return getAllByIndex('session_syntheses', 'session_id', sessionId);
  }

  function deleteSessionSynthesis(synthesisId) {
    return del('session_syntheses', synthesisId);
  }

  // --- Inquiries ---

  function saveInquiry(inquiry) {
    return put('inquiries', inquiry);
  }

  function getInquiriesBySession(sessionKey) {
    return getAllByIndex('inquiries', 'session_key', sessionKey);
  }

  function deleteInquiry(inquiryId) {
    return del('inquiries', inquiryId);
  }

  // --- Settings ---

  function getSetting(key) {
    return get('settings', key).then((rec) => rec ? rec.value : null);
  }

  function saveSetting(key, value) {
    return put('settings', { key: key, value: value });
  }

  // --- Utilities ---

  function clearStore(storeName) {
    return promisify(tx(storeName, 'readwrite').clear());
  }

  // --- V5 Migration: Participant-centric → Session-centric ---

  async function migrateToV5() {
    var done = await getSetting('migration_v5_done');
    if (done) return;

    var participants = await getAll('participants');
    var hasLegacyData = participants.some(function (p) { return !!p.transcript_id; });
    if (!hasLegacyData) {
      await saveSetting('migration_v5_done', true);
      return;
    }

    console.log('[migration] Starting V5 migration: participant → session');

    var participantToSession = {};
    var counter = 0;

    for (var i = 0; i < participants.length; i++) {
      var pp = participants[i];
      if (!pp.transcript_id) continue;

      counter++;
      var sessionId = 'sess_' + Date.now() + '_' + counter;
      var displayId = pp.display_id || pp.participant_id;

      participantToSession[displayId] = sessionId;

      var session = {
        session_id: sessionId,
        project_id: pp.project_id,
        label: displayId,
        transcript_id: pp.transcript_id,
        participant_ids: [displayId],
        synthesis_status: pp.synthesis_status || 'pending',
        created: pp.created || new Date().toISOString()
      };
      await saveSession(session);

      var transcript = await getTranscript(pp.transcript_id);
      if (transcript) {
        transcript.session_id = sessionId;

        var pMap = {};
        var roles = transcript.speaker_roles || {};
        for (var speaker in roles) {
          if (roles[speaker] === 'participant') {
            pMap[speaker] = transcript.participant_id || displayId;
          }
        }
        transcript.participant_map = pMap;

        delete transcript.participant_id;
        delete transcript.participant_group;
        await saveTranscript(transcript);
      }

      delete pp.transcript_id;
      delete pp.synthesis_status;
      await saveParticipant(pp);
    }

    var syntheses = await getAll('session_syntheses');
    for (var j = 0; j < syntheses.length; j++) {
      var s = syntheses[j];
      var oldPid = s.participant_id;
      if (oldPid && participantToSession[oldPid]) {
        s.session_id = participantToSession[oldPid];
        s.participant_ids = [oldPid];
        delete s.participant_id;
        await saveSessionSynthesis(s);
      }
    }

    var themes = await getAll('themes');
    for (var k = 0; k < themes.length; k++) {
      var theme = themes[k];
      var changed = false;
      var evidence = theme.supporting_evidence || [];
      for (var m = 0; m < evidence.length; m++) {
        var ev = evidence[m];
        if (ev.session_id && participantToSession[ev.session_id]) {
          ev.session_id = participantToSession[ev.session_id];
          changed = true;
        }
      }
      if (changed) {
        await saveTheme(theme);
      }
    }

    var inquiries = await getAll('inquiries');
    for (var n = 0; n < inquiries.length; n++) {
      var inq = inquiries[n];
      if (inq.participant_key && inq.participant_id) {
        var sessId = participantToSession[inq.participant_id];
        if (sessId) {
          inq.session_key = inq.project_id + '_' + sessId;
          inq.session_id = sessId;
          delete inq.participant_key;
          delete inq.participant_id;
          await saveInquiry(inq);
        }
      }
    }

    await saveSetting('migration_v5_done', true);
    console.log('[migration] V5 migration complete: ' + counter + ' session(s) created');
  }

  return {
    open, migrateToV5,
    createProject, getProjects, getProject, updateProject, deleteProject,
    getFramework, saveFramework, createDefaultFramework,
    saveSession, getSession, getSessionsByProject, deleteSession, getNextSessionNumber,
    saveParticipant, getParticipant, getParticipantsByProject, deleteParticipant, getNextParticipantNumber,
    saveTranscript, getTranscript, getTranscriptsByProject, deleteTranscript,
    saveTheme, getTheme, getThemesByProject, deleteTheme, getNextThemeId,
    saveSessionSynthesis, getSessionSynthesis, getSessionSynthesesByProject, getSessionSynthesesBySession, deleteSessionSynthesis,
    saveInquiry, getInquiriesBySession, deleteInquiry,
    getSetting, saveSetting,
    clearStore
  };
})();
