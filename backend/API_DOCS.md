# BRFN Marketplace API (Sprint 1 focus)

## Architecture Overview
The backend is built using **Django REST Framework (DRF)**.
- **Authentication**: Custom User model with email login + JWT/Session auth (Session used for Sprint 1).
- **Permissions**: Role-based access control (Producer vs Customer).
- **Database**: PostgreSQL (or SQLite for dev).

## Endpoints

### 1. Authentication (`/api/auth/`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/register/producer/` | Register as a new Producer | Public |
| POST | `/register/customer/` | Register as a new Customer | Public |
| POST | `/login/` | Login (returns user details) | Public |
| POST | `/logout/` | Logout (clears session) | Authenticated |
| GET | `/profile/` | Get current user profile details | Authenticated |

### 2. Products (`/api/products/`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/products/` | List all products (supports filtering/search) | Public |
| POST | `/products/` | Create a new product | Producer only |
| GET | `/products/<id>/` | Get product details | Public |
| PUT/PATCH | `/products/<id>/` | Update product | Owner Producer only |
| DELETE | `/products/<id>/` | Delete product | Owner Producer only |
| GET | `/categories/` | List all product categories | Public |

### 3. Shopping Cart (`/api/cart/`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/cart/` | View current user's cart | Customer only |
| POST | `/cart/` | Add item to cart | Customer only |
| DELETE | `/cart/` | Clear entire cart | Customer only |
| PUT | `/cart/items/<id>/` | Update item quantity | Customer only |
| DELETE | `/cart/items/<id>/` | Remove specific item | Customer only |

## Test Case Mapping (Sprint 1)

### TC-001: Producer Registration
- **Endpoint**: `POST /api/auth/register/producer/`
- **Data**: `email`, `password`, `password_confirm`, `business_name`, `contact_name`, `postcode`, etc.
- **Success**: 201 Created.

### TC-002: Customer Registration
- **Endpoint**: `POST /api/auth/register/customer/`
- **Data**: `email`, `password`, `password_confirm`, `full_name`, `delivery_address`, `postcode`, `terms_accepted`.
- **Success**: 201 Created.

### TC-022: Login and Permissions
- **Endpoint**: `POST /api/auth/login/`
- **Validation**: Correct role returned, correct permissions enforced on protected endpoints.

### TC-003: Product Detail
- **Endpoint**: `GET /api/products/<id>/`
- **Response**: Full product details including producer name, price, allergens.

### TC-004: Product Browsing
- **Endpoint**: `GET /api/products/?category=Vegetables&search=Carrots`
- **Features**: Filter by category, search by name.

### TC-006: Shopping Cart
- **Endpoint**: `POST /api/cart/` (Add item)
- **Endpoint**: `GET /api/cart/` (View total)
