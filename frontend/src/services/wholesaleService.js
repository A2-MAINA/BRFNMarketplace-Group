/**
 * BRFN Marketplace — Wholesale pricing (restaurant & community group)
 * Sprint 3: TC-019, TC-020
 */

/**
 * Get wholesale price for a product (restaurant or community_group session).
 * @param {number|string} productId
 */
async function getWholesalePrice(productId) {
  if (productId == null || productId === '') {
    throw new Error('getWholesalePrice: productId is required');
  }
  return get(`/api/products/${encodeURIComponent(productId)}/wholesale/`);
}

/**
 * Producer sets or updates wholesale price for a product.
 * @param {number|string} productId
 * @param {{
 *   buyer_type: 'restaurant'|'community_group',
 *   price: string|number,
 *   minimum_quantity?: number,
 *   is_active?: boolean
 * }} data
 */
async function setWholesalePrice(productId, data) {
  if (productId == null || productId === '') {
    throw new Error('setWholesalePrice: productId is required');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('setWholesalePrice: data is required');
  }
  return post(`/api/products/${encodeURIComponent(productId)}/wholesale/`, data);
}
