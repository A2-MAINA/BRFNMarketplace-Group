/* ============================================================
   BRFN MARKETPLACE — App Logic v2
   Wired to backend API: auth, products, categories, cart.
   ============================================================ */

// ---- REAL UNSPLASH IMAGES (fallbacks when API has no image) ----
const FARM_IMAGES = {
  'Bristol Valley Farm':  'images/farm.jpg',
  'Hillside Dairy':       'images/hillside.jpg',
  'Clifton Bakehouse':    'images/bakery.jpg',
  'Redland Growers':      'images/farm.jpg',
  'Avon Valley Kitchen':  'images/seasonal.jpg',
  'Local producer':       'images/farm.jpg',
};

const CATEGORY_IMAGES = {
  'Vegetables': 'images/vegetables.jpg',
  'Dairy & Eggs': 'images/dairy.jpg',
  'Bakery': 'images/bakery.jpg',
  'Preserves': 'images/preserves.jpg',
  'Seasonal Specialties': 'images/seasonal.jpg',
};

/** Map API product to UI shape (backend has id, name, description, price, image_url, stock, category, category_name). */
function apiProductToUI(apiP) {
  if (!apiP) return null;
  const price = typeof apiP.price === 'number' ? apiP.price : parseFloat(apiP.price);
  const cat = apiP.category;
  const catId = typeof cat === 'object' && cat ? cat.id : cat;
  const catName = typeof cat === 'object' && cat ? cat.name : (apiP.category_name || 'Products');
  const allergenList = Array.isArray(apiP.allergens)
    ? apiP.allergens.map(a => typeof a === 'object' ? a.name : a)
    : [];
  const producerName = apiP.producer_business_name || 'Local producer';
  const producerId =
    apiP.producer != null
      ? (typeof apiP.producer === 'object' && apiP.producer ? apiP.producer.id : apiP.producer)
      : null;
  const initials = producerName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  const availMap = { 'in_season': 'In Season', 'out_of_season': 'Out of Season', 'pre_order': 'Pre-Order' };
  return {
    id: apiP.id,
    name: apiP.name,
    description: apiP.description || '',
    price,
    category: catId,
    category_name: catName,
    unit: apiP.unit || 'each',
    producer: producerName,
    producerId: producerId != null ? Number(producerId) : null,
    producerInitial: initials,
    availability: availMap[apiP.availability] || apiP.availability || 'Available',
    stock: apiP.stock_quantity || 0,
    allergens: allergenList,
    organic: apiP.is_organic === true,
    harvestDate: apiP.harvest_date || apiP.production_date || apiP.best_before || '',
    img: apiP.image || 'images/vegetables.jpg',
  };
}

/** Build categories for UI: "All" + API categories with counts from products. */
function buildCategoriesForUI(apiCategories, products) {
  const list = [{ id: 'all', name: 'All Products', count: products.length, img: 'images/vegetables.jpg' }];
  (apiCategories || []).forEach(c => {
    const count = products.filter(p => p.category === c.id).length;
    list.push({
      id: c.id,
      name: c.name,
      count,
      img: CATEGORY_IMAGES[c.name] || 'images/vegetables.jpg',
    });
  });
  return list;
}

/** Map API profile to state.currentUser shape. */
function profileToUser(profile) {
  if (!profile) return null;
  const cp = profile.customer_profile || {};
  const pp = profile.producer_profile || {};
  const rp = profile.restaurant_profile || {};
  const gp = profile.community_group_profile || {};
  const name = cp.full_name || pp.contact_name || rp.business_name || gp.organisation_name || profile.name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;
  return {
    name,
    email: profile.email,
    role: profile.role,
    businessName: pp.business_name || rp.business_name || gp.organisation_name || null,
    phone: cp.phone_number || pp.phone_number || rp.phone_number || gp.phone_number || '',
    deliveryAddress: cp.delivery_address || rp.delivery_address || gp.delivery_address || '',
    postcode: cp.postcode || pp.postcode || rp.postcode || gp.postcode || '',
  };
}

// ---- APP STATE ----
const state = {
  currentPage: 'home',
  currentCategory: 'all',
  searchQuery: '',
  cart: [],
  currentUser: null,
  currentProduct: null,
  producerDashTab: 'overview',
  producerOrderFilter: 'all',
  lastConfirmedOrder: null,
  customerDashTab: 'orders',
  customerOrderFilter: 'all',
  categories: [],   // UI categories (All + from API)
  products: [],     // All products from API (normalized)
  producerProducts: [], // Products belonging to logged-in producer
  producerOrders: null,
  producerOrdersLoading: false,
  customerOrders: null,
  customerOrdersLoading: false,
  reviewsData: {},
  reviewDraft: {},
  revenueReportData: null,
  producerSettlementReport: null,
  producerSettlementLoading: false,
  checkout: {
    stripeProcessing: false,
  },
};

// ---- CART ----
function getCartTotal() { return state.cart.reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 0), 0); }
function getCartCount() { return state.cart.reduce((s, i) => s + (i.qty || 0), 0); }

/** Sync state.cart from API cart response. */
function setCartFromApiResponse(data) {
  if (!data || !Array.isArray(data.items)) { state.cart = []; return; }
  state.cart = data.items.map(i => {
    const p = i.product ? apiProductToUI(i.product) : null;
    if (!p) return null;
    return { ...p, qty: i.quantity || 1, cartItemId: i.id };
  }).filter(Boolean);
  updateCartUI();
  if (state.currentPage === 'cart') renderCart();
}

function addToCart(productId, qty = 1) {
  const numericId = Number(productId);
  const product =
    state.products.find(p => Number(p.id) === numericId) ||
    (state.currentProduct && Number(state.currentProduct.id) === numericId ? state.currentProduct : null);

  // Even if the product isn't in `state.products` (occasionally happens during navigation/refresh),
  // the cart endpoint can still validate the product id, so we should still attempt to add.
  if (state.currentUser && (state.currentUser.role === 'customer' || state.currentUser.role === 'restaurant' || state.currentUser.role === 'community_group')) {
    addOrUpdateCartItem(productId, qty).then(data => {
      setCartFromApiResponse(data);
      const name = product && product.name ? product.name : 'Item';
      showToast(`${name} added to cart`, 'success');
    }).catch(err => showToast(apiErrorMessage(err, 'Could not add to cart'), 'error'));
    return;
  }
  if (state.currentUser && state.currentUser.role === 'producer') {
    showToast('Producers use the dashboard to manage orders', '');
    return;
  }
  showToast('Please log in to add to cart', 'error');
  navigate('login');
}

function removeFromCart(productId) {
  if (state.currentUser && state.currentUser.role === 'customer') {
    const item = state.cart.find(i => i.id === Number(productId));
    if (!item || !item.cartItemId) { showToast('Item not found in cart', 'error'); return; }
    removeCartItem(item.cartItemId).then(data => { setCartFromApiResponse(data); }).catch(err => showToast(apiErrorMessage(err, 'Could not update cart'), 'error'));
    return;
  }
  state.cart = state.cart.filter(i => i.id !== Number(productId));
  updateCartUI();
  renderCart();
}

function updateQty(productId, delta) {
  const item = state.cart.find(i => i.id === Number(productId));
  if (!item) return;
  const newQty = Math.max(1, (item.qty || 0) + delta);
  if (state.currentUser && state.currentUser.role === 'customer') {
    if (!item.cartItemId) { showToast('Item not found in cart', 'error'); return; }
    updateCartItemQty(item.cartItemId, newQty).then(data => { setCartFromApiResponse(data); }).catch(err => showToast(apiErrorMessage(err, 'Could not update quantity'), 'error'));
    return;
  }
  item.qty = newQty;
  updateCartUI();
  renderCart();
}

function updateCartUI() {
  const count = getCartCount();
  const el = document.getElementById('cart-count');
  if (el) { el.textContent = count; el.classList.toggle('hidden', count === 0); }
}

// ---- TOAST ----
function showToast(msg, type = '') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'i';
  t.innerHTML = `<span style="font-weight:700">${icon}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'fadeOutToast 0.3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3200);
}

/** Never show raw "Failed to fetch" — use friendly message for network errors. */
function apiErrorMessage(err, fallback) {
  const msg = err && err.message ? err.message : fallback || 'Something went wrong.';
  // Only map true fetch/network errors to the generic message.
  // Other app errors (e.g. missing Stripe keys) should show their actual message.
  if (msg === 'Failed to fetch') return 'Network error. Please check the backend is running and try again.';
  return msg;
}

// ---- NAVIGATION ----
function navigate(page, extra) {
  // Role guards — TC-022
  if (page === 'producer-dash' && (!state.currentUser || state.currentUser.role !== 'producer')) {
    showToast('Access denied.', 'error');
    navigate(state.currentUser ? 'home' : 'login');
    return;
  }
  if (page === 'admin-dash' && (!state.currentUser || state.currentUser.role !== 'admin')) {
    showToast('Access denied.', 'error');
    navigate(state.currentUser ? 'home' : 'login');
    return;
  }
  if (page === 'customer-dash' && (!state.currentUser || state.currentUser.role !== 'customer')) {
    showToast('Access denied.', 'error');
    navigate(state.currentUser ? 'home' : 'login');
    return;
  }
  if (page === 'restaurant-dash' && (!state.currentUser || state.currentUser.role !== 'restaurant')) {
    showToast('Access denied.', 'error');
    navigate(state.currentUser ? 'home' : 'login');
    return;
  }
  if (page === 'community-dash' && (!state.currentUser || state.currentUser.role !== 'community_group')) {
    showToast('Access denied.', 'error');
    navigate(state.currentUser ? 'home' : 'login');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (!target) {
    var fallback = document.getElementById('page-home');
    if (fallback) fallback.classList.add('active');
    state.currentPage = 'home';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  target.classList.add('active');
  state.currentPage = page;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  if (page === 'browse')        renderBrowse();
  if (page === 'restaurant-dash') {
    const nameEl = document.getElementById('rdash-user-name');
    if (nameEl && state.currentUser) nameEl.textContent = state.currentUser.name;
    const avatarEl = document.getElementById('rdash-avatar');
    if (avatarEl && state.currentUser) avatarEl.textContent = state.currentUser.name[0].toUpperCase();
    renderRestaurantDash();
  }
  if (page === 'community-dash') {
    const nameEl = document.getElementById('cdash-community-user-name');
    if (nameEl && state.currentUser) nameEl.textContent = state.currentUser.name;
    const avatarEl = document.getElementById('cdash-community-avatar');
    if (avatarEl && state.currentUser) avatarEl.textContent = state.currentUser.name[0].toUpperCase();
    renderCommunityDash();
  }
  if (page === 'cart')          renderCart();
  if (page === 'product')       { detailQty = 1; renderProductDetail(extra); }
  if (page === 'producer-dash') {
    if (state.currentUser && state.currentUser.role === 'producer') {
      getProducts({ mine: true })
        .then(prods => { state.producerProducts = (prods || []).map(apiProductToUI); renderProducerDash(); })
        .catch(() => { renderProducerDash(); });
    } else {
      renderProducerDash();
    }
  }
  if (page === 'customer-dash') renderCustomerDash();
  if (page === 'admin-dash') renderAdminDash();
  if (page === 'order-confirm') renderOrderConfirmation(state.lastConfirmedOrder);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- BROWSE ----
function getFiltered() {
  const list = state.products || [];
  return list.filter(p => {
    // Hide out-of-season products from the marketplace (TC-011)
    if (p.availability === 'Out of Season') return false;
    const catMatch = state.currentCategory === 'all' || p.category === state.currentCategory || String(p.category) === String(state.currentCategory);
    const q = (state.searchQuery || '').toLowerCase();
    const sMatch = !q || (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.producer || '').toLowerCase().includes(q);
    return catMatch && sMatch;
  });
}

function productCardHTML(p) {
  const allergens = p.allergens || [];
  const allergenHTML = allergens.length
    ? allergens.map(a => `<span class="allergen-chip">⚠ ${a}</span>`).join('')
    : `<span class="no-allergen">No common allergens</span>`;

  const badges = [];
  if (p.organic) badges.push(`<span class="badge badge-organic">Organic</span>`);
  badges.push(`<span class="badge badge-season">${p.availability || 'Available'}</span>`);

  return `
    <div class="product-card" onclick="navigate('product', ${p.id})">
      <div class="product-img">
        <img src="${p.img}" alt="${p.name}" loading="lazy" />
        <div class="product-badges">${badges.join('')}</div>
      </div>
      <div class="product-body">
        <div class="product-producer">
          <img src="${FARM_IMAGES[p.producer] || ''}" 
               style="width:16px;height:16px;border-radius:50%;object-fit:cover;display:inline-block" 
               alt="" onerror="this.style.display='none'" />
          ${p.producer}
        </div>
        <div class="product-name">${p.name}</div>
        <p class="product-desc">${p.description.substring(0, 85)}…</p>
        <div class="allergen-row">${allergenHTML}</div>
        <div class="product-footer">
          <div>
            <span class="product-price">£${p.price.toFixed(2)}</span>
            <span class="product-unit"> / ${p.unit}</span>
          </div>
          <button class="add-btn" onclick="event.stopPropagation(); addToCart(${p.id})" title="Add to cart">+</button>
        </div>
      </div>
    </div>`;
}

function renderBrowse() {
  const cats = state.categories || [];
  const catGrid = document.getElementById('category-grid');
  if (catGrid) {
    catGrid.innerHTML = cats.map(c => `
      <div class="category-card ${c.id === state.currentCategory || String(c.id) === String(state.currentCategory) ? 'active' : ''}" onclick="setCategory('${c.id}')">
        <div class="cat-img"><img src="${c.img || 'images/vegetables.jpg'}" alt="${c.name}" loading="lazy" /></div>
        <div class="cat-info"><h4>${c.name}</h4><span>${c.count} products</span></div>
      </div>`).join('');
  }

  const products = getFiltered();
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `<div class="no-results"><h3>No products found</h3><p>Try a different category or search term.</p></div>`;
  } else {
    grid.innerHTML = products.map(productCardHTML).join('');
  }
}

function setCategory(id) {
  state.currentCategory = id;
  renderBrowse();
}

// ---- PRODUCT DETAIL ----
function renderProductDetail(productId) {
  const contentEl = document.getElementById('product-detail-content');
  if (!contentEl) return;
  contentEl.innerHTML = '<p class="loading-msg">Loading…</p>';

  (async () => {
    let p = state.products.find(x => x.id === Number(productId));
    if (!p) {
      try {
        const api = await getProduct(productId);
        p = apiProductToUI(api);
      } catch (err) {
        contentEl.innerHTML = `<div class="no-results"><h3>Product not found</h3><p>${apiErrorMessage(err, 'Please try again.')}</p><button class="btn btn-primary" onclick="navigate('browse')">Back to Marketplace</button></div>`;
        return;
      }
    }
    state.currentProduct = p;

    const allergens = p.allergens || [];
    const allergenSection = allergens.length
      ? `<div class="allergen-warning">
           <h4>⚠ Allergen Information — Contains:</h4>
           <div class="allergen-row">${allergens.map(a => `<span class="allergen-chip">⚠ ${a}</span>`).join('')}</div>
         </div>`
      : `<div class="detail-block"><h4>Allergen Information</h4>
         <p style="font-size:15px;font-weight:600;color:var(--forest-mid)">✓ No common allergens declared</p></div>`;

    const catName = p.category_name || state.categories.find(c => c.id === p.category)?.name || 'Products';

  const html = `
    <div class="product-detail-layout">
      <div class="product-detail-img">
        <img src="${p.img}" alt="${p.name}" />
      </div>
      <div class="product-detail-info">
        <div class="breadcrumb">
          <span onclick="navigate('browse')">Marketplace</span> ›
          <span onclick="navigate('browse'); setCategory('${p.category}')">${catName}</span> ›
          <span style="color:var(--charcoal)">${p.name}</span>
        </div>
        <h1>${p.name}</h1>
        <div class="producer-card">
          <img src="${FARM_IMAGES[p.producer]}" alt="${p.producer}" onerror="this.style.display='none'" />
          <div class="producer-card-text">
            <strong>${p.producer}</strong>
            <span>Bristol, UK · Within 20 miles</span>
          </div>
        </div>
        <div class="price-availability">
          <span class="big-price">£${p.price.toFixed(2)}</span>
          <span style="font-size:16px;color:var(--text-muted)">/ ${p.unit}</span>
          <span class="avail-badge available">${p.availability}</span>
        </div>
        <div class="detail-block">
          <h4>About this product</h4>
          <p style="font-size:15px;color:var(--text-body);line-height:1.8">${p.description}</p>
        </div>
        <div class="detail-grid" style="margin-bottom:20px">
          <div class="detail-item"><h4>Stock</h4><p>${p.stock} ${p.unit}s available</p></div>
          <div class="detail-item"><h4>Certified Organic</h4><p>${p.organic ? '✓ Yes' : 'Conventional'}</p></div>
          <div class="detail-item"><h4>Harvest Date</h4><p>${p.harvestDate || '—'}</p></div>
          <div class="detail-item"><h4>Food Miles</h4><p>~${Math.floor(Math.random()*14)+2} miles</p></div>
        </div>
        ${allergenSection}
        <div class="qty-add-row">
          <div class="qty-control">
            <button class="qty-btn" onclick="changeDetailQty(-1)">−</button>
            <span class="qty-val" id="detail-qty">1</span>
            <button class="qty-btn" onclick="changeDetailQty(1)">+</button>
          </div>
          <button class="btn btn-primary" style="flex:1" onclick="addDetailToCart()">Add to Cart</button>
        </div>
        ${(p.availability || "").toLowerCase().includes("out") && state.currentUser && state.currentUser.role === "customer" ? '<button id="notify-btn-' + p.id + '" class="btn btn-notify" onclick="handleSubscribeNotification(' + p.id + ')">&#128276; Notify me when back in season</button>' : ""}
      </div>
    </div>`;
    contentEl.innerHTML = html + renderReviewsSection(productId);
    loadProductReviews(productId).then(() => {
      const sec = document.getElementById(`reviews-section-${productId}`);
      if (sec) sec.outerHTML = renderReviewsSection(productId);
    });
  })();
}

let detailQty = 1;
function changeDetailQty(delta) {
  detailQty = Math.max(1, detailQty + delta);
  const el = document.getElementById('detail-qty');
  if (el) el.textContent = detailQty;
}
function addDetailToCart() {
  if (state.currentProduct) { addToCart(state.currentProduct.id, detailQty); detailQty = 1; const el = document.getElementById('detail-qty'); if (el) el.textContent = 1; }
}

// ---- CART ----
function renderCart() {
  const wrap = document.getElementById('cart-items-wrap');
  const summary = document.getElementById('cart-summary');
  if (!wrap) return;

  if (state.cart.length === 0) {
    wrap.innerHTML = `
      <div class="cart-empty">
        <img class="cart-empty-img" src="images/vegetables.jpg" alt="Empty cart" />
        <h3>Your basket is empty</h3>
        <p>Discover fresh local produce from Bristol's finest farms.</p>
        <button class="btn btn-primary" onclick="navigate('browse')">Browse Marketplace</button>
      </div>`;
    if (summary) summary.innerHTML = '';
    return;
  }

  const groups = {};
  state.cart.forEach(item => {
    if (!groups[item.producer]) groups[item.producer] = [];
    groups[item.producer].push(item);
  });

  wrap.innerHTML = Object.entries(groups).map(([producer, items]) => `
    <div class="producer-group">
      <div class="producer-group-header">
        <img src="${FARM_IMAGES[producer]}" alt="${producer}" onerror="this.style.display='none'" />
        <h4>${producer}</h4>
        <span>${items.length} item${items.length > 1 ? 's' : ''}</span>
      </div>
      ${items.map(item => `
        <div class="cart-item">
          <div class="cart-item-img"><img src="${item.img}" alt="${item.name}" /></div>
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-unit">£${Number(item.price).toFixed(2)} / ${item.unit || 'unit'}</div>
          </div>
          <div class="qty-control">
            <button class="qty-btn" onclick="updateQty(${item.id},-1)">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" onclick="updateQty(${item.id},1)">+</button>
          </div>
          <div class="cart-item-price">£${(Number(item.price) * (item.qty || 0)).toFixed(2)}</div>
          <button class="remove-btn" onclick="removeFromCart(${item.id})">✕</button>
        </div>`).join('')}
    </div>`).join('');

  const subtotal = getCartTotal();
  const commission = subtotal * 0.05;

  if (summary) {
    summary.innerHTML = `
      <h3>Order Summary</h3>
      <div class="summary-line"><span>Subtotal (${getCartCount()} items)</span><span>£${subtotal.toFixed(2)}</span></div>
      <div class="summary-line"><span>Delivery</span><span style="color:var(--forest-mid);font-weight:600">Via producer</span></div>
      <div class="summary-line total"><span>Total</span><span>£${subtotal.toFixed(2)}</span></div>
      <div class="commission-note">
        A 5% network commission (£${commission.toFixed(2)}) supports the Bristol Regional Food Network. Producers receive 95% of every sale.
      </div>
      <button class="btn btn-gold btn-full" onclick="handleCheckout()" style="margin-bottom:10px">Proceed to Checkout</button>
      <button class="btn btn-secondary btn-full" onclick="navigate('browse')">Continue Shopping</button>`;
  }
}

let stripeInstance = null;
let stripeElements = null;
let stripeCard = null;
let stripeCardInitialized = false;

function closeCheckoutModal() {
  const overlay = document.getElementById('checkout-overlay');
  if (overlay) overlay.classList.add('hidden');

  const errorEl = document.getElementById('stripe-card-error');
  if (errorEl) errorEl.textContent = '';
  const dateErrEl = document.getElementById('checkout-delivery-date-err');
  if (dateErrEl) dateErrEl.textContent = '';
}

function openCheckoutModal() {
  const overlay = document.getElementById('checkout-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function ensureStripeInitialized() {
  const keyMeta = document.querySelector('meta[name="brfn-stripe-publishable-key"]');
  const publishableKey = keyMeta ? keyMeta.getAttribute('content') : null;

  if (!publishableKey || !publishableKey.trim() || publishableKey.includes('REPLACE_ME')) {
    throw new Error('Set your Stripe test publishable key in frontend/index.html (meta brfn-stripe-publishable-key).');
  }
  if (typeof Stripe === 'undefined') {
    throw new Error('Stripe.js failed to load. Check network access to https://js.stripe.com/v3/.');
  }

  if (stripeCardInitialized) return;
  stripeInstance = Stripe(publishableKey.trim());
  stripeElements = stripeInstance.elements();
  stripeCard = stripeElements.create('card');
  stripeCard.mount('#stripe-card-element');

  stripeCardInitialized = true;
  stripeCard.addEventListener('change', (event) => {
    const errorEl = document.getElementById('stripe-card-error');
    if (!errorEl) return;
    errorEl.textContent = event.error ? event.error.message : '';
  });
}

function getMinDeliveryDateStr(plusDays = 2) {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().split('T')[0];
}

function handleCheckout() {
  if (!state.currentUser) {
    showToast('Please log in to checkout', 'error');
    navigate('login');
    return;
  }
  if (state.currentUser.role !== 'customer') {
    showToast('Producers cannot check out.', 'error');
    return;
  }
  if (!state.cart || state.cart.length === 0) {
    showToast('Your cart is empty.', 'error');
    navigate('browse');
    return;
  }

  // Build per-producer sections with fulfilment selector and delivery date picker
  const minDate = getMinDeliveryDateStr(2);
  const groups = {};
  state.cart.forEach(item => {
    const key = String(item.producerId);
    if (!groups[key]) groups[key] = { producerName: item.producer, producerId: item.producerId, items: [] };
    groups[key].items.push(item);
  });

  const sectionsEl = document.getElementById('checkout-producer-sections');
  if (sectionsEl) {
    sectionsEl.innerHTML = Object.values(groups).map(g => `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:14px">
        <h4 style="margin:0 0 10px;font-size:15px;color:var(--forest)">${g.producerName}</h4>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px">
          ${g.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
        </div>
        <div class="form-row" style="gap:12px">
          <div class="form-group" style="flex:1">
            <label style="font-size:13px">Fulfilment <span class="req">*</span></label>
            <select class="form-control" id="fulfilment-${g.producerId}" style="font-size:13px">
              <option value="standard">Standard Delivery — £2.99 (3–5 days)</option>
              <option value="express">Express Delivery — £4.99 (1–2 days)</option>
              <option value="pickup">Pickup from producer — Free</option>
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label style="font-size:13px">Delivery Date <span class="req">*</span></label>
            <input type="date" class="form-control" id="delivery-date-${g.producerId}" min="${minDate}" value="${minDate}" style="font-size:13px" />
          </div>
        </div>
      </div>
    `).join('');
  }

  try {
    ensureStripeInitialized();
  } catch (err) {
    showToast(apiErrorMessage(err, 'Stripe setup error'), 'error');
    return;
  }

  // Render live total summary
  updateCheckoutTotal();
  openCheckoutModal();
}

function updateCheckoutTotal() {
  const DELIVERY_FEES = { standard: 2.99, express: 4.99, pickup: 0.00 };
  const groups = {};
  state.cart.forEach(item => {
    const key = String(item.producerId);
    if (!groups[key]) groups[key] = { producerId: item.producerId, items: [] };
    groups[key].items.push(item);
  });

  const productSubtotal = getCartTotal();
  let totalDelivery = 0;

  Object.values(groups).forEach(g => {
    const sel = document.getElementById('fulfilment-' + g.producerId);
    const type = sel ? sel.value : 'standard';
    totalDelivery += DELIVERY_FEES[type] || 0;

    // Add onchange listener if not already set
    if (sel && !sel._listenerAdded) {
      sel.addEventListener('change', updateCheckoutTotal);
      sel._listenerAdded = true;
    }
  });

  const commission = productSubtotal * 0.05;
  const grandTotal = productSubtotal + totalDelivery;

  // Render or update the total summary box
  let summaryEl = document.getElementById('checkout-live-total');
  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.id = 'checkout-live-total';
    summaryEl.style.cssText = 'background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-top:4px;margin-bottom:14px';
    const sectionsEl = document.getElementById('checkout-producer-sections');
    if (sectionsEl && sectionsEl.parentNode) {
      sectionsEl.parentNode.insertBefore(summaryEl, sectionsEl.nextSibling);
    }
  }

  summaryEl.innerHTML = `
    <h4 style="margin:0 0 10px;font-size:14px;color:var(--forest)">Order Total</h4>
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
      <span style="color:var(--text-muted)">Products subtotal</span>
      <span>£${productSubtotal.toFixed(2)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
      <span style="color:var(--text-muted)">Delivery fees</span>
      <span>£${totalDelivery.toFixed(2)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px">
      <span style="color:var(--text-muted)">BRFN commission (5%)</span>
      <span style="color:var(--gold)">−£${commission.toFixed(2)} (from producer)</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;border-top:1px solid #e5e7eb;padding-top:8px">
      <span>Total to pay</span>
      <span style="color:var(--forest)">£${grandTotal.toFixed(2)}</span>
    </div>
  `;
}

async function handleStripePay() {
  if (!state.currentUser || state.currentUser.role !== 'customer') {
    showToast('Please log in as a customer to pay.', 'error');
    return;
  }
  if (!stripeInstance || !stripeCard) {
    showToast('Stripe is not ready yet.', 'error');
    return;
  }

  if (state.checkout && state.checkout.stripeProcessing) return;
  if (!state.checkout) state.checkout = {};
  state.checkout.stripeProcessing = true;

  const payBtn = document.getElementById('stripe-pay-btn');
  if (payBtn) payBtn.disabled = true;

  try {
    const deliveryAddress = state.currentUser.deliveryAddress || '';
    const deliveryPostcode = state.currentUser.postcode || '';
    if (!deliveryAddress || !deliveryPostcode) {
      showToast('Delivery address and postcode are required for checkout.', 'error');
      return;
    }

    // Build producer_groups payload — read fulfilment type and delivery date per producer
    const groupsByProducerId = {};
    for (const item of state.cart) {
      const producerId = item.producerId;
      if (!producerId) {
        throw new Error('Cart item is missing producerId. Try reloading products/cart.');
      }
      const key = String(producerId);
      if (!groupsByProducerId[key]) {
        // Read the per-producer fulfilment type and delivery date from the checkout modal
        const fulfilmentEl = document.getElementById('fulfilment-' + producerId);
        const dateEl = document.getElementById('delivery-date-' + producerId);
        const fulfilmentType = fulfilmentEl ? fulfilmentEl.value : 'standard';
        const producerDeliveryDate = dateEl ? dateEl.value : '';

        if (!producerDeliveryDate) {
          throw new Error('Please select a delivery date for ' + item.producer);
        }

        groupsByProducerId[key] = {
          producer_id: Number(producerId),
          fulfilment_type: fulfilmentType,
          delivery_date: producerDeliveryDate,
          items: [],
        };
      }
      groupsByProducerId[key].items.push({
        product_id: Number(item.id),
        quantity: Number(item.qty || 1),
      });
    }

    const orderData = {
      delivery_address: deliveryAddress,
      delivery_postcode: deliveryPostcode,
      special_instructions: document.getElementById('checkout-special-instructions')?.value?.trim() || '',
      producer_groups: Object.values(groupsByProducerId),
    };

    showToast('Creating order…', '');
    const order = await createOrder(orderData);

    const payment = await createPaymentIntent(order.id);
    const clientSecret = payment && payment.client_secret;
    if (!clientSecret) throw new Error('Backend did not return client_secret.');

    const result = await stripeInstance.confirmCardPayment(clientSecret, {
      payment_method: { card: stripeCard },
    });

    if (result.error) {
      showToast(result.error.message || 'Payment failed.', 'error');
      return;
    }

    const paymentIntentId = result.paymentIntent && result.paymentIntent.id;
    if (!paymentIntentId) throw new Error('Payment succeeded but paymentIntent id is missing.');

    await notifyBackend(paymentIntentId, order.id);
    showToast(`Order ${order.invoice_number || '#' + order.id} confirmed! Payment successful.`, 'success');
    closeCheckoutModal();

    // Clear cart UI + backend cart.
    await clearCart();
    const cart = await getCart();
    setCartFromApiResponse(cart);

    // Show order confirmation page
    state.lastConfirmedOrder = order;
    navigate('order-confirm');
  } catch (err) {
    showToast(apiErrorMessage(err, 'Checkout failed.'), 'error');
  } finally {
    state.checkout.stripeProcessing = false;
    if (payBtn) payBtn.disabled = false;
  }
}

// ---- AUTH ----
function renderAuthNavbar() {
  const el = document.getElementById('navbar-actions');
  if (!el) return;

  if (state.currentUser) {
    const initials = state.currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
    el.innerHTML = `
      <button class="cart-btn" onclick="navigate('cart')">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        Cart
        <span class="cart-count hidden" id="cart-count">0</span>
      </button>
      <div class="user-pill" onclick="navigate('${state.currentUser.role === 'admin' ? 'admin-dash' : state.currentUser.role === 'producer' ? 'producer-dash' : state.currentUser.role === 'restaurant' ? 'restaurant-dash' : state.currentUser.role === 'community_group' ? 'community-dash' : 'customer-dash'}')">
        <div class="user-avatar">${initials}</div>
        <span class="user-name">${state.currentUser.name.split(' ')[0]}</span>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="handleLogout()">Log out</button>`;
  } else {
    el.innerHTML = `
      <button class="cart-btn" onclick="navigate('cart')">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        Cart
        <span class="cart-count hidden" id="cart-count">0</span>
      </button>
      <button class="btn btn-secondary btn-sm" onclick="navigate('login')">Log in</button>
      <button class="btn btn-primary btn-sm" onclick="navigate('register')">Sign up</button>`;
  }
  updateCartUI();
}

function handleLogout() {
  (typeof logout !== 'undefined' ? logout() : Promise.resolve())
    .catch(() => {})
    .finally(() => {
      state.currentUser = null;
      state.cart = [];
      state.producerProducts = [];
      renderAuthNavbar();
      updateCartUI();
      navigate('home');
      showToast('Logged out successfully', '');
    });
}

// ---- REGISTER ----
let registerRole = 'customer';

// FIX 3: producer-name-row is now included in the allFieldGroups array so it gets
// hidden/shown correctly when switching roles. Previously it was always visible.
function setRegisterRole(role) {
  registerRole = role;
  // Update dropdown display
  const dropdown = document.getElementById('reg-role-select');
  if (dropdown && dropdown.value !== role) dropdown.value = role;
  // Hide all role-specific field groups (including producer-name-row)
  const allFieldGroups = ['producer-fields', 'customer-fields', 'restaurant-fields', 'community-group-fields', 'producer-name-row'];
  allFieldGroups.forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  // Show the correct field group
  const fieldMap = {
    'producer': 'producer-fields',
    'customer': 'customer-fields',
    'restaurant': 'restaurant-fields',
    'community_group': 'community-group-fields'
  };
  const activeId = fieldMap[role];
  if (activeId) {
    const activeEl = document.getElementById(activeId);
    if (activeEl) activeEl.classList.remove('hidden');
  }
  // producer-name-row is only for producers (shared contact name + phone fields)
  const producerNameRow = document.getElementById('producer-name-row');
  if (producerNameRow) producerNameRow.classList.toggle('hidden', role !== 'producer');
  // terms-row is only for customers
  const termsRow = document.getElementById('terms-row');
  if (termsRow) termsRow.classList.toggle('hidden', role !== 'customer');
}

function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const firstName = document.getElementById('reg-first-name')?.value?.trim() ?? '';
  const lastName = document.getElementById('reg-last-name')?.value?.trim() ?? '';
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  let valid = true;

  // FIX 2: validation is now role-specific.
  // Previously the else branch ran for ALL non-producer roles (including restaurant and
  // community_group), attempting to validate reg-first-name / reg-last-name which do not
  // exist for those roles — causing registration to always fail at the frontend.
  if (registerRole === 'producer') {
    if (!name) { showFieldError('reg-name', 'Contact name is required'); valid = false; } else clearFieldError('reg-name');
  } else if (registerRole === 'customer') {
    clearFieldError('reg-name');
    if (!firstName) { showFieldError('reg-first-name', 'First name is required'); valid = false; } else clearFieldError('reg-first-name');
    if (!lastName) { showFieldError('reg-last-name', 'Last name is required'); valid = false; } else clearFieldError('reg-last-name');
  } else {
    // restaurant and community_group — their required fields are inside their own field
    // groups and are submitted directly; clear any stale errors on the shared name fields.
    clearFieldError('reg-name');
    clearFieldError('reg-first-name');
    clearFieldError('reg-last-name');
  }

  if (!email.includes('@')) { showFieldError('reg-email', 'Valid email required'); valid = false; } else clearFieldError('reg-email');
  if (password.length < 8) { showFieldError('reg-password', 'Password must be at least 8 characters'); valid = false; } else clearFieldError('reg-password');
  if (password !== confirm)  { showFieldError('reg-confirm', 'Passwords do not match'); valid = false; } else clearFieldError('reg-confirm');

  if (registerRole === 'customer') {
    const terms = document.getElementById('terms-check');
    if (terms && !terms.checked) { showToast('Please accept the terms and conditions', 'error'); valid = false; }
  }
  if (!valid) return;

  let doRegister;
  if (registerRole === 'producer') {
    doRegister = () => registerProducer({
      email, password, password_confirm: confirm,
      business_name: document.getElementById('reg-business')?.value?.trim() || name,
      contact_name: name,
      phone_number: document.getElementById('reg-phone')?.value?.trim() || '',
      address: document.getElementById('reg-address')?.value?.trim() || '-',
      postcode: document.getElementById('reg-postcode')?.value?.trim() || '-',
    });
  } else if (registerRole === 'customer') {
    doRegister = () => registerCustomer({
      email, password, password_confirm: confirm,
      full_name: (firstName + ' ' + lastName).trim(),
      phone_number: document.getElementById('reg-phone')?.value?.trim() || '',
      delivery_address: document.getElementById('reg-delivery')?.value?.trim() || '-',
      postcode: document.getElementById('reg-postcode')?.value?.trim() || '-',
      terms_accepted: true,
    });
  } else if (registerRole === 'restaurant') {
    doRegister = () => registerRestaurant({
      email, password, password_confirm: confirm,
      business_name: document.getElementById('reg-restaurant-name')?.value?.trim() || '',
      contact_name: document.getElementById('reg-restaurant-contact')?.value?.trim() || '',
      phone_number: document.getElementById('reg-restaurant-phone')?.value?.trim() || '',
      delivery_address: document.getElementById('reg-restaurant-address')?.value?.trim() || '-',
      postcode: document.getElementById('reg-restaurant-postcode')?.value?.trim() || '-',
      cuisine_type: document.getElementById('reg-restaurant-cuisine')?.value?.trim() || '',
    });
  } else if (registerRole === 'community_group') {
    doRegister = () => registerCommunityGroup({
      email, password, password_confirm: confirm,
      organisation_name: document.getElementById('reg-community-name')?.value?.trim() || '',
      contact_name: document.getElementById('reg-community-contact')?.value?.trim() || '',
      phone_number: document.getElementById('reg-community-phone')?.value?.trim() || '',
      delivery_address: document.getElementById('reg-community-address')?.value?.trim() || '-',
      postcode: document.getElementById('reg-community-postcode')?.value?.trim() || '-',
      group_type: document.getElementById('reg-community-type')?.value?.trim() || '',
    });
  } else {
    showToast('Please select an account type.', 'error'); return;
  }

  doRegister()
    .then(() => login(email, password))
    .then(() => getProfile())
    .then(profile => {
      state.currentUser = profileToUser(profile);
      renderAuthNavbar();
      showToast(`Welcome, ${state.currentUser.name.split(' ')[0]}! Account created.`, 'success');
      const regDest = state.currentUser.role === 'producer' ? 'producer-dash'
        : state.currentUser.role === 'restaurant' ? 'restaurant-dash'
        : state.currentUser.role === 'community_group' ? 'community-dash'
        : 'customer-dash';
      navigate(regDest);
      if (state.currentUser.role === 'customer') {
        getCart().then(setCartFromApiResponse).catch(() => {});
      }
    })
    .catch(err => {
      const msg = err.status && err.body
        ? (err.message || 'Registration failed. Please check your details.')
        : apiErrorMessage(err, 'Registration failed. Check the backend is running and try again.');
      showToast(msg, 'error');
      const fieldErrors = typeof getFieldErrors === 'function' && err.body ? getFieldErrors(err.body) : {};
      Object.keys(fieldErrors).forEach(f => {
        const id = 'reg-' + f.replace(/_/g, '-');
        showFieldError(id, fieldErrors[f]);
      });
    });
}

// ---- LOGIN ----
function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('Please enter your email and password', 'error'); return; }
  if (!email.includes('@')) { showToast('Please enter a valid email', 'error'); return; }

  login(email, password)
    .then(() => getProfile())
    .then(profile => {
      state.currentUser = profileToUser(profile);
      renderAuthNavbar();
      showToast(`Welcome back, ${state.currentUser.name.split(' ')[0]}!`, 'success');
      const dest = state.currentUser.role === 'admin' ? 'admin-dash'
        : state.currentUser.role === 'producer' ? 'producer-dash'
        : state.currentUser.role === 'restaurant' ? 'restaurant-dash'
        : state.currentUser.role === 'community_group' ? 'community-dash'
        : 'customer-dash';
      navigate(dest);
      if (state.currentUser.role === 'customer') {
        getCart().then(setCartFromApiResponse).catch(() => {});
      }
    })
    .catch(err => showToast(apiErrorMessage(err, 'Invalid email or password'), 'error'));
}

function showFieldError(id, msg) {
  const el = document.getElementById(id); if (el) el.classList.add('error');
  const err = document.getElementById(id + '-err'); if (err) { err.textContent = msg; err.classList.add('show'); }
}
function clearFieldError(id) {
  const el = document.getElementById(id); if (el) el.classList.remove('error');
  const err = document.getElementById(id + '-err'); if (err) err.classList.remove('show');
}
function checkPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const bars = document.querySelectorAll('.strength-bar');
  const levels = ['', 'weak', 'fair', 'good', 'strong'];
  bars.forEach((bar, i) => { bar.className = 'strength-bar'; if (i < score) bar.classList.add(levels[score]); });
}

// ---- PRODUCER DASHBOARD ----
// Orders: real API wiring is Sprint 2; for Sprint 1 show an empty state (no fake orders).
const MOCK_ORDERS = [];

// Producer's own products: backend does not yet filter by producer; show all products for now
const MY_PRODUCTS = [];

function renderProducerDash() {
  document.querySelectorAll('#producer-sidebar li').forEach(li => li.classList.toggle('active', li.dataset.tab === state.producerDashTab));
  document.querySelectorAll('#producer-dash-content .dashboard-section').forEach(s => s.classList.toggle('active', s.id === `pdash-${state.producerDashTab}`));

  const nameEl = document.getElementById('pdash-user-name'); if (nameEl && state.currentUser) nameEl.textContent = state.currentUser.name;
  const bizEl  = document.getElementById('pdash-biz-name');  if (bizEl && state.currentUser)  bizEl.textContent  = state.currentUser.businessName || 'My Farm';

  // Overview stats: start empty / zero per producer for Sprint 1
  const listedCount = state.producerProducts.length;
  const listedEl = document.getElementById('pdash-listed-products');
  if (listedEl) listedEl.textContent = String(listedCount);
  const activeOrdersEl = document.getElementById('pdash-active-orders');
  const weeklyRevenueEl = document.getElementById('pdash-weekly-revenue');
  const formatMoney = (v) => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    const safe = Number.isFinite(n) ? n : 0;
    return '£' + safe.toFixed(2);
  };

  const ordersTbodyEls = document.querySelectorAll('.pdash-orders-tbody');
  const setOrdersBody = (html) => { ordersTbodyEls.forEach(el => { if (el) el.innerHTML = html; }); };

  const loadingRow = `
    <tr>
      <td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);font-size:14px">
        Loading orders…
      </td>
    </tr>`;

  const emptyRow = `
    <tr>
      <td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);font-size:14px">
        You haven't received any orders yet. When customers checkout, their orders will appear here.
      </td>
    </tr>`;

  const toItemsCount = (o) => {
    if (!o) return '—';
    if (Array.isArray(o.items)) return String(o.items.length);
    return String(o.items_count || o.items || o.item_count || '—');
  };

  const toOrderId = (o) => (o && (o.invoice_number || o.id)) ? String(o.invoice_number || o.id) : '—';
  const toCustomerName = (o) => {
    if (!o) return '—';
    if (o.customer_name) return String(o.customer_name);
    if (o.customer && typeof o.customer === 'object') return String(o.customer.name || o.customer.email || '—');
    if (o.customer) return String(o.customer);
    return '—';
  };
  const shortDate = (raw) => {
    if (!raw) return '—';
    try { const d = new Date(raw); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch(e) { return String(raw).substring(0, 10); }
  };
  const toDate = (o) => shortDate(o && (o.created_at || o.order_date || o.date));
  const toDeliveryDate = (o) => shortDate(o && (o.delivery_date || o.delivery));
  const toTotal = (o) => {
    // Producer orders endpoint returns per-group subtotal + delivery_fee.
    const subtotal = o && o.subtotal != null ? o.subtotal : (o && o.total_amount != null ? o.total_amount : 0);
    const deliveryFee = o && o.delivery_fee != null ? o.delivery_fee : 0;
    const n1 = typeof subtotal === 'string' ? parseFloat(subtotal) : Number(subtotal);
    const n2 = typeof deliveryFee === 'string' ? parseFloat(deliveryFee) : Number(deliveryFee);
    const safe1 = Number.isFinite(n1) ? n1 : 0;
    const safe2 = Number.isFinite(n2) ? n2 : 0;
    return safe1 + safe2;
  };
  const toStatus = (o) => (o && o.status) ? String(o.status) : 'pending';
  const toUpdateId = (o) => (o && (o.id || o.order_id || o.pk)) ? String(o.id || o.order_id || o.pk) : null;

  // Sprint 2 TC-010: Producer can progress status Pending → Confirmed → Processing → Ready → Delivered
  const statusActionHTML = (o) => {
    const id = toUpdateId(o);
    const status = toStatus(o).toLowerCase();
    if (!id) return '';

    if (status === 'pending') {
      return `
        <div class="order-action-prompt">
          <span class="order-action-label">Action required</span>
          <div class="order-action-buttons">
            <button class="btn btn-confirm btn-sm" onclick="handleUpdateOrderStatus('${id}','confirmed')">Accept Order</button>
            <button class="btn btn-reject btn-sm" onclick="handleUpdateOrderStatus('${id}','rejected')">Reject</button>
          </div>
        </div>`;
    }
    if (status === 'confirmed') {
      return `<div style="margin-top:6px"><button class="btn btn-progress btn-sm" onclick="handleUpdateOrderStatus('${id}','processing')">Mark Processing</button></div>`;
    }
    if (status === 'processing') {
      return `<div style="margin-top:6px"><button class="btn btn-progress btn-sm" onclick="handleUpdateOrderStatus('${id}','ready')">Mark Ready</button></div>`;
    }
    if (status === 'ready') {
      return `<div style="margin-top:6px"><button class="btn btn-confirm btn-sm" onclick="handleUpdateOrderStatus('${id}','delivered')">Mark Delivered</button></div>`;
    }
    return '';
  };

  if (activeOrdersEl) activeOrdersEl.textContent = String((state.producerOrders || []).length || 0);

  // Render status filter pills
  const filterStatuses = ['all', 'pending', 'confirmed', 'processing', 'ready', 'delivered', 'rejected'];
  const filterHTML = `<div class="order-filter-bar">${filterStatuses.map(s => {
    const label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
    const count = s === 'all'
      ? (state.producerOrders || []).length
      : (state.producerOrders || []).filter(o => (o.status || '').toLowerCase() === s).length;
    const active = state.producerOrderFilter === s ? ' active' : '';
    return `<button class="order-filter-pill${active}" onclick="setProducerOrderFilter('${s}')">${label} <span class="order-filter-count">${count}</span></button>`;
  }).join('')}</div>`;
  document.querySelectorAll('.pdash-order-filters').forEach(el => { el.innerHTML = filterHTML; });

  // Apply filter
  const allOrders = state.producerOrders || [];
  const filteredOrders = state.producerOrderFilter === 'all'
    ? allOrders
    : allOrders.filter(o => (o.status || '').toLowerCase() === state.producerOrderFilter);

  if (state.producerOrders === null) {
    setOrdersBody(loadingRow);
    if (!state.producerOrdersLoading) refreshProducerOrders();
  } else if (filteredOrders.length === 0) {
    setOrdersBody(emptyRow);
  } else {
    const toItemsDetail = (o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      if (items.length === 0) return '<div style="color:var(--text-muted);font-size:12px;margin-top:4px">No items</div>';
      return `<div class="order-items-list">${items.map(i => {
        const name = i.product_name || i.product_name_at_time_of_order || 'Product';
        const qty = i.quantity;
        const price = Number(i.price || i.price_at_time_of_order || 0).toFixed(2);
        const unit = i.unit || i.unit_at_time_of_order || 'unit';
        const total = Number(i.item_total || (i.price * i.quantity) || 0).toFixed(2);
        return `<div class="order-item-row">
          <span class="order-item-qty">${qty}×</span>
          <span class="order-item-name">${name}</span>
          <span class="order-item-price">£${price}/${unit}</span>
          <span class="order-item-total">£${total}</span>
        </div>`;
      }).join('')}</div>`;
    };

    const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    const specialInstructionsHTML = (o) => {
      const note = (o && o.special_instructions) ? String(o.special_instructions).trim() : '';
      if (!note) return '';
      return `<div class="order-special-instructions" style="margin-top:6px;padding:6px 8px;background:#fff7e6;border-left:3px solid var(--gold);border-radius:4px;font-size:12px;color:var(--charcoal)">
          <strong style="color:var(--forest)">Special instructions:</strong> ${escapeHTML(note)}
        </div>`;
    };

    const rows = filteredOrders.map(o => `
      <tr>
        <td>${toOrderId(o)}</td>
        <td>${toCustomerName(o)}</td>
        <td style="font-size:12px">${toDate(o)}</td>
        <td style="font-size:12px">${toDeliveryDate(o)}</td>
        <td>
          <span style="font-size:13px;font-weight:600;color:var(--charcoal)">${toItemsCount(o)} item${Number(toItemsCount(o)) !== 1 ? 's' : ''}</span>
          ${toItemsDetail(o)}
          ${specialInstructionsHTML(o)}
        </td>
        <td style="font-weight:700">${formatMoney(toTotal(o))}</td>
        <td>
          <span class="status-pill status-${toStatus(o).toLowerCase()}">${toStatus(o)}</span>
          ${statusActionHTML(o)}
        </td>
      </tr>
    `).join('');
    setOrdersBody(rows);
  }

  // Best-effort weekly revenue from delivered orders.
  if (weeklyRevenueEl) {
    if (Array.isArray(state.producerOrders)) {
      const delivered = state.producerOrders.filter(o => String((o && o.status) || '').toLowerCase() === 'delivered');
      const revenue = delivered.reduce((sum, o) => {
        const t = o && o.producer_payout != null ? o.producer_payout : (o && o.total_amount != null ? o.total_amount : 0);
        const n = typeof t === 'string' ? parseFloat(t) : Number(t);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      weeklyRevenueEl.textContent = formatMoney(revenue);
    } else {
      weeklyRevenueEl.textContent = '£0.00';
    }
  }

  const prodTable = document.getElementById('pdash-products-table');
  if (prodTable) {
    const myProducts = state.producerProducts.length ? state.producerProducts : [];
    prodTable.innerHTML = myProducts.length ? myProducts.map(p => `
      <tr>
        <td><img src="${p.img}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;margin-right:8px;vertical-align:middle" />${p.name}</td>
        <td>${p.category_name}</td>
        <td style="font-weight:700">£${p.price.toFixed(2)}</td>
        <td>${p.stock} ${p.unit}s</td>
        <td><span class="status-pill status-confirmed">${p.availability}</span></td>
        <td><button class="btn btn-secondary btn-sm" onclick="handleEditProduct(${p.id})">Edit</button>
              <button class="btn btn-secondary btn-sm" onclick="showWholesaleModal(${p.id}, ${p.price})">Wholesale Price</button></td>
      </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Your products will appear here. Add products via the form below.</td></tr>';
  }

  // Populate Add Product category dropdown from API categories (numeric ids)
  const catSelect = document.getElementById('prod-category');
  if (catSelect) {
    const apiCategories = (state.categories || []).filter(c => c.id !== 'all');
    if (apiCategories.length > 0) {
      catSelect.innerHTML = '<option value="">Select category</option>';
      apiCategories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        catSelect.appendChild(opt);
      });
    } else {
      // state.categories not loaded yet or empty — fetch categories directly
      catSelect.innerHTML = '<option value="">Loading categories…</option>';
      getCategories()
        .then(cats => {
          if (!cats || !cats.length) {
            catSelect.innerHTML = '<option value="">No categories yet — add some in admin</option>';
            return;
          }
          catSelect.innerHTML = '<option value="">Select category</option>';
          cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            catSelect.appendChild(opt);
          });
          state.categories = buildCategoriesForUI(cats, state.products || []);
        })
        .catch(() => {
          catSelect.innerHTML = '<option value="">Could not load categories</option>';
        });
    }
  }
}

function handleAddProduct(e) {
  e.preventDefault();
  const name = document.getElementById('prod-name')?.value?.trim() ?? '';
  const categoryVal = document.getElementById('prod-category')?.value ?? '';
  const description = document.getElementById('prod-desc')?.value?.trim() ?? '';
  const priceVal = document.getElementById('prod-price')?.value?.trim() ?? '';
  const stockVal = document.getElementById('prod-stock')?.value?.trim() ?? '';

  ['prod-name', 'prod-category', 'prod-price', 'prod-stock'].forEach(clearFieldError);
  let valid = true;
  if (!name) { showFieldError('prod-name', 'Product name is required'); valid = false; }
  const categoryId = categoryVal ? parseInt(categoryVal, 10) : NaN;
  if (!categoryVal || isNaN(categoryId)) { showFieldError('prod-category', 'Please select a category'); valid = false; }
  const price = priceVal ? parseFloat(priceVal) : NaN;
  if (priceVal === '' || isNaN(price) || price < 0) { showFieldError('prod-price', 'Enter a valid price (0 or more)'); valid = false; }
  const stock = stockVal !== '' ? parseInt(stockVal, 10) : NaN;
  if (stockVal === '' || isNaN(stock) || stock < 0) { showFieldError('prod-stock', 'Enter a valid stock quantity (0 or more)'); valid = false; }
  if (!valid) return;

  if (!state.currentUser || state.currentUser.role !== 'producer') {
    showToast('You must be logged in as a producer to add products.', 'error');
    return;
  }

  const unitVal = document.getElementById('prod-unit')?.value?.trim() || 'each';
  const availRaw = document.getElementById('prod-availability')?.value || 'In Season';
  const availMap = { 'Available': 'in_season', 'In Season': 'in_season', 'Out of Season': 'out_of_season', 'Unavailable': 'out_of_season' };
  const availability = availMap[availRaw] || 'in_season';
  const harvestDate = document.getElementById('prod-harvest')?.value || new Date().toISOString().split('T')[0];
  const organicVal = document.getElementById('prod-organic')?.value === 'true';
  const selectedAllergens = Array.from(document.querySelectorAll('input[name="allergen"]:checked')).map(cb => cb.value);
  const allergenNameMap = {
    'Celery': 'Celery', 'Gluten': 'Cereals containing gluten', 'Crustaceans': 'Crustaceans',
    'Eggs': 'Eggs', 'Fish': 'Fish', 'Lupin': 'Lupin', 'Milk': 'Milk', 'Molluscs': 'Molluscs',
    'Mustard': 'Mustard', 'Nuts': 'Nuts', 'Peanuts': 'Peanuts', 'Sesame': 'Sesame',
    'Soya': 'Soybeans', 'Sulphites': 'Sulphur dioxide'
  };

  get('/api/allergens/')
    .then(allergens => {
      const allergenIds = selectedAllergens.map(cbName => {
        const dbName = allergenNameMap[cbName] || cbName;
        const found = allergens.find(a => a.name === dbName);
        return found ? found.id : null;
      }).filter(Boolean);

      return createProduct({
        name,
        description: description || '',
        price: price,
        category: categoryId,
        stock_quantity: isNaN(stock) ? 1 : stock,
        unit: unitVal,
        availability: availability,
        origin_location: 'Bristol, UK',
        is_organic: organicVal,
        storage_instructions: 'Store in a cool, dry place.',
        harvest_date: harvestDate,
        allergens: allergenIds,
      });
    })
    .then(() => Promise.all([
      loadCatalog(),
      getProducts({ mine: true }),
    ]))
    .then(([, myProds]) => {
      state.producerProducts = (myProds || []).map(apiProductToUI);
      showToast('Product listed successfully.', 'success');
      state.producerDashTab = 'products';
      renderProducerDash();
      document.getElementById('prod-name').value = '';
      document.getElementById('prod-category').value = '';
      document.getElementById('prod-desc').value = '';
      document.getElementById('prod-price').value = '';
      document.getElementById('prod-stock').value = '';
      const imgEl = document.getElementById('prod-image-url');
      if (imgEl) imgEl.value = '';
      document.getElementById('prod-unit').value = 'each';
      document.getElementById('prod-harvest').value = '';
      document.getElementById('prod-organic').value = 'false';
      document.querySelectorAll('input[name="allergen"]:checked').forEach(cb => cb.checked = false);
    })
    .catch(err => {
      showToast(apiErrorMessage(err, 'Could not add product. Check the backend and try again.'), 'error');
      const fieldErrors = typeof getFieldErrors === 'function' && err.body ? getFieldErrors(err.body) : {};
      const map = { name: 'prod-name', category: 'prod-category', price: 'prod-price', stock_quantity: 'prod-stock', description: 'prod-desc' };
      Object.keys(fieldErrors).forEach(f => {
        const id = map[f];
        if (id) showFieldError(id, fieldErrors[f]);
      });
    });
}

// ---- Sprint 2: Orders / Settlements / Reorder Wiring ----

function handleEditProduct(productId) {
  const product = (state.producerProducts || []).find(p => p.id === Number(productId));
  if (!product) {
    showToast('Product not found.', 'error');
    return;
  }

  const stockInput = window.prompt('Enter new stock quantity (0 or more):', String(product.stock ?? 0));
  if (stockInput === null) return;
  const nextStock = parseInt(stockInput, 10);
  if (!Number.isFinite(nextStock) || nextStock < 0) {
    showToast('Stock quantity must be 0 or more.', 'error');
    return;
  }

  const availabilityInput = window.prompt(
    'Availability (In Season | Out of Season | Pre-Order):',
    String(product.availability ?? 'In Season')
  );
  if (availabilityInput === null) return;

  const uiToRaw = {
    'In Season': 'in_season',
    'Out of Season': 'out_of_season',
    'Pre-Order': 'pre_order',
    // allow raw backend values too
    in_season: 'in_season',
    out_of_season: 'out_of_season',
    pre_order: 'pre_order',
  };
  const chosenAvailability = uiToRaw[String(availabilityInput).trim()];
  if (!chosenAvailability) {
    showToast('Invalid availability. Use In Season, Out of Season, or Pre-Order.', 'error');
    return;
  }

  const ok = window.confirm(
    'Update product inventory?\n\n' +
    `Stock: ${nextStock}\n` +
    `Availability: ${availabilityInput}`
  );
  if (!ok) return;

  updateProductInventory(productId, { stock_quantity: nextStock, availability: chosenAvailability })
    .then(() => getProducts({ mine: true }))
    .then((prods) => {
      state.producerProducts = (prods || []).map(apiProductToUI);
      renderProducerDash();
      showToast('Product updated successfully.', 'success');
    })
    .catch((err) => showToast(apiErrorMessage(err, 'Could not update product.'), 'error'));
}

async function refreshProducerOrders() {
  if (state.producerOrdersLoading) return;
  state.producerOrdersLoading = true;
  state.producerOrders = null; // triggers loading state in renderProducerDash

  try {
    const data = await getProducerOrders();
    const orders = Array.isArray(data) ? data : (data && (data.orders || data.results)) ? (data.orders || data.results) : [];
    state.producerOrders = Array.isArray(orders) ? orders : [];
  } catch (err) {
    state.producerOrders = [];
    showToast(apiErrorMessage(err, 'Could not load producer orders.'), 'error');
  } finally {
    state.producerOrdersLoading = false;
    renderProducerDash();
  }
}

function renderSettlementsReport(report) {
  const summary = report || {};
  const formatMoney = (v) => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    const safe = Number.isFinite(n) ? n : 0;
    return '£' + safe.toFixed(2);
  };

  const elOrders = document.getElementById('pdash-settlement-orders');
  const elComm = document.getElementById('pdash-settlement-commission');
  const elPayout = document.getElementById('pdash-settlement-your-payment');
  if (elOrders) elOrders.textContent = String(summary.total_orders ?? summary.orders_count ?? 0);
  if (elComm) elComm.textContent = formatMoney(summary.commission ?? summary.total_commission ?? 0);
  if (elPayout) elPayout.textContent = formatMoney(summary.net_payout ?? summary.total_payout ?? summary.your_payment ?? 0);

  const tbody = document.getElementById('pdash-settlements-tbody');
  if (!tbody) return;

  const lines = Array.isArray(summary.orders) ? summary.orders : [];
  if (lines.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);font-size:14px">
          No settlements yet. When customers place real orders (Sprint 2), their payouts will be summarised here.
        </td>
      </tr>`;
    return;
  }

  const toItemsCount = (line) => line.items_sold ?? line.items_count ?? line.items ?? '—';
  const toInvoice = (line) => line.invoice_number ?? line.order_id ?? line.id ?? '—';
  const toCustomer = (line) => line.customer_name ?? '—';
  const toDelivery = (line) => line.delivery_date ?? '—';
  const toSubtotal = (line) => line.subtotal ?? 0;
  const toCommission = (line) => line.commission ?? 0;
  const toPayout = (line) => line.producer_payout ?? 0;

  tbody.innerHTML = lines.map(line => `
    <tr>
      <td>${toInvoice(line)}</td>
      <td style="font-size:12px">${toCustomer(line)}</td>
      <td style="font-size:12px">${toDelivery(line)}</td>
      <td style="font-size:12px">${toItemsCount(line)}</td>
      <td style="font-weight:700">${formatMoney(toSubtotal(line) + (line.delivery_fee ?? 0))}</td>
      <td style="font-weight:700; color: var(--gold)">${formatMoney(toCommission(line))}</td>
      <td style="font-weight:700; color: var(--forest-mid)">${formatMoney(toPayout(line))}</td>
    </tr>
  `).join('');
}

async function refreshProducerSettlements() {
  if (state.producerSettlementLoading) return;
  state.producerSettlementLoading = true;

  try {
    const report = await getSettlementReport();
    state.producerSettlementReport = report;
    renderSettlementsReport(report);
  } catch (err) {
    showToast(apiErrorMessage(err, 'Could not load settlement report.'), 'error');
    state.producerSettlementReport = null;
  } finally {
    state.producerSettlementLoading = false;
  }
}

function handleUpdateOrderStatus(orderId, nextStatus) {
  if (orderId == null || nextStatus == null) {
    showToast('Invalid order status update.', 'error');
    return;
  }
  const ok = window.confirm(`Update order status to "${nextStatus}"?`);
  if (!ok) return;

  updateOrderStatus(orderId, { status: String(nextStatus).toLowerCase() })
    .then(() => {
      showToast('Order status updated.', 'success');
      refreshProducerOrders();
      // Only customers can view order history; producers should not trigger that refresh.
      if (state.currentUser && state.currentUser.role === 'customer') {
        refreshCustomerOrders();
      }
    })
    .catch((err) => showToast(apiErrorMessage(err, 'Could not update order status.'), 'error'));
}

async function handleReorder(orderId) {
  if (orderId == null) return;
  try {
    showToast('Reordering from history…', '');
    await reorderFromHistory(orderId);
    const cart = await getCart();
    setCartFromApiResponse(cart);
    navigate('cart');
    showToast('Reorder complete.', 'success');
  } catch (err) {
    const msg = err && err.message ? err.message : '';
    if (msg.toLowerCase().includes('stock') || msg.toLowerCase().includes('insufficient') || (err.body && JSON.stringify(err.body).toLowerCase().includes('stock'))) {
      showToast('Some items could not be re-added — product is out of stock.', 'error');
    } else {
      showToast(apiErrorMessage(err, 'Could not reorder.'), 'error');
    }
    // Still navigate to cart so user sees what was added
    const cart = await getCart().catch(() => null);
    if (cart) { setCartFromApiResponse(cart); navigate('cart'); }
  }
}

async function handleDownloadSettlementCSV() {
  try {
    await downloadSettlementReport();
    showToast('Settlement CSV download started.', 'success');
  } catch (err) {
    showToast(apiErrorMessage(err, 'Could not download settlement CSV.'), 'error');
  }
}

async function refreshCustomerOrders() {
  if (state.customerOrdersLoading) return;
  state.customerOrdersLoading = true;
  state.customerOrders = null;

  try {
    const data = await getCustomerOrderHistory();
    const orders = Array.isArray(data) ? data : (data && (data.orders || data.results)) ? (data.orders || data.results) : [];
    state.customerOrders = Array.isArray(orders) ? orders : [];
    // TC-014: attach dispute info to any order eligible to have one
    await Promise.all(state.customerOrders.map(async (o) => {
      const status = String(o.status || '').toLowerCase();
      if (status === 'pending' || status === 'cancelled') { o.dispute = null; return; }
      try {
        const res = await fetch('/api/orders/' + o.id + '/dispute/', { credentials: 'include' });
        if (res.ok) {
          o.dispute = await res.json();
        } else {
          o.dispute = null;
        }
      } catch (e) {
        o.dispute = null;
      }
    }));
  } catch (err) {
    state.customerOrders = [];
    showToast(apiErrorMessage(err, 'Could not load your order history.'), 'error');
  } finally {
    state.customerOrdersLoading = false;
    renderCustomerDash();
  }
}

function setProducerOrderFilter(f) {
  state.producerOrderFilter = f;
  renderProducerDash();
}

function setProducerTab(tab) {
  state.producerDashTab = tab;
  renderProducerDash();
  if (tab === 'orders' || tab === 'overview') refreshProducerOrders();
  if (tab === 'payments') refreshProducerSettlements();
  if (tab === 'reviews') renderProducerReviewsTab();
  if (tab === 'analytics') renderProducerAnalyticsTab();
}

// ---- CUSTOMER DASHBOARD ----
// Customer orders: from API when available (Sprint 2); no mock data for new accounts
const CUSTOMER_ORDERS = []; // legacy placeholder (no longer used)

function renderCustomerDash() {
  document.querySelectorAll('#customer-sidebar li').forEach(li => li.classList.toggle('active', li.dataset.tab === state.customerDashTab));
  document.querySelectorAll('#customer-dash-content .dashboard-section').forEach(s => s.classList.toggle('active', s.id === `cdash-${state.customerDashTab}`));

  // Show logged-in user name and email (sidebar + profile form)
  if (state.currentUser) {
    const nameEl = document.getElementById('cdash-user-name');
    if (nameEl) nameEl.textContent = state.currentUser.name;
    const avatarEl = document.getElementById('cdash-avatar');
    if (avatarEl) avatarEl.textContent = state.currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) || '?';
    const nameInput = document.getElementById('cdash-profile-name');
    if (nameInput) nameInput.value = state.currentUser.name;
    const emailInput = document.getElementById('cdash-profile-email');
    if (emailInput) emailInput.value = state.currentUser.email;
    const phoneInput = document.getElementById('cdash-profile-phone');
    if (phoneInput) phoneInput.value = state.currentUser.phone || '';
    const addressInput = document.getElementById('cdash-profile-address');
    if (addressInput) addressInput.value = state.currentUser.deliveryAddress || '';
    const postcodeInput = document.getElementById('cdash-profile-postcode');
    if (postcodeInput) postcodeInput.value = state.currentUser.postcode || '';
  }

  const ordTable = document.getElementById('cdash-orders-table');
  if (!ordTable) return;

  const loadingRow = `
    <tr>
      <td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);font-size:15px">
        Loading your orders…
      </td>
    </tr>`;
  const emptyRow = "<tr><td colspan=\"5\" style=\"text-align:center;padding:32px;color:var(--text-muted);font-size:15px\">You have not placed any orders yet. When you checkout, your orders will appear here.</td></tr>";

  if (state.customerOrders === null) {
    ordTable.innerHTML = loadingRow;
    if (!state.customerOrdersLoading) refreshCustomerOrders();
    return;
  }

  if (!Array.isArray(state.customerOrders) || state.customerOrders.length === 0) {
    ordTable.innerHTML = emptyRow;
    return;
  }

  // Render status filter pills
  const allCustOrders = state.customerOrders || [];
  const custFilterStatuses = ['all', 'pending', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled', 'rejected'];
  const custFilterEl = document.getElementById('cdash-order-filters');
  if (custFilterEl) {
    custFilterEl.innerHTML = `<div class="order-filter-bar">${custFilterStatuses.map(s => {
      const label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
      const count = s === 'all' ? allCustOrders.length : allCustOrders.filter(o => (o.status || '').toLowerCase() === s).length;
      if (s !== 'all' && count === 0) return '';
      const active = state.customerOrderFilter === s ? ' active' : '';
      return `<button class="order-filter-pill${active}" onclick="setCustomerOrderFilter('${s}')">${label} <span class="order-filter-count">${count}</span></button>`;
    }).filter(Boolean).join('')}</div>`;
  }

  const filteredCustOrders = state.customerOrderFilter === 'all'
    ? allCustOrders
    : allCustOrders.filter(o => (o.status || '').toLowerCase() === state.customerOrderFilter);

  if (filteredCustOrders.length === 0 && allCustOrders.length > 0) {
    ordTable.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);font-size:15px">No orders match this filter.</td></tr>';
    return;
  }

  const formatMoney = (v) => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    const safe = Number.isFinite(n) ? n : 0;
    return '£' + safe.toFixed(2);
  };

  const toOrderId = (o) => o.invoice_number ?? o.id ?? '—';
  const toDate = (o) => {
    const raw = o.created_at ?? o.order_date ?? '';
    if (!raw) return '—';
    try { return new Date(raw).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch(e) { return String(raw).substring(0, 10); }
  };
  const toTotal = (o) => o.total_amount ?? o.total ?? 0;

  const groupDetail = (o) => {
    const groups = Array.isArray(o.producer_groups) ? o.producer_groups : [];
    if (groups.length === 0) return '<em style="color:var(--text-muted)">No items</em>';
    return groups.map(g => {
      const name = g.producer_info?.business_name || g.producer_info?.email || 'Producer';
      const gStatus = g.status || o.status || 'pending';
      const items = Array.isArray(g.items) ? g.items : [];
      const itemsHtml = items.map(i =>
        `<div class="order-item-row">
          <span class="order-item-qty">${i.quantity}×</span>
          <span class="order-item-name">${i.product_name_at_time_of_order || 'Product'}</span>
          <span class="order-item-total">£${Number(i.item_total || 0).toFixed(2)}</span>
        </div>`
      ).join('');
      return `<div class="customer-order-group">
        <div class="customer-order-group-header">
          <span class="customer-order-group-name">${name}</span>
          <span class="status-pill status-${gStatus.toLowerCase()}">${gStatus}</span>
        </div>
        <div class="order-items-list">${itemsHtml}</div>
      </div>`;
    }).join('');
  };

  const disputeBadge = (o) => {
    if (!o || !o.dispute) return '';
    const status = String(o.dispute.status || '').toLowerCase();
    const labels = { open: 'Dispute Open', under_review: 'Dispute Under Review', resolved: 'Dispute Resolved', closed: 'Dispute Closed' };
    const colours = { open: '#b91c1c', under_review: '#b45309', resolved: '#15803d', closed: '#4b5563' };
    const label = labels[status] || ('Dispute: ' + status);
    const bg = colours[status] || '#4b5563';
    return `<div style="margin-top:6px"><span class="status-pill" style="background:${bg};color:#fff;padding:3px 8px;font-size:11px;border-radius:4px;font-weight:600">${label}</span></div>`;
  };

  const orderActions = (o) => {
    const btns = [];
    btns.push(`<button class="btn btn-secondary btn-sm" onclick="handleViewReceipt(${o.id})">Receipt</button>`);
    if (o.can_cancel) {
      btns.push(`<button class="btn btn-reject btn-sm" onclick="handleCancelOrder(${o.id})">Cancel</button>`);
    }
    btns.push(`<button class="btn btn-secondary btn-sm" onclick="handleReorder(${o.id})">Reorder</button>`);
    const disputeStatus = o.dispute && String(o.dispute.status || '').toLowerCase();
    if ((o.status || "").toLowerCase() === "delivered" && (!disputeStatus || disputeStatus === 'closed')) {
      btns.push(`<button class="btn btn-warning btn-sm" onclick="handleRaiseDispute(${o.id})">Raise Dispute</button>`);
    }
    return `<div style="display:flex;flex-direction:column;gap:4px">${btns.join('')}${disputeBadge(o)}</div>`;
  };

  ordTable.innerHTML = filteredCustOrders.map(o => `
    <tr>
      <td style="font-weight:600">${toOrderId(o)}</td>
      <td style="font-size:12px">${toDate(o)}</td>
      <td>${groupDetail(o)}</td>
      <td style="font-weight:700">${formatMoney(toTotal(o))}</td>
      <td>${orderActions(o)}</td>
    </tr>`).join('');
}

async function handleViewReceipt(orderId) {
  if (orderId == null) return;
  try {
    const order = await getOrder(orderId);
    state.lastConfirmedOrder = order;
    navigate('order-confirm');
  } catch (err) {
    showToast(apiErrorMessage(err, 'Could not load receipt.'), 'error');
  }
}

async function handleCancelOrder(orderId) {
  if (orderId == null) return;
  const ok = window.confirm('Are you sure you want to cancel this order?');
  if (!ok) return;
  try {
    await cancelOrder(orderId);
    showToast('Order cancelled.', 'success');
    refreshCustomerOrders();
  } catch (err) {
    showToast(apiErrorMessage(err, 'Could not cancel order.'), 'error');
  }
}

function handleUpdateProfile() {
  const data = {
    full_name: (document.getElementById('cdash-profile-name')?.value || '').trim(),
    phone_number: (document.getElementById('cdash-profile-phone')?.value || '').trim(),
    delivery_address: (document.getElementById('cdash-profile-address')?.value || '').trim(),
    postcode: (document.getElementById('cdash-profile-postcode')?.value || '').trim(),
  };
  if (!data.full_name) { showToast('Full name is required.', 'error'); return; }
  updateProfile(data)
    .then(profile => {
      state.currentUser = profileToUser(profile);
      renderAuthNavbar();
      renderCustomerDash();
      showToast('Profile updated!', 'success');
    })
    .catch(err => showToast(apiErrorMessage(err, 'Could not update profile.'), 'error'));
}

function setCustomerOrderFilter(f) {
  state.customerOrderFilter = f;
  renderCustomerDash();
}

function setCustomerTab(tab) {
  state.customerDashTab = tab;
  renderCustomerDash();
  if (tab === 'orders') refreshCustomerOrders();
  if (tab === 'notifications') renderCustomerNotificationsTab();
}

// ---- ORDER CONFIRMATION PAGE ----
function renderOrderConfirmation(order) {
  const el = document.getElementById('order-confirm-content');
  if (!el) return;
  if (!order) {
    el.innerHTML = '<div style="text-align:center;padding:60px 0"><h2>No order to display</h2><button class="btn btn-primary" onclick="navigate(\'browse\')">Continue Shopping</button></div>';
    return;
  }

  const fm = (v) => { const n = typeof v === 'string' ? parseFloat(v) : Number(v); return Number.isFinite(n) ? n.toFixed(2) : '0.00'; };
  const fulfilmentLabel = { standard: 'Standard Delivery (3-5 days)', express: 'Express Delivery (1-2 days)', pickup: 'Pickup from producer' };

  const groups = Array.isArray(order.producer_groups) ? order.producer_groups : [];
  const productsSubtotal = groups.reduce((s, g) => s + parseFloat(g.subtotal || 0), 0);
  const totalDelivery = groups.reduce((s, g) => s + parseFloat(g.delivery_fee || 0), 0);
  const commission = productsSubtotal * 0.05;

  const groupsHTML = groups.map(g => {
    const biz = g.producer_info?.business_name || 'Producer';
    const items = Array.isArray(g.items) ? g.items : [];
    const itemsHTML = items.map(i => `
      <div class="confirm-item">
        <span class="confirm-item-qty">${i.quantity}x</span>
        <span class="confirm-item-name">${i.product_name_at_time_of_order || 'Product'}</span>
        <span class="confirm-item-unit">@ £${fm(i.price_at_time_of_order)}/${i.unit_at_time_of_order || 'unit'}</span>
        <span class="confirm-item-total">£${fm(i.item_total)}</span>
      </div>
    `).join('');

    return `
      <div class="confirm-group">
        <div class="confirm-group-header">
          <strong>${biz}</strong>
          <span class="status-pill status-${(g.status || 'pending').toLowerCase()}">${g.status || 'pending'}</span>
        </div>
        <div class="confirm-group-meta">
          <span>${fulfilmentLabel[g.fulfilment_type] || g.fulfilment_type}</span>
          <span>Delivery: ${g.delivery_date || order.delivery_date || '-'}</span>
          <span>Fee: £${fm(g.delivery_fee)}</span>
        </div>
        <div class="confirm-items">${itemsHTML}</div>
        <div class="confirm-group-subtotal">Subtotal: £${fm(g.subtotal)}</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="confirm-page">
      <div class="confirm-header">
        <div class="confirm-check">&#10003;</div>
        <h1>Order Confirmed!</h1>
        <p class="confirm-invoice">${order.invoice_number || 'Order #' + order.id}</p>
        <p class="confirm-msg">Your order is being processed. You will see status updates in your dashboard as each producer prepares your items.</p>
      </div>

      <div class="confirm-sections">
        <div class="confirm-card">
          <h3>Items Ordered</h3>
          ${groupsHTML}
        </div>

        <div class="confirm-card">
          <h3>Delivery Details</h3>
          <p style="margin:0;font-size:14px;color:var(--charcoal)">${order.delivery_address || '-'}, ${order.delivery_postcode || ''}</p>
        </div>

        <div class="confirm-card">
          <h3>Payment Summary</h3>
          <div class="confirm-summary-row"><span>Products subtotal</span><span>£${fm(productsSubtotal)}</span></div>
          <div class="confirm-summary-row"><span>Delivery fees</span><span>£${fm(totalDelivery)}</span></div>
          <div class="confirm-summary-row confirm-total"><span>Total paid</span><span>£${fm(order.total_amount)}</span></div>
          <p class="confirm-commission">A 5% network commission (£${fm(commission)}) supports the Bristol Regional Food Network. Producers receive 95% of every sale.</p>
        </div>
      </div>

      <div class="confirm-actions">
        <button class="btn btn-primary" onclick="navigate('customer-dash')">View My Orders</button>
        <button class="btn btn-secondary" onclick="navigate('browse')">Continue Shopping</button>
      </div>
    </div>`;
}

// ---- Admin Commission Report (TC-025) ----
function renderAdminDash() {
  const nameEl = document.getElementById('adash-user-name');
  if (nameEl && state.currentUser) nameEl.textContent = state.currentUser.name;
}

async function handleLoadCommissionReport() {
  const from = document.getElementById('adash-from-date')?.value;
  const to = document.getElementById('adash-to-date')?.value;
  try {
    const report = await getCommissionReport({ from, to });
    const tbody = document.getElementById('adash-commission-tbody');
    if (!tbody) return;

    const rows = Array.isArray(report?.orders) ? report.orders : [];
    tbody.innerHTML = rows.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);font-size:14px">No commission rows found for this date range.</td></tr>`
      : rows.map(r => `
          <tr>
            <td style="font-weight:600">${r.invoice_number ?? '—'}</td>
            <td style="font-size:12px">${r.producer_business ?? r.producer_email ?? '—'}</td>
            <td style="font-size:12px">${r.processed_at ?? '—'}</td>
            <td style="font-weight:700">${formatMoney(r.subtotal)}</td>
            <td style="font-weight:700; color: var(--gold)">${formatMoney(r.commission)}</td>
            <td style="font-weight:700; color: var(--forest-mid)">${formatMoney(r.producer_payout)}</td>
          </tr>
        `).join('');
  } catch (err) {
    showToast(apiErrorMessage(err, 'Could not load commission report.'), 'error');
  }
}

async function handleExportCommissionCSV() {
  const from = document.getElementById('adash-from-date')?.value;
  const to = document.getElementById('adash-to-date')?.value;
  try {
    await exportCommissionCSV({ from, to });
    showToast('Commission CSV download started.', 'success');
  } catch (err) {
    showToast(apiErrorMessage(err, 'Could not export commission CSV.'), 'error');
  }
}

function formatMoney(v) {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  const safe = Number.isFinite(n) ? n : 0;
  return '£' + safe.toFixed(2);
}

// ---- INIT ----
function loadCatalog() {
  return Promise.all([getCategories(), getProducts()])
    .then(([cats, prods]) => {
      state.products = (prods || []).map(apiProductToUI);
      state.categories = buildCategoriesForUI(cats || [], state.products);
      if (state.currentPage === 'browse') renderBrowse();
      const grid = document.getElementById('home-featured-grid');
      if (grid) grid.innerHTML = state.products.slice(0, 4).map(productCardHTML).join('');
    })
    .catch(() => {
      state.products = [];
      state.categories = buildCategoriesForUI([], []);
      showToast('Could not load products. Check backend is running.', 'error');
    });
}

function initAuthAndCart() {
  get('/api/auth/csrf/').catch(() => {});
  getProfile()
    .then(profile => {
      state.currentUser = profileToUser(profile);
      renderAuthNavbar();
      if (state.currentUser.role === 'customer') {
        return getCart().then(setCartFromApiResponse);
      } else if (state.currentUser.role === 'producer') {
        return getProducts({ mine: true }).then(prods => {
          state.producerProducts = (prods || []).map(apiProductToUI);
        });
      }
    })
    .catch(() => { state.currentUser = null; renderAuthNavbar(); })
    .finally(() => updateCartUI());
}

// ---- BROWSE SEARCH (Sprint 2: server-backed + debounced) ----
let browseSearchDebounceTimer = null;
async function loadBrowseProductsForSearch(query) {
  const q = (query || '').toString().trim();

  // Reload full catalog when search is cleared (keeps category grid/category counts in sync).
  if (!q) {
    await loadCatalog();
    renderBrowse();
    return;
  }

  // Category is numeric in the generated browse grid; ignore non-numeric values (home page uses strings).
  const catCandidate = state.currentCategory;
  const categoryId = catCandidate !== 'all' ? parseInt(catCandidate, 10) : NaN;

  const params = { search: q };
  if (!Number.isNaN(categoryId)) params.category = categoryId;

  const prods = await getProducts(params);
  state.products = (prods || []).map(apiProductToUI);
  renderBrowse();
}

document.addEventListener('DOMContentLoaded', () => {
  renderAuthNavbar();
  navigate('home');
  loadCatalog();
  initAuthAndCart();

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const next = e.target.value;
      state.searchQuery = next;
      if (state.currentPage !== 'browse') return;

      if (browseSearchDebounceTimer) clearTimeout(browseSearchDebounceTimer);
      browseSearchDebounceTimer = setTimeout(() => {
        loadBrowseProductsForSearch(next)
          .catch(() => showToast('Could not search products. Check backend and try again.', 'error'));
      }, 300);
    });
  }
  const pwInput = document.getElementById('reg-password');
  if (pwInput) pwInput.addEventListener('input', () => checkPasswordStrength(pwInput.value));
});

// ============================================================
// SPRINT 3 — NEW FUNCTIONS
// ============================================================

// ---- REVIEWS (TC-023) ----
function renderStars(rating) {
  const full = Math.round(rating);
  return [1,2,3,4,5].map(i =>
    '<span class="star ' + (i <= full ? 'star-filled' : 'star-empty') + '">&#9733;</span>'
  ).join('');
}

function renderReviewsSection(productId) {
  const cached = state.reviewsData[productId];
  const reviews = cached ? (cached.reviews || []) : [];
  const avg = cached ? (cached.average_rating || 0) : 0;
  const total = cached ? (cached.total_reviews || reviews.length) : 0;

  const breakdown = [5,4,3,2,1].map(function(star) {
    const count = reviews.filter(function(r) { return r.rating === star; }).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return '<div class="star-breakdown-row">' +
      '<span class="star-breakdown-label">' + star + '&#9733;</span>' +
      '<div class="star-breakdown-bar"><div class="star-breakdown-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="star-breakdown-count">' + count + '</span>' +
      '</div>';
  }).join('');

  const reviewsList = reviews.length === 0
    ? '<p class="no-reviews-msg">No reviews yet. Be the first to review this product!</p>'
    : reviews.map(function(r) {
        return '<div class="review-card">' +
          '<div class="review-header">' +
          '<span class="review-author">' + (r.customer_name || 'Customer') + '</span>' +
          '<span class="review-stars">' + renderStars(r.rating) + '</span>' +
          '<span class="review-date">' + (r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '') + '</span>' +
          '</div>' +
          (r.comment ? '<p class="review-comment">' + r.comment + '</p>' : '') +
          (r.producer_response ? '<div class="producer-response"><span class="producer-response-label">Producer replied:</span><p class="producer-response-text">' + r.producer_response + '</p></div>' : '') +
          '</div>';
      }).join('');

  let reviewForm = '';
  if (state.currentUser && state.currentUser.role === 'customer') {
    const rating = state.reviewDraft ? (state.reviewDraft.rating || 0) : 0;
    const stars = [1,2,3,4,5].map(function(i) {
      return '<span class="star star-input ' + (i <= rating ? 'star-filled' : 'star-empty') + '" onclick="setReviewStar(' + productId + ', ' + i + ')">&#9733;</span>';
    }).join('');
    reviewForm = '<div class="review-form-wrap">' +
      '<h4>Write a Review</h4>' +
      '<p class="review-eligibility-note">Only available after a delivered order for this product.</p>' +
      '<div class="star-rating-input" id="star-input-' + productId + '">' + stars +
      '<span class="star-hint" id="star-hint-' + productId + '">' + (rating ? rating + ' star' + (rating > 1 ? 's' : '') : 'Click to rate') + '</span></div>' +
      '<textarea id="review-comment-' + productId + '" class="review-textarea" placeholder="Share your experience (optional)..." rows="3"></textarea>' +
      '<button class="btn btn-primary review-submit-btn" onclick="handleSubmitReview(' + productId + ')">Submit Review</button>' +
      '</div>';
  } else if (!state.currentUser) {
    reviewForm = '<p class="review-eligibility"><a onclick="navigate(\'login\')" style="cursor:pointer;color:var(--forest-mid);font-weight:600">Log in</a> to leave a review after purchasing this product.</p>';
  }

  return '<div class="reviews-section" id="reviews-section-' + productId + '">' +
    '<div class="reviews-header">' +
    '<h3>Customer Reviews</h3>' +
    (total > 0 ? '<span class="reviews-avg">' + renderStars(avg) + ' <strong>' + Number(avg).toFixed(1) + '</strong> <span class="reviews-count">(' + total + ' review' + (total !== 1 ? 's' : '') + ')</span></span>' : '') +
    '</div>' +
    (total > 0 ? '<div class="star-breakdown">' + breakdown + '</div>' : '') +
    '<div class="reviews-list">' + reviewsList + '</div>' +
    reviewForm +
    '</div>';
}

function setReviewStar(productId, rating) {
  if (!state.reviewDraft) state.reviewDraft = {};
  state.reviewDraft.rating = rating;
  const container = document.getElementById('star-input-' + productId);
  if (container) {
    container.querySelectorAll('.star-input').forEach(function(s, i) {
      s.classList.toggle('star-filled', i < rating);
      s.classList.toggle('star-empty', i >= rating);
    });
    const hint = document.getElementById('star-hint-' + productId);
    if (hint) hint.textContent = rating + ' star' + (rating > 1 ? 's' : '');
  }
}

async function handleSubmitReview(productId) {
  if (!state.currentUser || state.currentUser.role !== 'customer') {
    showToast('You must be logged in as a customer to review products.', 'error');
    return;
  }
  const rating = state.reviewDraft && state.reviewDraft.rating;
  if (!rating) { showToast('Please select a star rating.', 'error'); return; }
  const commentEl = document.getElementById('review-comment-' + productId);
  const comment = commentEl ? commentEl.value.trim() : '';
  const deliveredOrders = (state.customerOrders || []).filter(function(o) {
    return (o.status || '').toLowerCase() === 'delivered';
  });
  if (deliveredOrders.length === 0) {
    showToast('You can only review products from delivered orders.', 'error');
    return;
  }
  try {
    const csrfEl = document.cookie.split(';').find(function(c) { return c.trim().startsWith('csrftoken='); });
    const csrf = csrfEl ? csrfEl.split('=')[1] : '';
    const res = await fetch('/api/products/' + productId + '/reviews/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      credentials: 'include',
      body: JSON.stringify({ rating: rating, comment: comment, order: deliveredOrders[0].id })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Could not submit review.');
    }
    showToast('Review submitted! Thank you.', 'success');
    state.reviewDraft = {};
    await loadProductReviews(productId);
    const sec = document.getElementById('reviews-section-' + productId);
    if (sec) sec.outerHTML = renderReviewsSection(productId);
  } catch(err) {
    showToast(apiErrorMessage(err, 'Could not submit review.'), 'error');
  }
}

async function loadProductReviews(productId) {
  try {
    const res = await fetch('/api/products/' + productId + '/reviews/', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const reviews = data.results || data.reviews || (Array.isArray(data) ? data : []);
    state.reviewsData[productId] = {
      reviews: reviews,
      average_rating: data.average_rating || 0,
      total_reviews: data.total_reviews || reviews.length,
    };
  } catch(e) {
    state.reviewsData[productId] = { reviews: [], average_rating: 0, total_reviews: 0 };
  }
}

// ---- PRODUCER REVIEWS TAB (TC-024) ----
async function renderProducerReviewsTab() {
  const container = document.getElementById('pdash-reviews-content');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-muted);padding:24px 0">Loading reviews...</p>';
  try {
    const products = state.producerProducts || [];
    if (products.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:24px 0">No products listed yet.</p>';
      return;
    }
    let allReviews = [];
    for (let pi = 0; pi < products.length; pi++) {
      const p = products[pi];
      try {
        const res = await fetch('/api/products/' + p.id + '/reviews/', { credentials: 'include' });
        if (!res.ok) continue;
        const data = await res.json();
        const reviews = data.results || data.reviews || (Array.isArray(data) ? data : []);
        reviews.forEach(function(r) { r._productId = p.id; r._productName = p.name; });
        allReviews = allReviews.concat(reviews);
      } catch(e) {}
    }
    if (allReviews.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:24px 0;font-style:italic">No reviews yet. Reviews will appear here once customers have placed and received orders.</p>';
      return;
    }
    container.innerHTML = allReviews.map(function(r) {
      return '<div class="review-card" style="margin-bottom:16px">' +
        '<div class="review-card-product-label">' + r._productName + '</div>' +
        '<div class="review-header">' +
        '<span class="review-author">' + (r.customer_name || 'Customer') + '</span>' +
        '<span class="review-stars">' + renderStars(r.rating) + '</span>' +
        '<span class="review-date">' + (r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB') : '') + '</span>' +
        '</div>' +
        (r.comment ? '<p class="review-comment">' + r.comment + '</p>' : '') +
        (r.producer_response
          ? '<div class="producer-response"><span class="producer-response-label">Your response:</span><p class="producer-response-text">' + r.producer_response + '</p></div><button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="showProducerResponseForm(' + r._productId + ', ' + r.id + ')">Edit Response</button>'
          : '<button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="showProducerResponseForm(' + r._productId + ', ' + r.id + ')">Respond</button>'
        ) +
        '<div id="response-form-' + r.id + '" class="producer-response-form hidden"></div>' +
        '</div>';
    }).join('');
  } catch(err) {
    container.innerHTML = '<p style="color:var(--danger)">Could not load reviews. ' + apiErrorMessage(err, '') + '</p>';
  }
}

function showProducerResponseForm(productId, reviewId) {
  const formDiv = document.getElementById('response-form-' + reviewId);
  if (!formDiv) return;
  formDiv.classList.remove('hidden');
  formDiv.innerHTML = '<textarea id="response-text-' + reviewId + '" class="review-textarea" style="margin-top:12px" placeholder="Write your response..." rows="3"></textarea>' +
    '<div style="display:flex;gap:10px;margin-top:8px">' +
    '<button class="btn btn-primary btn-sm" onclick="submitProducerResponse(' + productId + ', ' + reviewId + ')">Submit Response</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'response-form-' + reviewId + '\').classList.add(\'hidden\')">Cancel</button>' +
    '</div>';
}

async function submitProducerResponse(productId, reviewId) {
  const textEl = document.getElementById('response-text-' + reviewId);
  const response = textEl ? textEl.value.trim() : '';
  if (!response) { showToast('Please enter a response.', 'error'); return; }
  try {
    const csrfEl = document.cookie.split(';').find(function(c) { return c.trim().startsWith('csrftoken='); });
    const csrf = csrfEl ? csrfEl.split('=')[1] : '';
    const res = await fetch('/api/products/' + productId + '/reviews/' + reviewId + '/respond/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      credentials: 'include',
      body: JSON.stringify({ producer_response: response })
    });
    if (!res.ok) throw new Error('Could not submit response.');
    showToast('Response submitted successfully!', 'success');
    renderProducerReviewsTab();
  } catch(err) {
    showToast(apiErrorMessage(err, 'Could not submit response.'), 'error');
  }
}

// ---- DISPUTES (TC-014) ----
var disputeOrderId = null;

function handleRaiseDispute(orderId) {
  const order = (state.customerOrders || []).find(function(o) { return o.id === orderId; });
  if (order && order.dispute && ['open', 'under_review', 'resolved'].indexOf(String(order.dispute.status || '').toLowerCase()) !== -1) {
    showToast('Dispute already raised - status: ' + order.dispute.status, '');
    return;
  }
  disputeOrderId = orderId;
  const reasonEl = document.getElementById('dispute-reason');
  const descEl = document.getElementById('dispute-description');
  if (reasonEl) reasonEl.value = '';
  if (descEl) descEl.value = '';
  const overlay = document.getElementById('dispute-overlay');
  if (overlay) { overlay.classList.remove('hidden'); overlay.style.display = 'flex'; }
}

function closeDisputeModal() {
  const overlay = document.getElementById('dispute-overlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.style.display = 'none'; }
  disputeOrderId = null;
}

async function submitDispute() {
  const reason = document.getElementById('dispute-reason') ? document.getElementById('dispute-reason').value : '';
  const descEl = document.getElementById('dispute-description');
  const description = descEl ? descEl.value.trim() : '';
  if (!reason) { showToast('Please select a reason.', 'error'); return; }
  if (!description) { showToast('Please provide a description.', 'error'); return; }
  if (!disputeOrderId) return;
  try {
    const csrfEl = document.cookie.split(';').find(function(c) { return c.trim().startsWith('csrftoken='); });
    const csrf = csrfEl ? csrfEl.split('=')[1] : '';
    const res = await fetch('/api/orders/' + disputeOrderId + '/dispute/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      credentials: 'include',
      body: JSON.stringify({ reason: reason, description: description })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Could not raise dispute.');
    }
    showToast('Dispute raised successfully. Our team will review it shortly.', 'success');
    closeDisputeModal();
    refreshCustomerOrders();
  } catch(err) {
    showToast(apiErrorMessage(err, 'Could not raise dispute.'), 'error');
  }
}

// ---- NOTIFICATIONS (TC-016) ----
async function handleSubscribeNotification(productId) {
  try {
    const csrfEl = document.cookie.split(';').find(function(c) { return c.trim().startsWith('csrftoken='); });
    const csrf = csrfEl ? csrfEl.split('=')[1] : '';
    const res = await fetch('/api/products/' + productId + '/notify/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Could not subscribe.');
    showToast('You will be notified when this product is back in season!', 'success');
    const btn = document.getElementById('notify-btn-' + productId);
    if (btn) {
      btn.textContent = 'Subscribed - Click to unsubscribe';
      btn.className = 'btn btn-notify-subscribed';
      btn.onclick = function() { handleUnsubscribeNotification(productId); };
    }
  } catch(err) {
    showToast(apiErrorMessage(err, 'Could not subscribe to notifications.'), 'error');
  }
}

async function handleUnsubscribeNotification(productId) {
  try {
    const csrfEl = document.cookie.split(';').find(function(c) { return c.trim().startsWith('csrftoken='); });
    const csrf = csrfEl ? csrfEl.split('=')[1] : '';
    const res = await fetch('/api/products/' + productId + '/notify/', {
      method: 'DELETE',
      headers: { 'X-CSRFToken': csrf },
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Could not unsubscribe.');
    showToast('Unsubscribed from notifications.', '');
    const btn = document.getElementById('notify-btn-' + productId);
    if (btn) {
      btn.textContent = 'Notify me when back in season';
      btn.className = 'btn btn-notify';
      btn.onclick = function() { handleSubscribeNotification(productId); };
    }
  } catch(err) {
    showToast(apiErrorMessage(err, 'Could not unsubscribe.'), 'error');
  }
}

async function renderCustomerNotificationsTab() {
  const container = document.getElementById('cdash-notifications-content');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-muted);padding:24px 0">Loading...</p>';
  try {
    const res = await fetch('/api/auth/notifications/', { credentials: 'include' });
    if (!res.ok) throw new Error('Could not load notifications.');
    const data = await res.json();
    const notifs = Array.isArray(data) ? data : (data.results || []);
    if (notifs.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-style:italic;padding:24px 0">No notifications yet. Subscribe to out-of-season products to get notified when they are back.</p>';
      return;
    }
    container.innerHTML = notifs.map(function(n) {
      return '<div class="notification-card ' + (n.notified ? 'notification-notified' : '') + '">' +
        (n.notified ? '<div class="notification-banner">Good news! <strong>' + n.product_name + '</strong> is now back in season! <a onclick="navigate(\'browse\')" style="cursor:pointer;color:var(--forest-mid);font-weight:600">Shop now</a></div>' : '') +
        '<div class="notification-row">' +
        '<div><div class="notification-product">' + n.product_name + '</div>' +
        '<div class="notification-status">' + (n.notified ? 'Back in season' : 'Waiting - out of season') + '</div></div>' +
        '<span class="notification-badge ' + (n.notified ? 'badge-notified' : 'badge-waiting') + '">' + (n.notified ? 'Notified' : 'Waiting') + '</span>' +
        '</div></div>';
    }).join('');
  } catch(err) {
    container.innerHTML = '<p style="color:var(--danger)">Could not load notifications. ' + apiErrorMessage(err, '') + '</p>';
  }
}

// ---- PRODUCER ANALYTICS (TC-017) ----
async function renderProducerAnalyticsTab() {
  const container = document.getElementById('pdash-analytics-content');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-muted);padding:24px 0">Loading analytics...</p>';
  try {
    const res = await fetch('/api/producer/analytics/', { credentials: 'include' });
    if (!res.ok) throw new Error('Could not load analytics.');
    const data = await res.json();
    const fm = function(v) { return '£' + Number(v || 0).toFixed(2); };
    const topProducts = Array.isArray(data.top_products) ? data.top_products : [];
    const weeklyRevenue = Array.isArray(data.weekly_revenue) ? data.weekly_revenue : [];
    const maxRev = weeklyRevenue.length > 0 ? Math.max.apply(null, weeklyRevenue.map(function(w) { return Number(w.revenue || 0); }).concat([1])) : 1;
    const chartBars = weeklyRevenue.map(function(w) {
      const pct = Math.round((Number(w.revenue || 0) / maxRev) * 100);
      return '<div class="analytics-bar-wrap">' +
        '<div class="analytics-bar-label">' + fm(w.revenue) + '</div>' +
        '<div class="analytics-bar-outer"><div class="analytics-bar-inner" style="height:' + pct + '%"></div></div>' +
        '<div class="analytics-bar-week">' + (w.week || '') + '</div></div>';
    }).join('');
    const topTable = topProducts.length === 0
      ? '<p style="color:var(--text-muted);font-style:italic">No delivered orders yet.</p>'
      : '<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;border-bottom:2px solid var(--cream-dark)"><th style="padding:8px">Product</th><th style="padding:8px">Units Sold</th><th style="padding:8px">Revenue</th></tr></thead><tbody>' +
        topProducts.map(function(p) {
          return '<tr style="border-bottom:1px solid var(--cream-dark)"><td style="padding:10px;font-weight:600">' + (p.name || p.product_name || '-') + '</td><td style="padding:10px">' + (p.units_sold || 0) + '</td><td style="padding:10px;font-weight:700;color:var(--forest-mid)">' + fm(p.revenue) + '</td></tr>';
        }).join('') + '</tbody></table>';
    container.innerHTML =
      '<div class="analytics-stats">' +
      '<div class="stat-card"><div class="label">TOTAL REVENUE</div><div class="value" style="color:var(--forest-mid)">' + fm(data.total_revenue) + '</div><div class="change">Lifetime delivered orders</div></div>' +
      '<div class="stat-card"><div class="label">TOTAL ORDERS</div><div class="value">' + (data.total_orders || 0) + '</div><div class="change">Delivered orders</div></div>' +
      '<div class="stat-card"><div class="label">AVG ORDER VALUE</div><div class="value">' + fm(data.average_order_value) + '</div><div class="change">Per delivered order</div></div>' +
      '<div class="stat-card"><div class="label">COMMISSION PAID</div><div class="value" style="color:var(--gold)">' + fm(data.total_commission_paid) + '</div><div class="change">5% to BRFN network</div></div>' +
      '</div>' +
      (weeklyRevenue.length > 0 ? '<div class="analytics-chart-wrap"><h4>Weekly Revenue - Last 8 Weeks</h4><div class="analytics-chart">' + chartBars + '</div></div>' : '') +
      '<div style="margin-top:32px"><h4 style="margin-bottom:16px">Top 5 Products by Revenue</h4>' + topTable + '</div>';
  } catch(err) {
    container.innerHTML = '<p style="color:var(--danger)">Could not load analytics. ' + apiErrorMessage(err, '') + '</p>';
  }
}

// ---- ADMIN REVENUE & DISPUTES (TC-018, TC-014 admin) ----
function showAdminTab(tab) {
  document.querySelectorAll('#admin-dash-content .dashboard-section').forEach(function(s) {
    s.classList.toggle('active', s.id === 'adash-' + tab);
  });
  const navItems = document.querySelectorAll('.page#page-admin-dash .sidebar-nav li');
  const tabs = ['commission', 'revenue', 'disputes'];
  navItems.forEach(function(li, i) { li.classList.toggle('active', tabs[i] === tab); });
  if (tab === 'revenue') handleLoadRevenueReport();
  if (tab === 'disputes') renderAdminDisputes();
}

async function handleLoadRevenueReport() {
  const fromEl = document.getElementById('adash-revenue-from');
  const toEl = document.getElementById('adash-revenue-to');
  const from = fromEl ? fromEl.value : '';
  const to = toEl ? toEl.value : '';
  const tbody = document.getElementById('adash-revenue-tbody');
  const statsDiv = document.getElementById('adash-revenue-stats');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">Loading...</td></tr>';
  try {
    let url = '/api/admin/revenue/';
    const params = [];
    if (from) params.push('from=' + from);
    if (to) params.push('to=' + to);
    if (params.length) url += '?' + params.join('&');
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Could not load revenue report.');
    const data = await res.json();
    const fm = function(v) { return '£' + Number(v || 0).toFixed(2); };
    if (statsDiv) {
      statsDiv.innerHTML =
        '<div class="stat-card"><div class="label">TOTAL REVENUE</div><div class="value">' + fm(data.total_revenue) + '</div></div>' +
        '<div class="stat-card"><div class="label">COMMISSION (5%)</div><div class="value" style="color:var(--gold)">' + fm(data.total_commission) + '</div></div>' +
        '<div class="stat-card"><div class="label">PRODUCER PAYOUTS</div><div class="value">' + fm(data.total_producer_payouts) + '</div></div>' +
        '<div class="stat-card"><div class="label">TOTAL ORDERS</div><div class="value">' + (data.total_orders || 0) + '</div></div>' +
        '<div class="stat-card"><div class="label">ACTIVE PRODUCERS</div><div class="value">' + (data.active_producers || 0) + '</div></div>' +
        '<div class="stat-card"><div class="label">ACTIVE CUSTOMERS</div><div class="value">' + (data.active_customers || 0) + '</div></div>';
    }
    const rows = Array.isArray(data.revenue_by_producer) ? data.revenue_by_producer : [];
    if (tbody) {
      tbody.innerHTML = rows.length === 0
        ? '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No revenue data for this period.</td></tr>'
        : rows.map(function(r) {
            return '<tr><td style="font-weight:600">' + (r.producer_email || '-') + '</td><td style="font-weight:700">' + fm(r.subtotal) + '</td><td style="color:var(--gold)">' + fm(r.commission) + '</td><td style="color:var(--forest-mid)">' + fm(r.payout) + '</td><td>' + (r.orders || 0) + '</td></tr>';
          }).join('');
    }
    state.revenueReportData = data;
  } catch(err) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--danger)">' + apiErrorMessage(err, 'Could not load revenue report.') + '</td></tr>';
  }
}

function handleExportRevenueCSV() {
  const data = state.revenueReportData;
  if (!data || !Array.isArray(data.revenue_by_producer) || data.revenue_by_producer.length === 0) {
    showToast('Load a report first before exporting.', 'error'); return;
  }
  const headers = ['producer_email', 'subtotal', 'commission', 'payout', 'orders'];
  const rows = data.revenue_by_producer.map(function(r) { return headers.map(function(h) { return '"' + (r[h] != null ? r[h] : '') + '"'; }).join(','); });
  const csv = [headers.join(',')].concat(rows).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'revenue_report.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function renderAdminDisputes() {
  const container = document.getElementById('adash-disputes-content');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-muted);padding:24px 0">Loading disputes...</p>';
  try {
    const res = await fetch('/api/orders/admin/disputes/', { credentials: 'include' });
    if (!res.ok) throw new Error('Could not load disputes.');
    const data = await res.json();
    const disputes = Array.isArray(data) ? data : (data.results || []);
    if (disputes.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-style:italic;padding:24px 0">No disputes raised yet.</p>';
      return;
    }
    container.innerHTML = disputes.map(function(d) {
      return '<div class="review-card" style="margin-bottom:16px">' +
        '<div class="review-header">' +
        '<span style="font-weight:700">Order: ' + (d.order_invoice || d.order || '-') + '</span>' +
        '<span style="font-weight:600;text-transform:capitalize">' + (d.status || '').replace('_', ' ') + '</span>' +
        '<span class="review-date">' + (d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB') : '') + '</span>' +
        '</div>' +
        '<p style="font-size:14px;color:var(--text-muted);margin:4px 0"><strong>Reason:</strong> ' + (d.reason || '').replace('_', ' ') + '</p>' +
        '<p style="font-size:14px;color:var(--text-body);margin:4px 0">' + (d.description || '') + '</p>' +
        (d.status === 'open' || d.status === 'under_review'
          ? '<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap"><textarea id="dispute-note-' + d.id + '" class="review-textarea" style="flex:1;min-width:200px" placeholder="Resolution note..." rows="2"></textarea><div style="display:flex;flex-direction:column;gap:6px"><button class="btn btn-primary btn-sm" onclick="resolveDispute(' + d.id + ',\'resolved\')">Resolve</button><button class="btn btn-secondary btn-sm" onclick="resolveDispute(' + d.id + ',\'closed\')">Close</button></div></div>'
          : '<p style="font-size:13px;color:var(--text-muted);margin-top:8px"><strong>Resolution:</strong> ' + (d.resolution_note || '-') + '</p>'
        ) +
        '</div>';
    }).join('');
  } catch(err) {
    container.innerHTML = '<p style="color:var(--danger)">Could not load disputes. ' + apiErrorMessage(err, '') + '</p>';
  }
}

async function resolveDispute(disputeId, status) {
  const noteEl = document.getElementById('dispute-note-' + disputeId);
  const note = noteEl ? noteEl.value.trim() : '';
  if (!note) { showToast('Please enter a resolution note.', 'error'); return; }
  try {
    const csrfEl = document.cookie.split(';').find(function(c) { return c.trim().startsWith('csrftoken='); });
    const csrf = csrfEl ? csrfEl.split('=')[1] : '';
    const res = await fetch('/api/orders/admin/disputes/' + disputeId + '/resolve/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      credentials: 'include',
      body: JSON.stringify({ status: status, resolution_note: note })
    });
    if (!res.ok) throw new Error('Could not resolve dispute.');
    showToast('Dispute ' + status + ' successfully.', 'success');
    renderAdminDisputes();
  } catch(err) {
    showToast(apiErrorMessage(err, 'Could not resolve dispute.'), 'error');
  }
}

// ---- WHOLESALE PRICING (TC-019, TC-020) ----
var wholesaleProductId = null;
var wholesaleStandardPrice = 0;

function _wholesaleResetTier(prefix) {
  const cb = document.getElementById('wholesale-' + prefix + '-enabled');
  const cur = document.getElementById('wholesale-' + prefix + '-current');
  const pr = document.getElementById('wholesale-' + prefix + '-price');
  const mq = document.getElementById('wholesale-' + prefix + '-min-qty');
  if (cb) cb.checked = false;
  if (cur) cur.textContent = 'Not set';
  if (pr) pr.value = '';
  if (mq) mq.value = '1';
}

function _wholesaleApplyTier(prefix, tier) {
  // tier is the WholesalePrice row from the API (or null)
  const cur = document.getElementById('wholesale-' + prefix + '-current');
  const pr = document.getElementById('wholesale-' + prefix + '-price');
  const mq = document.getElementById('wholesale-' + prefix + '-min-qty');
  if (!tier) {
    if (cur) cur.textContent = 'Not set';
    return;
  }
  const price = Number(tier.price).toFixed(2);
  const min = tier.minimum_quantity || 1;
  if (cur) cur.textContent = '£' + price + ' · min ' + min + ' unit' + (min === 1 ? '' : 's');
  if (pr) pr.value = price;
  if (mq) mq.value = min;
}

async function showWholesaleModal(productId, standardPrice) {
  wholesaleProductId = productId;
  wholesaleStandardPrice = Number(standardPrice) || 0;
  const priceEl = document.getElementById('wholesale-standard-price');
  if (priceEl) priceEl.textContent = '£' + wholesaleStandardPrice.toFixed(2);

  // Reset both tiers, then fetch existing values and pre-fill.
  _wholesaleResetTier('restaurant');
  _wholesaleResetTier('community');

  const overlay = document.getElementById('wholesale-overlay');
  if (overlay) { overlay.classList.remove('hidden'); overlay.style.display = 'flex'; }

  try {
    const res = await fetch('/api/products/' + productId + '/wholesale/', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data && data.buyer_type ? [data] : []);
      const restaurant = list.find(t => t.buyer_type === 'restaurant') || null;
      const community = list.find(t => t.buyer_type === 'community_group') || null;
      _wholesaleApplyTier('restaurant', restaurant);
      _wholesaleApplyTier('community', community);
    }
  } catch (e) {
    // fetch failure is non-fatal — user can still set new prices
  }
}

function closeWholesaleModal() {
  const overlay = document.getElementById('wholesale-overlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.style.display = 'none'; }
  wholesaleProductId = null;
}

async function _saveWholesaleTier(buyerType, prefix, csrf) {
  const cb = document.getElementById('wholesale-' + prefix + '-enabled');
  if (!cb || !cb.checked) return { skipped: true };

  const pr = document.getElementById('wholesale-' + prefix + '-price');
  const mq = document.getElementById('wholesale-' + prefix + '-min-qty');
  const price = pr ? parseFloat(pr.value) : NaN;
  const minQty = mq ? (parseInt(mq.value, 10) || 1) : 1;

  if (!price || isNaN(price) || price <= 0) {
    return { error: 'Enter a valid ' + buyerType.replace('_', ' ') + ' price.' };
  }
  if (price >= wholesaleStandardPrice) {
    return { error: buyerType.replace('_', ' ') + ' wholesale price must be lower than £' + wholesaleStandardPrice.toFixed(2) + '.' };
  }

  const res = await fetch('/api/products/' + wholesaleProductId + '/wholesale/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    credentials: 'include',
    body: JSON.stringify({ buyer_type: buyerType, price: price.toFixed(2), minimum_quantity: minQty, is_active: true })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.detail || body.price || ('Could not save ' + buyerType + ' wholesale price.') };
  }
  return { saved: true };
}

async function submitWholesalePrice() {
  const restaurantCb = document.getElementById('wholesale-restaurant-enabled');
  const communityCb = document.getElementById('wholesale-community-enabled');
  if ((!restaurantCb || !restaurantCb.checked) && (!communityCb || !communityCb.checked)) {
    showToast('Tick at least one tier to save.', 'error');
    return;
  }

  const csrfCookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
  const csrf = csrfCookie ? csrfCookie.split('=')[1] : '';

  const results = await Promise.all([
    _saveWholesaleTier('restaurant', 'restaurant', csrf),
    _saveWholesaleTier('community_group', 'community', csrf),
  ]);

  const errors = results.filter(r => r && r.error).map(r => r.error);
  const savedCount = results.filter(r => r && r.saved).length;

  if (errors.length) {
    showToast(errors.join(' · '), 'error');
    return;
  }
  if (savedCount === 0) {
    showToast('No tiers were saved.', 'error');
    return;
  }
  showToast(savedCount === 2 ? 'Both wholesale tiers saved.' : 'Wholesale price saved.', 'success');
  closeWholesaleModal();
}

// ============================================================
// RESTAURANT & COMMUNITY GROUP — New Registration Functions
// ============================================================

async function registerRestaurant(data) {
  return post('/api/auth/register/restaurant/', data);
}

async function registerCommunityGroup(data) {
  return post('/api/auth/register/community-group/', data);
}

// ---- RESTAURANT DASHBOARD ----
function renderRestaurantDash() {
  const container = document.getElementById('rdash-marketplace-content');
  if (!container) return;
  // Restaurant sees same marketplace but with wholesale prices
  renderWholesaleMarketplace('restaurant', container);
}

// ---- COMMUNITY GROUP DASHBOARD ----
function renderCommunityDash() {
  const container = document.getElementById('cdash-marketplace-content-community');
  if (!container) return;
  renderWholesaleMarketplace('community_group', container);
}

async function renderWholesaleMarketplace(role, container) {
  container.innerHTML = '<p style="color:var(--text-muted);padding:24px 0">Loading products...</p>';
  try {
    const products = state.products.length > 0 ? state.products : await loadCatalog().then(() => state.products);
    if (products.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:24px 0">No products available.</p>';
      return;
    }
    // Fetch wholesale prices for all products
    const wholesalePrices = {};
    await Promise.all(products.map(async function(p) {
      try {
        const res = await fetch('/api/products/' + p.id + '/wholesale/', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.price && data.is_active) {
            wholesalePrices[p.id] = data;
          }
        }
      } catch(e) {}
    }));

    container.innerHTML = '<div class="wholesale-grid">' + products.map(function(p) {
      const ws = wholesalePrices[p.id];
      const hasWholesale = ws && ws.price;
      return '<div class="product-card wholesale-card">' +
        '<img src="' + (p.img || 'images/vegetables.jpg') + '" alt="' + p.name + '" onerror="this.src=\'images/vegetables.jpg\'" />' +
        '<div class="product-card-body">' +
        '<div class="product-name">' + p.name + '</div>' +
        '<div class="product-producer" style="font-size:12px;color:var(--text-muted)">' + (p.producer || '') + '</div>' +
        (hasWholesale
          ? '<div class="wholesale-price-display">' +
            '<span class="standard-price-crossed">£' + Number(p.price).toFixed(2) + '/' + (p.unit || 'unit') + '</span>' +
            '<span class="wholesale-price-green">£' + Number(ws.price).toFixed(2) + '/' + (p.unit || 'unit') + ' (wholesale)</span>' +
            '<span class="wholesale-min-qty">Min. ' + (ws.minimum_quantity || 1) + ' ' + (p.unit || 'units') + '</span>' +
            '</div>'
          : '<div class="product-price">£' + Number(p.price).toFixed(2) + '/' + (p.unit || 'unit') + '</div>'
        ) +
        '<button class="btn btn-primary btn-sm" style="margin-top:12px;width:100%" onclick="addToCart(' + p.id + ', 1)">Add to Cart</button>' +
        '</div></div>';
    }).join('') + '</div>';
  } catch(err) {
    container.innerHTML = '<p style="color:var(--danger)">Could not load products. ' + apiErrorMessage(err, '') + '</p>';
  }
}

function setRestaurantTab(tab) {
  document.querySelectorAll('#rdash-content .dashboard-section').forEach(function(s) {
    s.classList.toggle('active', s.id === 'rdash-' + tab);
  });
  document.querySelectorAll('#page-restaurant-dash .sidebar-nav li').forEach(function(li, i) {
    li.classList.toggle('active', i === (['marketplace', 'profile'].indexOf(tab)));
  });
  if (tab === 'marketplace') renderRestaurantDash();
}

function setCommunityTab(tab) {
  document.querySelectorAll('#cdash-content-community .dashboard-section').forEach(function(s) {
    s.classList.toggle('active', s.id === 'cdash-community-' + tab);
  });
  if (tab === 'marketplace') renderCommunityDash();
}