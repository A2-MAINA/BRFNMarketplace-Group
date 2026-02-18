/* ============================================================
   BRFN MARKETPLACE — App Logic & Mock Data
   ============================================================ */

// ---- MOCK DATA ----

const CATEGORIES = [
  { id: 'all',       name: 'All Products',        icon: '🛒', count: 24 },
  { id: 'veg',       name: 'Vegetables',           icon: '🥦', count: 8  },
  { id: 'dairy',     name: 'Dairy & Eggs',         icon: '🥛', count: 5  },
  { id: 'bakery',    name: 'Bakery',               icon: '🍞', count: 4  },
  { id: 'preserves', name: 'Preserves',            icon: '🫙', count: 3  },
  { id: 'seasonal',  name: 'Seasonal Specialties', icon: '🍓', count: 4  },
];

const PRODUCTS = [
  {
    id: 1, name: 'Organic Free Range Eggs', category: 'dairy',
    price: 3.50, unit: 'dozen',
    producer: 'Bristol Valley Farm', producerInitial: 'BV',
    description: 'Fresh organic eggs from free-range hens, collected daily. Our hens roam freely across 40 acres of organic pasture.',
    availability: 'In Season', stock: 50,
    allergens: ['Eggs'],
    organic: true,
    harvestDate: '2026-02-15',
    emoji: '🥚',
  },
  {
    id: 2, name: 'Organic Carrots', category: 'veg',
    price: 1.80, unit: 'kg',
    producer: 'Bristol Valley Farm', producerInitial: 'BV',
    description: 'Sweet, freshly harvested organic carrots grown without pesticides. Perfect for roasting or juicing.',
    availability: 'Available', stock: 35,
    allergens: [],
    organic: true,
    harvestDate: '2026-02-14',
    emoji: '🥕',
  },
  {
    id: 3, name: 'Fresh Whole Milk', category: 'dairy',
    price: 1.20, unit: 'litre',
    producer: 'Hillside Dairy', producerInitial: 'HD',
    description: 'Creamy whole milk from our small herd of Friesian cows, pasteurised and bottled on-farm same day.',
    availability: 'Available', stock: 80,
    allergens: ['Milk'],
    organic: false,
    harvestDate: '2026-02-17',
    emoji: '🥛',
  },
  {
    id: 4, name: 'Sourdough Loaf', category: 'bakery',
    price: 4.50, unit: 'loaf',
    producer: 'Clifton Bakehouse', producerInitial: 'CB',
    description: 'Slow-fermented sourdough using a 20-year-old starter, baked fresh each morning in a stone oven.',
    availability: 'In Season', stock: 12,
    allergens: ['Gluten', 'Wheat'],
    organic: false,
    harvestDate: '2026-02-17',
    emoji: '🍞',
  },
  {
    id: 5, name: 'Heritage Tomatoes', category: 'veg',
    price: 3.20, unit: 'kg',
    producer: 'Redland Growers', producerInitial: 'RG',
    description: 'A vibrant mix of heirloom tomato varieties — from sweet cherry to beefsteak. Grown in our heated glasshouses.',
    availability: 'Available', stock: 28,
    allergens: [],
    organic: true,
    harvestDate: '2026-02-16',
    emoji: '🍅',
  },
  {
    id: 6, name: 'Mature Cheddar Cheese', category: 'dairy',
    price: 6.80, unit: '500g',
    producer: 'Hillside Dairy', producerInitial: 'HD',
    description: 'Aged 18 months in our stone cellar, this cheddar has a rich, nutty depth of flavour with a crumbly texture.',
    availability: 'Available', stock: 20,
    allergens: ['Milk'],
    organic: false,
    harvestDate: '2025-08-01',
    emoji: '🧀',
  },
  {
    id: 7, name: 'Wild Garlic Pesto', category: 'preserves',
    price: 4.20, unit: '180g jar',
    producer: 'Avon Valley Kitchen', producerInitial: 'AV',
    description: 'Made from freshly foraged wild garlic, toasted pine nuts, and Somerset parmesan. Limited seasonal stock.',
    availability: 'In Season', stock: 15,
    allergens: ['Nuts', 'Milk'],
    organic: false,
    harvestDate: '2026-02-10',
    emoji: '🫙',
  },
  {
    id: 8, name: 'Strawberries', category: 'seasonal',
    price: 3.80, unit: '400g punnet',
    producer: 'Redland Growers', producerInitial: 'RG',
    description: 'Sun-ripened British strawberries, picked to order for peak sweetness. Available June–August only.',
    availability: 'In Season', stock: 40,
    allergens: [],
    organic: false,
    harvestDate: '2026-02-17',
    emoji: '🍓',
  },
  {
    id: 9, name: 'Mixed Salad Leaves', category: 'veg',
    price: 2.50, unit: '100g bag',
    producer: 'Redland Growers', producerInitial: 'RG',
    description: 'A vibrant mix of rocket, spinach, watercress and baby leaves, harvested and packed on the same day.',
    availability: 'Available', stock: 60,
    allergens: [],
    organic: true,
    harvestDate: '2026-02-17',
    emoji: '🥗',
  },
  {
    id: 10, name: 'Walnut Bread', category: 'bakery',
    price: 3.80, unit: 'loaf',
    producer: 'Clifton Bakehouse', producerInitial: 'CB',
    description: 'Dense, flavourful bread packed with whole walnuts, baked with wholemeal flour and a touch of honey.',
    availability: 'Available', stock: 8,
    allergens: ['Gluten', 'Wheat', 'Nuts'],
    organic: false,
    harvestDate: '2026-02-17',
    emoji: '🥖',
  },
  {
    id: 11, name: 'Fresh Apples', category: 'seasonal',
    price: 2.20, unit: 'kg',
    producer: 'Bristol Valley Farm', producerInitial: 'BV',
    description: 'Cox, Braeburn and Discovery varieties from our century-old orchard. No waxing or chemical treatment.',
    availability: 'Available', stock: 100,
    allergens: [],
    organic: true,
    harvestDate: '2026-02-12',
    emoji: '🍎',
  },
  {
    id: 12, name: 'Honey (Set)', category: 'preserves',
    price: 7.50, unit: '340g jar',
    producer: 'Avon Valley Kitchen', producerInitial: 'AV',
    description: 'Raw set honey from our urban hives, pollinated by Bristol\'s parks and gardens. Unfiltered and unpasteurised.',
    availability: 'Available', stock: 22,
    allergens: [],
    organic: false,
    harvestDate: '2025-09-01',
    emoji: '🍯',
  },
];

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
};

// ---- CART ----
function getCartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function getCartCount() {
  return state.cart.reduce((sum, item) => sum + item.qty, 0);
}

function addToCart(productId, qty = 1) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;
  const existing = state.cart.find(i => i.id === productId);
  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({ ...product, qty });
  }
  updateCartUI();
  showToast(`Added ${product.name} to cart 🛒`, 'success');
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(i => i.id !== productId);
  updateCartUI();
  renderCart();
}

function updateQty(productId, delta) {
  const item = state.cart.find(i => i.id === productId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  updateCartUI();
  renderCart();
}

function updateCartUI() {
  const count = getCartCount();
  const countEl = document.getElementById('cart-count');
  if (countEl) {
    countEl.textContent = count;
    countEl.classList.toggle('hidden', count === 0);
  }
}

// ---- TOAST ----
function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ---- PAGE NAVIGATION ----
function navigate(page, extra) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) { target.classList.add('active'); target.classList.add('fade-up'); }
  state.currentPage = page;

  // Update nav
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
  });

  // Re-render
  if (page === 'browse')   renderBrowse();
  if (page === 'cart')     renderCart();
  if (page === 'product')  renderProductDetail(extra);
  if (page === 'producer-dash') renderProducerDash();
  if (page === 'customer-dash') renderCustomerDash();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- PRODUCT RENDERING ----
function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    const catMatch = state.currentCategory === 'all' || p.category === state.currentCategory;
    const q = state.searchQuery.toLowerCase();
    const searchMatch = !q || p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.producer.toLowerCase().includes(q);
    return catMatch && searchMatch;
  });
}

function productCardHTML(p) {
  const allergenHTML = p.allergens.length
    ? p.allergens.map(a => `<span class="allergen-tag">⚠ ${a}</span>`).join('')
    : `<span class="no-allergen">No common allergens</span>`;
  return `
    <div class="product-card fade-up" onclick="navigate('product', ${p.id})">
      <div class="product-img">
        <span>${p.emoji}</span>
        <span class="product-badge ${p.organic ? 'organic' : ''}">${p.organic ? '🌿 Organic' : p.availability}</span>
      </div>
      <div class="product-body">
        <div class="product-meta">
          <div>
            <div class="product-name">${p.name}</div>
            <div class="product-producer">🏡 ${p.producer}</div>
          </div>
          <div class="product-price">£${p.price.toFixed(2)}</div>
        </div>
        <p class="product-desc">${p.description.substring(0, 90)}…</p>
        <div class="allergen-tags">${allergenHTML}</div>
        <button class="btn btn-primary btn-sm btn-full"
          onclick="event.stopPropagation(); addToCart(${p.id})">
          Add to Cart
        </button>
      </div>
    </div>`;
}

function renderBrowse() {
  // Category pills
  const catContainer = document.getElementById('category-grid');
  if (catContainer) {
    catContainer.innerHTML = CATEGORIES.map(c => `
      <div class="category-card ${c.id === state.currentCategory ? 'active' : ''}"
           onclick="setCategory('${c.id}')">
        <div class="cat-icon">${c.icon}</div>
        <h4>${c.name}</h4>
        <span>${c.count} items</span>
      </div>`).join('');
  }

  const products = getFilteredProducts();
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="no-results" style="grid-column:1/-1">
        <div class="emoji">🔍</div>
        <h3>No products found</h3>
        <p>Try a different category or search term.</p>
      </div>`;
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
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;
  state.currentProduct = p;

  const allergenSection = p.allergens.length
    ? `<div class="allergen-warning">
         <span class="warn-icon">⚠️</span>
         <div>
           <h4>Allergen Information</h4>
           <p style="font-size:13px;margin-bottom:8px">This product contains:</p>
           <div class="tags">${p.allergens.map(a => `<span class="allergen-tag">⚠ ${a}</span>`).join('')}</div>
         </div>
       </div>`
    : `<div class="detail-section"><h4>Allergen Information</h4>
       <p style="font-size:14px;color:var(--green-mid);font-weight:600">✅ No common allergens declared</p></div>`;

  document.getElementById('product-detail-content').innerHTML = `
    <div class="product-detail-layout">
      <div class="product-detail-img">${p.emoji}</div>
      <div class="product-detail-info">
        <div class="breadcrumb">
          <span onclick="navigate('browse')">Marketplace</span> ›
          <span onclick="navigate('browse'); setCategory('${p.category}')">${CATEGORIES.find(c=>c.id===p.category)?.name || 'Products'}</span> ›
          <span>${p.name}</span>
        </div>
        <h1>${p.name}</h1>
        <div class="producer-info">
          <div class="producer-avatar">${p.producerInitial}</div>
          <div class="producer-info-text">
            <strong>${p.producer}</strong>
            Bristol, UK · Within 20 miles
          </div>
        </div>
        <div class="price-row">
          <span class="big-price">£${p.price.toFixed(2)}</span>
          <span>/ ${p.unit}</span>
          <span class="availability-badge available">${p.availability}</span>
        </div>
        <div class="detail-section">
          <h4>About this product</h4>
          <p style="font-size:15px;color:var(--text-mid);line-height:1.7">${p.description}</p>
        </div>
        <div class="detail-section" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><h4>Stock</h4><p style="font-size:15px;font-weight:600">${p.stock} ${p.unit}s available</p></div>
          <div><h4>Organic</h4><p style="font-size:15px;font-weight:600">${p.organic ? '🌿 Certified Organic' : 'Conventional'}</p></div>
          <div><h4>Harvest Date</h4><p style="font-size:15px;font-weight:600">${p.harvestDate}</p></div>
          <div><h4>Food Miles</h4><p style="font-size:15px;font-weight:600">~${Math.floor(Math.random()*15)+2} miles 🚜</p></div>
        </div>
        ${allergenSection}
        <div class="qty-add-row">
          <div class="qty-control">
            <button class="qty-btn" id="detail-minus" onclick="changeDetailQty(-1)">−</button>
            <span class="qty-val" id="detail-qty">1</span>
            <button class="qty-btn" id="detail-plus" onclick="changeDetailQty(1)">+</button>
          </div>
          <button class="btn btn-primary" style="flex:1" onclick="addDetailToCart()">
            🛒 Add to Cart
          </button>
        </div>
      </div>
    </div>`;
}

let detailQty = 1;
function changeDetailQty(delta) {
  detailQty = Math.max(1, detailQty + delta);
  const el = document.getElementById('detail-qty');
  if (el) el.textContent = detailQty;
}

function addDetailToCart() {
  if (state.currentProduct) {
    addToCart(state.currentProduct.id, detailQty);
    detailQty = 1;
    const el = document.getElementById('detail-qty');
    if (el) el.textContent = 1;
  }
}

// ---- CART RENDER ----
function renderCart() {
  const wrap = document.getElementById('cart-items-wrap');
  const summary = document.getElementById('cart-summary');
  if (!wrap) return;

  if (state.cart.length === 0) {
    wrap.innerHTML = `
      <div class="cart-empty">
        <div class="emoji">🛒</div>
        <h3>Your cart is empty</h3>
        <p>Discover fresh local produce from Bristol's finest farms.</p>
        <button class="btn btn-primary" onclick="navigate('browse')">Browse Marketplace</button>
      </div>`;
    if (summary) summary.innerHTML = '';
    return;
  }

  // Group by producer
  const groups = {};
  state.cart.forEach(item => {
    if (!groups[item.producer]) groups[item.producer] = [];
    groups[item.producer].push(item);
  });

  wrap.innerHTML = Object.entries(groups).map(([producer, items]) => `
    <div class="producer-group">
      <div class="producer-group-header">
        <span class="icon">🏡</span>
        <h4>${producer}</h4>
        <span>${items.length} item${items.length > 1 ? 's' : ''}</span>
      </div>
      ${items.map(item => `
        <div class="cart-item">
          <div class="cart-item-icon">${item.emoji}</div>
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-unit">£${item.price.toFixed(2)} / ${item.unit}</div>
          </div>
          <div class="qty-control">
            <button class="qty-btn" onclick="updateQty(${item.id}, -1)">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
          </div>
          <div class="cart-item-price">£${(item.price * item.qty).toFixed(2)}</div>
          <button class="remove-btn" onclick="removeFromCart(${item.id})">✕</button>
        </div>`).join('')}
    </div>`).join('');

  const subtotal = getCartTotal();
  const commission = subtotal * 0.05;
  const total = subtotal;

  if (summary) {
    summary.innerHTML = `
      <h3>Order Summary</h3>
      <div class="summary-line"><span>Subtotal (${getCartCount()} items)</span><span>£${subtotal.toFixed(2)}</span></div>
      <div class="summary-line"><span>Delivery</span><span style="color:var(--green-mid)">Arranged with producer</span></div>
      <div class="summary-line total"><span>Total</span><span>£${total.toFixed(2)}</span></div>
      <div class="commission-note">
        💼 A 5% network commission (£${commission.toFixed(2)}) supports the Bristol Regional Food Network. Producers receive 95% of the sale price.
      </div>
      <button class="btn btn-amber btn-full" onclick="handleCheckout()" style="margin-bottom:10px">
        Proceed to Checkout →
      </button>
      <button class="btn btn-secondary btn-full" onclick="navigate('browse')">
        Continue Shopping
      </button>`;
  }
}

function handleCheckout() {
  if (!state.currentUser) {
    showToast('Please log in to checkout', 'error');
    navigate('login');
  } else {
    showToast('Checkout coming in Sprint 2! 🛍', '');
  }
}

// ---- AUTH ----
function renderAuthNavbar() {
  const actionsEl = document.getElementById('navbar-actions');
  if (!actionsEl) return;

  if (state.currentUser) {
    const initials = state.currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
    actionsEl.innerHTML = `
      <button class="cart-btn" onclick="navigate('cart')">
        🛒 Cart
        <span class="cart-count hidden" id="cart-count">0</span>
      </button>
      <div class="user-pill" onclick="navigate('${state.currentUser.role === 'producer' ? 'producer-dash' : 'customer-dash'}')">
        <div class="user-avatar">${initials}</div>
        <span class="user-name">${state.currentUser.name.split(' ')[0]}</span>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="logout()">Log out</button>`;
  } else {
    actionsEl.innerHTML = `
      <button class="cart-btn" onclick="navigate('cart')">
        🛒 Cart
        <span class="cart-count hidden" id="cart-count">0</span>
      </button>
      <button class="btn btn-secondary btn-sm" onclick="navigate('login')">Log in</button>
      <button class="btn btn-primary btn-sm" onclick="navigate('register')">Sign up</button>`;
  }
  updateCartUI();
}

function logout() {
  state.currentUser = null;
  renderAuthNavbar();
  navigate('home');
  showToast('Logged out successfully', '');
}

// ---- REGISTER ----
let registerRole = 'customer';

function setRegisterRole(role) {
  registerRole = role;
  document.querySelectorAll('.role-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.role === role);
  });
  document.getElementById('producer-fields').classList.toggle('hidden', role !== 'producer');
  document.getElementById('terms-row').classList.toggle('hidden', role !== 'customer');
}

function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  let valid = true;

  // Validation
  if (!name) { showFieldError('reg-name', 'Name is required'); valid = false; }
  else clearFieldError('reg-name');

  if (!email || !email.includes('@')) { showFieldError('reg-email', 'Valid email required'); valid = false; }
  else clearFieldError('reg-email');

  if (password.length < 8) { showFieldError('reg-password', 'Password must be at least 8 characters'); valid = false; }
  else clearFieldError('reg-password');

  if (password !== confirm) { showFieldError('reg-confirm', 'Passwords do not match'); valid = false; }
  else clearFieldError('reg-confirm');

  if (registerRole === 'customer') {
    const terms = document.getElementById('terms-check');
    if (terms && !terms.checked) { showToast('Please accept the terms and conditions', 'error'); valid = false; }
  }

  if (!valid) return;

  // Mock registration
  state.currentUser = {
    name,
    email,
    role: registerRole,
    businessName: registerRole === 'producer' ? document.getElementById('reg-business')?.value : null,
  };
  renderAuthNavbar();
  showToast(`Welcome, ${name.split(' ')[0]}! Account created. 🎉`, 'success');
  navigate(registerRole === 'producer' ? 'producer-dash' : 'customer-dash');
}

// ---- LOGIN ----
function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showToast('Please enter your email and password', 'error');
    return;
  }

  // Mock login (any valid-looking input works in mock mode)
  if (!email.includes('@') || password.length < 4) {
    showToast('Invalid email or password', 'error');
    return;
  }

  // Demo accounts
  const demoAccounts = {
    'producer@example.com': { name: 'Jane Smith', role: 'producer', businessName: 'Bristol Valley Farm' },
    'customer@example.com': { name: 'Robert Johnson', role: 'customer' },
  };

  state.currentUser = demoAccounts[email] || { name: email.split('@')[0], role: 'customer' };
  renderAuthNavbar();
  showToast(`Welcome back, ${state.currentUser.name.split(' ')[0]}! 👋`, 'success');
  navigate(state.currentUser.role === 'producer' ? 'producer-dash' : 'customer-dash');
}

// ---- FIELD VALIDATION HELPERS ----
function showFieldError(id, msg) {
  const input = document.getElementById(id);
  if (input) input.classList.add('error');
  const errEl = document.getElementById(id + '-err');
  if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
}

function clearFieldError(id) {
  const input = document.getElementById(id);
  if (input) input.classList.remove('error');
  const errEl = document.getElementById(id + '-err');
  if (errEl) errEl.classList.remove('show');
}

// Password strength
function checkPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const bars = document.querySelectorAll('.strength-bar');
  const levels = ['', 'weak', 'fair', 'good', 'strong'];
  bars.forEach((bar, i) => {
    bar.className = 'strength-bar';
    if (i < score) bar.classList.add(levels[score]);
  });
}

// ---- PRODUCER DASHBOARD ----
const MOCK_ORDERS = [
  { id: '#ORD-001', customer: 'Robert Johnson', date: '2026-02-15', delivery: '2026-02-17', items: 'Organic Eggs × 3, Carrots × 2kg', total: 14.10, status: 'Confirmed' },
  { id: '#ORD-002', customer: 'Sarah Williams', date: '2026-02-14', delivery: '2026-02-18', items: 'Organic Eggs × 5', total: 17.50, status: 'Pending' },
  { id: '#ORD-003', customer: 'St Mary\'s School', date: '2026-02-12', delivery: '2026-02-19', items: 'Fresh Apples × 20kg, Carrots × 30kg', total: 98.00, status: 'Ready' },
];

const MOCK_PRODUCER_PRODUCTS = PRODUCTS.filter(p => p.producer === 'Bristol Valley Farm');

function renderProducerDash() {
  // Sidebar active
  document.querySelectorAll('#producer-sidebar li').forEach(li => {
    li.classList.toggle('active', li.dataset.tab === state.producerDashTab);
  });

  document.querySelectorAll('#producer-dash-content .dashboard-section').forEach(s => {
    s.classList.toggle('active', s.id === `pdash-${state.producerDashTab}`);
  });

  // Overview stats
  const statVals = { total: '£129.60', orders: '3', products: '4' };
  const totalEl = document.getElementById('pdash-total'); if (totalEl) totalEl.textContent = statVals.total;
  const ordEl = document.getElementById('pdash-orders-count'); if (ordEl) ordEl.textContent = statVals.orders;
  const prodEl = document.getElementById('pdash-prod-count'); if (prodEl) prodEl.textContent = statVals.products;

  // Orders table
  const ordersTableEl = document.getElementById('pdash-orders-table');
  if (ordersTableEl) {
    ordersTableEl.innerHTML = MOCK_ORDERS.map(o => `
      <tr>
        <td style="font-weight:600">${o.id}</td>
        <td>${o.customer}</td>
        <td>${o.date}</td>
        <td>${o.delivery}</td>
        <td style="max-width:180px;font-size:12px">${o.items}</td>
        <td style="font-weight:700">£${o.total.toFixed(2)}</td>
        <td><span class="status-pill status-${o.status.toLowerCase()}">${o.status}</span></td>
      </tr>`).join('');
  }

  // Products table
  const prodTableEl = document.getElementById('pdash-products-table');
  if (prodTableEl) {
    prodTableEl.innerHTML = MOCK_PRODUCER_PRODUCTS.map(p => `
      <tr>
        <td>${p.emoji} ${p.name}</td>
        <td>${p.category}</td>
        <td style="font-weight:700">£${p.price.toFixed(2)}</td>
        <td>${p.stock} ${p.unit}s</td>
        <td><span class="status-pill ${p.availability === 'Available' || p.availability === 'In Season' ? 'status-confirmed' : 'status-pending'}">${p.availability}</span></td>
        <td><button class="btn btn-secondary btn-sm" onclick="showToast('Edit product — coming with backend integration!','')">Edit</button></td>
      </tr>`).join('');
  }
}

function setProducerTab(tab) {
  state.producerDashTab = tab;
  renderProducerDash();
}

// ---- CUSTOMER DASHBOARD ----
const MOCK_CUSTOMER_ORDERS = [
  { id: '#ORD-108', date: '2026-02-14', producers: 'Bristol Valley Farm', items: 'Organic Eggs × 2, Carrots × 3kg', total: 12.40, status: 'Confirmed' },
  { id: '#ORD-095', date: '2026-02-07', producers: 'Hillside Dairy, Clifton Bakehouse', items: 'Milk × 4L, Sourdough × 1', total: 9.30, status: 'Delivered' },
];

function renderCustomerDash() {
  document.querySelectorAll('#customer-sidebar li').forEach(li => {
    li.classList.toggle('active', li.dataset.tab === state.customerDashTab);
  });
  document.querySelectorAll('#customer-dash-content .dashboard-section').forEach(s => {
    s.classList.toggle('active', s.id === `cdash-${state.customerDashTab}`);
  });

  const ordTableEl = document.getElementById('cdash-orders-table');
  if (ordTableEl) {
    ordTableEl.innerHTML = MOCK_CUSTOMER_ORDERS.map(o => `
      <tr>
        <td style="font-weight:600">${o.id}</td>
        <td>${o.date}</td>
        <td style="font-size:12px">${o.producers}</td>
        <td style="font-size:12px;max-width:200px">${o.items}</td>
        <td style="font-weight:700">£${o.total.toFixed(2)}</td>
        <td><span class="status-pill status-${o.status.toLowerCase()}">${o.status}</span></td>
        <td><button class="btn btn-secondary btn-sm" onclick="showToast('Reorder added to cart!','success')">Reorder</button></td>
      </tr>`).join('');
  }
}

function setCustomerTab(tab) {
  state.customerDashTab = tab;
  renderCustomerDash();
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  renderAuthNavbar();
  navigate('home');

  // Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (state.currentPage === 'browse') renderBrowse();
    });
  }

  // Password strength indicator
  const pwInput = document.getElementById('reg-password');
  if (pwInput) {
    pwInput.addEventListener('input', () => checkPasswordStrength(pwInput.value));
  }
});
