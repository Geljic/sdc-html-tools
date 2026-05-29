window.Synth = window.Synth || {};

Synth.export = (function () {

  function downloadFile(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadMarkdown(content, projectName) {
    var safeName = (projectName || 'synthesis').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '-');
    var date = new Date().toISOString().slice(0, 10);
    downloadFile(content, safeName + '-synthesis-' + date + '.md', 'text/markdown');
  }

  async function exportThemeDatabase(projectId, projectName) {
    var themes = await Synth.db.getThemesByProject(projectId);
    var framework = await Synth.db.getFramework(projectId);

    var exportData = {
      export_version: 1,
      exported_at: new Date().toISOString(),
      project_name: projectName || '',
      framework: framework || null,
      themes: themes
    };

    var json = JSON.stringify(exportData, null, 2);
    var safeName = (projectName || 'themes').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '-');
    var date = new Date().toISOString().slice(0, 10);
    downloadFile(json, safeName + '-themes-' + date + '.json', 'application/json');

    return themes.length;
  }

  async function importThemeDatabase(projectId, jsonString) {
    var data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Invalid JSON file.');
    }

    if (!data.themes || !Array.isArray(data.themes)) {
      throw new Error('No themes array found in the import file.');
    }

    var imported = 0;
    var skipped = 0;

    for (var i = 0; i < data.themes.length; i++) {
      var theme = data.themes[i];

      if (!theme.theme_id || !theme.label) {
        skipped++;
        continue;
      }

      var existing = await Synth.db.getTheme(theme.theme_id);
      if (existing) {
        skipped++;
        continue;
      }

      theme.project_id = projectId;
      await Synth.db.saveTheme(theme);
      imported++;
    }

    return { imported: imported, skipped: skipped, total: data.themes.length };
  }

  function renderMarkdownPreview(markdown) {
    var lines = markdown.split('\n');
    var html = [];
    var inList = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (/^#{1,6}\s/.test(line)) {
        if (inList) { html.push('</ul>'); inList = false; }
        var level = line.match(/^(#+)/)[1].length;
        var text = escapeHtml(line.replace(/^#+\s*/, ''));
        html.push('<h' + level + '>' + text + '</h' + level + '>');
      } else if (/^>\s/.test(line)) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<blockquote>' + formatInline(line.replace(/^>\s*/, '')) + '</blockquote>');
      } else if (/^[-*]\s/.test(line)) {
        if (!inList) { html.push('<ul>'); inList = true; }
        html.push('<li>' + formatInline(line.replace(/^[-*]\s*/, '')) + '</li>');
      } else if (/^\d+\.\s/.test(line)) {
        if (!inList) { html.push('<ol>'); inList = true; }
        html.push('<li>' + formatInline(line.replace(/^\d+\.\s*/, '')) + '</li>');
      } else if (line.trim() === '---' || line.trim() === '***') {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<hr>');
      } else if (line.trim() === '') {
        if (inList) { html.push('</ul>'); inList = false; }
      } else {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<p>' + formatInline(line) + '</p>');
      }
    }

    if (inList) html.push('</ul>');
    return html.join('\n');
  }

  function formatInline(text) {
    var s = escapeHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/"([^"]+)"/g, '<q>$1</q>');
    return s;
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ========== Theme Export (docx + xlsx) ==========

  function buildExportFilename(projectName, suffix, ext) {
    var safeName = (projectName || 'themes').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '-');
    var date = new Date().toISOString().slice(0, 10);
    return safeName + '-' + suffix + '-' + date + '.' + ext;
  }

  function formatRqLabels(theme, rqMap) {
    return (theme.rq_mappings || []).map(function (id) { return rqMap[id] || id; }).join(', ');
  }

  // --- DOCX generation via JSZip (raw OOXML) ---

  function docxEscape(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function docxParagraph(text, style) {
    var pPr = style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '';
    return '<w:p>' + pPr + '<w:r><w:t xml:space="preserve">' + docxEscape(text) + '</w:t></w:r></w:p>';
  }

  function docxStyledRun(text, bold, italic) {
    var rPr = '';
    if (bold || italic) {
      rPr = '<w:rPr>' + (bold ? '<w:b/>' : '') + (italic ? '<w:i/>' : '') + '</w:rPr>';
    }
    return '<w:r>' + rPr + '<w:t xml:space="preserve">' + docxEscape(text) + '</w:t></w:r>';
  }

  function docxQuoteParagraph(quote, attribution) {
    return '<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>' +
      '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">“' + docxEscape(quote) + '”</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>' +
      '<w:r><w:rPr><w:color w:val="5F6672"/><w:sz w:val="20"/></w:rPr>' +
      '<w:t xml:space="preserve">— ' + docxEscape(attribution) + '</w:t></w:r></w:p>';
  }

  async function exportThemesDocx(themes, projectName, sessionMap, rqMap) {
    var body = '';

    body += docxParagraph(projectName + ' — Theme Export', 'Title');
    body += docxParagraph(themes.length + ' theme' + (themes.length === 1 ? '' : 's') + ' exported on ' + new Date().toISOString().slice(0, 10), 'Subtitle');

    themes.forEach(function (theme) {
      body += docxParagraph(theme.label, 'Heading1');

      if (theme.significance === 'minor') {
        body += '<w:p><w:r><w:rPr><w:i/><w:color w:val="5F6672"/></w:rPr>' +
          '<w:t xml:space="preserve">Minor theme</w:t></w:r></w:p>';
      }

      body += docxParagraph(theme.current_description || '');

      var rqText = formatRqLabels(theme, rqMap);
      if (rqText) {
        body += '<w:p>' + docxStyledRun('Research Questions: ', true) + docxStyledRun(rqText) + '</w:p>';
      }

      var evidence = theme.supporting_evidence || [];
      var participants = new Set(evidence.map(function (e) { return e.participant_id; }));
      body += docxParagraph('Supporting Evidence (' + evidence.length + ' quote' + (evidence.length === 1 ? '' : 's') + ' from ' + participants.size + ' participant' + (participants.size === 1 ? '' : 's') + ')', 'Heading2');

      evidence.forEach(function (ev) {
        var sessionLabel = sessionMap[ev.session_id] || '';
        var parts = [ev.participant_id || ev.speaker || ''];
        if (sessionLabel) parts.push(sessionLabel);
        if (ev.timestamp) parts.push(ev.timestamp);
        var attribution = parts.filter(Boolean).join(', ');
        body += docxQuoteParagraph(ev.quote || '', attribution);
      });
    });

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>';

    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';

    var wordRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    var font = 'Public Sans';
    var rFonts = '<w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:cs="' + font + '"/>';

    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults>' +
        '<w:rPrDefault><w:rPr>' + rFonts + '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
        '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
      '</w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr>' + rFonts + '<w:b/><w:sz w:val="48"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr>' + rFonts + '<w:color w:val="5F6672"/><w:sz w:val="24"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr><w:rPr>' + rFonts + '<w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr>' + rFonts + '<w:b/><w:sz w:val="26"/><w:color w:val="5F6672"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="720"/><w:spacing w:after="60"/></w:pPr><w:rPr>' + rFonts + '<w:sz w:val="22"/></w:rPr></w:style>' +
      '</w:styles>';

    var document_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body + '</w:body></w:document>';

    var zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels', rels);
    zip.file('word/_rels/document.xml.rels', wordRels);
    zip.file('word/document.xml', document_xml);
    zip.file('word/styles.xml', styles);

    var blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = buildExportFilename(projectName, 'themes', 'docx');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- XLSX generation via SheetJS ---

  function exportThemesXlsx(themes, projectName, sessionMap, rqMap) {
    var rows = [];

    themes.forEach(function (theme) {
      var rqText = formatRqLabels(theme, rqMap);
      var evidence = theme.supporting_evidence || [];

      if (evidence.length === 0) {
        rows.push({
          'Theme': theme.label,
          'Description': theme.current_description || '',
          'Significance': theme.significance || 'major',
          'Research Questions': rqText,
          'Quote': '',
          'Speaker': '',
          'Participant': '',
          'Session': '',
          'Timestamp': ''
        });
        return;
      }

      evidence.forEach(function (ev) {
        rows.push({
          'Theme': theme.label,
          'Description': theme.current_description || '',
          'Significance': theme.significance || 'major',
          'Research Questions': rqText,
          'Quote': ev.quote || '',
          'Speaker': ev.speaker || '',
          'Participant': ev.participant_id || '',
          'Session': sessionMap[ev.session_id] || '',
          'Timestamp': ev.timestamp || ''
        });
      });
    });

    var ws = XLSX.utils.json_to_sheet(rows);

    var colWidths = [
      { wch: 30 },  // Theme
      { wch: 50 },  // Description
      { wch: 12 },  // Significance
      { wch: 40 },  // Research Questions
      { wch: 60 },  // Quote
      { wch: 15 },  // Speaker
      { wch: 12 },  // Participant
      { wch: 20 },  // Session
      { wch: 10 }   // Timestamp
    ];
    ws['!cols'] = colWidths;

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Themes');

    XLSX.writeFile(wb, buildExportFilename(projectName, 'themes', 'xlsx'));
  }

  return { downloadMarkdown, exportThemeDatabase, importThemeDatabase, renderMarkdownPreview, exportThemesDocx, exportThemesXlsx };
})();
