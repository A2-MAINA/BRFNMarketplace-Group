/**
 * List products with optional filters.
 * @param {object} params - { category?: number, search?: string }
 * @returns {Promise<object[]>} Array of products: { id, name, description, price, image_url, stock, category, category_name, created_at }
 */
async function getProducts(params = {}) {
  const q = new URLSearchParams();
  if (params.category != null) q.set('category', params.category);
  if (params.search) q.set('search', params.search);
   if (params.mine) q.set('mine', '1');
  const query = q.toString();
  const path = `/api/products/${query ? '?' + query : ''}`;
  return get(path);
}

/**
 * Get a single product by id.
 * @param {number} id - Product id
 * @returns {Promise<object>} Product: { id, name, description, price, image_url, stock, category, category_name, created_at }
 */
async function getProduct(id) {
  return get(`/api/products/${id}/`);
}

/**
 * List all categories.
 * @returns {Promise<object[]>} Array of categories: { id, name, description }
 */
async function getCategories() {
  return get(`/api/categories/`);
}

/**
 * Create a new product (producer only). Requires authenticated session with role=producer.
 * @param {object} data - { name, description?, price, category (id), stock, image_url? }
 * @returns {Promise<object>} Created product: { id, name, description, price, image_url, stock, category, category_name, created_at }
 */
async function createProduct(data) {
  return post(`/api/products/`, data);
}
