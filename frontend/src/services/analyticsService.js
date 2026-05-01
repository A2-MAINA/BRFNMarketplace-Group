/**
 * BRFN Marketplace — Producer analytics & platform revenue (admin)
 * Sprint 3: TC-017, TC-018
 */

/**
 * Producer dashboard analytics (delivered orders only on server).
 */
async function getProducerAnalytics() {
  return get('/api/producer/analytics/');
}

/**
 * Admin platform revenue report with optional date range.
 * @param {object} [params]
 * @param {string} [params.from] - YYYY-MM-DD (alias: startDate)
 * @param {string} [params.to] - YYYY-MM-DD (alias: endDate)
 */
async function getPlatformRevenue(params = {}) {
  const from = params.from ?? params.startDate ?? '';
  const to = params.to ?? params.endDate ?? '';
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const q = qs.toString();
  const path = q ? `/api/admin/revenue/?${q}` : '/api/admin/revenue/';
  return get(path);
}

/**
 * Download platform revenue as CSV (client-side), same pattern as TC-025 commission export.
 * Expects `report` to include a per-producer list under one of: producers, breakdown, rows.
 * @param {object} [params] - passed to getPlatformRevenue
 */
async function exportRevenueCSV(params = {}) {
  const report = await getPlatformRevenue(params);

  const from = params.from ?? params.startDate ?? report?.from ?? '';
  const to = params.to ?? params.endDate ?? report?.to ?? '';

  const rows =
    (Array.isArray(report?.producers) && report.producers) ||
    (Array.isArray(report?.breakdown) && report.breakdown) ||
    (Array.isArray(report?.rows) && report.rows) ||
    [];

  const escapeCSV = (val) => {
    const s = val === null || val === undefined ? '' : String(val);
    return `"${s.replace(/"/g, '""')}"`;
  };

  if (rows.length === 0) {
    const scalars = Object.entries(report || {}).filter(([, v]) =>
      v === null || ['string', 'number', 'boolean'].includes(typeof v)
    );
    const headers = ['field', 'value'];
    const csvRows =
      scalars.length > 0
        ? scalars.map(([k, v]) => `${escapeCSV(k)},${escapeCSV(v)}`)
        : [
            `${escapeCSV('message')},${escapeCSV(
              'No per-producer rows in API response; extend export when backend shape is fixed.'
            )}`,
          ];
    const csv = [headers.join(','), ...csvRows].join('\n');
    downloadCsvBlob(csv, `revenue_${from || 'report'}_to_${to || 'export'}.csv`);
    return;
  }

  const first = rows[0];
  const headers = typeof first === 'object' && first !== null ? Object.keys(first) : ['value'];
  const csvRows = rows.map((r) =>
    headers.map((h) => escapeCSV(r?.[h])).join(',')
  );
  const csv = [headers.join(','), ...csvRows].join('\n');
  downloadCsvBlob(csv, `revenue_${from || 'report'}_to_${to || 'export'}.csv`);
}

function downloadCsvBlob(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
