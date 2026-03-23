/**
 * BRFN Marketplace — Orders API
 * Sprint 2: order creation (checkout) and order history endpoints to be added by backend.
 * Use this module for: list my orders, create order from cart, get order detail.
 */

// Placeholder until backend exposes order endpoints, e.g.:
// GET  /api/orders/         — list current user's orders
// POST /api/orders/         — create order from cart (checkout)
// GET  /api/orders/{id}/    — order detail

async function getOrders() {
  // Customer "My Orders" shortcut (if backend implements it).
  // Expected: GET /api/orders/
  return get('/api/orders/');
}

/**
 * Create an order from checkout payload.
 * Expected request body (from Sprint 2 guide):
 * {
 *   delivery_address,
 *   producer_groups: [
 *     {
 *       producer: <user id>,
 *       fulfilment_type,
 *       delivery_date,
 *       pickup_location?,
 *       items: [{ product: <id>, quantity: <int>, price_at_time_of_order?, unit_at_time_of_order?, ... }]
 *     }
 *   ]
 * }
 *
 * @param {object} orderData
 * @returns {Promise<object>}
 */
async function createOrder(orderData) {
  if (!orderData || typeof orderData !== 'object') {
    throw new Error('createOrder: orderData payload is required');
  }
  return post('/api/orders/', orderData);
}

/**
 * Get a full order by id.
 * Expected: GET /api/orders/<id>/
 * @param {number|string} id
 */
async function getOrder(id) {
  if (id == null) throw new Error('getOrder: id is required');
  return get(`/api/orders/${id}/`);
}

/**
 * Producer dashboard: incoming orders.
 * Expected: GET /api/orders/producer/
 * @param {object} filters - optional query params, e.g. { status }
 */
async function getProducerOrders(filters = {}) {
  const q = new URLSearchParams();
  if (filters.status) q.set('status', filters.status);
  const query = q.toString();
  return get(`/api/orders/producer/${query ? `?${query}` : ''}`);
}

/**
 * Customer dashboard: my order history.
 * Expected: GET /api/orders/customer/
 */
async function getCustomerOrderHistory() {
  return get('/api/orders/customer/');
}

/**
 * Producer order status update.
 * Expected: PATCH /api/orders/producer/<id>/status/
 * @param {number|string} id
 * @param {object} payload - { status: 'confirmed'|'processing'|'ready'|'delivered'|'rejected'|..., note?: string }
 */
async function updateOrderStatus(id, payload) {
  if (id == null) throw new Error('updateOrderStatus: id is required');
  if (!payload || typeof payload !== 'object') throw new Error('updateOrderStatus: payload is required');
  return patch(`/api/orders/producer/${id}/status/`, payload);
}

/**
 * Customer cancel order (only allowed from pending in Sprint 2).
 * Expected: PATCH /api/orders/<id>/cancel/
 */
async function cancelOrder(id, note = '') {
  if (id == null) throw new Error('cancelOrder: id is required');
  const body = {};
  if (note) body.note = note;
  return patch(`/api/orders/${id}/cancel/`, body);
}

/**
 * Attempt to reorder using an order id (implementation depends on backend spec).
 * This function provides a common integration point for the UI.
 */
async function reorderFromHistory(orderId) {
  if (orderId == null) throw new Error('reorderFromHistory: orderId is required');
  // If backend supports a dedicated endpoint, use it; otherwise the UI can call getOrder(orderId)
  // and then re-add items to cart using the cart service.
  try {
    return post(`/api/orders/${orderId}/reorder/`, {});
  } catch (_) {
    // Fallback: return the order so the UI can rebuild the cart.
    return getOrder(orderId);
  }
}
