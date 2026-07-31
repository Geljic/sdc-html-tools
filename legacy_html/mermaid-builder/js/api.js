// ============================================================
// Mermaid Diagram Builder — api.js
// LiteLLM / OpenAI-compatible client
// Follows same pattern as status-report/js/api.js
// ============================================================

const MD_LS_ENDPOINT = 'md_api_endpoint';
const MD_LS_KEY      = 'md_api_key';
const MD_LS_MODEL    = 'md_api_model';

const MD_DEFAULT_MODEL = 'claude-sonnet-4-6';

const MD_RETRY_DELAYS = [1000, 3000, 9000];

function mdGetEndpoint() {
  return (localStorage.getItem(MD_LS_ENDPOINT) || '').replace(/\/+$/, '');
}

function mdGetApiKey() {
  return localStorage.getItem(MD_LS_KEY) || '';
}

function mdGetModel() {
  return localStorage.getItem(MD_LS_MODEL) || MD_DEFAULT_MODEL;
}

function mdSaveApiCredentials(endpoint, apiKey, model) {
  localStorage.setItem(MD_LS_ENDPOINT, (endpoint || '').replace(/\/+$/, ''));
  localStorage.setItem(MD_LS_KEY, apiKey || '');
  if (model) localStorage.setItem(MD_LS_MODEL, model);
}

function mdHasCredentials() {
  return !!(mdGetEndpoint() && mdGetApiKey());
}

function mdApiHeaders() {
  return {
    'Authorization': 'Bearer ' + mdGetApiKey(),
    'Content-Type': 'application/json',
  };
}

function mdSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mdFriendlyError(status, body) {
  switch (status) {
    case 401: return 'Authentication failed — check your API key.';
    case 403: return 'Access denied — your API key may not have permission for this model.';
    case 404: return 'Endpoint not found — check your API URL.';
    case 429: return 'Rate limited — too many requests. Try again in a moment.';
    default:
      if (status >= 500) return 'Gateway error (HTTP ' + status + '). The service may be temporarily unavailable.';
      try {
        const parsed = JSON.parse(body);
        return parsed.error?.message || 'API error (HTTP ' + status + '): ' + body.substring(0, 200);
      } catch (_) {
        return 'API error (HTTP ' + status + '): ' + body.substring(0, 200);
      }
  }
}

async function mdFetchWithRetry(url, options, retries) {
  if (retries === undefined) retries = MD_RETRY_DELAYS.length;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error('HTTP ' + res.status + ': ' + res.statusText);
        if (attempt < retries) {
          await mdSleep(MD_RETRY_DELAYS[attempt] || 9000);
          continue;
        }
        const body = await res.text().catch(() => '');
        throw new Error(mdFriendlyError(res.status, body));
      }

      const body = await res.text().catch(() => '');
      throw new Error(mdFriendlyError(res.status, body));
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        lastError = new Error('Network error — check your endpoint URL and internet connection.');
        if (attempt < retries) {
          await mdSleep(MD_RETRY_DELAYS[attempt] || 9000);
          continue;
        }
      }
      throw lastError || err;
    }
  }
  throw lastError || new Error('Request failed after retries.');
}

/**
 * Call the AI with a system + user prompt.
 * Returns the raw text content of the first choice.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} [opts]
 * @param {number} [opts.maxTokens=2048]
 * @param {number} [opts.temperature=0.2]
 * @returns {Promise<string>}
 */
async function mdCallAi(systemPrompt, userPrompt, opts = {}) {
  const endpoint = mdGetEndpoint();
  const model    = mdGetModel();

  if (!endpoint) throw new Error('No API endpoint configured. Click the ⚙️ settings icon to set up.');
  if (!mdGetApiKey()) throw new Error('No API key configured. Click the ⚙️ settings icon to set up.');

  const body = {
    model,
    max_tokens: opts.maxTokens || 2048,
    temperature: opts.temperature !== undefined ? opts.temperature : 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  };

  const res = await mdFetchWithRetry(
    endpoint + '/chat/completions',
    {
      method: 'POST',
      headers: mdApiHeaders(),
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from AI. Please try again.');
  return content.trim();
}
