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
  // Backend: GET /api/orders/admin/commission/?from=YYYY-MM-DD&to=YYYY-MM-DD
  const from = params.from || params.startDate || '';
  const to = params.to || params.endDate || '';
  if (!from || !to) throw new Error('getCommissionReport: from and to are required');
  return get(`/api/orders/admin/commission/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

/**
 * Download commission report CSV for a date range.
 * @param {object} params - { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 */
async function exportCommissionCSV(params = {}) {
  const report = await getCommissionReport(params);

  const from = params.from || params.startDate || report?.from || '';
  const to = params.to || params.endDate || report?.to || '';

  const rows = Array.isArray(report?.orders) ? report.orders : [];

  const headers = [
    'invoice_number',
    'producer_email',
    'producer_business',
    'subtotal',
    'commission',
    'producer_payout',
    'processed_at',
  ];

  const escapeCSV = (val) => {
    const s = (val === null || val === undefined) ? '' : String(val);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const csvRows = rows.map(r => headers.map(h => escapeCSV(r?.[h] ?? '')).join(','));
  const csv = [headers.join(','), ...csvRows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `commission_${from}_to_${to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

