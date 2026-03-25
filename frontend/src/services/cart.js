/**
 * BRFN Marketplace — Cart API (customer only, requires auth)
 * Cart items include nested product object.
 */

// Backend routes can be a little inconsistent across setups.
// Try the expected path first, then fall back if the backend returns 404.
const CART_PATH_PRIMARY = '/api/cart/';
const CART_PATH_FALLBACK = '/api/cart/cart/';

async function requestWithCartFallback(fn) {
  try {
    return await fn(CART_PATH_PRIMARY);
  } catch (err) {
    // Only retry on route-not-found; for auth/stock errors, don't mask the real issue.
    if (err && err.status === 404) {
      return fn(CART_PATH_FALLBACK);
    }
    throw err;
  }
}

async function getCart() {
  return requestWithCartFallback((path) => get(path));
}

async function addOrUpdateCartItem(productId, quantity) {
  return requestWithCartFallback((path) => post(path, { product_id: productId, quantity }));
}

async function removeCartItem(itemId) {
  return requestWithCartFallback((path) => del(`${path}items/${itemId}/`));
}

async function updateCartItemQty(itemId, quantity) {
  return requestWithCartFallback((path) => put(`${path}items/${itemId}/`, { quantity }));
}

/**
 * Clear entire cart for current customer.
 * Backend: DELETE /api/cart/
 */
async function clearCart() {
  return requestWithCartFallback((path) => del(path));
}