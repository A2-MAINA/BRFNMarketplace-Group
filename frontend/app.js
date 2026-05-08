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
  const rawAvail = apiP.availability || 'in_season';
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
    availabilityRaw: rawAvail,
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
  const name =
    cp.full_name ||
    pp.contact_name ||
    rp.business_name ||
    gp.organisation_name ||
    profile.name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.email;
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

function dashboardForRole(role) {
  if (role === 'admin') return 'admin-dash';
  if (role === 'producer') return 'producer-dash';
  if (role === 'restaurant') return 'restaurant-dash';
  if (role === 'community_group') return 'community-dash';
  return 'customer-dash';
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
  adminDashTab: 'commission',
  /** @type {{ productId: number, reviewId: number, text?: string } | null} */
  producerRespondDraft: null,
  /** Producer-set wholesale snapshot for dashboard badges: productId -> { restaurant?, community_group? } */
  wholesaleLocal: {},
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
  const role = state.currentUser && state.currentUser.role;
  if (role === 'customer' || role === 'restaurant' || role === 'community_group') {
    addOrUpdateCartItem(productId, qty).then(data => {
      setCartFromApiResponse(data);
      const name = product && product.name ? product.name : 'Item';
      showToast(`${name} added to cart`, 'success');
    }).catch(err => showToast(apiErrorMessage(err, 'Could not add to cart'), 'error'));
    return;
  }
  if (role === 'producer') {
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
  if (page === 'order-confirm') renderOrderConfirmation(state.lastConfirmedOrder);
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
  if (page === 'admin-dash') {
    renderAdminDash();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderOrderConfirmation(order) {
  const el = document.getElementById('order-confirm-content');
  if (!el) return;
  if (!order) {
    el.innerHTML = '<div style="text-align:center;padding:60px 0"><h2>No receipt available</h2><button class="btn btn-primary" onclick="navigate(\'customer-dash\')">Back to My Orders</button></div>';
    return;
  }

  const fm = (v) => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  };

  const payment = order.payment || {};
  const receipt = order.receipt || {};
  const stripe = receipt.stripe || {};
  const paymentNumber = receipt.payment_number || payment.payment_number || '-';
  const receiptNumber = receipt.receipt_number || '-';
  const paymentIntent = stripe.payment_intent_id || payment.transaction_id || '-';
  const chargeId = stripe.charge_id || payment.stripe_charge_id || '-';
  const customerEmail = (receipt.customer && receipt.customer.email) || order.customer_email || '-';
  const methodType = payment.payment_method_type || receipt.payment_method_type || '-';
  const methodLast4 = payment.payment_method_last4 || receipt.payment_method_last4 || '';
  const stripeReceiptUrl = stripe.receipt_url || payment.receipt_url || '';

  el.innerHTML = `
    <div class="confirm-page">
      <div class="confirm-header">
        <div class="confirm-check">&#10003;</div>
        <h1>Payment Receipt</h1>
        <p class="confirm-invoice">${order.invoice_number || ('Order #' + order.id)}</p>
      </div>
      <div class="confirm-sections">
        <div class="confirm-card">
          <h3>Order Summary</h3>
          <div class="confirm-summary-row"><span>Total paid</span><span>£${fm(order.total_amount)}</span></div>
          <div class="confirm-summary-row"><span>Status</span><span>${order.status || '-'}</span></div>
        </div>
        <div class="confirm-card">
          <h3>Payment Tracking</h3>
          <div class="confirm-summary-row"><span>Receipt number</span><span>${receiptNumber}</span></div>
          <div class="confirm-summary-row"><span>Payment number</span><span>${paymentNumber}</span></div>
          <div class="confirm-summary-row"><span>Payment intent ID</span><span style="max-width:60%;text-align:right;word-break:break-all">${paymentIntent}</span></div>
          <div class="confirm-summary-row"><span>Stripe charge ID</span><span style="max-width:60%;text-align:right;word-break:break-all">${chargeId}</span></div>
          <div class="confirm-summary-row"><span>Customer email</span><span>${customerEmail}</span></div>
          <div class="confirm-summary-row"><span>Payment method</span><span>${methodType}${methodLast4 ? ` ****${methodLast4}` : ''}</span></div>
          ${stripeReceiptUrl ? `<div style="margin-top:10px"><a href="${stripeReceiptUrl}" target="_blank" rel="noopener noreferrer">View Stripe receipt</a></div>` : ''}
        </div>
      </div>
      <div class="confirm-actions">
        <button class="btn btn-primary" onclick="navigate('customer-dash')">Back to My Orders</button>
        <button class="btn btn-secondary" onclick="window.print()">Print Receipt</button>
      </div>
    </div>`;
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

  const trade =
    p.wholesalePrice != null &&
    Number(p.wholesalePrice) > 0 &&
    Number(p.wholesalePrice) < Number(p.price);
  const minNote = p.wholesaleMin > 1 ? ' · min ' + p.wholesaleMin : '';
  const priceBlock = trade
    ? '<span class="product-price" style="color:var(--forest-mid)">£' +
      Number(p.wholesalePrice).toFixed(2) +
      '</span><span class="product-unit"> trade / ' +
      p.unit +
      '</span><span style="display:block;font-size:11px;color:var(--text-muted);margin-top:2px">Retail £' +
      p.price.toFixed(2) +
      minNote +
      '</span>'
    : '<span class="product-price">£' +
      p.price.toFixed(2) +
      '</span><span class="product-unit"> / ' +
      p.unit +
      '</span>';

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
          <div>${priceBlock}</div>
          <button class="add-btn" onclick="event.stopPropagation(); addToCart(${p.id})" title="Add to cart">+</button>
        </div>
      </div>
    </div>`;
}

async function enrichProductsWholesale(products) {
  const role = state.currentUser && state.currentUser.role;
  if (role !== 'restaurant' && role !== 'community_group') return products;
  const out = await Promise.all(
    products.map(async (p) => {
      try {
        const w = await getWholesalePrice(p.id);
        const price = w && w.price != null ? parseFloat(w.price) : NaN;
        const minQ = w && w.minimum_quantity != null ? Number(w.minimum_quantity) : 1;
        if (Number.isFinite(price) && price > 0) {
          return { ...p, wholesalePrice: price, wholesaleMin: minQ };
        }
      } catch (_) {
        /* no wholesale row */
      }
      return { ...p, wholesalePrice: null };
    })
  );
  return out;
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
    return;
  }

  const role = state.currentUser && state.currentUser.role;
  if (role === 'restaurant' || role === 'community_group') {
    grid.innerHTML = '<p class="loading-msg" style="padding:24px">Loading trade prices…</p>';
    enrichProductsWholesale(products)
      .then((enriched) => {
        if (state.currentPage !== 'browse') return;
        grid.innerHTML = enriched.map(productCardHTML).join('');
      })
      .catch(() => {
        if (state.currentPage !== 'browse') return;
        grid.innerHTML = products.map(productCardHTML).join('');
      });
  } else {
    grid.innerHTML = products.map(productCardHTML).join('');
  }
}

function setCategory(id) {
  state.currentCategory = id;
  renderBrowse();
}

// ---- SPRINT 3: reviews, notify, disputes, wholesale, analytics ----
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeReviewsPayload(data) {
  if (!data) return { list: [], average: null, count: 0 };
  const list = Array.isArray(data) ? data : (data.reviews || data.results || []);
  const average =
    data.average_rating != null
      ? Number(data.average_rating)
      : data.avg_rating != null
        ? Number(data.avg_rating)
        : null;
  return { list, average, count: data.count != null ? data.count : list.length };
}

function orderLineHasProduct(o, productId) {
  const pid = Number(productId);
  const groups = o.producer_groups || o.groups || [];
  for (const g of groups) {
    const items = g.items || [];
    for (const it of items) {
      const p = it.product_id != null ? it.product_id : it.product && it.product.id;
      if (Number(p) === pid) return true;
    }
  }
  return false;
}

function findEligibleReviewOrders(productId) {
  const orders = state.customerOrders;
  if (!Array.isArray(orders)) return [];
  const pid = Number(productId);
  const out = [];
  const seen = new Set();
  for (const o of orders) {
    if (String(o.status || '').toLowerCase() !== 'delivered') continue;
    if (!orderLineHasProduct(o, pid)) continue;
    const oid = o.id;
    if (oid == null || seen.has(oid)) continue;
    seen.add(oid);
    out.push({ orderId: oid, label: 'Order #' + (o.invoice_number || oid) });
  }
  return out;
}

function renderReviewsSectionHtml(productId, p, payload) {
  const list = payload.list || [];
  let avg = payload.average;
  if ((avg == null || Number.isNaN(avg)) && list.length) {
    const sum = list.reduce((s, r) => s + (Number(r.rating) || 0), 0);
    avg = sum / list.length;
  }
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  list.forEach((r) => {
    const n = Math.min(5, Math.max(1, parseInt(r.rating, 10) || 1));
    if (dist[n] !== undefined) dist[n]++;
  });
  const avgStr = avg != null && !Number.isNaN(avg) ? avg.toFixed(1) : '—';
  const maxC = Math.max(1, list.length);
  const bars = [5, 4, 3, 2, 1]
    .map((star) => {
      const c = dist[star] || 0;
      const pct = Math.round((c / maxC) * 100);
      return `<div style="display:flex;align-items:center;gap:8px;font-size:13px;margin:4px 0"><span style="width:28px">${star}★</span><div style="flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--gold)"></div></div><span style="width:24px;text-align:right;color:var(--text-muted)">${c}</span></div>`;
    })
    .join('');
  const items = list
    .map((r) => {
      const name = escHtml(r.customer_name || r.customer || 'Customer');
      const rt = Math.min(5, Math.max(0, parseInt(r.rating, 10) || 0));
      const resp = r.producer_response
        ? `<div style="margin-top:10px;padding:10px 12px;background:#f8faf8;border-left:3px solid var(--forest-mid);font-size:14px"><strong>Producer replied:</strong> ${escHtml(r.producer_response)}</div>`
        : '';
      return `<div style="border-bottom:1px solid rgba(0,0,0,0.08);padding:16px 0">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <strong>${name}</strong>
        <span style="color:var(--gold)">${'★'.repeat(rt)}${'☆'.repeat(5 - rt)}</span>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin:4px 0">${escHtml(r.created_at || '')}</div>
      <p style="margin:8px 0 0;font-size:15px;color:var(--text-body)">${escHtml(r.comment || '')}</p>
      ${resp}
    </div>`;
    })
    .join('');
  return `
    <section>
      <h3 style="font-size:22px;margin:0 0 8px">Reviews</h3>
      <p style="font-size:15px;color:var(--text-muted);margin:0 0 16px">${avgStr !== '—' ? avgStr + ' ★ average · ' : ''}${list.length} review${list.length === 1 ? '' : 's'}</p>
      <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:24px">
        <div style="min-width:200px">${bars}</div>
      </div>
      <div>${items || '<p style="color:var(--text-muted)">No reviews yet.</p>'}</div>
      <div id="product-review-form-slot" style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(0,0,0,0.08)"></div>
    </section>`;
}

function buildReviewFormHtml(productId, eligible) {
  const opts = eligible.map((e) => `<option value="${e.orderId}">${escHtml(e.label)}</option>`).join('');
  return `
    <h4 style="margin:0 0 10px;font-size:16px">Write a review</h4>
    <div class="form-group"><label>Order</label><select id="review-order-id" class="form-control">${opts}</select></div>
    <div class="form-group"><label>Rating</label><select id="review-rating" class="form-control">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} stars</option>`).join('')}</select></div>
    <div class="form-group"><label>Comment (optional)</label><textarea id="review-comment" class="form-control" rows="2"></textarea></div>
    <button type="button" class="btn btn-primary btn-sm" onclick="submitProductReview(${productId})">Submit review</button>`;
}

function submitProductReview(productId) {
  const orderId = document.getElementById('review-order-id')?.value;
  const rating = parseInt(document.getElementById('review-rating')?.value || '5', 10);
  const comment = document.getElementById('review-comment')?.value?.trim() || '';
  if (!orderId) return;
  submitReview(productId, { order: Number(orderId), rating, comment })
    .then(() => {
      showToast('Review submitted.', 'success');
      renderProductDetail(productId);
    })
    .catch((err) => showToast(apiErrorMessage(err, 'Could not submit review.'), 'error'));
}

function handleNotifyToggle(productId, subscribe) {
  const fn = subscribe ? subscribeToProduct : unsubscribeFromProduct;
  fn(productId)
    .then(() => {
      showToast(
        subscribe ? 'You will be notified when this product is back in season.' : 'Unsubscribed.',
        'success'
      );
      if (state.currentProduct) hydrateProductDetailSprint3(productId, state.currentProduct);
    })
    .catch((err) => showToast(apiErrorMessage(err, 'Could not update notification.'), 'error'));
}

async function hydrateProductDetailSprint3(productId, p) {
  const notifyEl = document.getElementById('product-detail-notify-wrap');
  const reviewsEl = document.getElementById('product-reviews-root');
  const priceMain = document.getElementById('product-detail-price-main');
  const priceSuffix = document.getElementById('product-detail-price-suffix');

  const role = state.currentUser && state.currentUser.role;
  if (role === 'restaurant' || role === 'community_group') {
    try {
      const w = await getWholesalePrice(productId);
      const wp = w && w.price != null ? parseFloat(w.price) : NaN;
      const minQ = w && w.minimum_quantity != null ? Number(w.minimum_quantity) : 1;
      if (Number.isFinite(wp) && wp > 0 && wp < p.price) {
        if (priceMain) priceMain.textContent = '£' + wp.toFixed(2);
        if (priceSuffix) {
          priceSuffix.innerHTML =
            ' trade / ' +
            p.unit +
            ' <span style="display:block;font-size:13px;color:var(--forest-mid);margin-top:4px">Retail £' +
            p.price.toFixed(2) +
            (minQ > 1 ? ' · min order ' + minQ : '') +
            '</span>';
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  if (notifyEl && p.availabilityRaw === 'out_of_season' && role === 'customer') {
    let subscribed = false;
    try {
      const notifs = await getMyNotifications();
      const arr = Array.isArray(notifs) ? notifs : (notifs && notifs.results) || [];
      const pid = Number(productId);
      subscribed = arr.some((x) => Number(x.product_id) === pid && !x.notified);
    } catch (_) {
      subscribed = false;
    }
    notifyEl.innerHTML = subscribed
      ? `<button type="button" class="btn btn-secondary" style="background:#ecfdf5;border-color:#059669;color:#047857" onclick="handleNotifyToggle(${productId}, false)">Subscribed ✓ — Click to unsubscribe</button>`
      : `<button type="button" class="btn btn-secondary" style="background:#fffbeb;border-color:#d97706;color:#92400e" onclick="handleNotifyToggle(${productId}, true)">Notify me when back in season</button>`;
  } else if (notifyEl) {
    notifyEl.innerHTML = '';
  }

  let reviewsPayload = { list: [], average: null };
  try {
    const raw = await getProductReviews(productId);
    reviewsPayload = normalizeReviewsPayload(raw);
  } catch (_) {
    if (reviewsEl) {
      reviewsEl.innerHTML =
        '<p style="color:var(--text-muted);font-size:14px">Reviews could not be loaded (backend may still be deploying Sprint 3).</p>';
    }
    return;
  }

  if (reviewsEl) {
    reviewsEl.innerHTML = renderReviewsSectionHtml(productId, p, reviewsPayload);
  }

  if (state.currentUser && state.currentUser.role === 'customer') {
    if (!Array.isArray(state.customerOrders)) await refreshCustomerOrders();
    const eligible = findEligibleReviewOrders(productId);
    const formEl = document.getElementById('product-review-form-slot');
    if (formEl) {
      if (eligible.length === 0) {
        formEl.innerHTML =
          '<p style="color:var(--text-muted);font-size:14px">Purchase this product to leave a review (after a delivered order).</p>';
      } else {
        formEl.innerHTML = buildReviewFormHtml(productId, eligible);
      }
    }
  }
}

function openDisputeModal(orderId) {
  const overlay = document.getElementById('dispute-modal-overlay');
  const label = document.getElementById('dispute-modal-order-label');
  const hid = document.getElementById('dispute-modal-order-id');
  const desc = document.getElementById('dispute-description');
  if (hid) hid.value = String(orderId);
  if (label) label.textContent = '#' + orderId;
  if (desc) desc.value = '';
  if (overlay) overlay.classList.remove('hidden');
}

function closeDisputeModal() {
  const overlay = document.getElementById('dispute-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function submitRaiseDispute() {
  const orderId = document.getElementById('dispute-modal-order-id')?.value;
  const reason = document.getElementById('dispute-reason')?.value;
  const description = document.getElementById('dispute-description')?.value?.trim();
  if (!orderId || !description) {
    showToast('Description is required.', 'error');
    return;
  }
  raiseDispute(orderId, { reason, description })
    .then(() => {
      showToast('Dispute raised.', 'success');
      closeDisputeModal();
      refreshCustomerOrders();
    })
    .catch((err) => showToast(apiErrorMessage(err, 'Could not raise dispute.'), 'error'));
}

function disputeStatusPillClass(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'open') return 'status-pending';
  if (s === 'under_review') return 'status-processing';
  if (s === 'resolved') return 'status-confirmed';
  if (s === 'closed') return 'status-cancelled';
  return 'status-pending';
}

function openWholesaleModal(productId, productName) {
  const o = document.getElementById('wholesale-modal-overlay');
  const hid = document.getElementById('wholesale-modal-product-id');
  const title = document.getElementById('wholesale-modal-product-name');
  const p = (state.producerProducts || []).find((x) => Number(x.id) === Number(productId));
  if (hid) hid.value = String(productId);
  if (title) title.textContent = productName || (p && p.name) || 'Product';
  if (o) o.classList.remove('hidden');
}

function closeWholesaleModal() {
  const o = document.getElementById('wholesale-modal-overlay');
  if (o) o.classList.add('hidden');
}

function submitWholesaleModal() {
  const pid = document.getElementById('wholesale-modal-product-id')?.value;
  const buyer = document.getElementById('wholesale-buyer-type')?.value;
  const priceVal = document.getElementById('wholesale-price-input')?.value;
  const minQ = parseInt(document.getElementById('wholesale-min-qty')?.value || '1', 10);
  const price = priceVal ? parseFloat(priceVal) : NaN;
  if (!pid || !buyer || !Number.isFinite(price)) {
    showToast('Enter a valid wholesale price.', 'error');
    return;
  }
  setWholesalePrice(pid, {
    buyer_type: buyer,
    price,
    minimum_quantity: Number.isFinite(minQ) && minQ >= 1 ? minQ : 1,
    is_active: true,
  })
    .then(() => {
      if (!state.wholesaleLocal[pid]) state.wholesaleLocal[pid] = {};
      state.wholesaleLocal[pid][buyer] = {
        price: price.toFixed(2),
        min: Number.isFinite(minQ) && minQ >= 1 ? minQ : 1,
      };
      showToast('Wholesale price saved.', 'success');
      closeWholesaleModal();
      renderProducerDash();
    })
    .catch((err) => showToast(apiErrorMessage(err, 'Could not save wholesale price.'), 'error'));
}

async function loadProducerReviewsTab() {
  const el = document.getElementById('pdash-reviews-content');
  if (!el) return;
  el.innerHTML = '<p class="loading-msg">Loading reviews…</p>';
  try {
    const prods = state.producerProducts || [];
    const rows = [];
    for (const p of prods) {
      const raw = await getProductReviews(p.id);
      const { list } = normalizeReviewsPayload(raw);
      for (const r of list) {
        if (r.id == null && r.pk == null) continue;
        rows.push({ product: p, review: r });
      }
    }
    if (!rows.length) {
      el.innerHTML = '<p style="color:var(--text-muted)">No reviews yet.</p>';
      return;
    }
    el.innerHTML = rows
      .map(({ product, review }) => {
        const rid = review.id != null ? review.id : review.pk;
        const hasResp = !!(review.producer_response && String(review.producer_response).trim());
        const btn = hasResp
          ? `<button class="btn btn-secondary btn-sm" onclick="openRespondReview(${product.id},${rid})">Edit response</button>`
          : `<button class="btn btn-primary btn-sm" onclick="openRespondReview(${product.id},${rid})">Respond</button>`;
        return `<div style="border-bottom:1px solid rgba(0,0,0,0.08);padding:14px 0">
        <strong>${escHtml(product.name)}</strong> · ${escHtml(review.customer_name || 'Customer')} · ${'★'.repeat(Math.min(5, review.rating || 0))}
        <p style="margin:8px 0;font-size:14px">${escHtml(review.comment || '')}</p>
        ${btn}
        <div id="respond-slot-${product.id}-${rid}" style="margin-top:8px"></div>
      </div>`;
      })
      .join('');
  } catch (e) {
    el.innerHTML = '<p style="color:var(--text-muted)">Could not load reviews.</p>';
  }
}

function openRespondReview(productId, reviewId) {
  const slot = document.getElementById('respond-slot-' + productId + '-' + reviewId);
  if (!slot) return;
  slot.innerHTML =
    `<textarea id="respond-ta-${productId}-${reviewId}" class="form-control" rows="2" placeholder="Your public reply…"></textarea>
    <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="submitRespondReview(${productId},${reviewId})">Submit</button>`;
}

function submitRespondReview(productId, reviewId) {
  const ta = document.getElementById('respond-ta-' + productId + '-' + reviewId);
  const text = ta && ta.value ? ta.value.trim() : '';
  if (!text) {
    showToast('Enter a response.', 'error');
    return;
  }
  respondToReview(productId, reviewId, text)
    .then(() => {
      showToast('Response published.', 'success');
      loadProducerReviewsTab();
    })
    .catch((err) => showToast(apiErrorMessage(err, 'Could not save response.'), 'error'));
}

async function loadProducerAnalyticsTab() {
  const el = document.getElementById('pdash-analytics-content');
  if (!el) return;
  el.innerHTML = '<p class="loading-msg">Loading…</p>';
  try {
    const a = await getProducerAnalytics();
    const totalRev = a.total_revenue ?? 0;
    const totalOrders = a.total_orders ?? 0;
    const aov = a.average_order_value ?? 0;
    const comm = a.total_commission_paid ?? 0;
    const weekly = Array.isArray(a.weekly_revenue) ? a.weekly_revenue : [];
    const top = Array.isArray(a.top_products) ? a.top_products : [];
    let maxW = 0;
    weekly.forEach((w) => {
      const v = Number(w.revenue);
      if (v > maxW) maxW = v;
    });
    const bars = weekly
      .map((w) => {
        const rev = Number(w.revenue) || 0;
        const h = maxW ? Math.round((rev / maxW) * 120) : 0;
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:0"><div style="height:120px;width:100%;display:flex;align-items:flex-end;justify-content:center"><div style="width:70%;height:${h}px;background:var(--gold);border-radius:6px 6px 0 0" title="£${rev.toFixed(2)}"></div></div><div style="font-size:10px;color:var(--text-muted);text-overflow:ellipsis;overflow:hidden">${escHtml(w.week || '')}</div></div>`;
      })
      .join('');
    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="label">Total revenue</div><div class="value">${formatMoney(totalRev)}</div></div>
        <div class="stat-card"><div class="label">Orders delivered</div><div class="value">${totalOrders}</div></div>
        <div class="stat-card"><div class="label">Avg order value</div><div class="value">${formatMoney(aov)}</div></div>
        <div class="stat-card"><div class="label">Commission paid</div><div class="value">${formatMoney(comm)}</div></div>
      </div>
      <h4 style="margin:24px 0 12px">Weekly revenue (8 weeks)</h4>
      <div style="display:flex;gap:8px;align-items:flex-end;padding:12px 0;overflow-x:auto">${bars || '<p style="color:var(--text-muted)">No chart data.</p>'}</div>
      <h4 style="margin:24px 0 12px">Top products</h4>
      <div class="data-table"><table><thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead><tbody>
        ${top.length ? top.map((t) => `<tr><td>${escHtml(t.name)}</td><td>${t.units_sold ?? '—'}</td><td>${formatMoney(t.revenue)}</td></tr>`).join('') : '<tr><td colspan="3">No data</td></tr>'}
      </tbody></table></div>
    `;
  } catch (e) {
    el.innerHTML = '<p style="color:var(--text-muted)">Analytics could not be loaded.</p>';
  }
}

async function renderNotificationsContent() {
  const el = document.getElementById('cdash-notifications-content');
  if (!el) return;
  el.innerHTML = '<p class="loading-msg">Loading…</p>';
  try {
    const data = await getMyNotifications();
    const arr = Array.isArray(data) ? data : (data && data.results) || [];
    if (!arr.length) {
      el.innerHTML = '<p style="color:var(--text-muted)">No product notifications yet.</p>';
      return;
    }
    el.innerHTML = arr
      .map((n) => {
        const name = escHtml(n.product_name || 'Product');
        const pid = n.product_id;
        const isWaiting = !n.notified;
        const banner = isWaiting
          ? `<span class="status-pill status-pending">Waiting</span>`
          : `<span class="status-pill status-confirmed">Notified</span>`;
        const extra =
          !isWaiting && n.notified_at
            ? `<div style="margin-top:10px;padding:10px;background:#ecfdf5;border-radius:8px;font-size:14px"><strong>Good news!</strong> ${name} is back in season — <a href="#" onclick="event.preventDefault();navigate('product',${pid});">view product</a></div>`
            : '';
        return `<div style="border-bottom:1px solid rgba(0,0,0,0.08);padding:14px 0">${banner} <strong>${name}</strong>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px">Subscribed: ${escHtml(n.created_at || '')}</div>
        ${extra}</div>`;
      })
      .join('');
  } catch (e) {
    el.innerHTML = '<p style="color:var(--text-muted)">Could not load notifications.</p>';
  }
}

function setAdminTab(tab) {
  state.adminDashTab = tab;
  document.querySelectorAll('#admin-sidebar li').forEach((li) =>
    li.classList.toggle('active', li.dataset.tab === tab)
  );
  document.querySelectorAll('#admin-dash-content .dashboard-section').forEach((s) =>
    s.classList.toggle('active', s.id === 'adash-' + tab)
  );
  if (tab === 'disputes') refreshAdminDisputesList();
  if (tab === 'revenue') initAdminRevenueDates();
}

function initAdminRevenueDates() {
  const from = document.getElementById('adash-rev-from');
  const to = document.getElementById('adash-rev-to');
  if (!from || !to || from.value) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  from.value = start.toISOString().slice(0, 10);
  to.value = now.toISOString().slice(0, 10);
}

async function handleLoadPlatformRevenue() {
  const from = document.getElementById('adash-rev-from')?.value;
  const to = document.getElementById('adash-rev-to')?.value;
  try {
    const r = await getPlatformRevenue({ from, to });
    const sumEl = document.getElementById('adash-revenue-summary');
    const tbody = document.getElementById('adash-revenue-tbody');
    if (sumEl) {
      sumEl.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="label">Platform revenue</div><div class="value">${formatMoney(r.total_platform_revenue ?? r.total_revenue ?? 0)}</div></div>
          <div class="stat-card"><div class="label">Commission</div><div class="value">${formatMoney(r.total_commission_collected ?? r.total_commission ?? 0)}</div></div>
          <div class="stat-card"><div class="label">Producer payouts</div><div class="value">${formatMoney(r.total_producer_payouts ?? 0)}</div></div>
          <div class="stat-card"><div class="label">Active producers</div><div class="value">${r.active_producers ?? '—'}</div></div>
          <div class="stat-card"><div class="label">Active customers</div><div class="value">${r.active_customers ?? '—'}</div></div>
        </div>`;
    }
    const rows = Array.isArray(r.producers) ? r.producers : r.breakdown || r.rows || [];
    if (tbody) {
      tbody.innerHTML = rows.length
        ? rows
            .map((row) => {
              const name = row.producer_name ?? row.name ?? row.business_name ?? '—';
              const sales = row.total_sales ?? row.sales ?? row.revenue ?? 0;
              const com = row.commission ?? 0;
              const pay = row.payout ?? row.producer_payout ?? 0;
              return `<tr><td>${escHtml(name)}</td><td>${formatMoney(sales)}</td><td>${formatMoney(com)}</td><td>${formatMoney(pay)}</td></tr>`;
            })
            .join('')
        : '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">No rows in this range.</td></tr>';
    }
  } catch (e) {
    showToast(apiErrorMessage(e, 'Could not load revenue report.'), 'error');
  }
}

async function handleExportRevenueCSV() {
  const from = document.getElementById('adash-rev-from')?.value;
  const to = document.getElementById('adash-rev-to')?.value;
  try {
    await exportRevenueCSV({ from, to });
    showToast('CSV export started.', 'success');
  } catch (e) {
    showToast(apiErrorMessage(e, 'Export failed.'), 'error');
  }
}

async function refreshAdminDisputesList() {
  const el = document.getElementById('adash-disputes-list');
  if (!el) return;
  el.innerHTML = '<p class="loading-msg">Loading…</p>';
  try {
    const data = await listAdminDisputes();
    const rows = Array.isArray(data) ? data : (data && (data.results || data.disputes)) || [];
    if (!rows.length) {
      el.innerHTML =
        '<p style="color:var(--text-muted);font-size:14px">No disputes returned. Use resolve by ID if your API has no list endpoint.</p>';
      return;
    }
    el.innerHTML =
      '<table><thead><tr><th>ID</th><th>Status</th><th>Reason</th><th>Created</th></tr></thead><tbody>' +
      rows
        .map(
          (d) =>
            `<tr><td>${d.id}</td><td>${escHtml(d.status)}</td><td>${escHtml(d.reason)}</td><td>${escHtml(d.created_at || '')}</td></tr>`
        )
        .join('') +
      '</tbody></table>';
  } catch (e) {
    el.innerHTML =
      '<p style="color:var(--text-muted)">List endpoint unavailable. Use resolve by ID below.</p>';
  }
}

function handleAdminResolveDispute() {
  const id = document.getElementById('adash-resolve-dispute-id')?.value?.trim();
  const status = document.getElementById('adash-resolve-status')?.value;
  const note = document.getElementById('adash-resolve-note')?.value?.trim();
  if (!id || !note) {
    showToast('Fill dispute ID and resolution note.', 'error');
    return;
  }
  resolveDispute(id, { status, resolution_note: note })
    .then(() => {
      showToast('Dispute updated.', 'success');
      refreshAdminDisputesList();
    })
    .catch((err) => showToast(apiErrorMessage(err, 'Could not resolve.'), 'error'));
}

function renderWholesaleBadgesHtml(productId) {
  const w = state.wholesaleLocal[productId];
  if (!w) return '';
  const parts = [];
  if (w.restaurant)
    parts.push(
      `<span class="badge" style="background:#ecfdf5;color:#047857;font-size:11px;margin-right:6px">Restaurant: £${w.restaurant.price} (min ${w.restaurant.min})</span>`
    );
  if (w.community_group)
    parts.push(
      `<span class="badge" style="background:#ecfdf5;color:#047857;font-size:11px">Community: £${w.community_group.price} (min ${w.community_group.min})</span>`
    );
  return parts.join(' ');
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
    } else if (!p.availabilityRaw) {
      try {
        const api = await getProduct(productId);
        p = apiProductToUI(api);
      } catch (_) {
        /* keep cached p */
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
        <div class="price-availability" id="product-detail-price-block">
          <span class="big-price" id="product-detail-price-main">£${p.price.toFixed(2)}</span>
          <span style="font-size:16px;color:var(--text-muted)" id="product-detail-price-suffix">/ ${p.unit}</span>
          <span class="avail-badge available">${p.availability}</span>
        </div>
        <div id="product-detail-notify-wrap" style="margin-top:12px"></div>
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
    </div>
    <div id="product-reviews-root" style="margin-top:40px;max-width:900px"></div>`;
    contentEl.innerHTML = html;
    hydrateProductDetailSprint3(productId, p);
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
  const specEl = document.getElementById('checkout-special-instructions');
  if (specEl) specEl.value = '';
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
  const role = state.currentUser.role;
  if (role === 'producer' || role === 'admin') {
    showToast('This role cannot check out.', 'error');
    return;
  }
  if (!state.cart || state.cart.length === 0) {
    showToast('Your cart is empty.', 'error');
    navigate('browse');
    return;
  }

  // Default delivery date: at least 48 hours from now.
  const minDate = getMinDeliveryDateStr(2);
  const dateInput = document.getElementById('checkout-delivery-date');
  if (dateInput) {
    dateInput.min = minDate;
    if (!dateInput.value) dateInput.value = minDate;
  }

  try {
    ensureStripeInitialized();
  } catch (err) {
    showToast(apiErrorMessage(err, 'Stripe setup error'), 'error');
    return;
  }

  openCheckoutModal();
}

async function handleStripePay() {
  if (!state.currentUser || !['customer', 'restaurant', 'community_group'].includes(state.currentUser.role)) {
    showToast('Please log in with a buyer account to pay.', 'error');
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
    const dateInput = document.getElementById('checkout-delivery-date');
    const deliveryDate = dateInput ? dateInput.value : '';
    if (!deliveryDate) {
      showToast('Select a delivery date.', 'error');
      return;
    }

    const deliveryAddress = state.currentUser.deliveryAddress || '';
    const deliveryPostcode = state.currentUser.postcode || '';
    if (!deliveryAddress || !deliveryPostcode) {
      showToast('Delivery address and postcode are required for checkout.', 'error');
      return;
    }

    // Build producer_groups payload required by backend OrderCreateSerializer.
    const groupsByProducerId = {};
    for (const item of state.cart) {
      const producerId = item.producerId;
      if (!producerId) {
        throw new Error('Cart item is missing producerId. Try reloading products/cart.');
      }
      const key = String(producerId);
      if (!groupsByProducerId[key]) {
        groupsByProducerId[key] = {
          producer_id: Number(producerId),
          fulfilment_type: 'standard',
          delivery_date: deliveryDate,
          items: [],
        };
      }
      groupsByProducerId[key].items.push({
        product_id: Number(item.id),
        quantity: Number(item.qty || 1),
      });
    }

    const specInput = document.getElementById('checkout-special-instructions');
    const specialInstructions = specInput && specInput.value ? String(specInput.value).trim() : '';

    const orderData = {
      delivery_address: deliveryAddress,
      delivery_postcode: deliveryPostcode,
      special_instructions: specialInstructions,
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
    showToast('Payment successful! Your order is confirmed.', 'success');
    closeCheckoutModal();

    // Clear cart UI + backend cart.
    await clearCart();
    const cart = await getCart();
    setCartFromApiResponse(cart);

    navigate(dashboardForRole(state.currentUser && state.currentUser.role));
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
      <div class="user-pill" onclick="navigate('${dashboardForRole(state.currentUser.role)}')">
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
  const roleSelect = document.getElementById('reg-role');
  if (roleSelect && roleSelect.value !== role) roleSelect.value = role;
  document.getElementById('producer-fields').classList.toggle('hidden', role !== 'producer');
  document.getElementById('producer-name-row').classList.toggle('hidden', role !== 'producer');
  document.getElementById('customer-fields').classList.toggle('hidden', role !== 'customer');
  document.getElementById('restaurant-fields').classList.toggle('hidden', role !== 'restaurant');
  document.getElementById('community-fields').classList.toggle('hidden', role !== 'community_group');
  document.getElementById('terms-row').classList.toggle('hidden', role !== 'customer');
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
  } else if (registerRole === 'customer') {
    clearFieldError('reg-name');
    if (!firstName) { showFieldError('reg-first-name', 'First name is required'); valid = false; } else clearFieldError('reg-first-name');
    if (!lastName) { showFieldError('reg-last-name', 'Last name is required'); valid = false; } else clearFieldError('reg-last-name');
  } else {
    clearFieldError('reg-name');
    clearFieldError('reg-first-name');
    clearFieldError('reg-last-name');
  }
  if (registerRole === 'restaurant') {
    const business = document.getElementById('reg-restaurant-business')?.value?.trim() || '';
    const contact = document.getElementById('reg-restaurant-contact')?.value?.trim() || '';
    const address = document.getElementById('reg-restaurant-address')?.value?.trim() || '';
    const postcode = document.getElementById('reg-restaurant-postcode')?.value?.trim() || '';
    if (!business || !contact || !address || !postcode) {
      showToast('Restaurant sign-up needs business name, contact, address, and postcode.', 'error');
      valid = false;
    }
  }
  if (registerRole === 'community_group') {
    const org = document.getElementById('reg-community-org')?.value?.trim() || '';
    const contact = document.getElementById('reg-community-contact')?.value?.trim() || '';
    const address = document.getElementById('reg-community-address')?.value?.trim() || '';
    const postcode = document.getElementById('reg-community-postcode')?.value?.trim() || '';
    if (!org || !contact || !address || !postcode) {
      showToast('Community sign-up needs organisation name, contact, address, and postcode.', 'error');
      valid = false;
    }
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
      email,
      password,
      password_confirm: confirm,
      business_name: document.getElementById('reg-business')?.value?.trim() || name,
      contact_name: name,
      phone_number: document.getElementById('reg-phone')?.value?.trim() || '',
      address: document.getElementById('reg-address')?.value?.trim() || '—',
      postcode: document.getElementById('reg-postcode')?.value?.trim() || '—',
    });
  } else if (registerRole === 'customer') {
    doRegister = () => registerCustomer({
      email,
      password,
      password_confirm: confirm,
      full_name: `${firstName} ${lastName}`.trim(),
      phone_number: document.getElementById('reg-phone')?.value?.trim() || '',
      delivery_address: document.getElementById('reg-delivery')?.value?.trim() || '—',
      postcode: document.getElementById('reg-postcode')?.value?.trim() || '—',
      terms_accepted: true,
    });
  } else if (registerRole === 'restaurant') {
    doRegister = () => registerRestaurant({
      email,
      password,
      password_confirm: confirm,
      business_name: document.getElementById('reg-restaurant-business')?.value?.trim() || '',
      contact_name: document.getElementById('reg-restaurant-contact')?.value?.trim() || '',
      phone_number: document.getElementById('reg-restaurant-phone')?.value?.trim() || '',
      delivery_address: document.getElementById('reg-restaurant-address')?.value?.trim() || '',
      postcode: document.getElementById('reg-restaurant-postcode')?.value?.trim() || '',
      cuisine_type: document.getElementById('reg-restaurant-cuisine')?.value?.trim() || '',
    });
  } else {
    doRegister = () => registerCommunityGroup({
      email,
      password,
      password_confirm: confirm,
      organisation_name: document.getElementById('reg-community-org')?.value?.trim() || '',
      contact_name: document.getElementById('reg-community-contact')?.value?.trim() || '',
      phone_number: document.getElementById('reg-community-phone')?.value?.trim() || '',
      delivery_address: document.getElementById('reg-community-address')?.value?.trim() || '',
      postcode: document.getElementById('reg-community-postcode')?.value?.trim() || '',
      group_type: document.getElementById('reg-community-type')?.value?.trim() || '',
    });
  }

  doRegister()
    .then(() => login(email, password))
    .then(() => getProfile())
    .then(profile => {
      state.currentUser = profileToUser(profile);
      renderAuthNavbar();
      showToast(`Welcome, ${state.currentUser.name.split(' ')[0]}! Account created.`, 'success');
      navigate(dashboardForRole(state.currentUser.role));
      if (['customer', 'restaurant', 'community_group'].includes(state.currentUser.role)) {
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
      navigate(dashboardForRole(state.currentUser.role));
      if (['customer', 'restaurant', 'community_group'].includes(state.currentUser.role)) {
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
    if (o.customer_name) return String(o.customer_name);
    if (o.customer && typeof o.customer === 'object') return String(o.customer.name || o.customer.email || '—');
    if (o.customer) return String(o.customer);
    return '—';
  };
  const toDate = (o) => (o && (o.created_at || o.order_date || o.date)) ? String(o.created_at || o.order_date || o.date) : '—';
  const toDeliveryDate = (o) => (o && (o.delivery_date || o.delivery)) ? String(o.delivery_date || o.delivery) : '—';
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
    const escHtml = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const rows = (state.producerOrders || []).map((o) => {
      const specRaw = o && o.special_instructions != null ? String(o.special_instructions).trim() : '';
      const notesRow = specRaw
        ? `<tr class="pdash-order-spec"><td colspan="7" style="font-size:13px;padding-top:0;padding-bottom:14px;color:var(--text-muted)"><strong style="color:var(--text)">Delivery instructions:</strong> ${escHtml(specRaw)}</td></tr>`
        : '';
      return `
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
      </tr>${notesRow}`;
    }).join('');
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
        <td><img src="${p.img}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;margin-right:8px;vertical-align:middle" />${p.name}
          <div style="margin-top:6px">${renderWholesaleBadgesHtml(p.id)}</div>
        </td>
        <td>${p.category_name}</td>
        <td style="font-weight:700">£${p.price.toFixed(2)}</td>
        <td>${p.stock} ${p.unit}s</td>
        <td><span class="status-pill status-confirmed">${p.availability}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="handleEditProduct(${p.id})">Edit</button>
          <button class="btn btn-primary btn-sm" style="margin-left:6px" onclick="openWholesaleModal(${p.id})">Wholesale</button>
        </td>
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
    showToast(apiErrorMessage(err, 'Could not reorder.'), 'error');
  }
}

async function handleViewReceipt(orderId) {
  if (orderId == null) return;
  try {
    const order = await getOrder(orderId);
    try {
      const receipt = await getOrderReceipt(orderId);
      order.receipt = receipt;
      if (receipt && receipt.payment && !order.payment) {
        order.payment = receipt.payment;
      }
    } catch (_) {
      // Keep viewing order confirmation even if receipt endpoint is unavailable.
    }
    state.lastConfirmedOrder = order;
    navigate('order-confirm');
  } catch (err) {
    showToast(apiErrorMessage(err, 'Could not load receipt.'), 'error');
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
    const base = Array.isArray(orders) ? orders : [];
    state.customerOrders = await Promise.all(
      base.map(async (o) => {
        if (String(o.status || '').toLowerCase() !== 'delivered') return { ...o, _dispute: null };
        try {
          const d = await getDisputeStatus(o.id);
          return { ...o, _dispute: d };
        } catch (err) {
          if (err.status === 404) return { ...o, _dispute: null };
          return { ...o, _dispute: null };
        }
      })
    );
  } catch (err) {
    state.customerOrders = [];
    showToast(apiErrorMessage(err, 'Could not load your order history.'), 'error');
  } finally {
    state.customerOrdersLoading = false;
    renderCustomerDash();
  }
}

function setProducerTab(tab) {
  state.producerDashTab = tab;
  renderProducerDash();
  if (tab === 'orders' || tab === 'overview') refreshProducerOrders();
  if (tab === 'payments') refreshProducerSettlements();
  if (tab === 'reviews') loadProducerReviewsTab();
  if (tab === 'analytics') loadProducerAnalyticsTab();
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
      <td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);font-size:15px">
        Loading your orders…
      </td>
    </tr>`;
  const emptyRow = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);font-size:15px">You haven’t placed any orders yet. When you checkout, your orders will appear here.</td></tr>';

  if (state.customerOrders === null) {
    ordTable.innerHTML = loadingRow;
    if (!state.customerOrdersLoading) refreshCustomerOrders();
    return;
  }

  if (!Array.isArray(state.customerOrders) || state.customerOrders.length === 0) {
    ordTable.innerHTML = emptyRow;
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
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };
  const toProducers = (o) => {
    const groups = Array.isArray(o.producer_groups) ? o.producer_groups : [];
    const names = groups.map(g => g.producer_info?.business_name || g.producer_info?.email).filter(Boolean);
    return names.length ? names.join(', ') : '—';
  };
  const toItemsCount = (o) => {
    const groups = Array.isArray(o.producer_groups) ? o.producer_groups : [];
    return groups.reduce((sum, g) => sum + ((Array.isArray(g.items) ? g.items.length : 0)), 0);
  };
  const toTotal = (o) => o.total_amount ?? o.total ?? 0;
  const toStatus = (o) => (o.status || 'pending');

  ordTable.innerHTML = state.customerOrders
    .map((o) => {
      const disp = o._dispute;
      const st = disp && disp.status ? String(disp.status) : '';
      const dispBadge = st
        ? `<span class="status-pill ${disputeStatusPillClass(st)}" style="margin-left:6px;font-size:11px">${st.replace(/_/g, ' ')}</span>`
        : '';
      const delivered = String(toStatus(o)).toLowerCase() === 'delivered';
      const hasDispute = !!(disp && disp.status);
      const raiseBtn =
        delivered && !hasDispute
          ? `<button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px" onclick="openDisputeModal(${o.id})">Raise dispute</button>`
          : '';
      return `
    <tr>
      <td style="font-weight:600">${toOrderId(o)}</td>
      <td>${toDate(o)}</td>
      <td style="font-size:12px">${toProducers(o)}</td>
      <td style="font-size:12px">${toItemsCount(o)}</td>
      <td style="font-weight:700">${formatMoney(toTotal(o))}</td>
      <td><span class="status-pill status-${toStatus(o).toLowerCase()}">${toStatus(o)}</span>${dispBadge}</td>
      <td style="display:flex;flex-direction:column;align-items:flex-start;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="handleViewReceipt(${o.id})">Receipt</button>
        <button class="btn btn-secondary btn-sm" onclick="handleReorder(${o.id})">Reorder</button>
        ${raiseBtn}
      </td>
    </tr>`;
    })
    .join('');
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
  if (tab === 'orders') refreshCustomerOrders();
  if (tab === 'notifications') renderNotificationsContent();
}

// ---- Admin Commission Report (TC-025) + Sprint 3 revenue/disputes ----
function renderAdminDash() {
  const nameEl = document.getElementById('adash-user-name');
  if (nameEl && state.currentUser) nameEl.textContent = state.currentUser.name;
  setAdminTab(state.adminDashTab || 'commission');
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
      if (['customer', 'restaurant', 'community_group'].includes(state.currentUser.role)) {
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
