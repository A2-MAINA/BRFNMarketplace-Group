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
  const name = cp.full_name || pp.contact_name || profile.name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;
  return {
    name,
    email: profile.email,
    role: profile.role,
    businessName: pp.business_name || null,
    phone: cp.phone_number || pp.phone_number || '',
    deliveryAddress: cp.delivery_address || '',
    postcode: cp.postcode || pp.postcode || '',
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
  customerDashTab: 'orders',
  categories: [],   // UI categories (All + from API)
  products: [],     // All products from API (normalized)
  producerProducts: [], // Products belonging to logged-in producer
  producerOrders: null,
  producerOrdersLoading: false,
  customerOrders: null,
  customerOrdersLoading: false,
  producerSettlementReport: null,
  producerSettlementLoading: false,
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
  const product = state.products.find(p => p.id === Number(productId));
  if (!product) { showToast('Product not found', 'error'); return; }
  if (state.currentUser && state.currentUser.role === 'customer') {
    addOrUpdateCartItem(productId, qty).then(data => {
      setCartFromApiResponse(data);
      showToast(`${product.name} added to cart`, 'success');
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
  if (msg === 'Failed to fetch' || (err && err.status === undefined && !err.body)) {
    return 'Network error. Please check the backend is running and try again.';
  }
  return msg;
}

// ---- NAVIGATION ----
function navigate(page, extra) {
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- BROWSE ----
function getFiltered() {
  const list = state.products || [];
  return list.filter(p => {
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
      </div>
    </div>`;
    contentEl.innerHTML = html;
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

function handleCheckout() {
  if (!state.currentUser) { showToast('Please log in to checkout', 'error'); navigate('login'); }
  else showToast('Checkout coming in Sprint 2', '');
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
      <div class="user-pill" onclick="navigate('${state.currentUser.role === 'producer' ? 'producer-dash' : 'customer-dash'}')">
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
let registerRole = 'producer';

function setRegisterRole(role) {
  registerRole = role;
  document.querySelectorAll('.role-tab').forEach(t => t.classList.toggle('active', t.dataset.role === role));
  document.getElementById('producer-fields').classList.toggle('hidden', role !== 'producer');
  document.getElementById('customer-fields').classList.toggle('hidden', role !== 'customer');
  document.getElementById('terms-row').classList.toggle('hidden', role !== 'customer');
  document.getElementById('producer-name-row').classList.toggle('hidden', role !== 'producer');
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

  if (registerRole === 'producer') {
    if (!name) { showFieldError('reg-name', 'Contact name is required'); valid = false; } else clearFieldError('reg-name');
  } else {
    clearFieldError('reg-name');
    if (!firstName) { showFieldError('reg-first-name', 'First name is required'); valid = false; } else clearFieldError('reg-first-name');
    if (!lastName) { showFieldError('reg-last-name', 'Last name is required'); valid = false; } else clearFieldError('reg-last-name');
  }
  if (!email.includes('@')) { showFieldError('reg-email', 'Valid email required'); valid = false; } else clearFieldError('reg-email');
  if (password.length < 8) { showFieldError('reg-password', 'Password must be at least 8 characters'); valid = false; } else clearFieldError('reg-password');
  if (password !== confirm)  { showFieldError('reg-confirm', 'Passwords do not match'); valid = false; } else clearFieldError('reg-confirm');

  if (registerRole === 'customer') {
    const terms = document.getElementById('terms-check');
    if (terms && !terms.checked) { showToast('Please accept the terms and conditions', 'error'); valid = false; }
  }
  if (!valid) return;

  const doRegister = registerRole === 'producer'
    ? () => registerProducer({
        email,
        password,
        password_confirm: confirm,
        business_name: document.getElementById('reg-business')?.value?.trim() || name,
        contact_name: name,
        phone_number: document.getElementById('reg-phone')?.value?.trim() || '',
        address: document.getElementById('reg-address')?.value?.trim() || '—',
        postcode: document.getElementById('reg-postcode')?.value?.trim() || '—',
      })
    : () => registerCustomer({
        email,
        password,
        password_confirm: confirm,
        full_name: `${firstName} ${lastName}`.trim(),
        phone_number: document.getElementById('reg-phone')?.value?.trim() || '',
        delivery_address: document.getElementById('reg-delivery')?.value?.trim() || '—',
        postcode: document.getElementById('reg-postcode')?.value?.trim() || '—',
        terms_accepted: true,
      });

  doRegister()
    .then(() => login(email, password))
    .then(() => getProfile())
    .then(profile => {
      state.currentUser = profileToUser(profile);
      renderAuthNavbar();
      showToast(`Welcome, ${state.currentUser.name.split(' ')[0]}! Account created.`, 'success');
      navigate(state.currentUser.role === 'producer' ? 'producer-dash' : 'customer-dash');
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
      navigate(state.currentUser.role === 'producer' ? 'producer-dash' : 'customer-dash');
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
        You haven’t received any orders yet. When customers checkout, their orders will appear here.
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
    return String(o.customer_name || o.customer || (o.customer && o.customer.name) || '—');
  };
  const toDate = (o) => (o && (o.created_at || o.order_date || o.date)) ? String(o.created_at || o.order_date || o.date) : '—';
  const toDeliveryDate = (o) => (o && (o.delivery_date || o.delivery)) ? String(o.delivery_date || o.delivery) : '—';
  const toTotal = (o) => (o && (o.total_amount || o.total || o.gross_total)) != null ? (o.total_amount || o.total || o.gross_total) : 0;
  const toStatus = (o) => (o && o.status) ? String(o.status) : 'pending';
  const toUpdateId = (o) => (o && (o.id || o.order_id || o.pk)) ? String(o.id || o.order_id || o.pk) : null;

  // Sprint 2 TC-010: Producer can progress status Pending → Confirmed → Processing → Ready → Delivered
  const statusActionHTML = (o) => {
    const id = toUpdateId(o);
    const status = toStatus(o).toLowerCase();
    if (!id) return '';

    if (status === 'pending') {
      return `
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="handleUpdateOrderStatus('${id}','confirmed')">Confirm</button>
          <button class="btn btn-secondary btn-sm" onclick="handleUpdateOrderStatus('${id}','rejected')">Reject</button>
        </div>`;
    }
    if (status === 'confirmed') {
      return `<div style="margin-top:6px"><button class="btn btn-secondary btn-sm" onclick="handleUpdateOrderStatus('${id}','processing')">Mark Processing</button></div>`;
    }
    if (status === 'processing') {
      return `<div style="margin-top:6px"><button class="btn btn-secondary btn-sm" onclick="handleUpdateOrderStatus('${id}','ready')">Mark Ready</button></div>`;
    }
    if (status === 'ready') {
      return `<div style="margin-top:6px"><button class="btn btn-secondary btn-sm" onclick="handleUpdateOrderStatus('${id}','delivered')">Mark Delivered</button></div>`;
    }
    return '';
  };

  if (activeOrdersEl) activeOrdersEl.textContent = String((state.producerOrders || []).length || 0);

  if (state.producerOrders === null) {
    setOrdersBody(loadingRow);
    if (!state.producerOrdersLoading) refreshProducerOrders();
  } else if (Array.isArray(state.producerOrders) && state.producerOrders.length === 0) {
    setOrdersBody(emptyRow);
  } else {
    const rows = (state.producerOrders || []).map(o => `
      <tr>
        <td>${toOrderId(o)}</td>
        <td>${toCustomerName(o)}</td>
        <td style="font-size:12px">${toDate(o)}</td>
        <td style="font-size:12px">${toDeliveryDate(o)}</td>
        <td style="font-size:12px">${toItemsCount(o)}</td>
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
        const t = toTotal(o);
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
        <td><button class="btn btn-secondary btn-sm" onclick="handleEditProduct(${p.id})">Edit</button></td>
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
      document.getElementById('prod-unit').value = '';
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


function handleEditProduct(productId) {
  const product = (state.producerProducts || []).find(p => p.id === Number(productId));
  if (!product) {
    showToast('Product not found.', 'error');
    return;
  }

  const stockInput = window.prompt('Enter new stock quantity (0 or more):', String(product.stock ?? 0));
  if (stockInput === null) return; // cancelled
  const nextStock = parseInt(stockInput, 10);
  if (!Number.isFinite(nextStock) || nextStock < 0) {
    showToast('Stock quantity must be 0 or more.', 'error');
    return;
  }

  const availabilityInput = window.prompt(
    'Availability (In Season | Out of Season | Pre-Order):',
    String(product.availability ?? 'In Season')
  );
  if (availabilityInput === null) return; // cancelled

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
    .catch((err) => {
      showToast(apiErrorMessage(err, 'Could not update product. Check backend and try again.'), 'error');
    });
}

// ---- Sprint 2: Orders wiring (backend may not exist yet) ----
async function refreshProducerOrders() {
  if (state.producerOrdersLoading) return;
  state.producerOrdersLoading = true;

  try {
    const data = await getProducerOrders();
    // Allow flexible backend shapes: array | { orders: [] } | { data: [] }
    const orders =
      Array.isArray(data) ? data :
      (data && (data.orders || data.producer_orders || data.results || [])) || [];

    state.producerOrders = Array.isArray(orders) ? orders : [];
  } catch (err) {
    state.producerOrders = [];
    showToast(apiErrorMessage(err, 'Could not load producer orders.'), 'error');
  } finally {
    state.producerOrdersLoading = false;
    renderProducerDash();
  }
}

async function refreshCustomerOrders() {
  if (state.customerOrdersLoading) return;
  state.customerOrdersLoading = true;

  try {
    const data = await getCustomerOrderHistory();
    const orders =
      Array.isArray(data) ? data :
      (data && (data.orders || data.results || data.customer_orders || [])) || [];

    state.customerOrders = Array.isArray(orders) ? orders : [];
  } catch (err) {
    state.customerOrders = [];
    showToast(apiErrorMessage(err, 'Could not load your order history.'), 'error');
  } finally {
    state.customerOrdersLoading = false;
    renderCustomerDash();
  }
}

function renderSettlementsReport(report) {
  const summary = (report && report.summary) ? report.summary : (report || {});
  const lines =
    (report && Array.isArray(report.lines) && report.lines) ? report.lines :
    (report && Array.isArray(report.settlements) && report.settlements) ? report.settlements :
    (report && report.items && Array.isArray(report.items)) ? report.items :
    summary.lines && Array.isArray(summary.lines) ? summary.lines :
    [];

  const formatMoney = (v) => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return '£' + (Number.isFinite(n) ? n : 0).toFixed(2);
  };

  const ordersCount =
    summary.order_count ?? summary.orders_count ?? summary.total_orders ??
    (Array.isArray(lines) ? lines.length : 0);

  const networkCommission =
    summary.commission_total ?? summary.network_commission ?? summary.commission ??
    summary.commission_deducted ?? 0;

  const yourPayment =
    summary.your_payment_total ?? summary.your_payment ?? summary.payout ??
    summary.your_share ?? summary.producer_payout ?? 0;

  const elOrders = document.getElementById('pdash-settlement-orders');
  const elComm = document.getElementById('pdash-settlement-commission');
  const elPayout = document.getElementById('pdash-settlement-your-payment');
  if (elOrders) elOrders.textContent = String(ordersCount || 0);
  if (elComm) elComm.textContent = formatMoney(networkCommission);
  if (elPayout) elPayout.textContent = formatMoney(yourPayment);

  const tbody = document.getElementById('pdash-settlements-tbody');
  if (!tbody) return;

  if (!Array.isArray(lines) || lines.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);font-size:14px">
          No settlements yet. When customers place real orders (Sprint 2), their payouts will be summarised here.
        </td>
      </tr>`;
    return;
  }

  const toItemsCount = (line) => {
    if (!line) return '—';
    if (Array.isArray(line.items)) return String(line.items.length);
    return String(line.items_sold || line.items_count || line.item_count || '—');
  };

  const toOrderId = (line) =>
    line.invoice_number || (line.order && line.order.invoice_number) || line.order_id || line.id || '—';
  const toCustomer = (line) =>
    line.customer_name || line.customer || (line.order && line.order.customer_name) || (line.order && line.order.customer) || '—';
  const toDelivery = (line) =>
    line.delivery_date || line.date || (line.order && line.order.delivery_date) || (line.order && line.order.delivery) || '—';
  const toTotal = (line) =>
    line.order_total ?? line.total_amount ?? line.total ?? (line.order && line.order.total_amount) ?? 0;
  const toCommission = (line) =>
    line.commission ?? line.commission_amount ?? 0;
  const toPayout = (line) =>
    line.payout ?? line.your_share ?? line.producer_payout ?? 0;

  tbody.innerHTML = lines.map(line => `
    <tr>
      <td>${toOrderId(line)}</td>
      <td style="font-size:12px">${toCustomer(line)}</td>
      <td style="font-size:12px">${toDelivery(line)}</td>
      <td style="font-size:12px">${toItemsCount(line)}</td>
      <td style="font-weight:700">${formatMoney(toTotal(line))}</td>
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
    state.producerSettlementReport = null;
    // Leave existing "No settlements yet" UI in place; just toast.
    showToast(apiErrorMessage(err, 'Could not load settlement report.'), 'error');
  } finally {
    state.producerSettlementLoading = false;
  }
}

function handleReorder(orderId) {
  reorderFromHistory(orderId)
    .then((res) => {
      // If backend returns cart data directly, use it; otherwise refetch cart.
      if (res && res.items) {
        setCartFromApiResponse(res);
        return;
      }
      return getCart().then(setCartFromApiResponse);
    })
    .then(() => {
      navigate('cart');
      showToast('Reorder added to cart.', 'success');
    })
    .catch((err) => {
      showToast(apiErrorMessage(err, 'Could not reorder from history.'), 'error');
    });
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
    })
    .catch((err) => {
      showToast(apiErrorMessage(err, 'Could not update order status.'), 'error');
    });
}

async function handleDownloadSettlementCSV() {
  try {
    await downloadSettlementReport();
    showToast('Settlement download started.', 'success');
  } catch (err) {
    showToast(apiErrorMessage(err, 'Could not download settlement CSV.'), 'error');
  }
}

function setProducerTab(tab) {
  state.producerDashTab = tab;
  renderProducerDash();
  if (!state.currentUser || state.currentUser.role !== 'producer') return;
  if (tab === 'orders' || tab === 'overview') refreshProducerOrders();
  if (tab === 'payments') refreshProducerSettlements();
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
  if (ordTable) {
    const orders = state.customerOrders || [];
    if (orders.length === 0) {
      ordTable.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);font-size:15px">You haven’t placed any orders yet. When you checkout, your orders will appear here.</td></tr>';
    } else {
      ordTable.innerHTML = orders.map(o => `
        <tr>
          <td style="font-weight:600">${o.id}</td><td>${o.date}</td>
          <td style="font-size:12px">${o.producers}</td>
          <td style="font-size:12px">${o.items}</td>
          <td style="font-weight:700">£${o.total.toFixed(2)}</td>
          <td><span class="status-pill status-${(o.status || '').toLowerCase()}">${o.status}</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="handleReorder(${o.id})">Reorder</button></td>
        </tr>`).join('');
    }
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

function setCustomerTab(tab) {
  state.customerDashTab = tab;
  renderCustomerDash();
  if (!state.currentUser || state.currentUser.role !== 'customer') return;
  if (tab === 'orders') refreshCustomerOrders();
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
        return getCart()
          .then(setCartFromApiResponse)
          .then(() => refreshCustomerOrders());
      } else if (state.currentUser.role === 'producer') {
        return getProducts({ mine: true })
          .then(prods => {
            state.producerProducts = (prods || []).map(apiProductToUI);
          })
          .then(() => refreshProducerOrders());
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
