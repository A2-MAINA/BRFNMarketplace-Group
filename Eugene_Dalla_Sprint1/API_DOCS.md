# BRFN Marketplace API (Sprint 1 focus)

> Eugene Dalla — Backend API & Business Logic  
> This file documents the endpoints that satisfy the Sprint 1 responsibilities.

Base URL (inside Docker): `http://localhost:8025`

## Architecture Overview

![DRF overview](https://learn-eu-central-1-prod-fleet01-xythos.content.blackboardcdn.com/5efb3ace8ea0a/33684022?X-Blackboard-S3-Bucket=learn-eu-central-1-prod-fleet01-xythos&X-Blackboard-Expiration=1771470000000&X-Blackboard-Signature=brEyUOxWwC1nZMC78OWzfh5%2Btd9uYEEBU%2Bv42nE9RGE%3D&X-Blackboard-Client-Id=147883&X-Blackboard-S3-Region=eu-central-1&response-cache-control=private%2C%20max-age%3D21600&response-content-disposition=inline%3B%20filename%2A%3DUTF-8%27%27overview.png&response-content-type=image%2Fpng&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKT%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaDGV1LWNlbnRyYWwtMSJIMEYCIQCAi%2BTcslm0NQ2kHzymFDoU58xhR1i5CNUjq5WoaiKA2gIhAPboNNNT4b0rnNnboPJnN37%2FCbOm%2FR2uJ%2FmZnA86xiLYKr4FCG0QBBoMNjM1NTY3OTI0MTgzIgwlCvyyTo6fh%2FhgjZ4qmwXcov7u8OOpKnG3fYl03U4nPuzQ%2Fljopv1FyIjXZQiZEQu1xoq1PluqcfsV2MubcgSYgnEjtj0RnHqD578UpECYtsIqKO2cAAOeZCKjy4T0sNRv552FZrbs1qwS5IyHA%2B8yRXZUK%2BZJFg3m%2Bs9bkg0PvWA%2FVMstQGKRcAJY4jjdWEzg3L788h7HuBE1Lr0fL%2FDB0ZnP7gGM0AhJaNvUthrHiPGH6dfkG8Pqf2NBDyzthFO71HdszWaOzgyXCrh4ydkGK7XiMrM8LDlNd731k5W7tVrdsKmZX%2FqfUGhAnGvDf6y%2FH4MSLw2LcEbgzeqmgzFuFPqnhh1%2F2mXviKotIQkRbi52l9gjPKGIFZwRP%2B0Ml%2BcCjcbiUqQJaxuRxJVLSlXMZWJs8QktrTQ28ATbi4pdkaiMRShGUPCDL0z3OCtNn61U5inHri%2Bsvtswttr5As5HQA9Il9T7XpZ9DxZB4HNsk0NcQVJHnFymDIU1jhYBu0XH8QnapY9WCZIqyqky0LsjjorwY94TcgDy5fwBLu3Vx9vizI5%2FqsR4GljabQlFZYjCiGoQqwM5pCnBInp572Gi9L6D9fS9cILWVurwuS54pH2Z2Wzf8Wa%2Ft5JawE9%2FYgpOLD2K64MHiC22nJEjNr9WOhRWURmiyBGHZJMR%2FHWewi3xhPv8jRVAVIogSSj%2FhZvJ6Xp%2BuV%2Bvd5xaz%2Bu6b%2B%2Bnpyf9EmdLL%2BwTlVDXj9gdzh9BbYg3wmLsUGCZUe3cz03lSueP%2F0VosSIsuFemu4VTvgzr53U4Ktx%2BjST06h%2BDbEM%2F9ZBjqccv6cqqlR0bvCfy0oOqrrff%2FzEf2LaOiqAcz1SOUHrblNdiu1xYBrdjGwKJTrjxKjR7tQj%2B72EINOJbZjwPo96vQ6eYMKy92MwGOrABVF9WKPOATR10w490BUcK18J3AdlZW9A06aL9b73uXpRy7AM9ssgZP3YViDnZMho5MRhF3ZfCQ2lEuSWgtwqE6b8ggN6uCoRVHzs%2FDr8G%2Fnpr0cm3SJzJYTsTHsspAWajyICmq68HYvucKFs7m5R9RGGEwhJ6eh%2FSPGWFJu3H80rEnW1dLRyr8ADfAqBS2z5r1tmF%2FXPybtnsTlIap2DvyMSFph9Ptki%2Bs6HUcUJGtOY%3D&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260218T210000Z&X-Amz-SignedHeaders=host&X-Amz-Expires=21600&X-Amz-Credential=ASIAZH6WM4PLUPLTV3VK%2F20260218%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Signature=ee2d1279ca4d1db4cc67d9f75f3bed468f53e929a1601b01066e9cc5da784c39)

The diagram maps to our code as follows:

- URLs → route definitions  
  - Auth: `backend/users/urls.py` (included at `/api/auth/`)  
  - Products: `backend/products/urls.py` (included at `/api/`)  
  - Cart: `backend/cart/urls.py` (included at `/api/cart/`)
- Views → request handlers  
  - Auth views: `backend/users/views.py`  
  - Product/category views: `backend/products/views.py`  
  - Cart view: `backend/cart/views.py`
- Serializers → JSON in/out shapes  
  - `backend/users/serializers.py`, `backend/products/serializers.py`, `backend/cart/serializers.py`
- Database → models and relations  
  - Users & profiles: `backend/users/models.py`  
  - Products & categories: `backend/products/models.py`  
  - Cart & items: `backend/cart/models.py`

## Auth

- `POST /api/auth/register/producer/`
  - Body: `email, password, password_confirm, business_name, contact_name, phone_number?, address, postcode, crn?, description?, food_hygiene_rating?`
  - Creates a producer `User` + `ProducerProfile`.

- `POST /api/auth/register/customer/`
  - Body: `email, password, password_confirm, full_name, phone_number?, delivery_address, postcode, terms_accepted`
  - Creates a customer `User` + `CustomerProfile`.

- `POST /api/auth/login/`
  - Body: `email, password`
  - Uses session authentication; returns basic user profile JSON.

- `POST /api/auth/logout/`
  - Logs out current session.

- `GET /api/auth/profile/`
  - Returns current user profile.

## Products & Categories

- `GET /api/products/`
  - Query params: `category` (id), `search` (name fragment).
  - Returns list of products with `category_name`.

- `POST /api/products/` (Producer only)
  - Requires authenticated user with `role="producer"`.
  - Creates new product.

- `GET /api/products/{id}/`
  - Product detail.

- `PUT/PATCH/DELETE /api/products/{id}/` (Producer only)
  - Update or delete product.

- `GET /api/categories/`
  - List of categories.

## Cart (Customer only)

- `GET /api/cart/`
  - Returns `{items, total, count}` for the current user's cart.

- `POST /api/cart/`
  - Body: `product_id, quantity`
  - Adds or updates an item in the cart.

- `DELETE /api/cart/`
  - Body: `product_id`
  - Removes an item from the cart.

## Test Case Mapping (Sprint 1)

- TC‑001 — Producer Registration
  - Endpoint: `POST /api/auth/register/producer/`
  - Success: 201 with basic profile JSON; user role = `producer`
  - Errors: email already in use; weak password; password mismatch

- TC‑002 — Customer Registration
  - Endpoint: `POST /api/auth/register/customer/`
  - Success: 201 with basic profile JSON; user role = `customer`
  - Errors: must accept terms; weak password; password mismatch

- TC‑022 — Login & Access Control
  - Login: `POST /api/auth/login/` → session cookie
  - Profile: `GET /api/auth/profile/` (auth required)
  - Permissions used:
    - `IsProducer` for product writes (POST/PUT/PATCH/DELETE)
    - `IsCustomer` for cart operations
    - `IsOwner` reserved for owner‑protected resources
  - Logout: `POST /api/auth/logout/`

- TC‑004 — Product Browsing with Category Navigation
  - List: `GET /api/products/`
  - Filters: `?category=<id>` and `?search=<text>`
  - Categories: `GET /api/categories/`

- TC‑003 — Product Detail (with future allergen display)
  - Detail: `GET /api/products/{id}/`
  - Note: Allergen model/UI integration is planned in the next phase

- TC‑006 — Shopping Cart (Quantity Modification)
  - View: `GET /api/cart/` → returns `items`, `total`, `count`
  - Add/Update: `POST /api/cart/` with `product_id`, `quantity`
  - Remove: `DELETE /api/cart/` with `product_id`
