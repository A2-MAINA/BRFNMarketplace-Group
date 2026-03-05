/**
 * BRFN Marketplace — Cart API (customer only, requires auth)
 * Cart items include nested product object.
 */

const CART_PATH = '/api/cart/';

/**
 * Get current user's cart.
 * @returns {Promise<object>} { items: Array<{ id, product, product_id?, quantity, created_at }>, total: string, count: number }
 * Each item.product: { id, name, description, price, image_url, stock, category, category_name, created_at }
 */
async function getCart() {
  return get(CART_PATH);
}

/**
 * Add or update a product in the cart.
 * @param {number} productId
 * @param {number} quantity
 * @returns {Promise<object>} Full cart response (same shape as getCart)
 */
async function addOrUpdateCartItem(productId, quantity) {
  return post(CART_PATH, { product_id: productId, quantity });
}

/**
 * Remove a product from the cart.
 * @param {number} productId
 * @returns {Promise<object>} Full cart response (same shape as getCart)
 */
async function removeCartItem(productId) {
  return del(CART_PATH, { product_id: productId });
}
