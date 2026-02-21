# BRFN Marketplace – Sprint 1 Backend Work (Eugene Dalla)

**Student details**

- Name: Eugene Dalla
- Student ID: __________________
- Module: __________________
- Date: __________________

This report explains in detail the backend work completed for Sprint 1,
based on the responsibilities assigned to **Eugene Dalla** in
`sprint1_role_dependency_guide 2.docx`.

The focus is on:

- Authentication API (registration, login, logout, profile)
- Role-based permissions and access control
- Product catalogue API (list, search, filter, detail)
- Shopping cart API (add/view/update/remove, total)
- API documentation and test case mapping

All of the code referenced here is collected in:

`BRFNMarketplace-Group/Eugene_Dalla_Sprint1/`

---

## 1. Authentication API

**Goal:** Allow different user types (producers and customers) to register,
log in, log out, and fetch their profile via a REST API that the frontend
can call.

**Key decisions:**

- Use Django’s built-in authentication system for password hashing and
  sessions.
- Use Django REST Framework (DRF) for request/response handling.
- Implement separate registration flows for producers and customers so
  each role captures the right data.
- Use session authentication (cookie-based) for simplicity in Sprint 1.

**Main files:**

- `users/views.py`
- `users/serializers.py`
- `users/urls.py`
- `users/permissions.py` (for role helpers used later)

### 1.1 Registration – Producers

**File:** `users/serializers.py`  
**Class:** `ProducerRegisterSerializer`

- Validates input fields such as:
  - `email`, `password`, `password_confirm`
  - `business_name`, `contact_name`, `phone_number`
  - `address`, `postcode`, `crn`, `description`,
    `food_hygiene_rating`
- Enforces:
  - Matching passwords
  - Strong password via Django’s password validators
- Creates:
  - A `User` object with `role="producer"`
  - A linked `ProducerProfile` with business and contact details

**File:** `users/views.py`  
**Class:** `ProducerRegisterView`

- DRF `APIView` that accepts `POST /api/auth/register/producer/`.
- Uses `ProducerRegisterSerializer` to validate and save the user.
- Returns the newly created user’s basic data in JSON.

**Routing:** `users/urls.py`

- Route: `path("register/producer/", ProducerRegisterView.as_view(), ...)`

### 1.2 Registration – Customers

**File:** `users/serializers.py`  
**Class:** `CustomerRegisterSerializer`

- Validates customer-specific fields:
  - `email`, `password`, `password_confirm`
  - `full_name`, `phone_number`
  - `delivery_address`, `postcode`, `terms_accepted`
- Enforces:
  - Matching passwords
  - Strong password
  - Terms and conditions accepted
- Creates:
  - A `User` object with `role="customer"`
  - A linked `CustomerProfile` with delivery details

**File:** `users/views.py`  
**Class:** `CustomerRegisterView`

- DRF `APIView` that accepts `POST /api/auth/register/customer/`.
- Uses `CustomerRegisterSerializer` to validate and save the user.

**Routing:** `users/urls.py`

- Route: `path("register/customer/", CustomerRegisterView.as_view(), ...)`

### 1.3 Login and Logout

**File:** `users/serializers.py`  
**Class:** `LoginSerializer`

- Accepts:
  - `email`, `password`
- Uses `authenticate` to verify credentials.
- Checks that the account is active.
- On success, places the authenticated `user` in `validated_data`.

**File:** `users/views.py`

- `LoginView`
  - `POST /api/auth/login/`
  - Uses `LoginSerializer` to validate credentials.
  - Calls Django’s `login()` to create a session.
  - Returns a simple JSON response that the frontend can use.
- `LogoutView`
  - `POST /api/auth/logout/`
  - Calls Django’s `logout()` to clear the session.

**Routing:** `users/urls.py`

- Routes:
  - `path("login/", LoginView.as_view(), ...)`
  - `path("logout/", LogoutView.as_view(), ...)`

### 1.4 Profile Endpoint

**File:** `users/serializers.py`  
**Class:** `UserProfileSerializer`

- Serializes:
  - `id`, `email`, `role`, `first_name`, `last_name`
- Used to send a clean, frontend-friendly profile payload.

**File:** `users/views.py`  
**Class:** `ProfileView`

- `GET /api/auth/profile/`
- Requires authenticated user.
- Uses `UserProfileSerializer` on `request.user`.

**Routing:** `users/urls.py`

- Route: `path("profile/", ProfileView.as_view(), ...)`

---

## 2. Role-Based Permissions and Access Control

**Goal:** Enforce that only appropriate roles can perform certain actions,
such as only producers creating products and only customers using the cart.

**Main file:**

- `users/permissions.py`

### 2.1 Custom Permission Classes

**IsProducer**

- Ensures:
  - User is authenticated.
  - `user.role == "producer"`.
- Used to guard product creation, update and deletion endpoints.

**IsCustomer**

- Ensures:
  - User is authenticated.
  - `user.role == "customer"`.
- Used to guard cart operations.

**IsOwner**

- Generic “owner” permission:
  - Checks `obj.user` or `obj.cart.user` against `request.user`.
- Used for resources that belong to a specific user (e.g. cart).

### 2.2 Applying Permissions in Views

**File:** `products/views.py`

- In `ProductListCreateView` and `ProductDetailView`:
  - For `POST`, `PUT`, `PATCH`, `DELETE`:
    - Uses `IsProducer()` to ensure only producers can modify products.
  - For `GET`:
    - Allows anyone to read products.

**File:** `cart/views.py`

- `CartView`:
  - Requires:
    - Authenticated user.
    - `IsCustomer` to ensure only customers can have a cart.
    - `IsOwner` where needed to ensure the cart belongs to the user.

---

## 3. Product Catalogue API

**Goal:** Provide endpoints for the frontend to browse, search, filter and
view product details, and allow producers to manage their products.

**Main files:**

- `products/views.py`
- `products/urls.py`

### 3.1 Product List and Create

**File:** `products/views.py`  
**Class:** `ProductListCreateView` (DRF `ListCreateAPIView`)

- `GET /api/products/`
  - Returns a list of products ordered by `created_at` (newest first).
  - Supports:
    - `?category=<id>` to filter by category.
    - `?search=<text>` to search by product name.
- `POST /api/products/`
  - Requires `IsProducer()` (only producers can create products).
  - Uses `ProductSerializer` to validate and save the product.

### 3.2 Product Detail, Update and Delete

**File:** `products/views.py`  
**Class:** `ProductDetailView` (DRF `RetrieveUpdateDestroyAPIView`)

- `GET /api/products/{id}/`
  - Returns detailed information for a single product.
- `PUT/PATCH/DELETE /api/products/{id}/`
  - Requires `IsProducer()` to ensure only producers can modify products.

### 3.3 Category List

**File:** `products/views.py`  
**Class:** `CategoryList` (DRF `ListAPIView`)

- `GET /api/categories/`
  - Returns the list of product categories ordered by name.

**Routing:** `products/urls.py`

- Routes:
  - `path("products/", ProductListCreateView.as_view(), ...)`
  - `path("products/<int:pk>/", ProductDetailView.as_view(), ...)`
  - `path("categories/", CategoryList.as_view(), ...)`

---

## 4. Shopping Cart API

**Goal:** Implement a simple shopping cart so customers can add products,
see their items and totals, and remove items.

**Main files:**

- `cart/models.py`
- `cart/serializers.py`
- `cart/views.py`
- `cart/urls.py`

### 4.1 Data Model

**File:** `cart/models.py`

- `Cart` model:
  - One-to-one relationship with `User` (each user has one cart).
  - Tracks `created_at` and `updated_at`.
- `CartItem` model:
  - Foreign key to `Cart` and `Product`.
  - `quantity` field.
  - `unique_together` constraint on `(cart, product)` so one cart has at
    most one row per product.

This structure keeps the cart logic simple and avoids duplicate items for
the same product.

### 4.2 Serializers

**File:** `cart/serializers.py`

- Serializes cart items and the overall cart response.
- Ensures that the API returns:
  - A list of items.
  - Product information.
  - Quantities.

### 4.3 Cart Endpoint

**File:** `cart/views.py`  
**Class:** `CartView` (DRF `APIView`)

- `GET /api/cart/`
  - Returns the current user’s cart with:
    - List of items.
    - Total item count.
    - Total price (computed using product prices and quantities).
- `POST /api/cart/`
  - Body: `product_id`, `quantity`.
  - Adds a new item or updates the quantity if it already exists.
- `DELETE /api/cart/`
  - Body: `product_id`.
  - Removes the item from the cart.

**Permissions:**

- Requires the user to be authenticated.
- Uses `IsCustomer` to restrict cart features to customers.
- Uses `IsOwner` to ensure the cart belongs to the user making the request.

**Routing:** `cart/urls.py`

- Route:
  - `path("", CartView.as_view(), name="cart")`
  - Typically included at `/api/cart/` in the main URL configuration.

---

## 5. API Documentation and Test Case Mapping

**Goal:** Provide clear documentation linking the implemented endpoints to
the responsibilities and the formal Sprint 1 test cases.

**Main files:**

- `API_DOCS.md`
- `API_DOCS.html`
- `SPRINT1_ROLE_MAPPING.txt`

### 5.1 API_DOCS.md

**File:** `API_DOCS.md`

- Title: “BRFN Marketplace API (Sprint 1 focus)”.
- Architecture overview:
  - Embeds the provided DRF diagram.
  - Explains how URLs, Views, Serializers and Models map to each other.
- Documents:
  - Auth endpoints (`/api/auth/...`).
  - Product endpoints (`/api/products/...`, `/api/categories/`).
  - Cart endpoint (`/api/cart/`).

### 5.2 Test Case Mapping

Inside `API_DOCS.md`, there is a **“Test Case Mapping (Sprint 1)”** section
linking test cases to concrete endpoints:

- **TC‑001 – Producer Registration**
  - `POST /api/auth/register/producer/`
- **TC‑002 – Customer Registration**
  - `POST /api/auth/register/customer/`
- **TC‑022 – Login & Access Control**
  - `POST /api/auth/login/`
  - `GET /api/auth/profile/`
  - Uses `IsProducer`, `IsCustomer`, `IsOwner` for role checks.
- **TC‑004 – Product Browsing with Category Navigation**
  - `GET /api/products/?category=&search=`
- **TC‑003 – Product Detail**
  - `GET /api/products/{id}/`
- **TC‑006 – Shopping Cart**
  - `GET /api/cart/`
  - `POST /api/cart/`
  - `DELETE /api/cart/`

This makes it easy for markers to verify that each test case is backed by
a working endpoint.

### 5.3 Printable HTML Version

**File:** `API_DOCS.html`

- Small HTML wrapper that:
  - Loads the Markdown content.
  - Renders it nicely in the browser using a client-side Markdown renderer.
  - Is designed to be exported as PDF using the browser’s “Export as PDF”
    or “Print to PDF” feature.

---

## 6. Sprint 1 Completion Summary

Based on the responsibilities for **Eugene Dalla** in the sprint guide:

- Authentication API:
  - Producer and customer registration implemented.
  - Login, logout and profile endpoints implemented.
- Role-based permissions:
  - Custom DRF permissions implemented (`IsProducer`, `IsCustomer`, `IsOwner`).
  - Integrated into product and cart views.
- Product catalogue:
  - Product list with category and search filters.
  - Product detail endpoint.
  - Producer-only create/update/delete.
  - Category listing endpoint.
- Shopping cart:
  - Cart and cart item models created.
  - Add/view/remove endpoints implemented.
  - Totals calculated server-side.
- Documentation:
  - API_DOCS.md describes endpoints and architecture.
  - Test case mapping links endpoints to Sprint 1 test cases.
  - SPRINT1_ROLE_MAPPING.txt links sprint responsibilities to specific files.

Overall, the Sprint 1 backend responsibilities assigned to Eugene Dalla are
implemented and documented, and the work is grouped in
`Eugene_Dalla_Sprint1/` so it is easy to review and submit.
