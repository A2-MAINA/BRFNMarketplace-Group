# BRFN Marketplace — Test Case Reference

**Project:** Bristol Regional Food Network Digital Marketplace
**Module:** 60% group project, due 7 May 2026
**Sprints:** Sprint 1 (15%) · Sprint 2 (15%) · Sprint 3 (50%)
**Total test cases:** 25 — **all PASS** (re-verified 2026-05-01 against the freshly-rebuilt containers)

This document records, for every test case, what it verifies, the exact code that implements it, and which team member owned each piece. Use it as both a marker's index and a contribution audit.

---

## Team & areas of ownership

| Member | Primary area | Owns |
|---|---|---|
| **Al-amin Maina** | Tech lead / backend | All Sprint 1+2+3 models, all Sprint 2+3 serializers / views / URLs, Django admin (colour-coded badges), migrations, git workflow + merges, end-to-end curl validation, Sprint guides + Q&A docs, PM portfolios |
| **Dalla Eugene** | Backend API (Sprint 1) | All 13 Sprint 1 endpoints, `ProducerRegistrationSerializer`, `CustomerRegistrationSerializer`, `IsProducer` / `IsCustomer` permissions, Sprint 1 URL routing, Sprint 2/3 endpoint review + integration support |
| **Joel Rowland** | Frontend pages | All 7 Sprint 1 pages (registration, login, marketplace, product detail, add product, cart), all 9 Sprint 2 pages (checkout, order confirmation, producer dashboard, status update UI, inventory mgmt, settlement report, order history, admin commission, product search), all Sprint 3 pages (reviews section, dispute modal, notify-me button, restaurant dashboard, community group dashboard, producer analytics, platform revenue, wholesale price display); category filtering, allergen display, route guards, navbar |
| **Saad Sail** | Frontend integration & DevOps | Sprint 1 service layer (`auth.js`, `products.js`, `cart.js`), AuthContext, Docker Compose, CORS, container networking; Sprint 2 service layer (`orders.js`, `paymentService.js`, `adminService.js`), Stripe test-mode Docker setup, demo accounts in `entrypoint.sh`; Sprint 3 service layer (`reviewService.js`, `disputeService.js`, `notificationService.js`, `analyticsService.js`, `wholesaleService.js`); restaurant + community-group role wiring in `auth.js`; README documentation |

> **Convention:** the per-TC "Team contributions" sections list only the work specific to that test case. The full role descriptions above are not repeated.

---

## Test environment & demo accounts

- **Frontend (nginx + static)**: `http://localhost:3025`
- **Backend (Django + DRF)**: `http://localhost:8025` (proxied at `/api/*` by the frontend nginx)
- **DB (Postgres 16)**: `localhost:5455`
- **Stack**: `docker compose up -d` (see [docker-compose.yml](docker-compose.yml))
- **Seeded by [backend/entrypoint.sh](backend/entrypoint.sh)**: `admin@brfn.com / Admin123!`, `customer@example.com / Password1!`, `producer@example.com / Password1!`
- **Registered via API in the test sweep**: `restaurant@example.com / Password1!`, `community@example.com / Password1!`, plus a second producer `producer2@example.com / Password1!` for TC-008
- **Follow-up (Saad)**: extend `entrypoint.sh` to upsert restaurant + community demo accounts so `docker compose up` gives all 5 roles out of the box

---

## Status summary

| TC | Sprint | Name | Status |
|---|---|---|---|
| TC-001 | 1 | Producer Registration | PASS |
| TC-002 | 1 | Customer Registration | PASS |
| TC-003 | 1 | Product Listing (as Producer) | PASS |
| TC-004 | 1 | Browse Products by Category | PASS |
| TC-006 | 1 | Shopping Cart | PASS |
| TC-015 | 1 | Allergen Display | PASS |
| TC-022 | 1 | Authentication & Security | PASS |
| TC-005 | 2 | Product Search | PASS |
| TC-007 | 2 | Single Producer Checkout | PASS |
| TC-008 | 2 | Multi-Vendor Checkout | PASS |
| TC-009 | 2 | Producer Order Dashboard | PASS |
| TC-010 | 2 | Order Status Update | PASS |
| TC-011 | 2 | Producer Inventory Update | PASS |
| TC-012 | 2 | Weekly Payment Settlements | PASS |
| TC-021 | 2 | Customer Order History | PASS |
| TC-025 | 2 | Admin Commission Report | PASS |
| TC-013 | 3 | Special Delivery Instructions | PASS |
| TC-014 | 3 | Dispute Resolution | PASS |
| TC-016 | 3 | Seasonal Availability Notifications | PASS |
| TC-017 | 3 | Producer Analytics Dashboard | PASS |
| TC-018 | 3 | Platform Revenue Reporting | PASS |
| TC-019 | 3 | Community Group Bulk Ordering | PASS |
| TC-020 | 3 | Restaurant Wholesale Pricing | PASS |
| TC-023 | 3 | Product Reviews and Ratings | PASS |
| TC-024 | 3 | Producer Response to Reviews | PASS |

---

# Sprint 1 — 7 test cases

## TC-001 — Producer Registration

**Sprint:** 1 · **Status:** PASS

**What this verifies.** A producer can create an account with business name, contact name, phone, address, postcode (UK Companies House registration is optional). Their `User.role` is set to `producer` and a one-to-one `ProducerProfile` is created in the same atomic transaction.

**Backend implementation**
- Models: [backend/users/models.py:33-65](backend/users/models.py#L33-L65) (`User` with email-as-USERNAME_FIELD, `role` field), [backend/users/models.py:69-102](backend/users/models.py#L69-L102) (`ProducerProfile` with business_name, contact_name, phone_number, address, postcode, optional CRN, food_hygiene_rating)
- Serializer: `ProducerRegistrationSerializer` — [backend/users/serializers.py:25-92](backend/users/serializers.py#L25-L92)
- View: `ProducerRegistrationView` — [backend/users/views.py:22-31](backend/users/views.py#L22-L31)
- URL: `POST /api/auth/register/producer/` — [backend/users/urls.py:16](backend/users/urls.py#L16)

**Frontend implementation**
- Page: `#page-register` block — [frontend/index.html:329](frontend/index.html#L329) onwards (role select, producer-fields panel with reg-business / reg-name / reg-phone / reg-address / reg-postcode)
- Handler: `handleRegister()` — [frontend/app.js:885](frontend/app.js#L885)
- Service: `registerProducer()` — [frontend/src/services/auth.js](frontend/src/services/auth.js)

**Team contributions**
- **Al-amin** — `User`, `ProducerProfile` models; migration `users/0001_initial`; admin badge for producer role
- **Dalla** — `ProducerRegistrationSerializer`, `ProducerRegistrationView`, `register/producer/` URL routing
- **Joel** — `#page-register` UI, role-switcher, producer-fields validation, post-registration redirect to producer dashboard
- **Saad** — `auth.js` service, AuthContext wiring, demo `producer@example.com` upsert in `entrypoint.sh`

**Test command**
```bash
curl -b $JAR -c $JAR -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" \
  -X POST http://localhost:3025/api/auth/register/producer/ \
  -d '{"email":"producer2@example.com","password":"Password1!","password_confirm":"Password1!",
       "business_name":"Clifton Bakery","contact_name":"Robin Baker","phone_number":"01179 555333",
       "address":"7 Whiteladies Road, Bristol","postcode":"BS8 2LX"}'
```
**Expected:** HTTP 201, body `{"id":6,"email":"producer2@example.com","role":"producer"}`. Confirmed via `GET /api/auth/profile/` returning `producer_profile.business_name == "Clifton Bakery"`.

---

## TC-002 — Customer Registration

**Sprint:** 1 · **Status:** PASS

**What this verifies.** A customer can register with full name, phone, delivery address, postcode and **must** tick "I accept the terms & conditions". The serializer rejects registration when `terms_accepted=false` and stamps `terms_accepted_at` with the current timestamp — this satisfies UK GDPR Article 7 (right to demonstrate when consent was given).

**Backend implementation**
- Models: [backend/users/models.py:107-144](backend/users/models.py#L107-L144) (`CustomerProfile` with `terms_accepted: BooleanField` and `terms_accepted_at: DateTimeField` for GDPR consent records)
- Serializer: `CustomerRegistrationSerializer` — [backend/users/serializers.py:99-172](backend/users/serializers.py#L99-L172) (validates `terms_accepted=True`, stamps `timezone.now()`)
- View: `CustomerRegistrationView` — [backend/users/views.py:34-43](backend/users/views.py#L34-L43)
- URL: `POST /api/auth/register/customer/` — [backend/users/urls.py:17](backend/users/urls.py#L17)

**Frontend implementation**
- Page: `#page-register` customer-fields panel + terms-row checkbox
- Handler: `handleRegister()` — [frontend/app.js:885](frontend/app.js#L885) (validates first/last name + terms checkbox)
- Service: `registerCustomer()` — [frontend/src/services/auth.js](frontend/src/services/auth.js)

**Team contributions**
- **Al-amin** — `CustomerProfile` model with GDPR consent fields; migration; admin registration
- **Dalla** — `CustomerRegistrationSerializer` (terms validation), `CustomerRegistrationView`, `register/customer/` URL routing
- **Joel** — `#page-register` customer-fields panel, terms checkbox UI
- **Saad** — `auth.js`, demo `customer@example.com` upsert in `entrypoint.sh`

**Test command**
```bash
curl -b /tmp/customer.cookie http://localhost:3025/api/auth/profile/
```
**Expected:** `customer_profile.terms_accepted == true`, `customer_profile.terms_accepted_at != null`.

---

## TC-003 — Product Listing (as Producer)

**Sprint:** 1 · **Status:** PASS

**What this verifies.** A producer can list a product with mandatory traceability fields (origin, organic Y/N, storage instructions, at least one date). Allergens are linked via M2M. Non-producers (customers, restaurants, community groups) cannot create products — `IsProducer` permission rejects with 403.

**Backend implementation**
- Models: [backend/products/models.py:37-152](backend/products/models.py#L37-L152) (`Product` with name, FK producer, FK category, price, unit, stock_quantity, harvest_date / production_date / best_before, M2M `allergens`, origin_location, is_organic, storage_instructions)
- Serializer: `ProductSerializer` — [backend/products/serializers.py:13-44](backend/products/serializers.py#L13-L44) (validates ≥1 date, nests category + allergens + producer business name in responses)
- View: `ProductListCreateView` — [backend/products/views.py:15-36](backend/products/views.py#L15-L36) (`POST` requires authenticated **+ IsProducer**)
- URL: `POST /api/products/` — [backend/products/urls.py:17](backend/products/urls.py#L17)
- Permission: `IsProducer` — [backend/users/permissions.py:3-8](backend/users/permissions.py#L3-L8)

**Frontend implementation**
- Page: `#page-producer-dash` add-product form (prod-name, prod-category, prod-desc, prod-price, prod-unit, prod-stock, prod-harvest, prod-organic, allergen checkboxes)
- Handler: `handleAddProduct()` — [frontend/app.js](frontend/app.js)
- Service: `createProduct()` — [frontend/src/services/products.js](frontend/src/services/products.js)

**Team contributions**
- **Al-amin** — `Product` model + traceability fields; migration; admin
- **Dalla** — `ProductSerializer`, `ProductListCreateView`, products URL routing, `IsProducer` permission gate
- **Joel** — Add Product UI, allergen checkbox grid, organic Y/N selector
- **Saad** — `products.js` service (`createProduct`)

**Test command**
```bash
curl -b $JAR -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" \
  -X POST http://localhost:3025/api/products/ -d '{
    "name":"Free range milk","description":"Fresh whole milk from free-range Jersey cows","price":"1.99",
    "unit":"litre","stock_quantity":50,"category":2,"allergens":[7],"availability":"in_season",
    "harvest_date":"2026-05-01","origin_location":"Bristol, UK","is_organic":true,
    "storage_instructions":"Refrigerate at 4C, consume within 5 days."}'
```
**Expected:** HTTP 201, response includes nested `category.name` and `allergens[*].name`. Customer attempt → HTTP 403 "You do not have permission to perform this action."

---

## TC-004 — Browse Products by Category

**Sprint:** 1 · **Status:** PASS

**What this verifies.** Customers can list all 5 BRFN categories (`Vegetables`, `Dairy & Eggs`, `Bakery`, `Preserves`, `Seasonal Specialties`) and filter products by category id via `?category=N`. The categories are pre-loaded by a data migration so a fresh `docker compose up` produces them automatically.

**Backend implementation**
- Models: [backend/products/models.py:11-33](backend/products/models.py#L11-L33) (`Category`)
- Serializer: `CategorySerializer` — [backend/products/serializers.py:4-7](backend/products/serializers.py#L4-L7)
- View: `CategoryList` — [backend/products/views.py:68-71](backend/products/views.py#L68-L71); category filter on `ProductListCreateView` via `filterset_fields = ['category', 'availability', 'is_organic']`
- URLs: `GET /api/categories/` — [backend/products/urls.py:19](backend/products/urls.py#L19); `GET /api/products/?category=N` — [backend/products/urls.py:17](backend/products/urls.py#L17)
- **Data migration**: [backend/products/migrations/0005_seed_categories_allergens.py](backend/products/migrations/0005_seed_categories_allergens.py) seeds the 5 categories on every fresh DB

**Frontend implementation**
- Page: `#page-browse` category-grid + product-grid — [frontend/index.html:228](frontend/index.html#L228)
- Handler: `renderBrowse()`, `setCategory()` — [frontend/app.js](frontend/app.js)
- Service: `getCategories()`, `getProducts({category})` — [frontend/src/services/products.js](frontend/src/services/products.js)

**Team contributions**
- **Al-amin** — `Category` model, `0005_seed_categories_allergens` data migration, admin
- **Dalla** — `CategorySerializer`, `CategoryList` view, products URL routing, `filterset_fields` wiring
- **Joel** — category-grid UI, category-card click → `setCategory()`, browse page filter pill
- **Saad** — `products.js` service (`getCategories`, category param)

**Test command**
```bash
curl http://localhost:3025/api/categories/
curl http://localhost:3025/api/products/?category=2
```
**Expected:** 5 categories returned; products filter narrows to the requested category.

---

## TC-006 — Shopping Cart

**Sprint:** 1 · **Status:** PASS

**What this verifies.** Logged-in customers can add products to their cart, change quantities, and remove items. The cart is **per-customer** (OneToOne), grouped server-side, totals are recalculated on every operation, and stock is validated — exceeding `product.stock_quantity` returns 400.

**Backend implementation**
- Models: [backend/cart/models.py](backend/cart/models.py) (`Cart` OneToOne `customer`, `CartItem` FK cart+product, helpers `get_item_total`, `get_cart_total`)
- Serializer: `CartSerializer`, `CartItemSerializer` — [backend/cart/serializers.py](backend/cart/serializers.py) (nests product, exposes `cart_total`, `item_total`)
- Views: `CartView` GET/POST/DELETE — [backend/cart/views.py:9](backend/cart/views.py#L9); `CartItemView` PUT/DELETE — [backend/cart/views.py:59](backend/cart/views.py#L59) (both gated by `IsAuthenticated + IsCustomer`)
- URLs: `/api/cart/`, `/api/cart/items/<int:item_id>/` — [backend/cart/urls.py](backend/cart/urls.py)
- Permission: `IsCustomer` — [backend/users/permissions.py:10-15](backend/users/permissions.py#L10-L15)

**Frontend implementation**
- Page: `#page-cart` — [frontend/index.html:262](frontend/index.html#L262); `renderCart()` groups items by producer — [frontend/app.js:463](frontend/app.js#L463)
- Service: [frontend/src/services/cart.js](frontend/src/services/cart.js) (`getCart`, `addOrUpdateCartItem`, `updateCartItemQty`, `removeCartItem`, `clearCart`)

**Team contributions**
- **Al-amin** — `Cart`, `CartItem` models; migration; admin
- **Dalla** — `CartSerializer`, `CartItemSerializer`, `CartView`, `CartItemView`, cart URL routing, `IsCustomer` permission
- **Joel** — `#page-cart` UI, group-by-producer rendering, quantity steppers, "Proceed to Checkout" button
- **Saad** — `cart.js` service layer, AuthContext gating

**Test command**
```bash
curl -b $JAR -H "X-CSRFToken: $CSRF" -X POST http://localhost:3025/api/cart/ -d '{"product_id":1,"quantity":2}'
curl -b $JAR -X POST http://localhost:3025/api/cart/ -d '{"product_id":1,"quantity":99999}'
```
**Expected:** First call returns 201 with `cart_total`; oversized qty returns HTTP 400 `"Not enough stock"`.

---

## TC-015 — Allergen Display

**Sprint:** 1 · **Status:** PASS

**What this verifies.** All 14 allergens defined by the UK Food Information Regulations 2014 / Natasha's Law are pre-loaded and exposed via API. Every product nests its declared allergens in the response, so the frontend can display the legally-required warnings on the product detail page.

**Backend implementation**
- Models: [backend/products/models.py:156-174](backend/products/models.py#L156-L174) (`Allergen`); `Product.allergens` M2M [backend/products/models.py:127](backend/products/models.py#L127)
- Serializer: `AllergenSerializer` — [backend/products/serializers.py:9-12](backend/products/serializers.py#L9-L12); nested in `ProductSerializer.to_representation` — [backend/products/serializers.py:33-39](backend/products/serializers.py#L33-L39)
- View: `AllergenList` — [backend/products/views.py:73-76](backend/products/views.py#L73-L76)
- URL: `GET /api/allergens/` — [backend/products/urls.py:20](backend/products/urls.py#L20)
- **Data migration**: [backend/products/migrations/0005_seed_categories_allergens.py](backend/products/migrations/0005_seed_categories_allergens.py) seeds the 14 UK allergens

**Frontend implementation**
- Add-product allergen checkboxes in `#page-producer-dash`
- Product detail allergen warning section in `#page-product`
- Service: `getAllergens()` — [frontend/src/services/products.js](frontend/src/services/products.js)

**Team contributions**
- **Al-amin** — `Allergen` model, M2M wiring on `Product`, `0005_seed_categories_allergens` data migration
- **Dalla** — `AllergenSerializer`, `AllergenList` view, `allergens/` URL routing
- **Joel** — Allergen checkbox grid (Add Product), allergen warning UI on product detail page
- **Saad** — `getAllergens` in `products.js`

**Test command**
```bash
curl http://localhost:3025/api/allergens/
curl http://localhost:3025/api/products/1/
```
**Expected:** 14 allergens returned. `products/1/` response nests `allergens: [{"name": "Milk", ...}]`.

---

## TC-022 — Authentication & Security

**Sprint:** 1 · **Status:** PASS

**What this verifies.** Passwords are hashed with Django's pbkdf2_sha256; wrong credentials return 400 (no information leak about which field was wrong); the profile endpoint requires authentication; sessions are CSRF-protected for browser clients via `CsrfExemptSessionAuthentication`. Aligns with UK Data Protection Act 2018 / GDPR Article 32 (security of processing).

**Backend implementation**
- Models: [backend/users/models.py:7-29](backend/users/models.py#L7-L29) (`UserManager.create_user` calls `set_password` → pbkdf2)
- Serializer: `LoginSerializer` — [backend/users/serializers.py:179-200](backend/users/serializers.py#L179-L200) (uses `authenticate()`)
- Views: `LoginView` — [backend/users/views.py:47](backend/users/views.py#L47); `LogoutView` — [backend/users/views.py:60](backend/users/views.py#L60); `ProfileView` — [backend/users/views.py:69](backend/users/views.py#L69); `CSRFView` — [backend/users/views.py:88](backend/users/views.py#L88)
- Auth class: `CsrfExemptSessionAuthentication` — [backend/users/authentication.py](backend/users/authentication.py)
- Settings: `AUTH_USER_MODEL`, `AUTH_PASSWORD_VALIDATORS`, REST_FRAMEWORK auth defaults — [backend/config/settings.py](backend/config/settings.py)

**Frontend implementation**
- Page: `#page-login` — [frontend/index.html:276](frontend/index.html#L276)
- Handler: `handleLogin()` — [frontend/app.js](frontend/app.js)
- Service: `login()`, `logout()`, `getProfile()` — [frontend/src/services/auth.js](frontend/src/services/auth.js)

**Team contributions**
- **Al-amin** — `User` model with email-as-username, custom `UserManager`, settings hardening
- **Dalla** — `LoginSerializer`, `LoginView` / `LogoutView` / `ProfileView` / `CSRFView`, auth URL routing
- **Joel** — `#page-login` UI, demo-account quick-fill buttons
- **Saad** — `auth.js` service (CSRF cookie fetch + login flow), CORS / Docker config, AuthContext

**Test command**
```bash
# wrong password rejected
curl -X POST http://localhost:3025/api/auth/login/ -d '{"email":"customer@example.com","password":"WRONG"}'
# unauthed profile request rejected
curl http://localhost:3025/api/auth/profile/
# password hashed in DB
docker compose exec -T db psql -U brfn_user -d brfn_db -tA -c "SELECT email, LEFT(password, 20) FROM users_user;"
```
**Expected:** Wrong password → HTTP 400. Unauthed → HTTP 403. DB stores `pbkdf2_sha256$100000$...` — never plaintext.

---

# Sprint 2 — 9 test cases

## TC-005 — Product Search

**Sprint:** 2 · **Status:** PASS

**What this verifies.** Customers can search products by free-text query that matches against `Product.name` or `Product.description`, using DRF's `SearchFilter` over the `ListCreateView`.

**Backend implementation**
- Models: [backend/products/models.py:64,82](backend/products/models.py#L64) (`name`, `description`)
- View: `ProductListCreateView` — [backend/products/views.py:15-28](backend/products/views.py#L15-L28) (`filter_backends = [DjangoFilterBackend, filters.SearchFilter]`, `search_fields = ['name', 'description']`)
- URL: `GET /api/products/?search=…` — [backend/products/urls.py:17](backend/products/urls.py#L17)

**Frontend implementation**
- Page: `#page-browse` search bar
- Handler: `renderBrowse()` reads `state.searchQuery`
- Service: `getProducts({search})`, `searchProducts()` — [frontend/src/services/products.js](frontend/src/services/products.js)

**Team contributions**
- **Al-amin** — `Product` model fields, search backend wiring on the ListView
- **Dalla** — initial `ProductListCreateView` (Sprint 1); Sprint 2 review of `SearchFilter` integration
- **Joel** — search bar UI, in-flight loading state, search-empty messaging
- **Saad** — `searchProducts` service helper

**Test command**
```bash
curl 'http://localhost:3025/api/products/?search=milk'
curl 'http://localhost:3025/api/products/?search=Jersey'   # description match
```
**Expected:** name match returns Free range milk; description match also returns it (matches "Jersey cows" in description).

---

## TC-007 — Single Producer Checkout

**Sprint:** 2 · **Status:** PASS

**What this verifies.** A customer with cart items from a single producer can place an order. The system creates `Order` + `OrderProducerGroup` + `OrderItem` rows, calculates a 5% commission and 95% producer payout, decrements stock, generates an HMRC-compliant invoice number `BRFN-YYYY-NNNNNN`, and creates a Stripe `PaymentIntent` for the customer to complete payment. Delivery date must be ≥48 hours away (Consumer Contracts Regulations 2013).

**Backend implementation**
- Models: [backend/orders/models.py:8-156](backend/orders/models.py#L8-L156) (`Order` with auto-invoice + cancellation_deadline + special_instructions); [backend/orders/models.py:159-296](backend/orders/models.py#L159-L296) (`OrderProducerGroup.calculate_financials()` does the 5% / 95% split); [backend/orders/models.py:299-371](backend/orders/models.py#L299-L371) (`OrderItem` with price/unit/name snapshots); `Payment` — [backend/orders/models.py:419-481](backend/orders/models.py#L419-L481)
- Serializer: `OrderCreateSerializer` — [backend/orders/serializers.py:173-296](backend/orders/serializers.py#L173-L296); 48h validator — [backend/orders/serializers.py:163-170](backend/orders/serializers.py#L163-L170)
- Views: `OrderListCreateView.post` — [backend/orders/views.py:46-66](backend/orders/views.py#L46-L66); `CreatePaymentIntentView` — [backend/orders/views.py:326](backend/orders/views.py#L326); `ConfirmPaymentView` — [backend/orders/views.py:366](backend/orders/views.py#L366)
- URLs: `POST /api/orders/`, `POST /api/orders/payments/create-intent/`, `POST /api/orders/payments/confirm/` — [backend/orders/urls.py:17-32](backend/orders/urls.py#L17-L32)

**Frontend implementation**
- Modal: Stripe checkout overlay — [frontend/index.html:42](frontend/index.html#L42); per-producer fulfilment section + delivery date picker
- Handlers: `handleCheckout()`, `handleStripePay()` — [frontend/app.js:578](frontend/app.js#L578), [frontend/app.js:701](frontend/app.js#L701)
- Service: `createOrder` — [frontend/src/services/orders.js](frontend/src/services/orders.js); `paymentService.js` — [frontend/src/services/paymentService.js](frontend/src/services/paymentService.js) (`createPaymentIntent`, `notifyBackend`)

**Team contributions**
- **Al-amin** — All `Order*` models, `OrderCreateSerializer`, `OrderListCreateView`, `CreatePaymentIntentView`, `ConfirmPaymentView`, `Payment` model + invoice number generator
- **Dalla** — Sprint 2 review/integration of order endpoints
- **Joel** — Stripe checkout modal UI, per-producer fulfilment selector, delivery date picker, live total summary
- **Saad** — `orders.js`, `paymentService.js`, Stripe test-mode env vars in `docker-compose.yml`

**Test command**
```bash
curl -b $JAR -H "X-CSRFToken: $CSRF" -X POST http://localhost:3025/api/orders/ -d '{
  "delivery_address":"45 Park Street, Bristol","delivery_postcode":"BS1 5JG",
  "producer_groups":[{"producer_id":3,"fulfilment_type":"standard","delivery_date":"2026-05-04",
    "items":[{"product_id":1,"quantity":4}]}]}'
```
**Expected:** HTTP 201; `producer_groups[0].subtotal=£7.96`, `commission=£0.40` (5%), `producer_payout=£7.56` (95%), `invoice_number=BRFN-2026-NNNNNN`. A delivery date inside the 48h window returns HTTP 400.

---

## TC-008 — Multi-Vendor Checkout

**Sprint:** 2 · **Status:** PASS

**What this verifies.** A customer's cart can mix products from **multiple producers**. The order is created with one `OrderProducerGroup` per producer, each with its own subtotal, fulfilment type, delivery fee, commission, and payout. `unique_together = ('order', 'producer')` prevents duplicate groups.

**Backend implementation**
- Models: [backend/orders/models.py:159-272](backend/orders/models.py#L159-L272) (`OrderProducerGroup` with per-group `fulfilment_type`, `delivery_fee`, `subtotal`, `commission`, `producer_payout`)
- Serializer: `OrderCreateSerializer.create()` — [backend/orders/serializers.py:199-296](backend/orders/serializers.py#L199-L296) loops over `producer_groups`, calls `calculate_financials()` per group, then `order.calculate_totals()`
- View: `OrderListCreateView.post` — [backend/orders/views.py:46-66](backend/orders/views.py#L46-L66)

**Frontend implementation**
- Handlers: `handleCheckout()` groups cart items by `producerId` — [frontend/app.js:595-650](frontend/app.js#L595-L650)
- Service: `createOrder()` — [frontend/src/services/orders.js](frontend/src/services/orders.js)

**Team contributions**
- **Al-amin** — `OrderProducerGroup` pattern + `unique_together`, multi-group serializer logic
- **Joel** — checkout modal renders one fulfilment+date block per producer
- **Saad** — `orders.js` service builds `producer_groups` array from grouped cart

**Test command**
```bash
curl -b $JAR -X POST http://localhost:3025/api/orders/ -d '{
  "delivery_address":"45 Park Street, Bristol","delivery_postcode":"BS1 5JG",
  "producer_groups":[
    {"producer_id":3,"fulfilment_type":"standard","delivery_date":"2026-05-04","items":[{"product_id":1,"quantity":2}]},
    {"producer_id":6,"fulfilment_type":"express", "delivery_date":"2026-05-04","items":[{"product_id":2,"quantity":2}]}
  ]}'
```
**Expected:** Response has `producer_groups: [..,..]` with two distinct producers and independent commissions (£0.20 + £0.45 in our run); each group has its own delivery_fee (£2.99 standard / £4.99 express).

---

## TC-009 — Producer Order Dashboard

**Sprint:** 2 · **Status:** PASS

**What this verifies.** A producer hitting `/api/orders/producer/` sees only the `OrderProducerGroup` rows where they are the producer — never another producer's items, even on shared multi-vendor orders. UK GDPR data minimisation: only customer name + phone + delivery address relevant to fulfilment is exposed (no email-only-related-orders, no other producers' financials).

**Backend implementation**
- View: `ProducerOrderListView` — [backend/orders/views.py:120-180](backend/orders/views.py#L120-L180) (filters `producer=request.user`, returns only that producer's groups + items + customer fulfilment data)
- URL: `GET /api/orders/producer/?status=…` — [backend/orders/urls.py:23](backend/orders/urls.py#L23)

**Frontend implementation**
- Page: producer dashboard "Orders" tab — `renderProducerDash()` table — [frontend/app.js:1067-1208](frontend/app.js#L1067-L1208) (now also shows `special_instructions` per row, see TC-013)
- Service: `getProducerOrders()` — [frontend/src/services/orders.js:59](frontend/src/services/orders.js#L59)

**Team contributions**
- **Al-amin** — `ProducerOrderListView` + isolation logic, status filter, status-history join
- **Joel** — orders table, status filter pills, items detail, special-instructions block (TC-013)
- **Saad** — `getProducerOrders` service

**Test command**
```bash
curl -b /tmp/producer1.cookie  http://localhost:3025/api/orders/producer/
curl -b /tmp/producer2.cookie  http://localhost:3025/api/orders/producer/
curl -b /tmp/customer.cookie   http://localhost:3025/api/orders/producer/
```
**Expected:** Producer 1 sees only their groups (e.g. milk items); producer 2 sees a different set (e.g. sourdough items); customer is rejected with HTTP 403.

---

## TC-010 — Order Status Update

**Sprint:** 2 · **Status:** PASS

**What this verifies.** The producer can advance an order through `pending → confirmed → processing → ready → delivered` (or reject from `pending`). Each transition is logged in `OrderStatusHistory` with timestamp, the user who made the change, and an optional note. Invalid transitions (e.g. `delivered → ready`) are rejected. Cross-producer access is blocked.

**Backend implementation**
- Models: [backend/orders/models.py:374-416](backend/orders/models.py#L374-L416) (`OrderStatusHistory`)
- Validator: `GROUP_VALID_TRANSITIONS` + `OrderStatusUpdateSerializer` — [backend/orders/serializers.py:303-390](backend/orders/serializers.py#L303-L390); `derive_order_status()` auto-updates the parent order
- View: `ProducerOrderStatusView` — [backend/orders/views.py:188-213](backend/orders/views.py#L188-L213) (also flips `Payment.status` to `processed` once all groups deliver)
- URL: `PATCH /api/orders/producer/<int:pk>/status/` — [backend/orders/urls.py:24](backend/orders/urls.py#L24)

**Frontend implementation**
- Action buttons rendered per group status by `statusActionHTML()` — [frontend/app.js:1117-1143](frontend/app.js#L1117-L1143)
- Service: `updateOrderStatus()` — [frontend/src/services/orders.js](frontend/src/services/orders.js)

**Team contributions**
- **Al-amin** — `OrderStatusHistory`, transition validator, payment release trigger
- **Joel** — status-action buttons (Accept / Reject / Mark Processing / Mark Ready / Mark Delivered), status pill colours
- **Saad** — `updateOrderStatus` service

**Test command**
```bash
for s in confirmed processing ready delivered; do
  curl -b /tmp/producer.cookie -X PATCH http://localhost:3025/api/orders/producer/1/status/ \
    -d "{\"status\":\"$s\",\"note\":\"automated test\"}"
done
# invalid backward transition
curl -X PATCH http://localhost:3025/api/orders/producer/1/status/ -d '{"status":"ready"}'
```
**Expected:** Each forward step returns 200 and appends to `status_history`. Backward step returns HTTP 400 `"Cannot transition from 'delivered' to 'ready'"`. Cross-producer attempt returns HTTP 404.

---

## TC-011 — Producer Inventory Update

**Sprint:** 2 · **Status:** PASS

**What this verifies.** A producer can update `stock_quantity` and `availability` on their own products (`PATCH /api/products/<id>/`). Negative stock is rejected. Other producers cannot patch products they don't own (`IsOwner`). Setting availability back to `in_season` triggers the TC-016 notification flow.

**Backend implementation**
- Serializer: `ProductInventoryUpdateSerializer` — [backend/products/serializers.py:46-54](backend/products/serializers.py#L46-L54)
- View: `ProductDetailView.perform_update` — [backend/products/views.py:38-66](backend/products/views.py#L38-L66) (`IsProducer + IsOwner`; fires the notification update when availability flips back to `in_season`)
- Permission: `IsOwner` — [backend/users/permissions.py:17-33](backend/users/permissions.py#L17-L33)

**Frontend implementation**
- Page: producer dashboard "Inventory" tab; per-product stock + availability controls
- Service: `updateProductInventory()` — [frontend/src/services/products.js](frontend/src/services/products.js)

**Team contributions**
- **Al-amin** — `ProductInventoryUpdateSerializer`, `ProductDetailView` PATCH path, notification trigger
- **Dalla** — `IsOwner` permission
- **Joel** — inventory editor UI in producer dashboard
- **Saad** — `updateProductInventory` service

**Test command**
```bash
curl -b /tmp/producer.cookie -X PATCH http://localhost:3025/api/products/1/ \
  -d '{"stock_quantity":100,"availability":"pre_order"}'
curl -b /tmp/producer.cookie -X PATCH http://localhost:3025/api/products/1/ \
  -d '{"stock_quantity":-5}'
curl -b /tmp/producer2.cookie -X PATCH http://localhost:3025/api/products/1/ \
  -d '{"stock_quantity":1}'
```
**Expected:** Update succeeds; negative stock returns HTTP 400; cross-producer returns HTTP 403.

---

## TC-012 — Weekly Payment Settlements

**Sprint:** 2 · **Status:** PASS

**What this verifies.** A producer can request their weekly settlement report. Only `OrderProducerGroup` rows with status `delivered` within the requested ISO week are counted. The system aggregates `gross_sales`, `commission` (5%), `net_payout` (95%) — the latter is what BRFN actually pays out. Aligns with HMRC record-keeping requirements.

**Backend implementation**
- Serializer: `SettlementOrderSerializer` + `SettlementSerializer` — [backend/orders/serializers.py:397-441](backend/orders/serializers.py#L397-L441)
- View: `ProducerSettlementView` — [backend/orders/views.py:221-267](backend/orders/views.py#L221-L267) (filters delivered groups by ISO week; supports `?week=YYYY-WW`)
- URL: `GET /api/orders/settlements/` — [backend/orders/urls.py:25](backend/orders/urls.py#L25)
- Math: 5% / 95% split in `OrderProducerGroup.calculate_financials()` — [backend/orders/models.py:274-296](backend/orders/models.py#L274-L296)

**Frontend implementation**
- Page: producer dashboard "Settlements" tab
- Service: `getSettlementReport()`, `downloadSettlementReport()` — [frontend/src/services/paymentService.js](frontend/src/services/paymentService.js)

**Team contributions**
- **Al-amin** — `SettlementSerializer`, `ProducerSettlementView`, week math
- **Joel** — settlement table UI + CSV download button
- **Saad** — `paymentService.js` settlement helpers + CSV blob generator

**Test command**
```bash
curl -b /tmp/producer.cookie http://localhost:3025/api/orders/settlements/
```
**Expected:** Response with `gross_sales=£7.96`, `commission=£0.40`, `net_payout=£7.56`. The math `0.05 × gross = commission` and `0.95 × gross = net_payout` holds.

---

## TC-021 — Customer Order History

**Sprint:** 2 · **Status:** PASS

**What this verifies.** A customer hitting `GET /api/orders/` sees their own orders (filtered server-side by `customer=request.user`) with the full `OrderSerializer` payload including `producer_groups`, `status_history`, `can_cancel`, `invoice_number`, `delivery_date`. Producers / admins / restaurants get HTTP 403 from the same endpoint (it is customer-only by design — they have their own dashboards).

**Backend implementation**
- View: `OrderListCreateView.get` — [backend/orders/views.py:49-55](backend/orders/views.py#L49-L55)
- Serializer: `OrderSerializer` — [backend/orders/serializers.py:114-145](backend/orders/serializers.py#L114-L145)
- URL: `GET /api/orders/` — [backend/orders/urls.py:18](backend/orders/urls.py#L18)

**Frontend implementation**
- Page: `#page-customer-dash` "Orders" tab; `renderCustomerDash()` orders table — [frontend/app.js:1620-1750](frontend/app.js#L1620-L1750) (now also renders TC-014 dispute badge)
- Service: `getCustomerOrderHistory()` — [frontend/src/services/orders.js](frontend/src/services/orders.js)

**Team contributions**
- **Al-amin** — order history filter logic, `OrderSerializer.get_can_cancel`
- **Joel** — customer dashboard orders table, status filter pills, cancel/reorder/raise-dispute action column
- **Saad** — `getCustomerOrderHistory` service + dispute pre-fetch hook (TC-014)

**Test command**
```bash
curl -b /tmp/customer.cookie  http://localhost:3025/api/orders/
curl -b /tmp/producer.cookie  http://localhost:3025/api/orders/   # 403
```
**Expected:** Customer sees their two orders; producer/restaurant/admin get HTTP 403.

---

## TC-025 — Admin Commission Report

**Sprint:** 2 · **Status:** PASS

**What this verifies.** Admin-only commission report aggregating across **all** producers' delivered groups. Optional `?from=YYYY-MM-DD&to=YYYY-MM-DD` filter. Each row shows invoice number, producer business name, subtotal, commission, payout, and the `Payment.processed_at` timestamp. CSV export is provided in the UI for finance/HMRC reporting.

**Backend implementation**
- View: `AdminCommissionReportView` — [backend/orders/views.py:275-318](backend/orders/views.py#L275-L318)
- URL: `GET /api/orders/admin/commission/` — [backend/orders/urls.py:28](backend/orders/urls.py#L28)

**Frontend implementation**
- Page: admin dashboard "Commission Report" tab — [frontend/index.html:770](frontend/index.html#L770)
- Handlers: `handleLoadCommissionReport()`, `handleExportCommissionCSV()` — [frontend/app.js:1900,1926](frontend/app.js#L1900)
- Service: `getCommissionReport()`, `exportCommissionCSV()` — [frontend/src/services/adminService.js](frontend/src/services/adminService.js)

**Team contributions**
- **Al-amin** — `AdminCommissionReportView`, aggregation queries
- **Joel** — admin dashboard layout + commission table + From/To pickers
- **Saad** — `adminService.js` (commission report fetcher + CSV export)

**Test command**
```bash
curl -b /tmp/admin.cookie http://localhost:3025/api/orders/admin/commission/?from=2026-05-01&to=2026-05-31
curl -b /tmp/customer.cookie http://localhost:3025/api/orders/admin/commission/   # 403
```
**Expected:** Admin sees `total_sales`, `total_commission`, `total_payout` plus per-row invoice/producer/amounts. Customer is rejected.

---

# Sprint 3 — 9 test cases

## TC-013 — Special Delivery Instructions

**Sprint:** 3 · **Status:** PASS

**What this verifies.** When placing an order, the customer can attach a free-text "Please leave at the back gate"-style note. The note is stored on the `Order` (not the cart, not the producer group), exposed on the producer's dashboard endpoint, and rendered alongside the items list. Aligns with Consumer Contracts Regulations 2013 (right to communicate delivery requirements).

**Backend implementation**
- Models: [backend/orders/models.py:61](backend/orders/models.py#L61) (`Order.special_instructions: TextField(blank=True)`)
- Serializers: `OrderCreateSerializer` accepts `special_instructions` — [backend/orders/serializers.py:176](backend/orders/serializers.py#L176); exposed in `OrderSerializer` — [backend/orders/serializers.py:131](backend/orders/serializers.py#L131); included in producer dashboard payload — [backend/orders/views.py:148](backend/orders/views.py#L148)

**Frontend implementation**
- Checkout textarea: `id="checkout-special-instructions"` — [frontend/index.html:55-58](frontend/index.html#L55-L58) (added in fix commit `b2cd4e3`)
- Read by `handleStripePay()` — [frontend/app.js:761](frontend/app.js#L761)
- Producer dashboard row callout — [frontend/app.js:1190-1196](frontend/app.js#L1190-L1196)

**Team contributions**
- **Al-amin** — `Order.special_instructions` field, migration, exposure in producer endpoint
- **Joel** — checkout textarea + producer dashboard callout (the missing UI was added in the late-Sprint-3 polish pass)
- **Saad** — `orders.js` payload includes `special_instructions`

**Test command**
```bash
curl -b /tmp/customer.cookie -X POST http://localhost:3025/api/orders/ -d '{
  "delivery_address":"45 Park Street, Bristol","delivery_postcode":"BS1 5JG",
  "special_instructions":"Please leave at the back gate",
  "producer_groups":[{"producer_id":3,"fulfilment_type":"standard","delivery_date":"2026-05-04",
    "items":[{"product_id":1,"quantity":1}]}]}'
curl -b /tmp/producer.cookie http://localhost:3025/api/orders/producer/
```
**Expected:** Order response includes `special_instructions`. Producer dashboard exposes the same field on the matching group.

---

## TC-014 — Dispute Resolution

**Sprint:** 3 · **Status:** PASS

**What this verifies.** A customer with a delivered (or in-transit) order can raise a `Dispute` (reason: damaged / missing / wrong_item / quality / other). Pending and cancelled orders cannot be disputed. Admins list all disputes, resolve them with a note, and the customer sees the new status (`resolved`) with the admin's resolution note. Aligns with Consumer Rights Act 2015 + Alternative Dispute Resolution Regulations 2015.

**Backend implementation**
- Models: [backend/orders/models.py:483-566](backend/orders/models.py#L483-L566) (`Dispute` with reason/status enums + resolution_note + resolved_by)
- Serializers: `DisputeCreateSerializer` (validates not pending/cancelled, no duplicates) — [backend/orders/serializers.py:463-503](backend/orders/serializers.py#L463-L503); `DisputeSerializer` — [backend/orders/serializers.py:510-537](backend/orders/serializers.py#L510-L537); `DisputeResolveSerializer` — [backend/orders/serializers.py:544-561](backend/orders/serializers.py#L544-L561)
- Views: `OrderDisputeView` — [backend/orders/views.py:397-430](backend/orders/views.py#L397-L430); `AdminDisputeListView` — [backend/orders/views.py:464-478](backend/orders/views.py#L464-L478); `AdminDisputeResolveView` — [backend/orders/views.py:437-457](backend/orders/views.py#L437-L457)
- URLs: `POST /api/orders/<pk>/dispute/`, `GET /api/orders/admin/disputes/`, `PATCH /api/orders/admin/disputes/<pk>/resolve/` — [backend/orders/urls.py:35-37](backend/orders/urls.py#L35-L37)

**Frontend implementation**
- Customer-side: "Raise Dispute" button on delivered order — [frontend/app.js:1733-1746](frontend/app.js#L1733-L1746); dispute badge on row — [frontend/app.js:1725-1731](frontend/app.js#L1725-L1731); dispute modal with reason + description — [frontend/app.js:2244-2270](frontend/app.js#L2244-L2270); per-order dispute pre-fetch in `refreshCustomerOrders()` — [frontend/app.js:1574-1593](frontend/app.js#L1574-L1593)
- Admin-side: Disputes tab in `#page-admin-dash` — [frontend/index.html:864-871](frontend/index.html#L864-L871); `renderAdminDisputes()`, `resolveDispute()` — [frontend/app.js:2479-2532](frontend/app.js#L2479-L2532)
- Service: [frontend/src/services/disputeService.js](frontend/src/services/disputeService.js)

**Team contributions**
- **Al-amin** — `Dispute` model, dispute migration `orders/0003_dispute`, all dispute serializers + views, admin badge
- **Joel** — Raise-Dispute button + modal, admin disputes tab UI, customer dispute badge
- **Saad** — `disputeService.js`, customer dashboard dispute pre-fetch loop

**Test command**
```bash
# customer raises
curl -b /tmp/customer.cookie -X POST http://localhost:3025/api/orders/1/dispute/ \
  -d '{"reason":"damaged","description":"One bottle arrived cracked."}'
# admin resolves
curl -b /tmp/admin.cookie -X PATCH http://localhost:3025/api/orders/admin/disputes/1/resolve/ \
  -d '{"status":"resolved","resolution_note":"Refund issued."}'
# customer sees updated status
curl -b /tmp/customer.cookie http://localhost:3025/api/orders/1/dispute/
```
**Expected:** Dispute starts `status=open`, transitions to `resolved` with `resolved_by_email=admin@brfn.com`. Pending order rejects with HTTP 400.

---

## TC-016 — Seasonal Availability Notifications

**Sprint:** 3 · **Status:** PASS

**What this verifies.** When a product is `out_of_season`, customers see a "Notify me when back in season" button. Subscribing creates a `Notification` row (`unique_together` on (product, customer) prevents dupes). When the producer flips availability back to `in_season`, the `ProductDetailView.perform_update` hook flips every waiting `Notification` to `notified=True` with a timestamp. Customers see this in their notifications inbox.

**Backend implementation**
- Models: [backend/products/models.py:247-292](backend/products/models.py#L247-L292) (`Notification`)
- Serializer: `NotificationSerializer` — [backend/products/serializers.py:171-186](backend/products/serializers.py#L171-L186)
- Views: `ProductNotificationView` (subscribe / unsubscribe) — [backend/products/views.py:169-205](backend/products/views.py#L169-L205); fan-out trigger in `ProductDetailView.perform_update` — [backend/products/views.py:51-66](backend/products/views.py#L51-L66); customer inbox `CustomerNotificationsView` — [backend/users/views.py:131-139](backend/users/views.py#L131-L139)
- URLs: `POST/DELETE /api/products/<pk>/notify/`, `GET /api/auth/notifications/` — [backend/products/urls.py:27](backend/products/urls.py#L27), [backend/users/urls.py:23](backend/users/urls.py#L23)

**Frontend implementation**
- Notify-me button on out-of-season products — [frontend/app.js:441](frontend/app.js#L441)
- Subscribe / unsubscribe handlers — [frontend/app.js:2273-2305](frontend/app.js#L2273-L2305)
- Customer notifications tab `renderCustomerNotificationsTab()` — [frontend/app.js:2307-2332](frontend/app.js#L2307-L2332)
- Service: [frontend/src/services/notificationService.js](frontend/src/services/notificationService.js)

**Team contributions**
- **Al-amin** — `Notification` model + migration + signal-style trigger inside `ProductDetailView.perform_update`, `ProductNotificationView`, `CustomerNotificationsView`
- **Joel** — Notify-me button + dynamic subscribed/unsubscribed states + Notifications inbox tab
- **Saad** — `notificationService.js`

**Test command**
```bash
# producer marks out of season
curl -b /tmp/producer.cookie -X PATCH http://localhost:3025/api/products/1/ -d '{"availability":"out_of_season"}'
# customer subscribes
curl -b /tmp/customer.cookie -X POST http://localhost:3025/api/products/1/notify/ -d '{}'
# producer flips back
curl -b /tmp/producer.cookie -X PATCH http://localhost:3025/api/products/1/ -d '{"availability":"in_season"}'
# inbox
curl -b /tmp/customer.cookie http://localhost:3025/api/auth/notifications/
```
**Expected:** Subscription created with `notified=false`; after producer flips to in_season, inbox shows `notified=true` with timestamp.

---

## TC-017 — Producer Analytics Dashboard

**Sprint:** 3 · **Status:** PASS

**What this verifies.** Each producer can see lifetime delivered-order metrics: `total_revenue` (sum of producer payouts), `total_orders`, `average_order_value`, `total_commission_paid`, top-5 products by revenue, and a weekly revenue chart for the last 8 weeks. Customers / admins are 403'd.

**Backend implementation**
- View: `ProducerAnalyticsView` — [backend/products/views.py:270-335](backend/products/views.py#L270-L335)
- URL: `GET /api/producer/analytics/` — [backend/products/urls.py:33](backend/products/urls.py#L33)

**Frontend implementation**
- Page: producer dashboard "Analytics" tab; `renderProducerAnalyticsTab()` — [frontend/app.js:2335-2372](frontend/app.js#L2335-L2372) (KPI cards + 8-week bar chart + top-5 table)
- Service: [frontend/src/services/analyticsService.js](frontend/src/services/analyticsService.js)

**Team contributions**
- **Al-amin** — `ProducerAnalyticsView` aggregations, weekly bucketing, top-5 query
- **Joel** — analytics tab UI, KPI stat cards, bar chart styling
- **Saad** — `analyticsService.js`

**Test command**
```bash
curl -b /tmp/producer.cookie http://localhost:3025/api/producer/analytics/
```
**Expected:** Response shows `total_revenue=£7.56`, `total_orders=1`, top_products=[{"name":"Free range milk", ...}], 8 weekly buckets with revenue ≥ 0.

---

## TC-018 — Platform Revenue Reporting

**Sprint:** 3 · **Status:** PASS

**What this verifies.** Admin-only platform-wide revenue report. Aggregates across all delivered producer groups: `total_revenue` (subtotal sum), `total_commission`, `total_producer_payouts`, `total_orders`, `active_producers`, `active_customers`, plus a per-producer breakdown. Optional `?from=&to=` date filter. The frontend exports the per-producer breakdown to CSV.

**Backend implementation**
- View: `PlatformRevenueView` — [backend/products/views.py:342-403](backend/products/views.py#L342-L403)
- URL: `GET /api/admin/revenue/` — [backend/products/urls.py:36](backend/products/urls.py#L36)

**Frontend implementation**
- Page: admin dashboard "Revenue Report" tab — [frontend/index.html:818-862](frontend/index.html#L818-L862) (added in fix commit `b2cd4e3` so the tab is reachable)
- Handlers: `handleLoadRevenueReport()`, `handleExportRevenueCSV()` — [frontend/app.js:2422-2476](frontend/app.js#L2422-L2476) (post-fix: read `total_producer_payouts`, `revenue_by_producer` per the actual API shape)
- Service: [frontend/src/services/analyticsService.js](frontend/src/services/analyticsService.js)

**Team contributions**
- **Al-amin** — `PlatformRevenueView`, per-producer aggregations with date filter
- **Joel** — Revenue Report tab UI, From/To pickers, KPI cards, breakdown table, Export CSV button
- **Saad** — `analyticsService.js`

**Test command**
```bash
curl -b /tmp/admin.cookie http://localhost:3025/api/admin/revenue/
curl -b /tmp/admin.cookie http://localhost:3025/api/admin/revenue/?from=2026-04-01\&to=2026-04-15
```
**Expected:** Full report has `total_revenue=£7.96`, `total_producer_payouts=£7.56`, `revenue_by_producer` populated. Date range that excludes today returns zeros.

---

## TC-019 — Community Group Bulk Ordering

**Sprint:** 3 · **Status:** PASS

**What this verifies.** Producers can set a discounted `WholesalePrice` for `buyer_type=community_group` with a `minimum_quantity`. Community group accounts hitting the wholesale endpoint see the discount. Standard customers are 403'd. Validator rejects wholesale prices ≥ standard product price.

**Backend implementation**
- Models: [backend/users/models.py:174-199](backend/users/models.py#L174-L199) (`CommunityGroupProfile`); [backend/products/models.py:295-352](backend/products/models.py#L295-L352) (`WholesalePrice` with `buyer_type` enum + `unique_together` on (product, buyer_type))
- Serializers: `CommunityGroupRegistrationSerializer` — [backend/users/serializers.py:342-400](backend/users/serializers.py#L342-L400); `WholesalePriceSerializer` (with the < standard-price validator) — [backend/products/serializers.py:192-225](backend/products/serializers.py#L192-L225)
- Views: `CommunityGroupRegistrationView` — [backend/users/views.py:115-124](backend/users/views.py#L115-L124); `ProductWholesalePriceView` — [backend/products/views.py:212-262](backend/products/views.py#L212-L262)
- URLs: `POST /api/auth/register/community-group/`, `GET/POST /api/products/<pk>/wholesale/`

**Frontend implementation**
- Page: `#page-register` with "Community Group / Charity" role option — [frontend/index.html:343-344](frontend/index.html#L343-L344) and community-group-fields panel
- Page: `#page-community-dash` (mostly mirrors the marketplace with green wholesale prices)
- Handler: `renderWholesaleMarketplace()` — [frontend/app.js:2581-2629](frontend/app.js#L2581-L2629)
- Service: [frontend/src/services/wholesaleService.js](frontend/src/services/wholesaleService.js)

**Team contributions**
- **Al-amin** — `CommunityGroupProfile` model + migration; `WholesalePrice` model + migration; `CommunityGroupRegistrationSerializer`/View; `WholesalePriceSerializer`/View with the < standard-price validator
- **Joel** — Community Group registration UI + dashboard + green wholesale price badge
- **Saad** — `auth.js` extended for community_group role; `wholesaleService.js`; restaurant + community-group entries pending in `entrypoint.sh` (follow-up)

**Test command**
```bash
# producer sets community_group wholesale
curl -b /tmp/producer.cookie -X POST http://localhost:3025/api/products/1/wholesale/ \
  -d '{"buyer_type":"community_group","price":"1.20","minimum_quantity":5,"is_active":true}'
# community group sees it
curl -b /tmp/community.cookie http://localhost:3025/api/products/1/wholesale/
# standard customer blocked
curl -b /tmp/customer.cookie http://localhost:3025/api/products/1/wholesale/   # 403
# validator rejects price >= standard
curl -X POST http://localhost:3025/api/products/1/wholesale/ \
  -d '{"buyer_type":"community_group","price":"3.00","minimum_quantity":5,"is_active":true}'
```
**Expected:** Wholesale set at £1.20, visible to community group; £3.00 attempt rejected with `Wholesale price (£3.00) must be less than the standard product price (£1.99).`

---

## TC-020 — Restaurant Wholesale Pricing

**Sprint:** 3 · **Status:** PASS

**What this verifies.** Identical mechanics to TC-019 but with `buyer_type=restaurant`. Restaurants see the discounted price (e.g. £1.50 vs the standard £1.99 displayed to customers). Validator and 403 rules apply equally.

**Backend implementation**
- Models: [backend/users/models.py:146-171](backend/users/models.py#L146-L171) (`RestaurantProfile`); same `WholesalePrice` model
- Serializers: `RestaurantRegistrationSerializer` — [backend/users/serializers.py:277-335](backend/users/serializers.py#L277-L335); same `WholesalePriceSerializer`
- Views: `RestaurantRegistrationView` — [backend/users/views.py:99-108](backend/users/views.py#L99-L108); same `ProductWholesalePriceView`
- URLs: `POST /api/auth/register/restaurant/`

**Frontend implementation**
- Page: `#page-register` "Restaurant / Food Business" role + restaurant-fields panel — [frontend/index.html:418](frontend/index.html#L418)
- Page: `#page-restaurant-dash` — [frontend/index.html:943](frontend/index.html#L943); shares `renderWholesaleMarketplace()`

**Team contributions**
- **Al-amin** — `RestaurantProfile` model + migration; `RestaurantRegistrationSerializer`/View
- **Joel** — Restaurant registration UI + dashboard
- **Saad** — `auth.js` extended for restaurant role; `wholesaleService.js`

**Test command**
```bash
curl -b /tmp/producer.cookie -X POST http://localhost:3025/api/products/1/wholesale/ \
  -d '{"buyer_type":"restaurant","price":"1.50","minimum_quantity":3,"is_active":true}'
curl -b /tmp/restaurant.cookie http://localhost:3025/api/products/1/wholesale/
```
**Expected:** Restaurant sees £1.50 wholesale with min 3. Standard customer's view of `/api/products/1/` still shows the standard £1.99.

---

## TC-023 — Product Reviews and Ratings

**Sprint:** 3 · **Status:** PASS

**What this verifies.** A customer with a `delivered` order containing a given product can leave one review per (product, order) pair. Rating is 1-5 stars; comment is optional. The public review payload **anonymises the customer name** to "First L." — required by UK GDPR (no full name in public listings). Average rating is recalculated server-side. Reviews are public (no auth required to read).

**Backend implementation**
- Models: [backend/products/models.py:177-244](backend/products/models.py#L177-L244) (`Review`, `unique_together = (product, customer, order)`)
- Serializers: `ReviewSerializer` (with anonymising `get_customer_name`) — [backend/products/serializers.py:61-90](backend/products/serializers.py#L61-L90); `ReviewCreateSerializer` (validates delivered order ownership + product-in-order + no duplicate) — [backend/products/serializers.py:97-149](backend/products/serializers.py#L97-L149)
- Views: `ProductReviewListCreateView` — [backend/products/views.py:85-131](backend/products/views.py#L85-L131)
- URL: `GET/POST /api/products/<pk>/reviews/` — [backend/products/urls.py:23](backend/products/urls.py#L23)

**Frontend implementation**
- Reviews section on product detail page (star widget + comment textarea + reviews list with average) — [frontend/app.js:2003-2059](frontend/app.js#L2003-L2059)
- Handlers: `handleSubmitReview()`, `loadReviewsForProduct()` — [frontend/app.js:2076-2128](frontend/app.js#L2076-L2128)
- Service: [frontend/src/services/reviewService.js](frontend/src/services/reviewService.js)

**Team contributions**
- **Al-amin** — `Review` model + migration; `ReviewSerializer` (anonymising), `ReviewCreateSerializer` (eligibility checks); `ProductReviewListCreateView`
- **Joel** — Reviews section UI, star rating widget, "Submit Review" form
- **Saad** — `reviewService.js`

**Test command**
```bash
curl -b /tmp/customer.cookie -X POST http://localhost:3025/api/products/1/reviews/ \
  -d '{"rating":5,"comment":"Beautifully creamy.","order":1}'
curl http://localhost:3025/api/products/1/reviews/
# without delivered order
curl -b /tmp/customer.cookie -X POST http://localhost:3025/api/products/2/reviews/ \
  -d '{"rating":5,"comment":"x","order":2}'   # 400
```
**Expected:** Review created with `customer_name="Demo C."`; public list shows `average_rating=5.0`; review without delivered order rejected with HTTP 400.

---

## TC-024 — Producer Response to Reviews

**Sprint:** 3 · **Status:** PASS

**What this verifies.** Producers can write a public response to any review on their own product. Other producers cannot respond to reviews on products they don't own. The response shows up in the public review listing alongside the original.

**Backend implementation**
- Model fields: `Review.producer_response`, `Review.producer_response_at` — [backend/products/models.py:226-229](backend/products/models.py#L226-L229)
- Serializer: `ProducerResponseSerializer` — [backend/products/serializers.py:156-164](backend/products/serializers.py#L156-L164)
- View: `ProducerReviewResponseView` — [backend/products/views.py:134-162](backend/products/views.py#L134-L162) (cross-producer ownership check)
- URL: `PATCH /api/products/<pk>/reviews/<review_id>/respond/` — [backend/products/urls.py:24](backend/products/urls.py#L24)

**Frontend implementation**
- Producer dashboard "Reviews" tab — `renderProducerReviewsTab()` — [frontend/app.js:2132-2176](frontend/app.js#L2132-L2176)
- Response form: `showProducerResponseForm()`, `submitProducerResponse()` — [frontend/app.js:2178-2218](frontend/app.js#L2178-L2218)

**Team contributions**
- **Al-amin** — `producer_response` fields, `ProducerResponseSerializer`, `ProducerReviewResponseView` with ownership check
- **Joel** — Producer Reviews tab + Respond button + response textarea
- **Saad** — `reviewService.js`

**Test command**
```bash
curl -b /tmp/producer.cookie -X PATCH http://localhost:3025/api/products/1/reviews/1/respond/ \
  -d '{"producer_response":"Thank you, glad you enjoyed it!"}'
curl http://localhost:3025/api/products/1/reviews/
# different producer rejected
curl -b /tmp/producer2.cookie -X PATCH http://localhost:3025/api/products/1/reviews/1/respond/ \
  -d '{"producer_response":"hijacked"}'   # 403
```
**Expected:** Public review now includes `producer_response`; foreign producer attempt returns HTTP 403 "You can only respond to reviews on your own products."

---

# Appendix: rebuilding from scratch

```bash
git pull
docker compose down
docker volume rm brfnmarketplace-group_postgres_data    # full DB wipe
docker compose up -d --build                            # rebuilds frontend image too
```
The backend `entrypoint.sh` re-applies migrations, seeds 5 categories + 14 allergens, and creates the 3 demo accounts. To replay this test plan, register `restaurant@example.com` and `community@example.com` via API once (or extend `entrypoint.sh` — Saad follow-up), then run the curl commands in each TC section.
