/**
 * BRFN Marketplace — Order disputes (customer raise + admin resolve)
 * Sprint 3: TC-014
 */

/**
 * Customer raises a dispute on an order.
 * @param {number|string} orderId
 * @param {{ reason: string, description: string }} data
 */
async function raiseDispute(orderId, data) {
  if (orderId == null || orderId === '') {
    throw new Error('raiseDispute: orderId is required');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('raiseDispute: data is required');
  }
  return post(`/api/orders/${encodeURIComponent(orderId)}/dispute/`, data);
}

/**
 * Customer views dispute status for an order.
 * @param {number|string} orderId
 */
async function getDisputeStatus(orderId) {
  if (orderId == null || orderId === '') {
    throw new Error('getDisputeStatus: orderId is required');
  }
  return get(`/api/orders/${encodeURIComponent(orderId)}/dispute/`);
}

/**
 * Admin resolves or closes a dispute.
 * @param {number|string} disputeId
 * @param {{ status: 'resolved'|'closed', resolution_note: string }} data
 */
async function resolveDispute(disputeId, data) {
  if (disputeId == null || disputeId === '') {
    throw new Error('resolveDispute: disputeId is required');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('resolveDispute: data is required');
  }
  return patch(`/api/admin/disputes/${encodeURIComponent(disputeId)}/resolve/`, data);
}

/**
 * Admin list of disputes (if backend exposes GET /api/admin/disputes/).
 * @returns {Promise<object|array>}
 */
async function listAdminDisputes() {
  return get('/api/admin/disputes/');
}
