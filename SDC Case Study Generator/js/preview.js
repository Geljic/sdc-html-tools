// ============================================================
// PREVIEW — Renders structured markdown preview from state
// [NOT FOUND] fields are highlighted with amber warning style
// ============================================================

const CaseStudyPreview = (function () {

  const NOT_FOUND_MARKER = '[NOT FOUND';

  function isNotFound(val) {
    return typeof val === 'string' && val.trim().startsWith(NOT_FOUND_MARKER);
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function field(label, value) {
    if (value === null || value === undefined || value === '') {
      return `<div class="preview-field preview-field--missing">
        <span class="preview-field__label">${esc(label)}</span>
        <span class="preview-field__value preview-field__value--not-found">[NOT FOUND — no content extracted]</span>
      </div>`;
    }
    const notFound = isNotFound(value);
    return `<div class="preview-field${notFound ? ' preview-field--missing' : ''}">
      <span class="preview-field__label">${esc(label)}</span>
      <span class="preview-field__value${notFound ? ' preview-field__value--not-found' : ''}">${esc(value)}</span>
    </div>`;
  }

  function listField(label, items) {
    if (!items || items.length === 0) {
      return field(label, null);
    }
    const listItems = items.map(function (item) {
      const notFound = isNotFound(item);
      return `<li class="${notFound ? 'not-found' : ''}">${esc(item)}</li>`;
    }).join('');
    return `<div class="preview-field">
      <span class="preview-field__label">${esc(label)}</span>
      <ul class="preview-list">${listItems}</ul>
    </div>`;
  }

  function slideSection(number, title, contentHtml, slideKey) {
    const state = CaseStudyState.getExtracted(slideKey);
    const copyText = buildPlainText(slideKey);
    return `<section class="preview-slide" id="preview-${slideKey}">
      <div class="preview-slide__header">
        <div class="preview-slide__title">
          <span class="preview-slide__number">Slide ${number}</span>
          <span class="preview-slide__name">${esc(title)}</span>
        </div>
        <button class="btn-copy-slide" data-slide="${slideKey}" title="Copy this slide's content">
          📋 Copy
        </button>
      </div>
      <div class="preview-slide__body">
        ${contentHtml}
      </div>
    </section>`;
  }

  // ── Slide renderers ──────────────────────────────────────────

  function renderSlide1() {
    const d = CaseStudyState.getExtracted('slide1') || {};
    const content = [
      field('Presenter Name', d.presenterName),
      field('Presenter Title', d.presenterTitle),
      field('Project / System Name', d.projectName),
      field('Subtitle', d.subtitle),
      field('Goal 1 — Heading', d.goal1Heading),
      field('Goal 1 — Description', d.goal1Description),
      field('Goal 2 — Heading', d.goal2Heading),
      field('Goal 2 — Description', d.goal2Description),
      field('Goal 3 — Heading', d.goal3Heading),
      field('Goal 3 — Description', d.goal3Description),
      field('Objective Statement', d.objectiveStatement),
      field('Closing Quote', d.closingQuote),
    ].join('');
    return slideSection(1, 'Cover / Title Slide', content, 'slide1');
  }

  function renderSlide2() {
    const d = CaseStudyState.getExtracted('slide2') || {};
    const stats = d.stats || [];
    let content;
    if (stats.length === 0) {
      content = field('Statistics', null);
    } else {
      const rows = stats.map(function (s, i) {
        const notFound = isNotFound(s.number) || isNotFound(s.label);
        return `<tr class="${notFound ? 'not-found' : ''}">
          <td class="stat-number">${esc(s.number)}</td>
          <td class="stat-label">${esc(s.label)}</td>
        </tr>`;
      }).join('');
      content = `<div class="preview-field">
        <span class="preview-field__label">Statistics (ordered largest → smallest)</span>
        <table class="preview-stats-table">
          <thead><tr><th>Number</th><th>Label</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }
    return slideSection(2, 'Project Snapshot', content, 'slide2');
  }

  function renderSlide3() {
    const d = CaseStudyState.getExtracted('slide3') || {};
    const content = [
      field('Project Team Name', d.projectTeamName),
      listField('Project Team Roles', d.projectTeamRoles),
      listField('SMEs (Expert Input)', d.smes),
      listField('External Stakeholders', d.externalStakeholders),
    ].join('');
    return slideSection(3, 'Who Was Involved', content, 'slide3');
  }

  function renderSlide4() {
    const d = CaseStudyState.getExtracted('slide4') || {};
    const content = [
      field('Context Paragraph', d.contextParagraph),
      listField('Challenges (8–10)', d.challenges),
    ].join('');
    return slideSection(4, 'What We Discovered (Challenges)', content, 'slide4');
  }

  function renderSlide5() {
    const d = CaseStudyState.getExtracted('slide5') || {};
    const callouts = d.activityCallouts || [];
    let calloutsHtml;
    if (callouts.length === 0) {
      calloutsHtml = field('Activity Callouts', null);
    } else {
      calloutsHtml = callouts.map(function (c, i) {
        return `<div class="preview-callout">
          <div class="preview-callout__stat">${esc(c.stat)}</div>
          <div class="preview-callout__label">${esc(c.label)}</div>
          <div class="preview-callout__desc">${esc(c.description)}</div>
        </div>`;
      }).join('');
      calloutsHtml = `<div class="preview-field">
        <span class="preview-field__label">Activity Callouts</span>
        <div class="preview-callouts">${calloutsHtml}</div>
      </div>`;
    }
    const content = [
      field('Approach Description', d.approachDescription),
      calloutsHtml,
    ].join('');
    return slideSection(5, 'What We Did (Methods & Approach)', content, 'slide5');
  }

  function renderSlide6() {
    const d = CaseStudyState.getExtracted('slide6') || {};
    const content = [
      field('Findings Summary', d.findingsSummary),
      listField('Key Findings (7–9)', d.keyFindings),
    ].join('');
    return slideSection(6, 'What Were the Findings', content, 'slide6');
  }

  function renderSlide7() {
    const d = CaseStudyState.getExtracted('slide7') || {};
    const content = [
      field('Artifact Type', d.artifactType),
      field('Opportunities Summary', d.opportunitiesSummary),
      listField('Opportunity Statements (8–10)', d.opportunityStatements),
    ].join('');
    return slideSection(7, 'High-Level Opportunity Areas', content, 'slide7');
  }

  function renderSlide8() {
    const d = CaseStudyState.getExtracted('slide8') || {};
    const content = [
      field('Artifact Type', d.artifactType),
      listField('Key Recommendations (3–4)', d.keyRecommendations),
      field('Outcome Statement', d.outcomeStatement),
      listField('Deliverables (5–7)', d.deliverables),
    ].join('');
    return slideSection(8, 'Recommendations & Project Outcome', content, 'slide8');
  }

  function renderSlide12() {
    const d = CaseStudyState.getExtracted('slide12') || {};
    const benefits = d.benefits || [];
    let benefitsHtml;
    if (benefits.length === 0) {
      benefitsHtml = field('Benefits', null);
    } else {
      benefitsHtml = benefits.map(function (b) {
        return `<div class="preview-benefit">
          <strong>${esc(b.heading)}</strong>
          <p>${esc(b.description)}</p>
        </div>`;
      }).join('');
      benefitsHtml = `<div class="preview-field">
        <span class="preview-field__label">Benefits (3)</span>
        <div class="preview-benefits">${benefitsHtml}</div>
      </div>`;
    }
    const content = [
      field('Section Heading', d.sectionHeading),
      benefitsHtml,
    ].join('');
    return slideSection(12, 'Benefits', content, 'slide12');
  }

  function renderSlide13() {
    const d = CaseStudyState.getExtracted('slide13') || {};
    const content = [
      field('Call to Action', d.callToAction),
      field('Email Address', d.email),
      field('Physical Address', d.physicalAddress),
      field('Additional Contact', d.additionalContact),
    ].join('');
    return slideSection(13, 'Contact', content, 'slide13');
  }

  // ── Plain text builder for clipboard copy ───────────────────

  function buildPlainText(slideKey) {
    const d = CaseStudyState.getExtracted(slideKey);
    if (!d) return '';

    function line(label, val) {
      if (val === null || val === undefined) return label + ': [NOT FOUND]\n';
      return label + ': ' + val + '\n';
    }
    function lines(label, arr) {
      if (!arr || arr.length === 0) return label + ': [NOT FOUND]\n';
      return label + ':\n' + arr.map(function (i) { return '  • ' + i; }).join('\n') + '\n';
    }

    switch (slideKey) {
      case 'slide1':
        return [
          'SLIDE 1 — Cover / Title Slide\n',
          line('Presenter Name', d.presenterName),
          line('Presenter Title', d.presenterTitle),
          line('Project / System Name', d.projectName),
          line('Subtitle', d.subtitle),
          line('Goal 1 Heading', d.goal1Heading),
          line('Goal 1 Description', d.goal1Description),
          line('Goal 2 Heading', d.goal2Heading),
          line('Goal 2 Description', d.goal2Description),
          line('Goal 3 Heading', d.goal3Heading),
          line('Goal 3 Description', d.goal3Description),
          line('Objective Statement', d.objectiveStatement),
          line('Closing Quote', d.closingQuote),
        ].join('');
      case 'slide2':
        const stats = (d.stats || []).map(function (s) { return '  ' + s.number + ' — ' + s.label; }).join('\n');
        return 'SLIDE 2 — Project Snapshot\nStatistics:\n' + stats + '\n';
      case 'slide3':
        return [
          'SLIDE 3 — Who Was Involved\n',
          line('Project Team Name', d.projectTeamName),
          lines('Project Team Roles', d.projectTeamRoles),
          lines('SMEs', d.smes),
          lines('External Stakeholders', d.externalStakeholders),
        ].join('');
      case 'slide4':
        return [
          'SLIDE 4 — What We Discovered (Challenges)\n',
          line('Context Paragraph', d.contextParagraph),
          lines('Challenges', d.challenges),
        ].join('');
      case 'slide5':
        const callouts = (d.activityCallouts || []).map(function (c) {
          return '  ' + c.stat + ' ' + c.label + ' — ' + c.description;
        }).join('\n');
        return [
          'SLIDE 5 — What We Did (Methods & Approach)\n',
          line('Approach Description', d.approachDescription),
          'Activity Callouts:\n' + callouts + '\n',
        ].join('');
      case 'slide6':
        return [
          'SLIDE 6 — What Were the Findings\n',
          line('Findings Summary', d.findingsSummary),
          lines('Key Findings', d.keyFindings),
        ].join('');
      case 'slide7':
        return [
          'SLIDE 7 — High-Level Opportunity Areas\n',
          line('Artifact Type', d.artifactType),
          line('Opportunities Summary', d.opportunitiesSummary),
          lines('Opportunity Statements', d.opportunityStatements),
        ].join('');
      case 'slide8':
        return [
          'SLIDE 8 — Recommendations & Project Outcome\n',
          line('Artifact Type', d.artifactType),
          lines('Key Recommendations', d.keyRecommendations),
          line('Outcome Statement', d.outcomeStatement),
          lines('Deliverables', d.deliverables),
        ].join('');
      case 'slide12':
        const benefits = (d.benefits || []).map(function (b) {
          return '  ' + b.heading + ': ' + b.description;
        }).join('\n');
        return 'SLIDE 12 — Benefits\nSection Heading: ' + (d.sectionHeading || '[NOT FOUND]') + '\nBenefits:\n' + benefits + '\n';
      case 'slide13':
        return [
          'SLIDE 13 — Contact\n',
          line('Call to Action', d.callToAction),
          line('Email', d.email),
          line('Physical Address', d.physicalAddress),
          line('Additional Contact', d.additionalContact),
        ].join('');
      default:
        return '';
    }
  }

  function buildAllPlainText() {
    const slideKeys = ['slide1','slide2','slide3','slide4','slide5','slide6','slide7','slide8','slide12','slide13'];
    const header = [
      'SDC CASE STUDY — EXTRACTED CONTENT',
      'Generated by SDC Case Study Generator',
      'Source: ' + (CaseStudyState.get().filename || 'Unknown file'),
      'Date: ' + new Date().toLocaleDateString('en-AU'),
      '',
      'NOTE: Slides 9–11 (About the SDC Team, Ways of Working, Vision) are not included.',
      'Fill these from your own template.',
      '',
      '═'.repeat(60),
      ''
    ].join('\n');
    return header + slideKeys.map(buildPlainText).join('\n' + '─'.repeat(60) + '\n\n');
  }

  // ── Main render ──────────────────────────────────────────────

  function render() {
    const skippedNotice = `<div class="preview-skipped-notice">
      <span class="preview-skipped-notice__icon">ℹ️</span>
      <div>
        <strong>Slides 9–11 not included</strong>
        <p>Slides 9 (About the SDC Team), 10 (Our Ways of Working) and 11 (Our Vision) contain standard SDC boilerplate. Fill these from your own template.</p>
      </div>
    </div>`;

    const slides = [
      renderSlide1(),
      renderSlide2(),
      renderSlide3(),
      renderSlide4(),
      renderSlide5(),
      renderSlide6(),
      renderSlide7(),
      renderSlide8(),
      skippedNotice,
      renderSlide12(),
      renderSlide13(),
    ].join('\n');

    return slides;
  }

  return {
    render,
    buildAllPlainText,
    buildPlainText
  };

})();
