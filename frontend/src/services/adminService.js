/**
 * BRFN Marketplace — Admin API
 * Sprint 2: Commission report + CSV export.
 *
 * Note: endpoints may not exist yet; callers should catch errors.
 */

/**
 * Get commission report for a date range.
 * @param {object} params - { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 */
async function getCommissionReport(params = {}) {
  const start = params.startDate || '';
  const end = params.endDate || '';
  if (!start || !end) throw new Error('getCommissionReport: startDate and endDate are required');
  return get(`/api/admin/commissions/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
}

/**
 * Download commission report CSV for a date range.
 * @param {object} params - { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 */
async function exportCommissionCSV(params = {}) {
  const start = params.startDate || '';
  const end = params.endDate || '';
  if (!start || !end) throw new Error('exportCommissionCSV: startDate and endDate are required');

  const url = `${(typeof window !== 'undefined' && window.BRFN_API_BASE) ? window.BRFN_API_BASE : 'http://localhost:8025'}`
    + `/api/admin/commissions/download/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

  let res;
  try {
    res = await fetch(url, { credentials: 'include' });
  } catch (e) {
    throw new Error('Network error. Please check the backend is running and try again.');
  }

  if (!res.ok) {
    throw new Error(`CSV download failed (HTTP ${res.status}).`);
  }

  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `commission_${start}_to_${end}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

