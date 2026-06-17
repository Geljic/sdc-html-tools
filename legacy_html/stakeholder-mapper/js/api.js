// ============================================================
// SDC Stakeholder Mapper — api.js
// LiteLLM / OpenAI-compatible client
// Namespace: sm_ (localStorage keys: sm_api_endpoint, sm_api_key, sm_api_model)
// ============================================================

const SM_LS_ENDPOINT = 'sm_api_endpoint';
const SM_LS_KEY      = 'sm_api_key';
const SM_LS_MODEL    = 'sm_api_model';

const SM_DEFAULT_MODEL = 'claude-sonnet-4-6';
const SM_RETRY_DELAYS  = [1000, 3000, 9000];

function smGetEndpoint() {
  return (localStorage.getItem(SM_LS_ENDPOINT) || '').replace(/\/+$/, '');
}

function smGetApiKey() {
  return localStorage.getItem(SM_LS_KEY) || '';
}

function smGetModel() {
  return localStorage.getItem(SM_LS_MODEL) || SM_DEFAULT_MODEL;
}

function smSaveApiCredentials(endpoint, apiKey, model) {
  localStorage.setItem(SM_LS_ENDPOINT, (endpoint || '').replace(/\/+$/, ''));
  localStorage.setItem(SM_LS_KEY, apiKey || '');
  if (model) localStorage.setItem(SM_LS_MODEL, model);
}

function smHasCredentials() {
  return !!(smGetEndpoint() && smGetApiKey());
}

function smApiHeaders() {
  return {
    'Authorization': 'Bearer ' + smGetApiKey(),
    'Content-Type': 'application/json',
  };
}

function smSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function smFriendlyError(status, body) {
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

async function smFetchWithRetry(url, options, retries) {
  if (retries === undefined) retries = SM_RETRY_DELAYS.length;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error('HTTP ' + res.status + ': ' + res.statusText);
        if (attempt < retries) {
          await smSleep(SM_RETRY_DELAYS[attempt] || 9000);
          continue;
        }
        const body = await res.text().catch(() => '');
        throw new Error(smFriendlyError(res.status, body));
      }

      const body = await res.text().catch(() => '');
      throw new Error(smFriendlyError(res.status, body));
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        lastError = new Error('Network error — check your endpoint URL and internet connection.');
        if (attempt < retries) {
          await smSleep(SM_RETRY_DELAYS[attempt] || 9000);
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
 * @param {number} [opts.maxTokens=3000]
 * @param {number} [opts.temperature=0.3]
 * @returns {Promise<string>}
 */
async function smCallAi(systemPrompt, userPrompt, opts = {}) {
  const endpoint = smGetEndpoint();
  const model    = smGetModel();

  if (!endpoint) throw new Error('No API endpoint configured. Click the ⚙️ settings icon to set up.');
  if (!smGetApiKey()) throw new Error('No API key configured. Click the ⚙️ settings icon to set up.');

  const body = {
    model,
    max_tokens: opts.maxTokens || 3000,
    temperature: opts.temperature !== undefined ? opts.temperature : 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  };

  const res = await smFetchWithRetry(
    endpoint + '/chat/completions',
    {
      method: 'POST',
      headers: smApiHeaders(),
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from AI. Please try again.');
  return content.trim();
}

/**
 * Call the AI with a system prompt + image (vision).
 * Converts the image file to base64 and sends as a vision message.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt   — text part of the user message
 * @param {File}   imageFile    — the image file (JPG, PNG, PDF)
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function smCallAiWithImage(systemPrompt, userPrompt, imageFile, opts = {}) {
  const endpoint = smGetEndpoint();
  const model    = smGetModel();

  if (!endpoint) throw new Error('No API endpoint configured. Click the ⚙️ settings icon to set up.');
  if (!smGetApiKey()) throw new Error('No API key configured. Click the ⚙️ settings icon to set up.');

  // Convert file to base64 data URL
  const base64 = await smFileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  // Build vision message content
  const userContent = [
    {
      type: 'image_url',
      image_url: { url: base64 },
    },
    {
      type: 'text',
      text: userPrompt,
    },
  ];

  const body = {
    model,
    max_tokens: opts.maxTokens || 4000,
    temperature: opts.temperature !== undefined ? opts.temperature : 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  },
    ],
  };

  const res = await smFetchWithRetry(
    endpoint + '/chat/completions',
    {
      method: 'POST',
      headers: smApiHeaders(),
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from AI. Please try again.');
  return content.trim();
}

/**
 * Convert a File object to a base64 data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
function smFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}
