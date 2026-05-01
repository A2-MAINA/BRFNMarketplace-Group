/**
 * BRFN Marketplace — Out-of-season availability notification subscriptions
 * Sprint 3: TC-016
 */

/**
 * Subscribe to be notified when a product is back in season.
 * @param {number|string} productId
 */
async function subscribeToProduct(productId) {
  if (productId == null || productId === '') {
    throw new Error('subscribeToProduct: productId is required');
  }
  return post(`/api/products/${encodeURIComponent(productId)}/notify/`, {});
}

/**
 * Unsubscribe from availability notifications for a product.
 * @param {number|string} productId
 */
async function unsubscribeFromProduct(productId) {
  if (productId == null || productId === '') {
    throw new Error('unsubscribeFromProduct: productId is required');
  }
  return del(`/api/products/${encodeURIComponent(productId)}/notify/`);
}

/**
 * List all notification subscriptions for the logged-in customer.
 */
async function getMyNotifications() {
  return get('/api/auth/notifications/');
}
