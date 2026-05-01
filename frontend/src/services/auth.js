/**
 * BRFN Marketplace — Auth API
 * Uses session (cookie) authentication; credentials: 'include' in api.js sends cookies.
 */

const AUTH_BASE = '/api/auth/';

/**
 * Register a producer.
 * @param {object} data - { email, password, password_confirm, business_name, contact_name, phone_number?, address, postcode, crn?, description?, food_hygiene_rating? }
 * @returns {Promise<object>} Profile: { id, email, role, first_name, last_name }
 */
async function registerProducer(data) {
  return post(`${AUTH_BASE}register/producer/`, data);
}

/**
 * Register a customer.
 * @param {object} data - { email, password, password_confirm, first_name, last_name, phone_number?, delivery_address, postcode, terms_accepted }
 * @returns {Promise<object>} Profile: { id, email, role, first_name, last_name }
 */
async function registerCustomer(data) {
  return post(`${AUTH_BASE}register/customer/`, data);
}

/**
 * Register a restaurant.
 * @param {object} data - { email, password, password_confirm, business_name, contact_name, phone_number?, delivery_address, postcode, cuisine_type? }
 * @returns {Promise<object>}
 */
async function registerRestaurant(data) {
  return post(`${AUTH_BASE}register/restaurant/`, data);
}

/**
 * Register a community group.
 * @param {object} data - { email, password, password_confirm, organisation_name, contact_name, phone_number?, delivery_address, postcode, group_type? }
 * @returns {Promise<object>}
 */
async function registerCommunityGroup(data) {
  return post(`${AUTH_BASE}register/community-group/`, data);
}

/**
 * Log in. Sets session cookie; subsequent requests send it via credentials: 'include'.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} Profile: { id, email, role, first_name, last_name }
 */
async function login(email, password) {
  return post(`${AUTH_BASE}login/`, { email, password });
}

/**
 * Log out current session.
 * @returns {Promise<object>} { detail: "Logged out." }
 */
async function logout() {
  return post(`${AUTH_BASE}logout/`, {});
}

/**
 * Get current user profile. Requires authenticated session.
 * @returns {Promise<object>} { id, email, role, first_name, last_name }
 * @throws If not authenticated (401)
 */
async function getProfile() {
  return get(`${AUTH_BASE}profile/`);
}

async function updateProfile(data) {
  return patch(`${AUTH_BASE}profile/`, data);
}
