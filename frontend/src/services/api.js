/**
 * BRFN Marketplace — Base API client
 * All requests use session (cookie) auth and JSON.
 */

function getApiBase() {
  if (typeof window === 'undefined') return 'http://localhost:8025';
  if (window.BRFN_API_BASE) return window.BRFN_API_BASE;
  const meta = document.querySelector('meta[name="brfn-api-base"]');
  if (meta && meta.getAttribute('content')) return meta.getAttribute('content').trim();
  return 'http://localhost:8025';
}
const API_BASE = getApiBase();

/**
 * Make an authenticated JSON request to the backend.
 * @param {string} method - GET, POST, PUT, PATCH, DELETE
 * @param {string} path - Path relative to API base (e.g. '/api/auth/login/')
 * @param {object|null} body - Optional JSON body (ignored for GET)
 * @returns {Promise<object>} Parsed JSON response
 * @throws {Error} On non-2xx response; error.message is user-friendly, error.status and error.body available
 */
async function request(method, path, body = null) {
  const url = path.startsWith('http') ? path : `${API_BASE.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  const options = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (body != null && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    // Any throw from fetch() is a network/CORS/connection issue — always show friendly message
    const err = new Error('Network error. Please check the backend is running and try again.');
    err.status = 0;
    err.body = null;
    throw err;
  }

  let data = null;
  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
  }

  if (!res.ok) {
    const err = new Error(getErrorMessage(data, res.status));
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

// Convenience methods
function get(path) {
  return request('GET', path);
}
function post(path, body) {
  return request('POST', path, body);
}
function put(path, body) {
  return request('PUT', path, body);
}
function patch(path, body) {
  return request('PATCH', path, body);
}
function del(path, body = null) {
  return request('DELETE', path, body);
}
