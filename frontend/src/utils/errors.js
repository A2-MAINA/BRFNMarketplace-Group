/**
 * BRFN Marketplace — API error parsing
 * Turns Django REST Framework error responses into user-friendly messages.
 */

/**
 * Parse error response from the API.
 * DRF can return: { "field": ["msg"], ... }, { "detail": "..." }, or { "non_field_errors": ["..."] }
 * @param {object} body - Parsed JSON error body
 * @param {number} status - HTTP status code
 * @returns {string} Single message suitable for a toast or form summary
 */
function getErrorMessage(body, status) {
  if (!body || typeof body !== 'object') {
    if (status === 401) return 'Please log in.';
    if (status === 403) return 'You do not have permission to do that.';
    if (status === 404) return 'Not found.';
    if (status >= 500) return 'Server error. Please try again later.';
    return 'Something went wrong.';
  }

  if (body.detail) {
    return Array.isArray(body.detail) ? body.detail.join(' ') : body.detail;
  }

  if (body.non_field_errors && body.non_field_errors.length) {
    return body.non_field_errors.join(' ');
  }

  const firstKey = Object.keys(body)[0];
  if (firstKey) {
    const val = body[firstKey];
    const msg = Array.isArray(val) ? val[0] : val;
    if (typeof msg === 'string') return msg;
  }

  if (status === 401) return 'Please log in.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'Not found.';
  return 'Something went wrong.';
}

/**
 * Get per-field errors for form display.
 * @param {object} body - Parsed JSON error body from API
 * @returns {object} Map of field name -> first error message
 */
function getFieldErrors(body) {
  if (!body || typeof body !== 'object') return {};
  const out = {};
  for (const [key, val] of Object.entries(body)) {
    if (key === 'detail' || key === 'non_field_errors') continue;
    const msg = Array.isArray(val) ? val[0] : val;
    if (typeof msg === 'string') out[key] = msg;
  }
  return out;
}
