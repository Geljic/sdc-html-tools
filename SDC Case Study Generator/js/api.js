// ============================================================
// API — LiteLLM / OpenAI-compatible client
// Adapted from SDC Project Charter/js/api.js
// ============================================================

const LS_ENDPOINT = 'casestudy_api_endpoint';
const LS_KEY      = 'casestudy_api_key';
const LS_MODEL    = 'casestudy_api_model';

const DEFAULT_ENDPOINT = 'https://v1alpha1.aigateway.ocp.dev.education.nsw.gov.au';
const DEFAULT_MODEL    = 'claude-sonnet-4-6';

const RETRY_DELAYS = [1000, 3000, 9000];

function getEndpoint() {
  return (localStorage.getItem(LS_ENDPOINT) || DEFAULT_ENDPOINT).replace(/\/+$/, '');
}

function getApiKey() {
  return localStorage.getItem(LS_KEY) || '';
}

function getModel() {
  return localStorage.getItem(LS_MODEL) || DEFAULT_MODEL;
}

function saveApiCredentials(endpoint, apiKey, model) {
  if (endpoint !== undefined) localStorage.setItem(LS_ENDPOINT, (endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, ''));
  if (apiKey  !== undefined) localStorage.setItem(LS_KEY, apiKey);
  if (model   !== undefined && model) localStorage.setItem(LS_MODEL, model);
}

function hasCredentials() {
  return !!(getEndpoint() && getApiKey());
}

function apiHeaders() {
  return {
    'Authorization': 'Bearer ' + getApiKey(),
    'Content-Type':  'application/json'
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyError(status, body) {
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

async function callApi(systemPrompt, userPrompt, attempt) {
  attempt = attempt || 0;
  const url = getEndpoint() + '/v1/chat/completions';
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt }
        ]
      })
    });
  } catch (networkErr) {
    if (attempt < RETRY_DELAYS.length) {
      await sleep(RETRY_DELAYS[attempt]);
      return callApi(systemPrompt, userPrompt, attempt + 1);
    }
    throw new Error('Network error: ' + networkErr.message);
  }

  const body = await response.text();

  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS.length) {
      await sleep(RETRY_DELAYS[attempt]);
      return callApi(systemPrompt, userPrompt, attempt + 1);
    }
    throw new Error(friendlyError(response.status, body));
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (_) {
    throw new Error('Invalid JSON response from API.');
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API.');
  return content;
}

async function callApiJson(systemPrompt, userPrompt) {
  const raw = await callApi(systemPrompt, userPrompt);
  // Strip markdown fencing if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    throw new Error('API returned non-JSON content. Raw response:\n' + raw.substring(0, 500));
  }
}
