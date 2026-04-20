/**
 * BRFN Marketplace — Product reviews & producer responses
 * Sprint 3: TC-023, TC-024
 *
 * Uses session (cookie) auth for POST/PATCH; GET is public.
 */

/**
 * List reviews for a product (includes average rating in API response).
 * @param {number|string} productId
 * @returns {Promise<object>} API payload (typically { results, average_rating, ... } or array — shape follows backend)
 */
async function getProductReviews(productId) {
  if (productId == null || productId === '') {
    throw new Error('getProductReviews: productId is required');
  }
  return get(`/api/products/${encodeURIComponent(productId)}/reviews/`);
}

/**
 * Submit a review for a product (delivered-order validation on server).
 * @param {number|string} productId
 * @param {{ rating: number, comment?: string, order: number }} data
 */
async function submitReview(productId, data) {
  if (productId == null || productId === '') {
    throw new Error('submitReview: productId is required');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('submitReview: data is required');
  }
  return post(`/api/products/${encodeURIComponent(productId)}/reviews/`, data);
}

/**
 * Producer public reply to a review.
 * @param {number|string} productId
 * @param {number|string} reviewId
 * @param {string} response - producer_response text
 */
async function respondToReview(productId, reviewId, response) {
  if (productId == null || productId === '') {
    throw new Error('respondToReview: productId is required');
  }
  if (reviewId == null || reviewId === '') {
    throw new Error('respondToReview: reviewId is required');
  }
  const text = typeof response === 'string' ? response.trim() : '';
  if (!text) {
    throw new Error('respondToReview: response cannot be blank');
  }
  return patch(`/api/products/${encodeURIComponent(productId)}/reviews/${encodeURIComponent(reviewId)}/respond/`, {
    producer_response: text,
  });
}
