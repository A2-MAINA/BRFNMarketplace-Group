/**
 * BRFN Marketplace — Payments & Settlements API
 * Sprint 2: Stripe PaymentIntent + settlement/CSV reporting.
 *
 * Note: backend endpoints may not exist yet; callers should catch errors and display a friendly toast.
 */

/**
 * Create a Stripe PaymentIntent on the backend.
 * @param {number} amountPence - amount in pence (e.g. 1049 for £10.49)
 * @returns {Promise<{client_secret: string}>}
 */
async function createPaymentIntent(orderId) {
  // Backend expects: POST /api/orders/payments/create-intent/ { "order_id": <id> }
  // Amount is derived from order.total_amount on the server.
  if (orderId == null) throw new Error('createPaymentIntent: orderId is required');
  return post('/api/orders/payments/create-intent/', { order_id: orderId });
}

/**
 * Confirm a payment in the browser.
 * This repo currently does not include Stripe.js/Elements wiring.
 * Provide a stub so the UI can be wired later.
 *
 * @throws Always, unless you later implement Stripe Elements in this frontend.
 */
async function confirmPayment(/* clientSecret, cardElement */) {
  throw new Error('Stripe Elements not wired yet in frontend.');
}

/**
 * Notify the backend that a payment succeeded (used after Stripe confirmation).
 * Endpoint name per Sprint 2 guide.
 *
 * @param {string} paymentIntentId
 * @param {number|string} orderId
 * @returns {Promise<object>} Updated Order (+ Payment)
 */
async function notifyBackend(paymentIntentId, orderId) {
  if (!paymentIntentId) throw new Error('notifyBackend: paymentIntentId is required');
  if (orderId == null) throw new Error('notifyBackend: orderId is required');
  return post('/api/orders/payments/confirm/', {
    payment_intent_id: paymentIntentId,
    order_id: orderId,
  });
}

/**
 * Get weekly settlement report.
 * @param {string} [weekParam] - format YYYY-WW
 * @returns {Promise<object>} Settlement report payload
 */
async function getSettlementReport(weekParam = null) {
  // IMPORTANT:
  // When `week` is omitted, backend uses its own "current week" logic.
  // This avoids mismatches between JS week-number calculations and backend week parsing.
  if (!weekParam) {
    return get('/api/orders/settlements/');
  }
  return get(`/api/orders/settlements/?week=${encodeURIComponent(weekParam)}`);
}

/**
 * Download settlement report as CSV/PDF/etc (backend decides content type).
 * @param {string} [weekParam] - format YYYY-WW
 */
async function downloadSettlementReport(weekParam = null) {
  // Backend in this repo returns JSON only; generate CSV client-side.
  const report = await getSettlementReport(weekParam);

  const week = weekParam || report?.week_start || report?.week_start?.toString?.() || 'settlement';

  const orders = Array.isArray(report?.orders) ? report.orders : [];
  const headers = [
    'invoice_number',
    'delivery_date',
    'customer_name',
    'subtotal',
    'commission',
    'producer_payout',
    'delivery_fee',
  ];

  const escapeCSV = (val) => {
    const s = (val === null || val === undefined) ? '' : String(val);
    // Escape quotes by doubling them
    return `"${s.replace(/"/g, '""')}"`;
  };

  const rows = orders.map(o =>
    headers.map(h => escapeCSV(o?.[h] ?? '')).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `settlement_${week}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

