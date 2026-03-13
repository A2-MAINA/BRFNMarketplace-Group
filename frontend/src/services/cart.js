/**
 * BRFN Marketplace — Cart API (customer only, requires auth)
 * Cart items include nested product object.
 */

const CART_PATH = '/api/cart/';

async function getCart() {
  return get(CART_PATH);
}

async function addOrUpdateCartItem(productId, quantity) {
  return post(CART_PATH, { product_id: productId, quantity });
}

async function removeCartItem(itemId) {
  return del(`${CART_PATH}items/${itemId}/`);
}

async function updateCartItemQty(itemId, quantity) {
  return put(`${CART_PATH}items/${itemId}/`, { quantity });
}