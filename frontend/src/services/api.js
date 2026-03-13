/**
 * BRFN Marketplace — Base API client
 * All requests use session (cookie) auth and JSON.
 */

function getApiBase() {
  if (typeof window === 'undefined') return '';
  if (window.BRFN_API_BASE) return window.BRFN_API_BASE;
  const meta = document.querySelector('meta[name="brfn-api-base"]');
  if (meta && meta.getAttribute('content')) return meta.getAttribute('content').trim();
  return '';
}
const API_BASE = getApiBase();

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

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

  if (method !== 'GET') {
    const csrfToken = getCookie('csrftoken');
    if (csrfToken) {
      options.headers['X-CSRFToken'] = csrfToken;
    }
  }

  if (body != null && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
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