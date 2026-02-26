/**
 * BRFN Marketplace — Products & Categories API
 */

const API_BASE = '/api';

/**
 * List products with optional filters.
 * @param {object} params - { category?: number, search?: string }
 * @returns {Promise<object[]>} Array of products: { id, name, description, price, image_url, stock, category, category_name, created_at }
 */
async function getProducts(params = {}) {
  const q = new URLSearchParams();
  if (params.category != null) q.set('category', params.category);
  if (params.search) q.set('search', params.search);
  const query = q.toString();
  const path = `${API_BASE}/products/${query ? '?' + query : ''}`;
  return get(path);
}

/**
 * Get a single product by id.
 * @param {number} id - Product id
 * @returns {Promise<object>} Product: { id, name, description, price, image_url, stock, category, category_name, created_at }
 */
async function getProduct(id) {
  return get(`${API_BASE}/products/${id}/`);
}

/**
 * List all categories.
 * @returns {Promise<object[]>} Array of categories: { id, name, description }
 */
async function getCategories() {
  return get(`${API_BASE}/categories/`);
}
