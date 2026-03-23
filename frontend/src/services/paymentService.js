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
async function createPaymentIntent(amountPence) {
  const amount = parseInt(amountPence, 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('createPaymentIntent: amountPence must be a positive integer');
  }
  return post('/api/payments/create-intent/', { amount });
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
  return post('/api/payments/confirm/', {
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
  let week = weekParam;
  if (!week) {
    // Compute current ISO week as YYYY-WW
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const millis = d - onejan;
    const days = Math.floor(millis / 86400000) + onejan.getDay() + 1;
    week = `${d.getFullYear()}-${String(Math.ceil(days / 7)).padStart(2, '0')}`;
  }
  return get(`/api/orders/settlements/?week=${encodeURIComponent(week)}`);
}

/**
 * Download settlement report as CSV/PDF/etc (backend decides content type).
 * @param {string} [weekParam] - format YYYY-WW
 */
async function downloadSettlementReport(weekParam = null) {
  let week = weekParam;
  if (!week) {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const millis = d - onejan;
    const days = Math.floor(millis / 86400000) + onejan.getDay() + 1;
    week = `${d.getFullYear()}-${String(Math.ceil(days / 7)).padStart(2, '0')}`;
  }

  // Use fetch directly so we can download a blob.
  // (We intentionally don't reuse api.js request(), since it parses JSON.)
  const url = `${(typeof window !== 'undefined' && window.BRFN_API_BASE) ? window.BRFN_API_BASE : 'http://localhost:8025'}`
    + `/api/orders/settlements/download/?week=${encodeURIComponent(week)}`;

  let res;
  try {
    res = await fetch(url, { credentials: 'include' });
  } catch (e) {
    throw new Error('Network error. Please check the backend is running and try again.');
  }

  if (!res.ok) {
    throw new Error(`Download failed (HTTP ${res.status}).`);
  }

  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `settlement_${week}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

