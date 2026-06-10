// ============================================================
// PIPELINE — Three-stage agentic workflow orchestration
// Stage 1: Global Innovation Scanner
// Stage 2: Ideation & Unpacking Engine (with chunking)
// Stage 3: Source Validation Agent (optional, on-demand)
// ============================================================

const STAGE2_BATCH_SIZE = 3;       // Max opportunities per Stage 2 call
const INTER_STAGE_DELAY_MS = 2000; // Delay between stages to avoid rate limiting
const STAGE1_TIMEOUT_MS = 480000;  // 8 minutes for Stage 1
const STAGE2_TIMEOUT_MS = 480000;  // 8 minutes per Stage 2 batch
const STAGE3_TIMEOUT_MS = 120000;  // 2 minutes for validation (lightweight)

/**
 * Parse JSON from LLM response, handling markdown fencing and preamble.
 * @param {string} raw - Raw LLM response text
 * @returns {Object} Parsed JSON object
 */
function parseJsonResponse(raw) {
  let text = raw.trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try to find JSON object boundaries if there's preamble
  if (!text.startsWith('{')) {
    const firstBrace = text.indexOf('{');
    if (firstBrace >= 0) {
      text = text.substring(firstBrace);
    }
  }

  // Trim trailing content after the last closing brace
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace >= 0 && lastBrace < text.length - 1) {
    text = text.substring(0, lastBrace + 1);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Failed to parse JSON from AI response: ' + e.message + '\n\nRaw response (first 500 chars):\n' + raw.substring(0, 500));
  }
}

/**
 * Validate Stage 1 output has the expected structure.
 */
function validateStage1(data) {
  const errors = [];
  if (typeof data.scan_summary !== 'string') errors.push('Missing scan_summary');
  if (!Array.isArray(data.best_practices)) errors.push('Missing best_practices array');
  if (!Array.isArray(data.analogous_solutions)) errors.push('Missing analogous_solutions array');
  if (!Array.isArray(data.design_trends)) errors.push('Missing design_trends array');
  if (!Array.isArray(data.inspiration_sources)) errors.push('Missing inspiration_sources array');

  if (errors.length > 0) {
    throw new Error('Stage 1 output validation failed:\n- ' + errors.join('\n- '));
  }
  return true;
}

/**
 * Validate Stage 2 output has the expected structure.
 */
function validateStage2(data) {
  const errors = [];
  if (typeof data.solution_overview !== 'string') errors.push('Missing solution_overview');
  if (!Array.isArray(data.solution_concepts)) errors.push('Missing solution_concepts array');
  // These are optional for batched results — may be empty in individual batches
  if (!Array.isArray(data.cross_cutting_themes)) data.cross_cutting_themes = [];
  if (!Array.isArray(data.risks_and_considerations)) data.risks_and_considerations = [];

  // Validate nested features
  if (Array.isArray(data.solution_concepts)) {
    data.solution_concepts.forEach((concept, i) => {
      if (!concept.concept_name) errors.push('Concept ' + (i + 1) + ': missing concept_name');
      if (!Array.isArray(concept.features)) errors.push('Concept ' + (i + 1) + ': missing features array');
    });
  }

  if (errors.length > 0) {
    throw new Error('Stage 2 output validation failed:\n- ' + errors.join('\n- '));
  }
  return true;
}

/**
 * Merge multiple Stage 2 batch results into a single result.
 */
function mergeStage2Results(batchResults) {
  if (batchResults.length === 1) return batchResults[0];

  const merged = {
    solution_overview: batchResults.map(r => r.solution_overview).filter(Boolean).join(' '),
    solution_concepts: [],
    cross_cutting_themes: [],
    risks_and_considerations: [],
  };

  // Collect all concepts
  batchResults.forEach(r => {
    if (r.solution_concepts) merged.solution_concepts.push(...r.solution_concepts);
  });

  // Deduplicate themes by name
  const seenThemes = new Set();
  batchResults.forEach(r => {
    (r.cross_cutting_themes || []).forEach(t => {
      if (!seenThemes.has(t.theme)) {
        seenThemes.add(t.theme);
        merged.cross_cutting_themes.push(t);
      }
    });
  });

  // Deduplicate risks by description
  const seenRisks = new Set();
  batchResults.forEach(r => {
    (r.risks_and_considerations || []).forEach(risk => {
      if (!seenRisks.has(risk.risk)) {
        seenRisks.add(risk.risk);
        merged.risks_and_considerations.push(risk);
      }
    });
  });

  return merged;
}

/**
 * Format elapsed time.
 */
function elapsed(startTime) {
  const secs = Math.round((Date.now() - startTime) / 1000);
  if (secs < 60) return secs + 's';
  return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
}

/**
 * Estimate total input size and warn if too large.
 */
function estimateInputSize(context, opportunities) {
  const totalChars = (context || '').length + (opportunities || '').length;
  const estTokens = Math.ceil(totalChars / 4);
  return { chars: totalChars, tokens: estTokens };
}

/**
 * Run the full two-stage ideation pipeline.
 *
 * @param {string} context - Project context text
 * @param {string} opportunities - High-level opportunities text
 * @param {string} scanFocus - Scan focus value from dropdown
 * @param {string} otherFocusText - Custom focus text when scanFocus is 'other'
 * @param {function} onStatus - Callback: onStatus(message, type) where type is 'step'|'update'|'done'|'error'
 * @returns {Object} { stage1, stage2, elapsed, model, usage }
 */
async function runPipeline(context, opportunities, scanFocus, otherFocusText, onStatus) {
  const startTime = Date.now();
  const model = getModel();

  // ── INPUT SIZE CHECK ──
  const inputSize = estimateInputSize(context, opportunities);
  onStatus('Input: ~' + inputSize.tokens.toLocaleString() + ' tokens (' + inputSize.chars.toLocaleString() + ' chars)', 'update');

  if (inputSize.tokens > 30000) {
    onStatus('⚠ Very large input (' + inputSize.tokens.toLocaleString() + ' tokens). Consider reducing the project context or opportunities to avoid timeouts.', 'error');
  } else if (inputSize.tokens > 15000) {
    onStatus('⚠ Large input — processing may take several minutes.', 'update');
  }

  // ── STAGE 1: Global Innovation Scanner ──
  onStatus('Stage 1: Running Global Innovation Scan with ' + model + '…', 'step');

  let stage1Raw;
  try {
    stage1Raw = await chatCompletion(
      [
        { role: 'system', content: STAGE1_SYSTEM_PROMPT },
        { role: 'user',   content: buildStage1UserPrompt(context, opportunities, scanFocus, otherFocusText) }
      ],
      { temperature: 0.3, max_tokens: 8000, timeoutMs: STAGE1_TIMEOUT_MS }
    );
  } catch (e) {
    onStatus('Stage 1 failed: ' + e.message, 'error');
    throw e;
  }

  onStatus('Stage 1: Parsing response… (' + elapsed(startTime) + ')', 'update');

  let stage1;
  try {
    stage1 = parseJsonResponse(stage1Raw.content);
    validateStage1(stage1);
  } catch (e) {
    onStatus('Stage 1 output invalid: ' + e.message, 'error');
    throw e;
  }

  const s1Counts = [
    stage1.best_practices.length + ' best practices',
    stage1.analogous_solutions.length + ' analogous solutions',
    stage1.design_trends.length + ' design trends',
    stage1.inspiration_sources.length + ' inspiration sources',
  ].join(', ');

  onStatus('Stage 1 complete: ' + s1Counts + ' (' + elapsed(startTime) + ')', 'done');

  // ── INTER-STAGE DELAY ──
  onStatus('Preparing Stage 2… (brief pause to avoid rate limiting)', 'update');
  await sleep(INTER_STAGE_DELAY_MS);

  // ── STAGE 2: Ideation & Unpacking Engine (with chunking) ──
  const batches = splitOpportunities(opportunities, STAGE2_BATCH_SIZE);
  const totalBatches = batches.length;
  const batchResults = [];
  let totalStage2Usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  for (let bi = 0; bi < totalBatches; bi++) {
    const batchLabel = totalBatches > 1 ? 'batch ' + (bi + 1) + '/' + totalBatches : '';
    const batchOpps = batches[bi];

    onStatus('Stage 2' + (batchLabel ? ' (' + batchLabel + ')' : '') + ': Unpacking opportunities with ' + model + '…', 'step');

    let stage2Raw;
    try {
      stage2Raw = await chatCompletion(
        [
          { role: 'system', content: STAGE2_SYSTEM_PROMPT },
          { role: 'user',   content: buildStage2UserPrompt(context, batchOpps, stage1, batchLabel) }
        ],
        { temperature: 0.3, max_tokens: 8000, timeoutMs: STAGE2_TIMEOUT_MS }
      );
    } catch (e) {
      onStatus('Stage 2' + (batchLabel ? ' (' + batchLabel + ')' : '') + ' failed: ' + e.message, 'error');
      throw e;
    }

    onStatus('Stage 2' + (batchLabel ? ' (' + batchLabel + ')' : '') + ': Parsing response… (' + elapsed(startTime) + ')', 'update');

    let stage2Batch;
    try {
      stage2Batch = parseJsonResponse(stage2Raw.content);
      validateStage2(stage2Batch);
    } catch (e) {
      onStatus('Stage 2 output invalid' + (batchLabel ? ' (' + batchLabel + ')' : '') + ': ' + e.message, 'error');
      throw e;
    }

    batchResults.push(stage2Batch);

    // Accumulate usage
    totalStage2Usage.prompt_tokens += (stage2Raw.usage.prompt_tokens || 0);
    totalStage2Usage.completion_tokens += (stage2Raw.usage.completion_tokens || 0);
    totalStage2Usage.total_tokens += (stage2Raw.usage.total_tokens || 0);

    const batchFeatures = stage2Batch.solution_concepts.reduce((sum, c) => sum + (c.features?.length || 0), 0);
    onStatus('Stage 2' + (batchLabel ? ' (' + batchLabel + ')' : '') + ' complete: ' +
      stage2Batch.solution_concepts.length + ' concepts, ' + batchFeatures + ' features (' + elapsed(startTime) + ')', 'done');

    // Delay between batches
    if (bi < totalBatches - 1) {
      onStatus('Pausing before next batch…', 'update');
      await sleep(INTER_STAGE_DELAY_MS);
    }
  }

  // ── MERGE BATCH RESULTS ──
  const stage2 = mergeStage2Results(batchResults);

  const featureCount = stage2.solution_concepts.reduce((sum, c) => sum + (c.features?.length || 0), 0);
  const s2Counts = [
    stage2.solution_concepts.length + ' solution concepts',
    featureCount + ' features',
    stage2.cross_cutting_themes.length + ' cross-cutting themes',
    stage2.risks_and_considerations.length + ' risks',
  ].join(', ');

  if (totalBatches > 1) {
    onStatus('All batches merged: ' + s2Counts + ' (' + elapsed(startTime) + ')', 'done');
  }

  // ── RESULT ──
  const totalUsage = {
    prompt_tokens:     (stage1Raw.usage.prompt_tokens || 0) + totalStage2Usage.prompt_tokens,
    completion_tokens: (stage1Raw.usage.completion_tokens || 0) + totalStage2Usage.completion_tokens,
    total_tokens:      (stage1Raw.usage.total_tokens || 0) + totalStage2Usage.total_tokens,
  };

  onStatus('✅ Pipeline complete: ' + s2Counts + ' · Total time: ' + elapsed(startTime), 'done');

  return {
    stage1:  stage1,
    stage2:  stage2,
    elapsed: elapsed(startTime),
    model:   model,
    usage:   totalUsage,
  };
}


// ── STAGE 3: SOURCE VALIDATION (on-demand) ──────────────────

const DEEP_VALIDATION_MODEL = 'claude-opus-4-6';  // Hardcoded for deep validation
const MAX_VALIDATION_PASSES = 2;                    // Anti-loop safeguard
const STAGE3B_TIMEOUT_MS = 180000;                  // 3 minutes for deep validation

/**
 * Run the initial Stage 3 source validation agent (Pass 1).
 * Returns both the validation result and usage data for token tracking.
 *
 * @param {Object} stage1 - Stage 1 output
 * @param {Object} stage2 - Stage 2 output
 * @param {function} onStatus - Status callback
 * @returns {Object} { validation, usage }
 */
async function runValidation(stage1, stage2, onStatus) {
  const model = getModel();
  onStatus('Validation Pass 1: Checking sources with ' + model + '…', 'step');

  let raw;
  try {
    raw = await chatCompletion(
      [
        { role: 'system', content: STAGE3_SYSTEM_PROMPT },
        { role: 'user',   content: buildStage3UserPrompt(stage1, stage2) }
      ],
      { temperature: 0.1, max_tokens: 4000, timeoutMs: STAGE3_TIMEOUT_MS }
    );
  } catch (e) {
    onStatus('Validation Pass 1 failed: ' + e.message, 'error');
    throw e;
  }

  onStatus('Validation Pass 1: Parsing results…', 'update');

  let validation;
  try {
    validation = parseJsonResponse(raw.content);
  } catch (e) {
    onStatus('Validation Pass 1 output invalid: ' + e.message, 'error');
    throw e;
  }

  // Ensure expected structure
  if (!validation.flags) validation.flags = [];
  if (typeof validation.validation_summary !== 'string') validation.validation_summary = '';
  if (typeof validation.confidence_score !== 'number') validation.confidence_score = null;

  const flagCounts = {
    valid: validation.flags.filter(f => f.status === 'likely_valid').length,
    uncertain: validation.flags.filter(f => f.status === 'uncertain').length,
    invalid: validation.flags.filter(f => f.status === 'likely_invalid').length,
  };

  onStatus('Validation Pass 1 complete: ' + flagCounts.valid + ' valid, ' +
    flagCounts.uncertain + ' uncertain, ' + flagCounts.invalid + ' flagged', 'done');

  return {
    validation: validation,
    usage: raw.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/**
 * Run deep validation (Pass 2) using Opus to find replacement URLs
 * for uncertain/flagged items, then re-validate replacements once.
 *
 * ANTI-LOOP: This function runs exactly once. It does NOT call itself recursively.
 *
 * @param {Object} stage1 - Stage 1 output (will be mutated with replacements)
 * @param {Object} stage2 - Stage 2 output (will be mutated with replacements)
 * @param {Object} initialValidation - Pass 1 validation result
 * @param {function} onStatus - Status callback
 * @returns {Object} { validation, usage, replacementsApplied }
 */
async function runDeepValidation(stage1, stage2, initialValidation, onStatus) {
  // Extract only uncertain and flagged items
  const problemFlags = (initialValidation.flags || []).filter(
    f => f.status === 'uncertain' || f.status === 'likely_invalid'
  );

  if (problemFlags.length === 0) {
    onStatus('No uncertain or flagged items — skipping deep validation.', 'update');
    return { validation: initialValidation, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, replacementsApplied: 0 };
  }

  onStatus('Validation Pass 2: Deep-checking ' + problemFlags.length + ' items with ' + DEEP_VALIDATION_MODEL + '…', 'step');

  // Build the flagged items list for the deep validation prompt
  const flaggedItems = problemFlags.map(f => ({
    section: f.section,
    item_index: f.item_index,
    field: f.field,
    feature_index: f.feature_index != null ? f.feature_index : null,
    original_value: f.original_value,
    status: f.status,
    reason: f.reason,
    suggested_fix: f.suggested_fix,
  }));

  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  // ── Pass 2a: Find replacement URLs using Opus ──
  let deepRaw;
  try {
    deepRaw = await chatCompletion(
      [
        { role: 'system', content: STAGE3B_SYSTEM_PROMPT },
        { role: 'user',   content: buildStage3bUserPrompt(flaggedItems) }
      ],
      { model: DEEP_VALIDATION_MODEL, temperature: 0.1, max_tokens: 4000, timeoutMs: STAGE3B_TIMEOUT_MS }
    );
  } catch (e) {
    onStatus('Validation Pass 2 failed: ' + e.message, 'error');
    throw e;
  }

  // Accumulate usage
  totalUsage.prompt_tokens += (deepRaw.usage?.prompt_tokens || 0);
  totalUsage.completion_tokens += (deepRaw.usage?.completion_tokens || 0);
  totalUsage.total_tokens += (deepRaw.usage?.total_tokens || 0);

  onStatus('Validation Pass 2: Parsing replacement suggestions…', 'update');

  let deepResult;
  try {
    deepResult = parseJsonResponse(deepRaw.content);
  } catch (e) {
    onStatus('Validation Pass 2 output invalid: ' + e.message, 'error');
    throw e;
  }

  const replacements = deepResult.replacements || [];
  let replacementsApplied = 0;

  // ── Apply replacements to stage1/stage2 data ──
  replacements.forEach(r => {
    if (!r.replacement_url || r.confidence === 'low') return;

    try {
      if (r.section === 'best_practices' && stage1.best_practices?.[r.item_index]) {
        stage1.best_practices[r.item_index].url_hint = r.replacement_url;
        replacementsApplied++;
      } else if (r.section === 'analogous_solutions' && stage1.analogous_solutions?.[r.item_index]) {
        stage1.analogous_solutions[r.item_index].url_hint = r.replacement_url;
        replacementsApplied++;
      } else if (r.section === 'design_trends' && stage1.design_trends?.[r.item_index]) {
        stage1.design_trends[r.item_index].url_hint = r.replacement_url;
        replacementsApplied++;
      } else if (r.section === 'inspiration_sources' && stage1.inspiration_sources?.[r.item_index]) {
        stage1.inspiration_sources[r.item_index].url_hint = r.replacement_url;
        replacementsApplied++;
      } else if (r.section === 'solution_concepts' && r.feature_index != null) {
        const concept = stage2.solution_concepts?.[r.item_index];
        if (concept?.features?.[r.feature_index]) {
          concept.features[r.feature_index].best_practice_url = r.replacement_url;
          replacementsApplied++;
        }
      } else if (r.section === 'cross_cutting_themes' && stage2.cross_cutting_themes?.[r.item_index]) {
        stage2.cross_cutting_themes[r.item_index].url_hint = r.replacement_url;
        replacementsApplied++;
      }
    } catch (_) {
      // Skip invalid replacements silently
    }
  });

  onStatus('Validation Pass 2: Applied ' + replacementsApplied + ' URL replacements. Re-validating…', 'update');

  // ── Pass 2b: Re-validate ONLY the replaced items ──
  if (replacementsApplied > 0) {
    let revalRaw;
    try {
      revalRaw = await chatCompletion(
        [
          { role: 'system', content: STAGE3_SYSTEM_PROMPT },
          { role: 'user',   content: buildStage3UserPrompt(stage1, stage2) }
        ],
        { temperature: 0.1, max_tokens: 4000, timeoutMs: STAGE3_TIMEOUT_MS }
      );
    } catch (e) {
      onStatus('Re-validation failed: ' + e.message + ' — using previous results.', 'error');
      // Return what we have so far
      return { validation: initialValidation, usage: totalUsage, replacementsApplied };
    }

    // Accumulate usage
    totalUsage.prompt_tokens += (revalRaw.usage?.prompt_tokens || 0);
    totalUsage.completion_tokens += (revalRaw.usage?.completion_tokens || 0);
    totalUsage.total_tokens += (revalRaw.usage?.total_tokens || 0);

    let revalidation;
    try {
      revalidation = parseJsonResponse(revalRaw.content);
      if (!revalidation.flags) revalidation.flags = [];
    } catch (e) {
      onStatus('Re-validation output invalid — using previous results.', 'error');
      return { validation: initialValidation, usage: totalUsage, replacementsApplied };
    }

    const revalCounts = {
      valid: revalidation.flags.filter(f => f.status === 'likely_valid').length,
      uncertain: revalidation.flags.filter(f => f.status === 'uncertain').length,
      invalid: revalidation.flags.filter(f => f.status === 'likely_invalid').length,
    };

    onStatus('Validation Pass 2 complete (final): ' + revalCounts.valid + ' valid, ' +
      revalCounts.uncertain + ' uncertain, ' + revalCounts.invalid + ' flagged · ' +
      replacementsApplied + ' URLs replaced', 'done');

    return { validation: revalidation, usage: totalUsage, replacementsApplied };
  }

  // No replacements applied — return initial validation with deep usage
  onStatus('Validation Pass 2 complete: no viable replacements found.', 'done');
  return { validation: initialValidation, usage: totalUsage, replacementsApplied: 0 };
}
