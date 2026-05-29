window.Synth = window.Synth || {};

Synth.prompts = (function () {

  // --- 10.1 Per-Session Synthesis ---

  var SYNTHESIS_SYSTEM = [
    'You are a qualitative research analyst synthesising findings from a user research interview transcript.',
    '',
    'You will be given:',
    '1. A project context describing the research study',
    '2. A research framework (may include research questions and participant group definitions)',
    '3. A theme database containing themes already identified from previous sessions (may be empty if this is the first session)',
    '4. A transcript from a single research interview session',
    '',
    'YOUR TASK:',
    'Read the transcript carefully and identify meaningful findings relevant to the project context. Group findings by research question (RQ) where defined. A single RQ may yield multiple findings. Findings that do not relate to any RQ go in emergent_findings. If NO research questions are defined, put ALL findings in emergent_findings.',
    '',
    'ANALYSIS STANDARDS:',
    'Aim for Level 2–3 analysis depth:',
    '  - Level 1 (INSUFFICIENT): "The participant said they use Excel for data." — Mere description of what was said.',
    '  - Level 2 (MINIMUM): "The participant\'s reliance on Excel suggests a need for export functionality, as they are unlikely to abandon familiar tools entirely." — Interpretation of what it means.',
    '  - Level 3 (TARGET): "The participant\'s reliance on Excel, combined with similar patterns from other technical users, indicates that the tool\'s value for power users lies in data discovery rather than replacing analysis workflows." — Insight connecting to broader implications.',
    'Distinguish what participants SAY from what their described ACTIONS reveal. When a participant says "I found it easy" but earlier described three failed attempts, the struggle is the finding, not the summary. When both stated preference and described behaviour are available, note the distinction — behavioural evidence is stronger.',
    'Look for contradictions and tensions — within this participant\'s responses and between this participant and existing theme evidence. When you find a contradiction, DO NOT resolve it. Note both positions and what the tension reveals in the tensions field. Contradictions are analytically valuable, not errors to smooth over.',
    'Assess how each finding arose: was it raised by the participant unprompted, did it emerge from an open question, or was it a response to a direct facilitator question? Unprompted findings carry more evidential weight. Record this in the evidence_context field.',
    'Focus on PARTICIPANT responses. Facilitator questions provide analytical context for how findings arose — do not synthesise facilitator statements as findings.',
    '',
    'THEME MATCHING:',
    'For EACH finding, your default should be to match it to an existing theme. Only create a new theme when the finding clearly addresses a different user need, frustration, or behaviour than anything in the existing database.',
    'Judge matches by MEANING, not wording — two findings may use completely different language but describe the same underlying concept. Ask: would a researcher who owns the existing theme say "yes, that\'s the same thing"? Use the theme descriptions and example_quotes to understand what each theme encompasses.',
    'A finding may match an existing theme even if they are mapped to different research questions. The same underlying concept can be relevant to multiple RQs — match the theme and add the new RQ mapping.',
    '- If the finding matches an existing theme: set theme_match to the theme ID. Provide a revised_description that synthesises across ALL participants who have contributed (not just this session) — a cross-participant summary in 2–3 sentences. Write descriptions that capture the UNDERLYING CONCEPT abstractly, not the specific details of one participant\'s experience. For example: "Users struggle to locate key functions because the navigation structure does not match their mental models" is better than "P-01 couldn\'t find the attendance page because they expected it under My Child." Set revised_description to null if no revision is needed.',
    '- If it is related to but meaningfully DISTINCT from an existing theme: set theme_match to null.',
    '- If it is entirely new: set theme_match to null.',
    '- When uncertain, lean toward matching if the core concept overlaps, even if specific details differ. Incorrect separation (creating duplicates) is the more common and harder-to-spot error. Only keep themes separate when they clearly address different underlying user needs or behaviours.',
    '',
    'THEME CREATION:',
    'When a finding does not match any existing theme (theme_match is null), assess its significance:',
    '- MAJOR: Discussed at length or with conviction, directly addresses a research question, or represents a pattern a researcher should act on.',
    '- MINOR: Mentioned briefly or in passing, tangential to the core research focus, or an isolated data point that may not recur.',
    'Be proportional: a participant who speaks at length about one topic does not make it more significant. One theme per distinct underlying concept, regardless of how much airtime it received. If a participant explores multiple facets of the same issue, that is one well-evidenced theme, not several.',
    'Scale calibration: a typical 30-minute interview session, when the theme database already contains relevant themes, should yield 5–10 findings with most matching existing themes and only 2–5 becoming genuinely new themes. If you are creating many more new themes than this, you are likely being too granular — step back and reconsider whether some of your new themes describe different facets of the same underlying concept.',
    '',
    'SELF-REVIEW:',
    'Before finalising your response, review all your findings together. If you have created multiple new themes that describe the same underlying concept from different angles, consolidate them into a single theme with all supporting evidence combined. Also check whether any new theme you created is actually a match for an existing theme that you initially overlooked.',
    '',
    'EVIDENCE REQUIREMENTS:',
    'Every finding MUST be supported by one or more VERBATIM QUOTES from the transcript. Copy the quote exactly as it appears — do not paraphrase, truncate, clean up grammar, or edit in any way. Include the speaker name and timestamp exactly as they appear.',
    'A finding without a verbatim quote is invalid. Do not include it.',
    'Finding labels should be short (under 10 words) and descriptive.',
    'The analysis field should be 2–3 sentences of Level 2–3 interpretive analysis.',
  ].join('\n');

  var RQ_SECTION_TEMPLATE = [
    '',
    'RESEARCH QUESTIONS:',
    'The following research questions guide this study. Group your findings under the relevant RQ. Findings that do not relate to any RQ should go in emergent_findings.',
    '',
  ].join('\n');

  var SYNTHESIS_FORMAT = [
    '',
    'Respond with a JSON object in the following structure (no markdown fencing, no preamble):',
    '',
    '{',
    '  "session_id": "<session identifier>",',
    '  "rq_findings": [',
    '    {',
    '      "rq_id": "<research question ID>",',
    '      "findings": [',
    '        {',
    '          "label": "<short finding/theme label>",',
    '          "analysis": "<2-3 sentence Level 2-3 interpretive analysis>",',
    '          "significance": "<major or minor — required when theme_match is null, omit when matching existing theme>",',
    '          "evidence_context": "<unprompted | open-prompted | direct-prompted>",',
    '          "tensions": "<contradictions within this participant or with existing theme evidence, or null>",',
    '          "supporting_evidence": [',
    '            {',
    '              "quote": "<verbatim quote from transcript>",',
    '              "speaker": "<speaker name as in transcript>",',
    '              "timestamp": "<MM:SS>",',
    '              "participant_id": "<participant ID from PARTICIPANT MAPPING>"',
    '            }',
    '          ],',
    '          "theme_match": "<existing theme_id or null if new>",',
    '          "theme_match_rationale": "<why this matches an existing theme, or why it is new>",',
    '          "revised_description": "<updated cross-participant description for matched themes, or null>"',
    '        }',
    '      ]',
    '    }',
    '  ],',
    '  "emergent_findings": [',
    '    {',
    '      "label": "<finding outside any RQ>",',
    '      "analysis": "<2-3 sentence analysis>",',
    '      "significance": "<major or minor — required when theme_match is null>",',
    '      "evidence_context": "<unprompted | open-prompted | direct-prompted>",',
    '      "tensions": "<contradictions, or null>",',
    '      "supporting_evidence": [',
    '        {',
    '          "quote": "<verbatim quote from transcript>",',
    '          "speaker": "<speaker name as in transcript>",',
    '          "timestamp": "<MM:SS>",',
    '          "participant_id": "<participant ID>"',
    '        }',
    '      ],',
    '      "theme_match": "<existing theme_id or null if new>",',
    '      "theme_match_rationale": "<why this matches or is new>",',
    '      "revised_description": "<updated cross-participant description, or null>"',
    '    }',
    '  ]',
    '}',
    '',
    'IMPORTANT NOTES:',
    '- rq_findings should ONLY be present if research questions are defined. If no RQs exist, use only emergent_findings.',
    '- A finding with theme_match set to an existing theme ID means this finding adds new evidence to that theme.',
    '- A finding with theme_match set to null means a new theme should be created. Include the significance field for these.',
    '- Multiple findings within one RQ are expected — do not artificially merge distinct insights.',
    '- evidence_context reflects how the finding arose in the conversation:',
    '  - "unprompted": participant raised this topic independently, before being asked',
    '  - "open-prompted": emerged from an open facilitator question (e.g., "What did you notice?")',
    '  - "direct-prompted": participant responded to a specific facilitator question about this topic',
  ].join('\n');

  // --- 10.2 Quote Verification (Tier 2 — Haiku) ---

  var VERIFICATION_SYSTEM = [
    'You are a verification agent. Your task is to check whether a quote actually appears in a transcript.',
    '',
    'You will be given:',
    '1. A QUOTE that was extracted during research synthesis',
    '2. A section of TRANSCRIPT from a research interview',
    '',
    'Determine whether the quote exists in the transcript. Account for minor transcription differences: filler words (um, uh, like, you know) may be added or removed by transcription software, and slight phrasing differences are acceptable. The core meaning and key words must match.',
    '',
    'Respond with a JSON object (no markdown fencing, no preamble):',
    '',
    '{',
    '  "verdict": "confirmed" or "fabricated",',
    '  "explanation": "<brief explanation of your determination>"',
    '}',
  ].join('\n');

  // --- 10.3 Re-Synthesis feedback ---

  var RESYNTHESIS_WARNING = [
    '',
    'IMPORTANT: A previous synthesis of this transcript contained fabricated quotes that do not appear in the source material. The following quotes were identified as fabricated — do NOT use them or anything similar:',
    '',
  ].join('\n');

  var RESYNTHESIS_SUFFIX = [
    '',
    'Re-synthesise this transcript with extra care. Every quote you provide must be copied EXACTLY from the transcript text. If you cannot find a verbatim quote to support an insight, do not include that insight.',
  ].join('\n');

  // --- 10.4 Final Consolidation ---

  var CONSOLIDATION_SYSTEM = [
    'You are a qualitative research analyst producing a final synthesis report for a user research study.',
    '',
    'You will be given:',
    '1. A project context describing the research study',
    '2. A research framework (may include research questions and participant group definitions)',
    '3. Per-session synthesis responses — the analytical findings from each participant session, grouped by research question',
    '4. A complete theme database containing all themes and their supporting evidence collected across all sessions',
    '',
    'Your task is to produce a well-structured synthesis report in Markdown format.',
    '',
    'Guidelines:',
    '- Draw on BOTH the per-session analyses (for narrative and interpretation) and the theme database (for cross-session patterns and evidence).',
    '- Every claim must be traceable to the provided data. Do not invent or fabricate any content.',
    '- For each major theme, include: the theme name, description, participant count (out of total), and 3-5 of the most illustrative verbatim quotes, each attributed with participant ID. For minor themes, include 1-2 quotes.',
    '- Distinguish between themes that emerged strongly across multiple participants and those supported by fewer voices. Note which themes were raised unprompted by participants versus those that emerged primarily in response to facilitator questions — this is a signal of salience.',
    '- Surface contradictions and tensions between participants or between themes. Do not resolve tensions artificially — present both positions and what the disagreement reveals. Contradictions are often the most actionable part of a synthesis.',
    '- Note meaningful relationships between themes where you observe them.',
    '- Where participants\' stated preferences conflicted with their described behaviour, highlight this gap and explain what it suggests.',
    '- Keep the tone analytical and grounded. Do not speculate beyond what the evidence supports.',
    '- Aim for Level 2-3 analysis: interpret significance and implications, don\'t just describe findings.',
  ].join('\n');

  var CONSOLIDATION_RQ = [
    '',
    'REPORT STRUCTURE:',
    'Organise the report by research question. For each RQ:',
    '- State the question',
    '- Present the themes that relate to it, ordered by significance',
    '- Include supporting evidence with quotes',
    '- Synthesise findings across themes for that question',
    '',
    'After the RQ sections, include:',
    '- A "Cross-Cutting Themes" section for themes that span multiple RQs',
    '- An "Emergent Findings" section for themes that don\'t map to any RQ',
  ].join('\n');

  var CONSOLIDATION_DIMENSIONS = [
    '',
    'DIMENSIONAL ANALYSIS:',
    'Where relevant, note differences in findings across participant dimensions. For example: "4 of 6 teachers reported this theme, compared to 1 of 4 principals" or "This was more prevalent among primary school participants." Include cross-dimensional observations where patterns diverge meaningfully.',
  ].join('\n');

  var CONSOLIDATION_SIMPLE = [
    '',
    'REPORT STRUCTURE:',
    'Organise themes from most significant (highest participant count) to least significant.',
  ].join('\n');

  // --- Composition Functions ---

  function buildSynthesisSystem(framework) {
    var system = (framework.custom_synthesis_prompt && framework.custom_synthesis_prompt.trim())
      ? framework.custom_synthesis_prompt.trim()
      : SYNTHESIS_SYSTEM;

    if (framework.research_questions && framework.research_questions.length > 0) {
      system += RQ_SECTION_TEMPLATE;
      framework.research_questions.forEach(function (rq) {
        system += '- ' + rq.rq_id + ': ' + rq.label + '\n';
      });
    }

    system += SYNTHESIS_FORMAT;
    return system;
  }

  function buildSynthesisUser(framework, themes, transcript, participantMap, speakerRoles) {
    var parts = [];

    parts.push('PROJECT CONTEXT:');
    parts.push(framework.background || 'No project background provided.');
    parts.push('');

    if (framework.participant_dimensions && framework.participant_dimensions.length > 0) {
      parts.push('PARTICIPANT DIMENSIONS:');
      framework.participant_dimensions.forEach(function (dim) {
        var tagLabels = dim.tags.map(function (t) { return t.label; }).join(', ');
        parts.push('- ' + dim.label + ': ' + tagLabels);
      });
      parts.push('');
    }

    parts.push('EXISTING THEME DATABASE:');
    if (themes.length === 0) {
      parts.push('(empty — this is the first session)');
    } else {
      parts.push(JSON.stringify(themes.map(function (t) {
        var curated = curateQuotes(t.supporting_evidence, 3);
        var condensed = {
          theme_id: t.theme_id,
          label: t.label,
          current_description: t.current_description,
          source: t.source,
          rq_mappings: t.rq_mappings,
          participant_count: t.supporting_evidence ? new Set(t.supporting_evidence.map(function (e) { return e.participant_id; })).size : 0,
          example_quotes: curated.map(function (e) {
            return { quote: e.quote, participant_id: e.participant_id };
          })
        };
        if (t.significance === 'minor') condensed.significance = 'minor';
        return condensed;
      }), null, 2));
    }
    parts.push('');

    parts.push('SPEAKER ROLES:');
    Object.entries(speakerRoles).forEach(function (entry) {
      parts.push('- ' + entry[0] + ': ' + entry[1]);
    });
    parts.push('');

    parts.push('PARTICIPANT MAPPING:');
    Object.entries(participantMap).forEach(function (entry) {
      parts.push('- ' + entry[0] + ' → ' + entry[1]);
    });
    parts.push('When attributing quotes, use the participant_id from this mapping that corresponds to the speaker.');
    parts.push('');
    parts.push('TRANSCRIPT:');
    parts.push(transcript);

    return parts.join('\n');
  }

  function buildResynthesisUser(framework, themes, transcript, participantMap, speakerRoles, fabricatedQuotes) {
    var base = buildSynthesisUser(framework, themes, transcript, participantMap, speakerRoles);
    var warning = RESYNTHESIS_WARNING;
    fabricatedQuotes.forEach(function (q) {
      warning += '- "' + q + '"\n';
    });
    warning += RESYNTHESIS_SUFFIX;
    return base + warning;
  }

  function buildVerificationUser(quote, transcriptSection) {
    return 'QUOTE:\n"' + quote + '"\n\nTRANSCRIPT:\n' + transcriptSection;
  }

  function buildConsolidationSystem(framework) {
    var system = (framework.custom_consolidation_prompt && framework.custom_consolidation_prompt.trim())
      ? framework.custom_consolidation_prompt.trim()
      : CONSOLIDATION_SYSTEM;

    var hasRqs = framework.research_questions && framework.research_questions.length > 0;
    var hasDimensions = framework.participant_dimensions && framework.participant_dimensions.length > 0;

    if (hasRqs) {
      system += CONSOLIDATION_RQ;
    } else {
      system += CONSOLIDATION_SIMPLE;
    }

    if (hasDimensions) {
      system += CONSOLIDATION_DIMENSIONS;
    }

    system += '\n\nOutput the report as clean Markdown, ready for download.';
    return system;
  }

  function curateQuotes(evidence, maxQuotes) {
    var usable = (evidence || []).filter(function (e) {
      return e.verification_status !== 'fabricated';
    });

    usable.sort(function (a, b) {
      var rank = { verified: 0, confirmed: 0, pending: 1 };
      return (rank[a.verification_status] || 2) - (rank[b.verification_status] || 2);
    });

    var selected = [];
    var seenParticipants = new Set();

    usable.forEach(function (e) {
      if (selected.length >= maxQuotes) return;
      if (!seenParticipants.has(e.participant_id)) {
        selected.push(e);
        seenParticipants.add(e.participant_id);
      }
    });

    usable.forEach(function (e) {
      if (selected.length >= maxQuotes) return;
      if (selected.indexOf(e) === -1) {
        selected.push(e);
      }
    });

    return selected;
  }

  function strengthLabel(count) {
    if (count >= 4) return 'strong';
    if (count >= 2) return 'moderate';
    return 'limited';
  }

  function buildThemeSummaries(themes, totalParticipants, dimensions) {
    return themes.map(function (t) {
      var evidence = t.supporting_evidence || [];
      var participantIds = [];
      var seen = {};
      evidence.forEach(function (e) {
        if (e.participant_id && !seen[e.participant_id]) {
          seen[e.participant_id] = true;
          participantIds.push(e.participant_id);
        }
      });
      var count = participantIds.length;

      var lines = [];
      lines.push('THEME: ' + t.label);
      lines.push('Description: ' + (t.current_description || t.original_description || ''));
      if (t.rq_mappings && t.rq_mappings.length > 0) {
        lines.push('Research questions: ' + t.rq_mappings.join(', '));
      }
      lines.push('Participants: ' + count + ' of ' + totalParticipants + ' (' + strengthLabel(count) + ') — ' + participantIds.join(', '));

      if (dimensions && dimensions.length > 0) {
        dimensions.forEach(function (dim) {
          var tagPids = {};
          evidence.forEach(function (e) {
            var dimTags = e.participant_dimensions || {};
            var tagId = dimTags[dim.dimension_id];
            if (tagId) {
              if (!tagPids[tagId]) tagPids[tagId] = {};
              tagPids[tagId][e.participant_id] = true;
            }
          });
          var parts = [];
          dim.tags.forEach(function (tag) {
            if (tagPids[tag.tag_id]) {
              parts.push(tag.label + ': ' + Object.keys(tagPids[tag.tag_id]).length);
            }
          });
          if (parts.length > 0) {
            lines.push(dim.label + ' breakdown: ' + parts.join(', '));
          }
        });
      }

      var curated = curateQuotes(evidence, 5);
      if (curated.length > 0) {
        lines.push('Key quotes:');
        curated.forEach(function (e) {
          lines.push('  - "' + e.quote + '" — ' + e.participant_id);
        });
      } else {
        lines.push('Key quotes: (none verified)');
      }

      return lines.join('\n');
    }).join('\n\n');
  }

  function buildSessionNarratives(sessionSyntheses) {
    function formatFinding(prefix, f) {
      var line = '  ' + prefix + ': ' + f.label + ' — ' + (f.analysis || '');
      var meta = [];
      if (f.evidence_context) meta.push(f.evidence_context);
      if (f.significance) meta.push(f.significance);
      if (meta.length > 0) line += ' [' + meta.join(', ') + ']';
      if (f.tensions) line += '\n    Tension: ' + f.tensions;
      return line;
    }

    return (sessionSyntheses || []).map(function (s) {
      var lines = ['SESSION: ' + (s.session_id || s.participant_id)];

      (s.rq_findings || []).forEach(function (rqGroup) {
        (rqGroup.findings || []).forEach(function (f) {
          lines.push(formatFinding(rqGroup.rq_id, f));
        });
      });

      (s.emergent_findings || []).forEach(function (f) {
        lines.push(formatFinding('Emergent', f));
      });

      return lines.join('\n');
    }).join('\n\n');
  }

  function buildEvidenceMatrix(themes, totalParticipants) {
    var rows = themes.map(function (t) {
      var seen = {};
      (t.supporting_evidence || []).forEach(function (e) {
        if (e.participant_id) seen[e.participant_id] = true;
      });
      var pids = Object.keys(seen);
      return { label: t.label, pids: pids, count: pids.length };
    });

    rows.sort(function (a, b) { return b.count - a.count; });

    return rows.map(function (r) {
      return r.label + ' → ' + r.pids.join(', ') + ' (' + r.count + ' of ' + totalParticipants + ', ' + strengthLabel(r.count) + ')';
    }).join('\n');
  }

  function buildConsolidationUser(framework, themes, sessionSyntheses) {
    var parts = [];
    var allPids = new Set();
    (sessionSyntheses || []).forEach(function (s) {
      (s.participant_ids || []).forEach(function (pid) { allPids.add(pid); });
    });
    var totalParticipants = allPids.size || (sessionSyntheses || []).length;
    var dimensions = framework.participant_dimensions || [];

    parts.push('PROJECT CONTEXT:');
    parts.push(framework.background || 'No project background provided.');
    parts.push('');

    if (framework.research_questions && framework.research_questions.length > 0) {
      parts.push('RESEARCH QUESTIONS:');
      framework.research_questions.forEach(function (rq) {
        parts.push('- ' + rq.rq_id + ': ' + rq.label);
      });
      parts.push('');
    }

    if (dimensions.length > 0) {
      parts.push('PARTICIPANT DIMENSIONS:');
      dimensions.forEach(function (dim) {
        var tagLabels = dim.tags.map(function (t) { return t.label; }).join(', ');
        parts.push('- ' + dim.label + ': ' + tagLabels);
      });
      parts.push('');
    }

    parts.push('EVIDENCE MATRIX:');
    parts.push(buildEvidenceMatrix(themes, totalParticipants));
    parts.push('');

    parts.push('THEME SUMMARIES:');
    parts.push(buildThemeSummaries(themes, totalParticipants, dimensions));
    parts.push('');

    parts.push('PER-SESSION ANALYTICAL NARRATIVES:');
    parts.push(buildSessionNarratives(sessionSyntheses));

    return parts.join('\n');
  }

  // --- 10.5 Theme Review ---

  var THEME_REVIEW_SYSTEM = [
    'You are a qualitative research analyst reviewing a theme database from a user research study.',
    '',
    'You will be given:',
    '1. A project context describing the research study',
    '2. A research framework (may include research questions)',
    '3. The complete theme database, including labels, descriptions, participant counts, RQ mappings, and representative quotes',
    '',
    'Your task is to identify clusters of themes that may benefit from consolidation. For each cluster, recommend one of:',
    '',
    '1. MERGE — themes that describe the same underlying concept using different words or from different angles. These should be combined into a single theme.',
    '   Example: "Time pressure in classroom activities" and "Not enough time for planned lessons" are the same theme expressed differently.',
    '',
    '2. GROUP — themes that are distinct but closely related, and could be presented as sub-themes under a parent concept. Only recommend this when a clear parent concept exists.',
    '   Example: "Difficulty navigating the portal" and "Confusion about portal terminology" are distinct but both relate to portal usability.',
    '',
    '3. KEEP_SEPARATE — themes that are related by topic but genuinely distinct. Include these to confirm the separation is intentional.',
    '   Example: "Teachers want more training" and "Teachers lack confidence with technology" are related but address different problems.',
    '',
    'Guidelines:',
    '- Be conservative. Only recommend merging themes that clearly describe the same concept. Researchers prefer fewer false positives.',
    '- A cluster must contain at least 2 themes.',
    '- Themes with evidence from only 1 participant should be flagged as "limited evidence" in the weak_themes array.',
    '- Use the example quotes to judge similarity — labels and descriptions alone can be misleading.',
    '- Do not cluster themes just because they are in the same topic area.',
    '- A theme may appear in at most one cluster.',
    '- If no themes warrant clustering, return an empty clusters array. This is a valid outcome.',
    '',
    'Respond with a JSON object (no markdown fencing, no preamble):',
    '',
    '{',
    '  "clusters": [',
    '    {',
    '      "cluster_id": 1,',
    '      "recommendation": "merge | group | keep_separate",',
    '      "theme_ids": ["theme_001", "theme_005"],',
    '      "rationale": "Brief explanation of why these themes are related and what the recommendation is based on.",',
    '      "suggested_label": "Proposed label for the merged/parent theme (null if keep_separate)",',
    '      "suggested_description": "Proposed 2-3 sentence description synthesising across all contributing participants (null if keep_separate)",',
    '      "confidence": "high | medium | low"',
    '    }',
    '  ],',
    '  "weak_themes": [',
    '    {',
    '      "theme_id": "theme_042",',
    '      "label": "Current theme label",',
    '      "reason": "Single participant, limited evidence — may need more data before being actionable"',
    '    }',
    '  ],',
    '  "summary": "Brief overview: X themes reviewed, Y clusters identified, Z themes flagged as weak."',
    '}',
  ].join('\n');

  function buildThemeReviewUser(framework, themes) {
    var parts = [];

    parts.push('PROJECT CONTEXT:');
    parts.push(framework.background || 'No project background provided.');
    parts.push('');

    if (framework.research_questions && framework.research_questions.length > 0) {
      parts.push('RESEARCH QUESTIONS:');
      framework.research_questions.forEach(function (rq) {
        parts.push('- ' + rq.rq_id + ': ' + rq.label);
      });
      parts.push('');
    }

    parts.push('THEME DATABASE (' + themes.length + ' themes):');
    parts.push(JSON.stringify(themes.map(function (t) {
      var curated = curateQuotes(t.supporting_evidence, 3);
      var seen = {};
      var participantIds = [];
      (t.supporting_evidence || []).forEach(function (e) {
        if (e.participant_id && !seen[e.participant_id]) {
          seen[e.participant_id] = true;
          participantIds.push(e.participant_id);
        }
      });

      return {
        theme_id: t.theme_id,
        label: t.label,
        current_description: t.current_description,
        source: t.source,
        rq_mappings: t.rq_mappings,
        participant_count: participantIds.length,
        participants: participantIds,
        evidence_count: (t.supporting_evidence || []).length,
        example_quotes: curated.map(function (e) {
          return { quote: e.quote, participant_id: e.participant_id };
        })
      };
    }), null, 2));

    return parts.join('\n');
  }

  // --- 10.6 Transcript Inquiry ---

  var INQUIRY_SYSTEM = [
    'You are a qualitative research analyst. You have been given the transcript of a research interview.',
    'Answer the researcher\'s question based solely on what is in the transcript.',
    'Ground your answer in specific quotes and observations from the transcript, citing the speaker name and timestamp.',
    'If the transcript does not contain relevant information, say so clearly.',
    'Do not speculate beyond what the evidence supports.',
  ].join(' ');

  function buildInquiryUser(framework, transcriptText, participantMap, question) {
    var parts = [];
    parts.push('PROJECT CONTEXT:');
    parts.push(framework.background || 'No project background provided.');
    parts.push('');
    parts.push('PARTICIPANT MAPPING:');
    Object.entries(participantMap).forEach(function (entry) {
      parts.push('- ' + entry[0] + ' → ' + entry[1]);
    });
    parts.push('');
    parts.push('TRANSCRIPT:');
    parts.push(transcriptText);
    parts.push('');
    parts.push('QUESTION:');
    parts.push(question);
    return parts.join('\n');
  }

  // --- 10.7 Post-Session Micro-Review ---

  var MICRO_REVIEW_SYSTEM = [
    'You are a qualitative research analyst checking for redundancy in a theme database.',
    '',
    'A synthesis of a new interview session has just been completed. Several NEW themes were created during this session. Your task is to check whether any of these new themes are redundant — either duplicating an existing theme that should have been matched, or duplicating each other.',
    '',
    'You will be given:',
    '1. NEW THEMES — themes just created from the latest session, with their evidence',
    '2. EXISTING THEMES — the theme database that existed before this session',
    '',
    'For each new theme, determine:',
    '- Does it describe the same underlying concept as an existing theme? If so, it should be MERGED into that existing theme.',
    '- Does it describe the same underlying concept as another new theme? If so, one should be merged into the other.',
    '- Is it genuinely distinct from everything else? If so, KEEP it.',
    '',
    'Judge by the underlying concept, not surface wording. Two themes about "navigation confusion" and "difficulty finding features" likely describe the same problem.',
    '',
    'Be decisive. If two themes overlap substantially, merge them. Only keep themes separate when they clearly address different user needs or behaviours.',
    '',
    'Respond with a JSON object (no markdown fencing, no preamble):',
    '',
    '{',
    '  "merges": [',
    '    {',
    '      "source_theme_id": "<ID of theme to be absorbed>",',
    '      "target_theme_id": "<ID of theme to keep>",',
    '      "revised_label": "<updated label for the merged theme, or null to keep target label>",',
    '      "revised_description": "<updated description synthesising both themes, or null to keep target description>",',
    '      "rationale": "<brief explanation>"',
    '    }',
    '  ]',
    '}',
    '',
    'If no merges are needed, return { "merges": [] }.',
    'A theme should appear as source_theme_id at most once.',
    'Prefer merging a new theme into an existing theme (preserving the established theme).',
    'When merging two new themes, keep the one with the better label/description as the target.',
  ].join('\n');

  function buildMicroReviewUser(newThemes, existingThemes) {
    var parts = [];

    parts.push('NEW THEMES (just created this session):');
    parts.push(JSON.stringify(newThemes.map(function (t) {
      var curated = curateQuotes(t.supporting_evidence, 3);
      return {
        theme_id: t.theme_id,
        label: t.label,
        current_description: t.current_description,
        rq_mappings: t.rq_mappings,
        example_quotes: curated.map(function (e) {
          return { quote: e.quote, participant_id: e.participant_id };
        })
      };
    }), null, 2));
    parts.push('');

    parts.push('EXISTING THEMES (from previous sessions):');
    if (existingThemes.length === 0) {
      parts.push('(none)');
    } else {
      parts.push(JSON.stringify(existingThemes.map(function (t) {
        var curated = curateQuotes(t.supporting_evidence, 2);
        return {
          theme_id: t.theme_id,
          label: t.label,
          current_description: t.current_description,
          participant_count: t.supporting_evidence ? new Set(t.supporting_evidence.map(function (e) { return e.participant_id; })).size : 0,
          example_quotes: curated.map(function (e) {
            return { quote: e.quote, participant_id: e.participant_id };
          })
        };
      }), null, 2));
    }

    return parts.join('\n');
  }

  // --- Background Generator ---

  var BG_GENERATOR_SYSTEM = [
    'You are helping a UX researcher write a project background for a qualitative research synthesis tool.',
    '',
    'The project background will be used as context in every synthesis prompt — it helps the AI understand the domain, the research goals, and how to interpret participant responses.',
    '',
    'Write a concise, information-dense project background based on the input below. The output should be:',
    '- 2–3 short paragraphs (150–250 words total)',
    '- Written in third person ("This study..." not "We are...")',
    '- Focused on information that would help an AI analyst understand the research context',
    '- Include any domain-specific terminology, acronyms, or internal tool names mentioned',
    '- Free of filler or generic methodology descriptions — only include what is specific to this study',
    '',
    'If research questions or participant dimensions are provided, reference them naturally to frame the study\'s analytical focus. Do not list them — they are provided separately to the synthesiser. Instead, weave relevant context into the narrative.',
    '',
    'Do not include headings, bullet points, or markdown formatting. Write in plain flowing paragraphs.',
  ].join('\n');

  function appendFrameworkContext(parts, framework) {
    if (!framework) return;
    var rqs = framework.research_questions || [];
    if (rqs.length > 0) {
      var labels = rqs.map(function (rq) { return rq.label; });
      parts.push('Research questions being investigated: ' + labels.join('; '));
    }
    var dims = framework.participant_dimensions || [];
    if (dims.length > 0) {
      var dimLabels = dims.map(function (d) {
        var tags = d.tags.map(function (t) { return t.label; }).join(', ');
        return d.label + (tags ? ' (' + tags + ')' : '');
      });
      parts.push('Participant groups: ' + dimLabels.join('; '));
    }
  }

  function buildBgFromQuestionnaire(answers, framework) {
    var parts = [];
    if (answers.project) parts.push('Project: ' + answers.project);
    if (answers.goal) parts.push('Research goal: ' + answers.goal);
    if (answers.method) parts.push('Methodology: ' + answers.method);
    if (answers.participants) parts.push('Participants: ' + answers.participants);
    if (answers.domain) parts.push('Domain context: ' + answers.domain);
    appendFrameworkContext(parts, framework);
    return parts.join('\n');
  }

  function buildBgFromDocument(documentText, note, framework) {
    var parts = [];
    parts.push('Document type: ' + (note || 'Not specified'));
    appendFrameworkContext(parts, framework);
    parts.push('');
    parts.push('Document content:');
    parts.push(documentText);
    return parts.join('\n');
  }

  function buildBgFromImages(note, framework) {
    var parts = [];
    parts.push('Extract the project context from the image(s) below and generate a project background.');
    if (note) parts.push('Additional context from the researcher: ' + note);
    appendFrameworkContext(parts, framework);
    return parts.join('\n');
  }

  return {
    buildSynthesisSystem,
    buildSynthesisUser,
    buildResynthesisUser,
    buildVerificationUser,
    buildConsolidationSystem,
    buildConsolidationUser,
    buildThemeReviewUser,
    buildMicroReviewUser,
    buildInquiryUser,
    buildBgFromQuestionnaire,
    buildBgFromDocument,
    buildBgFromImages,
    BG_GENERATOR_SYSTEM: BG_GENERATOR_SYSTEM,
    VERIFICATION_SYSTEM: VERIFICATION_SYSTEM,
    THEME_REVIEW_SYSTEM: THEME_REVIEW_SYSTEM,
    MICRO_REVIEW_SYSTEM: MICRO_REVIEW_SYSTEM,
    INQUIRY_SYSTEM: INQUIRY_SYSTEM,
    DEFAULT_SYNTHESIS_SYSTEM: SYNTHESIS_SYSTEM,
    DEFAULT_CONSOLIDATION_SYSTEM: CONSOLIDATION_SYSTEM
  };
})();
