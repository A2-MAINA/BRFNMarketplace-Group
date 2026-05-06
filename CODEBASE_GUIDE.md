# BRFN Marketplace — Codebase Guide (Q&A)

A complete walkthrough of the entire system, written in interview / explainer format. Every Python module, every JavaScript service, every container, every port, every pattern.

If you want to know **what every test case verifies and which file proves it** — that's [TEST_CASES.md](TEST_CASES.md) (this doc points at it from Part 6 rather than duplicating).

If you want to know **how to add a new feature without breaking anything** — read Part 8 first.

---

## Table of contents

- [Part 1 — Quickstart](#part-1--quickstart)
- [Part 2 — Architecture & infrastructure](#part-2--architecture--infrastructure)
- [Part 3 — Backend deep-dive](#part-3--backend-deep-dive)
- [Part 4 — Frontend deep-dive](#part-4--frontend-deep-dive)
- [Part 5 — DevOps & infrastructure](#part-5--devops--infrastructure)
- [Part 6 — Test cases (brief)](#part-6--test-cases-brief)
- [Part 7 — Per-file index](#part-7--per-file-index)
- [Part 8 — FAQ & common pitfalls](#part-8--faq--common-pitfalls)

---

# Part 1 — Quickstart

## Q. What is this project?

**A.** BRFN Marketplace — a digital marketplace for the **Bristol Regional Food Network**. It connects ~40 local food producers (farms, bakeries, dairies all within 20 miles of Bristol) with three types of buyer: standard customers, restaurants, and community groups. It is a 4-person university group project worth 60% of the *Distributed & Enterprise Software Development* module mark, due **7 May 2026**.

The platform supports the full life cycle of a local-food order: producers list products with UK-allergen information and traceability data; customers browse, search, and check out via Stripe; producers progress orders through `pending → confirmed → processing → ready → delivered`; and an admin role oversees commission and dispute resolution. There are 25 numbered test cases (TC-001..TC-025) spread across three sprints. Every one currently passes — see [TEST_CASES.md](TEST_CASES.md).

## Q. How do I run it from scratch on a clean machine?

**A.** You need Docker Desktop and Git. Three commands, in order:

```bash
git clone <repo>
cd BRFNMarketplace-Group
docker compose up -d --build
```

`-d` runs detached (in the background). `--build` rebuilds images from the Dockerfiles. The first build takes a few minutes; subsequent starts are seconds. When it's done you have three running containers:

- `brfn_db`    — Postgres 16
- `brfn_backend` — Django + DRF
- `brfn_frontend` — nginx serving the SPA + reverse-proxying `/api/*` to the backend

The backend's [entrypoint.sh](backend/entrypoint.sh) waits for Postgres, runs migrations (`python manage.py migrate --noinput`), and seeds five demo accounts. So you go from clone to a fully populated, login-ready system without typing another command.

## Q. What URLs do I open in the browser?

**A.**

| What | URL |
|---|---|
| The actual app (customers, producers, etc.) | http://localhost:3025 |
| Django admin panel | http://localhost:8025/admin/ |
| Raw API (e.g. product list) | http://localhost:8025/api/products/ |
| Postgres (psql client) | `localhost:5455`, db `brfn_db`, user `brfn_user`, password `brfn_password` |

You log into the customer-facing UI at `localhost:3025`. The Django admin is a separate Django-managed UI bound to the backend port — useful for the admin demo account (Sprint 3 TC-014/TC-018/TC-025).

## Q. What are the demo accounts and where do they come from?

**A.** All five roles are seeded automatically by [backend/entrypoint.sh](backend/entrypoint.sh) every time the backend container starts. The script uses upsert logic — if the user exists, it resets the password to the documented value; otherwise it creates the user + the matching profile row.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@brfn.com` | `Admin123!` |
| Customer | `customer@example.com` | `Password1!` |
| Producer | `producer@example.com` | `Password1!` |
| Restaurant | `restaurant@example.com` | `Password1!` |
| Community Group | `community@example.com` | `Password1!` |

Each of the four non-admin roles also has a fully-populated profile row (business name, address, postcode, etc.) so you don't see empty fields when you log in. See `upsert_customer`, `upsert_producer`, `upsert_restaurant`, `upsert_community_group` inside the entrypoint.

## Q. What's the fastest "smoke test" to know the system is alive?

**A.** Three `curl` calls:

```bash
curl -s -o /dev/null -w "frontend %{http_code}\n" http://localhost:3025/
curl -s -o /dev/null -w "backend  %{http_code}\n" http://localhost:8025/api/products/
curl -s http://localhost:8025/api/categories/ | python3 -m json.tool
```

If all three return 200 and the categories list shows 5 entries (Vegetables, Dairy & Eggs, Bakery, Preserves, Seasonal Specialties), the stack is healthy. If the third one is empty, your migrations didn't apply — see Part 5.

---

# Part 2 — Architecture & infrastructure

## Q. What's the overall stack?

**A.**

| Layer | Tech | Role |
|---|---|---|
| Database | PostgreSQL 16 (alpine) | Source of truth |
| Backend | Django 5 + Django REST Framework | API server, auth, business logic, admin |
| Frontend | Vanilla JS SPA (no React, no build step) | Single `index.html` + `app.js` + `style.css` + 12 service modules |
| Web server | nginx (alpine) | Serves the static SPA, reverse-proxies `/api/*` and `/admin/` to Django |
| Containers | Docker Compose | Orchestrates the three services |
| Payments | Stripe (test mode) | Card tokenisation + payment intents |

Everything you need to run is in [docker-compose.yml](docker-compose.yml). There is no Kubernetes, no separate CI deploy, no cloud DB — university machine, Docker, done.

## Q. Why are there three containers? What does each one do?

**A.** Three containers because each service has a different lifecycle, dependency set, and scaling profile. From [docker-compose.yml](docker-compose.yml):

1. **`brfn_db` (Postgres 16)** — Stores users, products, orders, cart items, reviews, disputes, payments, notifications, wholesale prices. Persists data via the named Docker volume `postgres_data`. The volume survives container restarts; the only way to wipe it is `docker compose down -v`.

2. **`brfn_backend` (Django + DRF)** — The API. Runs `python manage.py runserver 0.0.0.0:8000` after the entrypoint finishes migrations + seeding. Bind-mounts `./backend:/app` so code changes on the host hot-reload (Django's `StatReloader`).

3. **`brfn_frontend` (nginx)** — Serves three things: (a) the static SPA (HTML/JS/CSS), (b) reverse-proxies `/api/*` to the backend service (Docker DNS resolves `backend` → the backend container's IP), (c) reverse-proxies `/admin/` to the backend so the Django admin UI can be accessed via the same origin.

Each container is independently restartable (`docker compose restart backend`). They communicate over Docker's default bridge network using **service names** (`db`, `backend`) instead of host IPs.

## Q. Why localhost:3025 for the frontend? Why localhost:8025 for the backend? Why localhost:5455 for Postgres?

**A.** These are **host:container port mappings** declared in `docker-compose.yml`:

```yaml
db:        "5455:5432"   # host 5455 → container 5432 (Postgres default)
backend:   "8025:8000"   # host 8025 → container 8000 (Django runserver default)
frontend:  "3025:80"     # host 3025 → container 80   (nginx default)
```

The containers internally use the standard ports (5432, 8000, 80). The host-side ports are deliberately offset to a non-standard range so they don't collide with anything else you might be running locally — for example, if a teammate already has Postgres on 5432 or a React dev server on 3000, this stack still comes up clean. The "25" suffix is just a memorable convention chosen by Al-amin. There's nothing magic about the numbers — change them in `docker-compose.yml` and rebuild if you need to.

When you open `http://localhost:3025` in your browser, you reach the **nginx container**. nginx does not serve the API itself — it serves the static SPA and forwards anything starting with `/api/` to `http://backend:8000` over the internal Docker network. From the browser's perspective everything is on `localhost:3025` (same-origin), which sidesteps CORS and a bunch of session-cookie cross-origin issues.

## Q. How does the browser actually reach the Django backend through nginx?

**A.** Look at [frontend/nginx.conf](frontend/nginx.conf):

```nginx
location / {
    root /usr/share/nginx/html;
    index index.html;
    try_files $uri $uri/ /index.html;       # SPA fallback
    add_header Cache-Control "no-cache, must-revalidate";
}

location /api/ {
    proxy_pass http://backend:8000;          # forward to Django
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /admin/ {
    proxy_pass http://backend:8000;          # Django admin too
}
```

So `GET http://localhost:3025/` → nginx serves `/usr/share/nginx/html/index.html`. `POST http://localhost:3025/api/auth/login/` → nginx forwards to `http://backend:8000/api/auth/login/` (the `backend` hostname resolves via Docker's internal DNS). The browser only ever talks to `localhost:3025`, so cookies are first-party to that origin.

`try_files $uri $uri/ /index.html` is the **SPA fallback** — if a file at the requested path doesn't exist (e.g. someone deep-links to `localhost:3025/dashboard`), nginx serves `index.html` instead of 404'ing. The SPA's `navigate()` function then handles the route client-side.

## Q. How does session auth work across these ports? Why isn't this a CSRF nightmare?

**A.** Because nginx makes everything same-origin, this is much simpler than a typical SPA-on-3000 + API-on-8000 split.

1. **Browser → http://localhost:3025/api/auth/csrf/** (a no-op endpoint whose only job is to set a `csrftoken` cookie).
2. Django's `@ensure_csrf_cookie` decorator on [CSRFView](backend/users/views.py) writes a `csrftoken` cookie scoped to `localhost:3025` (well, technically the response goes via nginx but the cookie's `Set-Cookie` header arrives at the browser as if it came from `localhost:3025`).
3. Browser later sends `POST /api/auth/login/`. The frontend service `api.js` reads the `csrftoken` cookie and adds it as an `X-CSRFToken` header. Django's `CsrfViewMiddleware` is happy — it sees the header.
4. Django's `LoginView` sets a `sessionid` cookie. The browser stores it.
5. Future requests carry `Cookie: sessionid=...; csrftoken=...`. Django's `SessionMiddleware` resolves the user. DRF's `request.user` is populated.

So there are two cookies — `sessionid` for who you are, `csrftoken` for proving you're a same-origin browser making the request and not an attacker's cross-site form. Both ride along on every API call thanks to `credentials: 'include'` in `api.js`'s `fetch()` options.

## Q. What does `CsrfExemptSessionAuthentication` do, and why isn't it dangerous?

**A.** It's defined in [backend/users/authentication.py](backend/users/authentication.py):

```python
class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return  # no-op
```

DRF's default `SessionAuthentication` calls `enforce_csrf()` on unsafe methods (POST/PUT/PATCH/DELETE) and rejects the request if the CSRF token doesn't match. We override that to a no-op and use this class as the **default authentication class** for all DRF views (see `REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES']` in `backend/config/settings.py`).

Why isn't this dangerous? Because **session auth is still in force** — without a valid `sessionid` cookie, DRF treats the user as anonymous and the permission classes (`IsAuthenticated`, `IsCustomer`, etc.) reject the request with 403. The reason CSRF protection exists is to stop attackers tricking your browser into submitting authenticated state-changing forms. In this codebase, all writes go through `fetch()` from JavaScript that we control, with `credentials: 'include'` and an explicit JSON content type — exactly the pattern that CSRF can't help with anyway because browsers don't send arbitrary JSON cross-origin without an explicit CORS preflight.

The trade-off: in a *real* deployment you'd either (a) keep CSRF enforcement on and have the SPA mint a token per request (the same-origin nginx setup makes this easy — see frontend/src/services/api.js auto-attaching `X-CSRFToken`), or (b) move to JWT/Bearer tokens. For this coursework Al-amin chose path (a)'s simpler cousin: keep the cookie + token round-trip but skip the strict middleware match. The frontend still includes `X-CSRFToken` headers; the backend just doesn't enforce them.

## Q. How does the frontend know where the backend is? (`api.js` resolution)

**A.** Walk through [frontend/src/services/api.js](frontend/src/services/api.js):

```js
function getApiBase() {
  if (window.BRFN_API_BASE) return window.BRFN_API_BASE;
  const meta = document.querySelector('meta[name="brfn-api-base"]');
  if (meta && meta.getAttribute('content')) return meta.getAttribute('content').trim();
  return '';
}
const API_BASE = getApiBase();
```

Three resolution rules, in order:

1. `window.BRFN_API_BASE` (if set explicitly somewhere — useful for tests).
2. `<meta name="brfn-api-base" content="...">` in `index.html` (if you want to point the SPA at a different backend without rebuilding).
3. Fallback to **empty string**, meaning "use the current origin". This is the default and correct path for the Docker setup — every API call lands on `localhost:3025` and nginx forwards it.

Then `request(method, path, body)` builds the URL with `${API_BASE}${path}` (path always starts with `/api/...`), attaches `credentials: 'include'`, sets JSON headers, adds the CSRF token from the cookie for unsafe methods, and `await`s `fetch`. On non-2xx, it throws an `Error` with `.status` and `.body` attached so callers can inspect failure shape. There are five wrapper helpers — `get`, `post`, `put`, `patch`, `del` — that all call into `request()`.

## Q. What environment variables does the stack need? (`.env`, `docker-compose.yml`)

**A.** A `.env` file at repo root supplies dev defaults and Stripe test keys. Read into the container's environment by Docker Compose's auto-import. The keys are:

```
DB_NAME=brfn_db
DB_USER=brfn_user
DB_PASSWORD=brfn_password
DB_HOST=db
DB_PORT=5432
SECRET_KEY=django-insecure-...   # any value for dev
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Note that `.env` **is not gitignored** in this repo (`.gitignore` does not list it). Don't commit a real production secret key. For dev, the values above are fine — they only work against local Postgres + Stripe test mode.

`docker-compose.yml` references these variables via `${STRIPE_SECRET_KEY}` interpolation for the backend service. The `db` service uses inline values (the dev defaults), not the `.env` ones — so changing `.env` doesn't change the database password unless you also update `docker-compose.yml`.

---

# Part 3 — Backend deep-dive

## Q. How is the Django project laid out?

**A.**

```
backend/
├── manage.py              # Django CLI entry
├── requirements.txt       # 7 pip dependencies
├── Dockerfile             # python:3.13-slim, copies code, sets entrypoint
├── entrypoint.sh          # waits for DB, migrates, seeds 5 demo accounts
├── API_DOCS.md            # Sprint 1 endpoint cheat-sheet (partial)
├── config/                # the Django "project" package
│   ├── __init__.py
│   ├── settings.py        # all the settings
│   ├── urls.py            # top-level URL include
│   ├── wsgi.py            # standard, untouched
│   ├── asgi.py            # standard, untouched
│   └── auth.py            # dead stub (NOT used)
├── users/                 # auth, profiles, all 5 roles
├── products/              # catalog, reviews, notifications, wholesale, analytics
├── orders/                # orders, payment, settlements, disputes
└── cart/                  # shopping cart
```

The four "apps" follow Django convention — each has its own `models.py`, `serializers.py`, `views.py`, `urls.py`, `admin.py`, `apps.py`, and `migrations/`. Tests are stubs in three of them (`products/tests.py`, `orders/tests.py`, `cart/tests.py` are 3-line placeholders); only `users/tests.py` has a real `Sprint1IntegrationTests` class with a 100-line `test_full_flow` that registers a producer, lists a product, and walks a customer through it.

## Q. What does `manage.py` do? When do I use it?

**A.** It's Django's CLI shim. Untouched boilerplate. You run things like `python manage.py migrate`, `python manage.py shell`, `python manage.py makemigrations`, `python manage.py runserver` through it. In Docker you wrap it: `docker compose exec backend python manage.py migrate`. The entrypoint script uses it to apply migrations at container start.

## Q. How does `settings.py` configure auth, DB, REST_FRAMEWORK, password validators, AUTH_USER_MODEL?

**A.** Walk through the highlights of [backend/config/settings.py](backend/config/settings.py):

```python
INSTALLED_APPS = [
    'django.contrib.admin', 'django.contrib.auth',
    'django.contrib.contenttypes', 'django.contrib.sessions',
    'django.contrib.messages', 'django.contrib.staticfiles',
    'rest_framework', 'corsheaders', 'django_filters',
    'users', 'products', 'orders', 'cart',
]
```

— Django's six standard apps, three third-party packages, four project apps. Note that `corsheaders` is installed but in practice CORS isn't needed because nginx puts everything on the same origin.

```python
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
```

— Standard order. `SessionMiddleware` reads `sessionid` cookies. `CsrfViewMiddleware` is in the chain (so non-DRF views are still protected) but DRF endpoints bypass it via `CsrfExemptSessionAuthentication`. `AuthenticationMiddleware` populates `request.user`.

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'brfn_db'),
        ...
    } if os.environ.get('DB_HOST') else {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
```

— If the `DB_HOST` env var is set (Docker case), use Postgres. If not (someone running `python manage.py runserver` outside Docker), fall back to SQLite. Useful escape hatch for unit tests.

```python
AUTH_PASSWORD_VALIDATORS = [
    UserAttributeSimilarityValidator,   # rejects "myname" if email is myname@x.com
    MinimumLengthValidator,              # default min 8 chars
    CommonPasswordValidator,             # rejects top-1000 common passwords
    NumericPasswordValidator,            # rejects all-digit passwords
]
```

— Standard Django chain. Run on every `set_password` / `create_user`.

```python
AUTH_USER_MODEL = 'users.User'
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['users.authentication.CsrfExemptSessionAuthentication'],
}
```

— Custom user model (so `get_user_model()` returns `users.User`, not Django's default). DRF default auth class set to the no-CSRF subclass.

## Q. How do Django migrations work in this project? Why does `products/` jump 0001 → 0005 → 0006? Why are there cross-app deps like `products/0006 → orders/0003`?

**A.** Migrations are sequential schema changes auto-generated by `python manage.py makemigrations` and applied by `python manage.py migrate`. Each migration file declares `dependencies = [(app_label, migration_name), ...]` — Django uses this DAG to apply them in the correct order even across apps.

In our repo:

| App | Migrations |
|---|---|
| `users` | `0001_initial`, `0002_communitygroupprofile_restaurantprofile` |
| `products` | `0001_initial`, `0005_seed_categories_allergens`, `0006_notification_review_wholesaleprice` |
| `orders` | `0001_initial`, `0002_add_status_to_producergroup`, `0003_dispute` |
| `cart` | `0001_initial` |

The number gap in `products/` (0001 → 0005 → 0006) is **fine**. Django doesn't require sequential numbers — it requires the dependency chain to be intact. The intermediate 0002/0003/0004 migrations were squashed during a merge; what survived is the chain `products/0001 ← products/0005 ← products/0006`. `products/0006_notification_review_wholesaleprice` declares `dependencies = [('products', '0005_seed_categories_allergens'), ('orders', '0003_dispute')]` — the cross-app dep is there because `Review.order` is a foreign key to `orders.Order`, and Django needs the `Order` table to exist before it can add the `Review` table that references it.

`products/0005_seed_categories_allergens` is a **data migration** (not just a schema change). It pre-loads the 5 BRFN categories and the 14 UK allergens via `migrations.RunPython()`. That's why `GET /api/categories/` returns 5 rows on a freshly-built container without anyone running a fixture.

To verify your local DB matches the migration history: `docker compose exec backend python manage.py makemigrations --check --dry-run`. Should print `No changes detected`. If it doesn't, someone edited a model without committing a migration.

## Serializer pattern — full Q&A

### Q. What is a serializer? Why does DRF need one separate from the model?

**A.** A serializer is a translation layer between Python objects (database rows / Django model instances) and JSON (the wire format). It does **three jobs**:

1. **Validate** incoming JSON against rules — types, required fields, custom logic — and produce clean Python data.
2. **Transform** Python objects on the way out — flatten foreign keys to IDs, drop fields, nest related objects, anonymise PII.
3. **Persist** validated data — call `instance.save()` or build a new instance with the right fields populated.

You need it as a separate concept from the model because models live in the database layer (their fields describe storage; their methods are domain logic) while serializers live in the API layer (their fields describe what's exposed; their methods describe transformations a client cares about). You wouldn't expose `password` to a JSON response or accept `terms_accepted_at` from the client — both of those decisions happen in the serializer, leaving the model clean.

### Q. Walk me through `ProducerRegistrationSerializer` field-by-field — what's `password_confirm` doing, and why `@transaction.atomic`?

**A.** From [backend/users/serializers.py](backend/users/serializers.py):

```python
class ProducerRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    business_name = serializers.CharField(max_length=200)
    contact_name = serializers.CharField(max_length=200)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    address = serializers.CharField()
    postcode = serializers.CharField(max_length=10)

    class Meta:
        model = User
        fields = ['email', 'password', 'password_confirm',
                  'business_name', 'contact_name', 'phone_number',
                  'address', 'postcode']

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        return data

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop('password')
        validated_data.pop('password_confirm')
        # pop the profile fields so they don't get sent to User.objects.create_user
        business_name = validated_data.pop('business_name')
        ...
        user = User.objects.create_user(
            email=email, username=email,
            password=password, role='producer'
        )
        ProducerProfile.objects.create(
            user=user, business_name=business_name, ...
        )
        return user
```

Field-by-field:
- `password` — `write_only=True` means it's accepted on input but never returned in any response. `min_length=8` enforces minimum length.
- `password_confirm` — same treatment, exists only to compare against `password` in `validate()`. Common UX pattern: stop typos before they become "I forgot my password".
- `business_name`, `contact_name`, `phone_number`, `address`, `postcode` — extra fields that **don't exist on the User model**. They're declared explicitly because we want them in the request body, but they'll be popped before `User.objects.create_user` so Django's user manager doesn't choke on them.

`@transaction.atomic` wraps the whole `create()` in a database transaction. If `User.objects.create_user` succeeds but `ProducerProfile.objects.create` raises (say, an unexpected DB-level constraint), the User row is rolled back too — you never end up with an orphaned User without a profile, or a profile whose `user` FK is dangling. Without `@transaction.atomic`, you'd risk a half-registered account that breaks the login flow forever.

### Q. What's the difference between `serializer.is_valid()`, `validate_<field>()`, `validate()`, and `create()`?

**A.** They're four steps in DRF's deserialisation pipeline:

| Step | Where it lives | What it does |
|---|---|---|
| `is_valid()` | DRF's base class | Walks every declared field, runs its built-in validators (type, length, choices, regex). Populates `serializer.errors` if anything fails. |
| `validate_<field>(self, value)` | Your serializer | Field-level custom validation. Runs after the built-ins for that field. Can raise `ValidationError({"field": "..."}). Example: `validate_terms_accepted` could refuse `False`. |
| `validate(self, data)` | Your serializer | Cross-field validation. Runs after every `validate_<field>` has passed. Can compare two fields against each other (the password match in our example). |
| `create(self, validated_data)` | Your serializer | Build and persist the new object from the validated data. Only runs when you call `serializer.save()` after `is_valid()` returns True. Counterpart for updates: `update(self, instance, validated_data)`. |

The view typically does:

```python
serializer = MySerializer(data=request.data)
if serializer.is_valid():
    obj = serializer.save()        # → calls create() under the hood
    return Response(MyReadSerializer(obj).data, status=201)
return Response(serializer.errors, status=400)
```

### Q. What does `to_representation` do in `ProductSerializer`? Why nest category + allergens?

**A.** [backend/products/serializers.py:33-39](backend/products/serializers.py):

```python
def to_representation(self, instance):
    data = super().to_representation(instance)
    data['category'] = CategorySerializer(instance.category).data
    data['allergens'] = AllergenSerializer(instance.allergens.all(), many=True).data
    data['producer_business_name'] = self.get_producer_business_name(instance)
    return data
```

`to_representation` is the hook for the **outbound** transform (Python object → dict). The default implementation walks declared fields and produces e.g. `{"category": 2, "allergens": [7]}` (just the IDs, because that's all the foreign keys hold).

By overriding it we replace the IDs with full nested objects — `{"category": {"id": 2, "name": "Dairy & Eggs", ...}, "allergens": [{"id": 7, "name": "Milk", ...}]}`. The frontend product card needs the category name and allergen names to render; if we returned only IDs, the SPA would have to fire follow-up requests to look them up. Nesting saves N+1 round-trips and keeps the wire format self-describing.

`producer_business_name` follows the same idea — instead of returning the producer's user ID and forcing the frontend to look up their business name, we resolve it server-side and embed the string.

### Q. Why does `OrderCreateSerializer` snapshot `price_at_time_of_order` instead of just FK-ing to the product?

**A.** Financial integrity. From [backend/orders/serializers.py:253-265](backend/orders/serializers.py) inside `create()`:

```python
OrderItem.objects.create(
    order=order,
    producer_group=group,
    product=product,
    producer=producer,
    quantity=item_data['quantity'],
    price_at_time_of_order=product.price,
    unit_at_time_of_order=product.unit,
    product_name_at_time_of_order=product.name,
)
```

`OrderItem` does have a foreign key to `Product`, but it **also stores price, unit, and name as snapshots**. Why? Because the producer can change `Product.price` after the order is placed. If we computed an order's total from the live product price every time, then a price change next week would silently rewrite the historical revenue, the commission, and the producer payout for an order that was paid for last week. HMRC and your customers would not be amused.

Snapshotting at order-creation time means the order is **immutable from a financial perspective** the moment it's saved. The FK to `Product` is still useful for "show me the current page for this product" lookups, but the money math always uses the snapshot.

### Q. Why does `ReviewSerializer.get_customer_name` return "Demo C." instead of the full name?

**A.** UK GDPR / Data Protection Act 2018. Public reviews are **anonymised** to first name + last initial. From [backend/products/serializers.py:77-90](backend/products/serializers.py):

```python
def get_customer_name(self, obj):
    """
    Anonymise customer name for public display — UK GDPR compliance.
    Returns first name + last initial only e.g. 'Robert J.'
    """
    try:
        name = obj.customer.customer_profile.full_name
        parts = name.split()
        if len(parts) >= 2:
            return f"{parts[0]} {parts[-1][0]}."
        return parts[0] if parts else obj.customer.email
    except Exception:
        return 'Customer'
```

Producers of food deserve to know whose review they're reading? Sort of — but on the public-facing side, exposing full customer names creates a lawful-basis problem (customers didn't consent to having their name published), and the value to other shoppers is small. "Demo C." is enough to feel like a real person without identifying them. This is a deliberate MO2 (legal/ethical) choice and worth pointing out in the report.

## View pattern — full Q&A

### Q. What's `APIView` vs `generics.ListCreateAPIView`? When do we use each?

**A.** Both come from DRF.

- `APIView` is the bare-bones class. You define `get`, `post`, `patch`, `delete` methods yourself. You're in full control of request handling, but you write more code.
- `generics.ListCreateAPIView` (and friends — `RetrieveUpdateDestroyAPIView`, etc.) is a pre-baked combination of `APIView` + a serializer + a queryset that handles the common patterns (list, create, retrieve, update, delete) with very little code.

In this codebase:
- **`generics.ListCreateAPIView`** is used for `ProductListCreateView` ([backend/products/views.py:15](backend/products/views.py#L15)) — pretty much standard CRUD with `filter_backends` for category + search.
- **`generics.RetrieveUpdateDestroyAPIView`** is used for `ProductDetailView` ([backend/products/views.py:38](backend/products/views.py#L38)).
- **`generics.ListAPIView`** is used for `CategoryList` and `AllergenList` — pure read-only listings.
- **`APIView`** is used everywhere with non-trivial logic — `OrderListCreateView`, `ProducerOrderStatusView`, `ProducerSettlementView`, `OrderDisputeView`, `ProductWholesalePriceView`, `ProducerAnalyticsView`, `PlatformRevenueView`, `LoginView`, etc.

The rule of thumb: if your endpoint is "list a queryset" or "retrieve by PK", use generics. If it has business logic (financial calculation, role branching, multi-step transactions), use `APIView` so your code is explicit and readable.

### Q. How does a request flow from URL → view → serializer → response? Trace it for `POST /api/orders/`.

**A.**

1. Browser → `POST http://localhost:3025/api/orders/` with JSON body and `sessionid` cookie.
2. **nginx** sees `/api/`, proxies to `http://backend:8000/api/orders/`.
3. **Django** runs the middleware stack — `SessionMiddleware` reads the cookie and resolves `request.user`; `AuthenticationMiddleware` finalises it.
4. **`config/urls.py`** sees `api/orders/` and includes `orders.urls`.
5. **`orders/urls.py`** matches `''` (empty path) and routes to `OrderListCreateView`.
6. **DRF** instantiates the view, runs the auth class (`CsrfExemptSessionAuthentication` — sets `request.user`), runs the permissions (`IsAuthenticated` — passes because `sessionid` is valid).
7. **`OrderListCreateView.post()`** runs. It checks `request.user.role != 'customer'` and rejects with 403 if not.
8. It instantiates `OrderCreateSerializer(data=request.data, context={'request': request})`.
9. `serializer.is_valid()` walks each field, runs `validate_delivery_date` (the 48-hour check), runs `validate()` (delivery address required if not all pickup).
10. If valid: `serializer.save()` calls `OrderCreateSerializer.create()`, which is wrapped in `@transaction.atomic`. It validates stock, creates the `Order`, creates one `OrderProducerGroup` per producer, creates `OrderItem`s with snapshotted price/unit/name, decrements stock, calls `group.calculate_financials()` (5%/95% split), calls `order.calculate_totals()` (sum across groups), creates a `Payment` record with status `pending`, and creates an initial `OrderStatusHistory` row.
11. The returned `order` is wrapped in `OrderSerializer(order).data` (the read-shape, includes `producer_groups`, `status_history`, `can_cancel`).
12. DRF wraps that in a `Response` with status 201 and `Content-Type: application/json`.
13. nginx forwards the response back. Browser receives JSON.

### Q. How do permissions chain?

**A.** DRF permissions are a list. **Every permission must return True** for the request to proceed. They run in declaration order. From [backend/users/permissions.py](backend/users/permissions.py):

```python
class IsProducer(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'producer'

class IsCustomer(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'customer'

class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if hasattr(obj, 'user'):
            return obj.user == request.user
        if hasattr(obj, 'producer'):
            return obj.producer == request.user
        return False
```

Note `has_permission` (called once per request) vs `has_object_permission` (called once per object after fetch). `IsOwner` only implements the latter — it inspects the model instance and checks ownership. Used on `ProductDetailView` for PATCH/DELETE so a producer can only edit their own products.

A view like `ProductDetailView` does:

```python
def get_permissions(self):
    if self.request.method in ['PUT', 'PATCH', 'DELETE']:
        return [permissions.IsAuthenticated(), IsProducer(), IsOwner()]
    return [permissions.AllowAny()]
```

So GETs are public; mutations require auth + producer role + ownership.

Inside view bodies you'll also see direct role checks (`if request.user.role != 'customer': return 403`). Those are equivalent to using a permission class but more readable when the same view handles multiple roles differently.

### Q. Why do some views return arrays and others return objects? (e.g. wholesale GET)

**A.** Because the response shape encodes what the role is allowed to see. `ProductWholesalePriceView.get` ([backend/products/views.py:219-241](backend/products/views.py#L219-L241)) is a good example:

- **Producer (owns product)** → returns an **array** of every wholesale tier set on this product (so they can edit all of them in the modal).
- **Restaurant** / **Community Group** → returns a single **object** matching their role's tier (so they only see their own price).
- **Anyone else** → 403.

This shape switching is unusual but it lets the same URL serve two genuinely different UX needs without forcing a query parameter or a separate endpoint. The frontend handles both shapes in `showWholesaleModal` by detecting `Array.isArray(data)`.

### Q. How do error responses get standardised? Where does `{"detail": "..."}` come from?

**A.** DRF auto-formats most errors:

- `permissions.IsAuthenticated` failing → `{"detail": "Authentication credentials were not provided."}` with HTTP 403.
- `permissions.IsProducer` failing on a logged-in non-producer → `{"detail": "You do not have permission to perform this action."}` with HTTP 403.
- `serializer.is_valid()` failing → `{"field_name": ["error message"], "non_field_errors": ["..."]}` with HTTP 400.
- `Http404` (e.g. `Product.DoesNotExist` raised by `get_object_or_404`) → `{"detail": "Not found."}` with HTTP 404.

Where this codebase deliberately wants a more domain-specific message, it returns its own dict — e.g. `{"error": "Only customers can place orders."}`. These don't follow the DRF convention but are clearer to the human reading the toast.

The **frontend** parses both shapes via [frontend/src/utils/errors.js:13](frontend/src/utils/errors.js#L13)'s `getErrorMessage(body, status)` — it tries `body.detail` first, then `body.non_field_errors`, then the first field error, then a status-code-based fallback ("Please log in" for 401, "You do not have permission" for 403, etc.). One toast, regardless of shape.

## Per-app deep-dive

### users app

**Models** ([backend/users/models.py](backend/users/models.py)):
- **`User`** — extends Django's `AbstractUser`, swaps `USERNAME_FIELD` to `email`, adds `role` with 5 choices (producer / customer / community_group / restaurant / admin). Has a custom `UserManager` whose `create_user` sets `username=email` so Django's auth still works.
- **`ProducerProfile`** — OneToOne to User. Fields: business_name, contact_name, phone_number, address, postcode, optional `crn` (UK Companies House Registration Number), optional `food_hygiene_rating` (UK FSA 0-5). `created_at` for audit. Cascades on User delete.
- **`CustomerProfile`** — OneToOne to User. Fields: full_name, phone_number, delivery_address, postcode, **terms_accepted: BooleanField**, **terms_accepted_at: DateTimeField (nullable)**. The latter is the GDPR Article 7 consent record — proof of *when* consent was given.
- **`RestaurantProfile`** — OneToOne to User. Fields: business_name, contact_name, phone_number, delivery_address, postcode, optional `cuisine_type`. (Sprint 3.)
- **`CommunityGroupProfile`** — OneToOne to User. Fields: organisation_name, contact_name, phone_number, delivery_address, postcode, optional `group_type` (e.g. "Food Bank", "School"). (Sprint 3.)

**Serializers** ([backend/users/serializers.py](backend/users/serializers.py)):
- `UserSerializer` (read only) — exposes id/email/role.
- `ProducerRegistrationSerializer` — registers a producer (creates User + ProducerProfile atomically).
- `CustomerRegistrationSerializer` — registers a customer; refuses if `terms_accepted=False`; stamps `terms_accepted_at` with `timezone.now()`.
- `RestaurantRegistrationSerializer`, `CommunityGroupRegistrationSerializer` — Sprint 3 equivalents.
- `LoginSerializer` — calls `authenticate(username=email, password=password)`, refuses if `user is None or not user.is_active`.
- `ProducerProfileSerializer`, `CustomerProfileSerializer`, `RestaurantProfileSerializer`, `CommunityGroupProfileSerializer` — read-only profile shapes.
- `UserProfileSerializer` — composite that nests **all four** profiles (3 of them are null for any given user). Used by `GET /api/auth/profile/`.
- `CustomerProfileUpdateSerializer` — patch handler for `PATCH /api/auth/profile/` (customer-only currently).

**Views** ([backend/users/views.py](backend/users/views.py)):
- `ProducerRegistrationView` — `POST /api/auth/register/producer/`, `permission_classes = [AllowAny]`.
- `CustomerRegistrationView` — `POST /api/auth/register/customer/`.
- `RestaurantRegistrationView`, `CommunityGroupRegistrationView` — Sprint 3.
- `LoginView` — `POST /api/auth/login/`. Decorated with `@ensure_csrf_cookie` so the response sets a `csrftoken` cookie if there isn't one yet. Calls `django.contrib.auth.login(request, user)` to set `sessionid`.
- `LogoutView` — `POST /api/auth/logout/`. Calls `django.contrib.auth.logout(request)`.
- `ProfileView` — `GET/PATCH /api/auth/profile/`. GET returns `UserProfileSerializer`; PATCH only supports the customer profile shape today.
- `CSRFView` — `GET /api/auth/csrf/`. Tiny endpoint whose only job is to set the CSRF cookie via `@ensure_csrf_cookie`. Frontend hits this on app start.
- `CustomerNotificationsView` — `GET /api/auth/notifications/`. Returns the customer's `Notification` rows (TC-016).

**URLs** ([backend/users/urls.py](backend/users/urls.py)) — eight routes mounted under `/api/auth/`.

**Permissions** ([backend/users/permissions.py](backend/users/permissions.py)) — `IsProducer`, `IsCustomer`, `IsOwner`.

**Authentication** ([backend/users/authentication.py](backend/users/authentication.py)) — the `CsrfExemptSessionAuthentication` class.

**Admin** ([backend/users/admin.py](backend/users/admin.py)) — registers `User` (extending `BaseUserAdmin` with `add_fieldsets` / `fieldsets` so you can create or edit users with the role field visible), `ProducerProfile`, `CustomerProfile`. Lists the most useful columns; filters by `terms_accepted` for the customer panel. (RestaurantProfile / CommunityGroupProfile are not registered today — minor gap.)

### products app

**Models** ([backend/products/models.py](backend/products/models.py)):
- **`Category`** — name (unique), description, created_at. Five rows seeded by data migration.
- **`Product`** — name, FK producer (User), FK category, description, price (Decimal, min £0.01), unit (each / dozen / kg / g / lb / bunch / bag / box / litre), availability (in_season / out_of_season / pre_order, default in_season), stock_quantity (PositiveInteger, default 1), optional `image`, three optional date fields (harvest_date, production_date, best_before — at least one required by the serializer's `validate`), M2M `allergens`, **origin_location** (required, traceability), **is_organic** (BooleanField, null=True so the form forces an explicit Yes/No), **storage_instructions** (required, UK Food Information Regulations 2014).
- **`Allergen`** — name (unique), description, created_at. 14 rows seeded by data migration.
- **`Review`** — FK product, FK customer (User), FK order (orders.Order), rating (1-5 PositiveInteger with choices), comment (optional), `producer_response` (optional, set via the PATCH endpoint), `producer_response_at` (timestamp), created_at. `unique_together = (product, customer, order)` — one review per (customer, product, order) tuple.
- **`Notification`** — FK product, FK customer, `notified` (Boolean, default False), `notified_at` (set when the producer flips availability back to in_season), created_at. `unique_together = (product, customer)` — one subscription per (customer, product).
- **`WholesalePrice`** — FK product, buyer_type (restaurant / community_group), price (Decimal, must be < product.price — validated in serializer), minimum_quantity (default 1), is_active (default True), created_at. `unique_together = (product, buyer_type)`.

**Serializers** ([backend/products/serializers.py](backend/products/serializers.py)):
- `CategorySerializer` — full read.
- `AllergenSerializer` — full read.
- `ProductSerializer` — read + write. `validate` requires at least one date field. `to_representation` nests category, allergens, and producer_business_name.
- `ProductInventoryUpdateSerializer` — PATCH-only fields (`stock_quantity`, `availability`); validates `stock_quantity >= 0`.
- `ReviewSerializer` (read) — anonymises `customer_name`, exposes producer_response.
- `ReviewCreateSerializer` (write) — validates: customer owns the order, order is delivered, product is in the order, no duplicate review.
- `ProducerResponseSerializer` — single-field PATCH for producer responses.
- `NotificationSerializer` — nests `product_id` and `product_name`.
- `WholesalePriceSerializer` — validates `price < product.price`.

**Views** ([backend/products/views.py](backend/products/views.py)):
- `ProductListCreateView` (`GET/POST /api/products/`) — DjangoFilterBackend filters on category/availability/is_organic; SearchFilter on name+description; mine flag for "my products" view.
- `ProductDetailView` (`GET/PUT/PATCH/DELETE /api/products/<id>/`) — uses `ProductInventoryUpdateSerializer` for PATCH; flips notification rows from `notified=False` to `True` when availability changes back to `in_season` (TC-016).
- `CategoryList` (`GET /api/categories/`) — public list.
- `AllergenList` (`GET /api/allergens/`) — public list.
- `ProductReviewListCreateView` (`GET/POST /api/products/<id>/reviews/`) — public list, customer-only POST with eligibility checks.
- `ProducerReviewResponseView` (`PATCH /api/products/<id>/reviews/<rid>/respond/`) — producer-only, ownership-checked.
- `ProductNotificationView` (`POST/DELETE /api/products/<id>/notify/`) — subscribe / unsubscribe.
- `ProductWholesalePriceView` (`GET/POST /api/products/<id>/wholesale/`) — role-branched GET (producer→array, buyer→object); producer-owner-only POST.
- `ProducerAnalyticsView` (`GET /api/producer/analytics/`) — KPIs + top-5 + 8-week revenue chart.
- `PlatformRevenueView` (`GET /api/admin/revenue/`) — admin-only, optional `?from=&to=` filter, returns `total_revenue / total_commission / total_producer_payouts / revenue_by_producer`.

**URLs** ([backend/products/urls.py](backend/products/urls.py)) — eleven routes.

**Admin** ([backend/products/admin.py](backend/products/admin.py)) — Six models registered. `Product` admin uses `filter_horizontal` for allergens (better M2M widget than the default), filters by category/availability/is_organic. `Review` admin shows a boolean badge for "has producer response". `WholesalePrice` admin filters by buyer_type/is_active.

### orders app

**Models** ([backend/orders/models.py](backend/orders/models.py)):
- **`Order`** — FK customer, status (7 choices), delivery_date, delivery_address (snapshot, not FK — UK GDPR Art 5(1)(e)), delivery_postcode (snapshot), `special_instructions` (TextField), total_amount, total_delivery_fee, stripe_payment_intent_id, **invoice_number** (auto-generated `BRFN-YYYY-NNNNNN` on first save — HMRC-compliant audit trail), cancellation_deadline (auto-set to `created_at + 1h`), created_at, updated_at. Helper methods: `can_be_cancelled()` (only true while `status='pending'` and within deadline), `calculate_totals()` (sums producer-group subtotals + delivery fees).
- **`OrderProducerGroup`** — the magic for **multi-vendor orders** (TC-008). One row per producer per order. FK order, FK producer, status (independent per-producer lifecycle), fulfilment_type (standard / express / pickup with fixed fees in `DELIVERY_FEES`), delivery_fee, pickup_location (snapshot from producer's profile if pickup), delivery_date (per-producer, allows different dates), subtotal, commission (5%), producer_payout (95%). `unique_together = (order, producer)`. `calculate_financials()` does the 5/95 split using `Decimal('0.05').quantize(Decimal('0.01'))` for accurate rounding.
- **`OrderItem`** — line item. FK order, FK producer_group, FK product, FK producer (denormalised for fast producer-dashboard queries), quantity, **price_at_time_of_order** (snapshot), unit_at_time_of_order (snapshot), product_name_at_time_of_order (snapshot), added_at. Helper `get_item_total()` returns price × quantity from snapshot.
- **`OrderStatusHistory`** — audit log. FK order, status, FK changed_by (User, SET_NULL — survives user deletion), note, changed_at. Required by TC-010 ("status changes are logged with timestamp and producer information") and TC-022 (security event logging).
- **`Payment`** — OneToOne to Order. transaction_id (Stripe charge ID), amount, commission, producer_payout, status (4 choices), `paid_at` (when customer paid Stripe at checkout), `processed_at` (set only when order status hits `delivered` — this is what triggers the weekly settlement). Critical separation: paid_at = customer paid; processed_at = producer payout released. Money is held between the two.
- **`Dispute`** — FK order, FK raised_by (customer), reason (5 choices: damaged / missing / wrong_item / quality / other), description, status (open / under_review / resolved / closed), resolution_note, FK resolved_by (admin, SET_NULL), created_at, resolved_at. UK Consumer Rights Act 2015 + Alternative Dispute Resolution Regulations 2015.

**Serializers** ([backend/orders/serializers.py](backend/orders/serializers.py)) — many. Highlights:
- `OrderSerializer` (read) — includes nested producer_groups, status_history, computed `can_cancel`.
- `OrderItemInputSerializer`, `OrderProducerGroupInputSerializer`, `OrderCreateSerializer` (write) — the multi-vendor checkout pipeline. The 48-hour delivery validator lives on `OrderProducerGroupInputSerializer.validate_delivery_date`.
- `OrderStatusUpdateSerializer` — guards the `pending → confirmed → processing → ready → delivered` transition table via the `GROUP_VALID_TRANSITIONS` dict; auto-derives the parent Order status from per-group statuses via `derive_order_status()`; flips Payment to `processed` when all groups are delivered.
- `SettlementOrderSerializer`, `SettlementSerializer` — the producer weekly report shape.
- `DisputeCreateSerializer` (POST), `DisputeSerializer` (GET), `DisputeResolveSerializer` (admin PATCH).
- `ProducerAnalyticsSerializer`, `PlatformRevenueSerializer` — read-only shapes for the analytics endpoints (the actual aggregation lives in the view, not the serializer).

**Views** ([backend/orders/views.py](backend/orders/views.py)):
- `OrderListCreateView` — customer-only GET and POST.
- `OrderDetailView` — customer-only retrieve and cancel (PATCH → status='cancelled' if `can_be_cancelled()`).
- `ProducerOrderListView` — producer-only, filters to **their own producer groups** (TC-009 isolation).
- `ProducerOrderStatusView` — producer-only PATCH with transition validation.
- `ProducerSettlementView` — producer-only weekly report.
- `AdminCommissionReportView` — admin-only aggregated commission across all producers.
- `CreatePaymentIntentView`, `ConfirmPaymentView` — Stripe payment flow (TC-007/008). `CreatePaymentIntentView` uses `stripe.PaymentIntent.create(amount=int(order.total_amount * 100), currency='gbp', payment_method_types=['card'])`.
- `OrderDisputeView` — customer-only POST/GET.
- `AdminDisputeListView`, `AdminDisputeResolveView` — admin-only.

**URLs** ([backend/orders/urls.py](backend/orders/urls.py)) — twelve routes mounted under `/api/orders/`.

**Admin** ([backend/orders/admin.py](backend/orders/admin.py)) — Six models registered with **colour-coded status badges** rendered via `format_html`. Order status: amber (pending) → blue (confirmed) → purple (processing) → cyan (ready) → green (delivered). Payment status: amber/green/red/grey. Dispute reason: red (damaged) / amber (missing) / purple (wrong_item) / blue (quality) / grey (other). Inline editing via `OrderProducerGroupInline`, `OrderItemInline`, `OrderStatusHistoryInline` so admins see the full order tree on one page.

### cart app

**Models** ([backend/cart/models.py](backend/cart/models.py)):
- **`Cart`** — OneToOne customer (User), created_at, updated_at. Helper `get_cart_total()` sums item totals.
- **`CartItem`** — FK cart, FK product, quantity, added_at. Helper `get_item_total()` returns `product.price * quantity`. `unique_together = (cart, product)` — adding the same product twice updates quantity.

**Serializers** ([backend/cart/serializers.py](backend/cart/serializers.py)):
- `CartItemSerializer` — nests `ProductSerializer` for read; takes `product_id` for write; computed `item_total` from the model helper.
- `CartSerializer` — nests items + computed `cart_total`.

**Views** ([backend/cart/views.py](backend/cart/views.py)):
- `CartView` — `GET/POST/DELETE /api/cart/`. POST adds or updates an item; DELETE clears the cart. Stock-validated: rejects with HTTP 400 if `quantity > product.stock_quantity`.
- `CartItemView` — `PUT/DELETE /api/cart/items/<id>/`. PUT updates quantity (or deletes if quantity ≤ 0); DELETE removes the item.

Both views are gated by `IsAuthenticated + IsCustomer`. **This is the documented gap** for TC-019 / TC-020 — restaurant + community group can see wholesale prices but cannot add to cart, because `IsCustomer` rejects them. See Part 8 / FAQ.

**URLs** ([backend/cart/urls.py](backend/cart/urls.py)) — two routes mounted under `/api/`.

**Admin** ([backend/cart/admin.py](backend/cart/admin.py)) — Cart with `CartItemInline` so the admin sees the cart and its items together.

---

# Part 4 — Frontend deep-dive

## Q. What is `frontend/index.html`? Why is it a single file with multiple `<div class="page">` sections?

**A.** `index.html` is a **single-page application** (SPA) written without any framework — no React, no Vue, no build tool. It's one HTML file containing every "page" of the app as a sibling `<div class="page" id="page-XYZ">` block, with all but one of them hidden by CSS. Navigation is just JavaScript flipping which one has the `.active` class.

The page divs:

| ID | What it is | Roles that see it |
|---|---|---|
| `page-home` | Marketing landing page | All |
| `page-browse` | Marketplace product grid | All |
| `page-product` | Individual product detail | All |
| `page-cart` | Shopping cart | Customer |
| `page-login` | Login form | Anonymous |
| `page-register` | Multi-role registration form | Anonymous |
| `page-producer-dash` | Producer dashboard (overview / products / orders / settlements / analytics / reviews) | Producer |
| `page-customer-dash` | Customer dashboard (orders / notifications / profile) | Customer |
| `page-admin-dash` | Admin dashboard (commission / revenue / disputes) | Admin |
| `page-restaurant-dash` | Restaurant dashboard (wholesale marketplace) | Restaurant |
| `page-community-dash` | Community group dashboard | Community group |
| `page-order-confirm` | Post-checkout receipt | Customer |

Plus **three modals** that are children of `<body>` (not inside any page) so they overlay everything:

- `#checkout-overlay` — Stripe checkout (per-producer fulfilment + special instructions textarea)
- `#wholesale-overlay` — producer's "Set Wholesale Pricing" modal (two parallel rows for restaurant + community group)
- `#dispute-overlay` — customer's "Raise a Dispute" modal

Why a single file? Because there's no build step. The whole front-end is `index.html` + `app.js` + `style.css` + 12 service modules — copy them into nginx's `/usr/share/nginx/html/` and serve them. No webpack, no esbuild, no transpiler. Old-school for a reason: the team learning curve is shallow (anyone who knows DOM can contribute) and the deployment is `COPY index.html /usr/share/nginx/html/`.

## Q. How does navigation work without React Router?

**A.** A single `navigate(pageId)` function in `app.js`. It does:

1. Hide every `.page` (`document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))`).
2. Show the target one (`document.getElementById('page-' + pageId).classList.add('active')`).
3. Update `state.currentPage = pageId`.
4. Run a per-page render hook (e.g. if `pageId === 'browse'` call `renderBrowse()`; if `'producer-dash'` call `renderProducerDash()`).
5. Apply role guards — `if (pageId === 'producer-dash' && state.currentUser.role !== 'producer') navigate('login')`.

Links use `onclick="navigate('browse')"` instead of `<a href>` — that's why deep-linking doesn't naturally work, and why `nginx.conf` has `try_files $uri $uri/ /index.html;` (so refreshing `localhost:3025/anything` always serves `index.html` and lets the SPA decide what to render).

## Q. What is the global `state` object in `app.js`?

**A.** The whole SPA's runtime state lives in one `state` global at the top of [frontend/app.js](frontend/app.js) (~line 95):

```js
const state = {
  currentPage: 'home',
  cart: [],
  currentUser: null,
  currentProduct: null,
  producerDashTab: 'overview',
  producerOrderFilter: 'all',
  customerDashTab: 'orders',
  customerOrderFilter: 'all',
  categories: [],
  products: [],
  producerProducts: [],
  producerOrders: null,
  customerOrders: null,
  reviewsData: {},
  reviewDraft: {},
  revenueReportData: null,
  ...
};
```

Mutating `state` directly is the convention. Re-renders happen by calling render functions explicitly (`renderProducerDash()`) — there's no reactive system. If you change `state.cart` you call `updateCartUI()` yourself. Trade-off: simple, but you have to remember to re-render. With ~3000 lines of `app.js` it's still manageable.

`state.currentUser` is the rough equivalent of an AuthContext: set after login, cleared after logout, checked by route guards. Loaded from `GET /api/auth/profile/` on every app start so a refresh doesn't kick you out.

## Q. What does `frontend/src/services/api.js` do? Walk me through `request()` line-by-line.

**A.** Already covered in Part 2 (the cross-origin / CSRF section). The short version:

1. `getApiBase()` resolves the API base URL once at module load.
2. `getCookie(name)` reads a cookie value from `document.cookie`.
3. `request(method, path, body)` builds the URL, attaches `credentials: 'include'` (so cookies ride along), sets JSON Content-Type, adds `X-CSRFToken` for non-GET requests, awaits `fetch`, parses JSON if `Content-Type: application/json`, throws on non-2xx with `.status` and `.body` attached.
4. Five wrappers: `get`, `post`, `put`, `patch`, `del`.

Every other service module imports `request` (or one of its wrappers) and only worries about path + body. Single source of truth for the cross-cutting concerns.

## Q. How does the frontend get a CSRF token? Where does it come from, where is it stored, when is it sent?

**A.** Three steps:

1. **App start** — frontend hits `GET /api/auth/csrf/`. Django's `@ensure_csrf_cookie` decorator on `CSRFView` writes a `csrftoken` cookie. Browser stores it.
2. **Storage** — the cookie is HttpOnly=False and SameSite=Lax (default for Django dev). JavaScript can read it via `document.cookie`.
3. **Send on writes** — when `api.js` calls `request('POST', '/api/orders/', body)`, the helper reads the `csrftoken` cookie via `getCookie('csrftoken')` and adds `X-CSRFToken: <value>` to the request headers. Even though Django's `CsrfExemptSessionAuthentication` doesn't enforce it, sending the token keeps the door open to flipping enforcement back on later, and it satisfies any middleware sitting between nginx and Django.

You'll also see ad-hoc cases in `app.js` where some handlers read the cookie and attach the header manually (e.g. the dispute / wholesale modals). That's because a chunk of `app.js` predates the `api.js` service helper. Both work; the service-layer path is preferred.

## Q. What's the modal pattern?

**A.** Three modals (checkout, wholesale, dispute) all follow the same structure:

```html
<div id="X-overlay" class="hidden" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);
                                          z-index:9999;display:none;align-items:center;
                                          justify-content:center;padding:18px;overflow-y:auto">
  <div id="X-modal" style="width:min(NNN px, 100%);background:#fff;border-radius:14px;
                            box-shadow:...;padding:24px;max-height:90vh;overflow-y:auto">
    <!-- content -->
  </div>
</div>
```

Open: `overlay.classList.remove('hidden'); overlay.style.display = 'flex';`
Close: `overlay.classList.add('hidden'); overlay.style.display = 'none';`

Two `display` toggles (`hidden` class + inline style) because the inline `display:none` is the initial state and `.hidden` is the toggle target. Both are needed because the inline style would otherwise dominate over a class that just sets display.

A subtle gotcha lives here: if the markup for the overlay is missing from `index.html`, calling `showXModal()` does nothing visible — `getElementById` returns `null`, the function exits silently, and the user sees no error. We hit this twice on this codebase: the wholesale modal and the dispute modal both had handlers in `app.js` but no markup in `index.html`. Both fixed in this session — see Part 8 FAQ.

## Q. Why are there 12 service files in `src/services/`? What's the convention?

**A.** One file per backend domain. The convention is: every group of related endpoints gets its own service module that owns the URL strings, request bodies, and response normalisation for that domain.

| File | Wraps |
|---|---|
| `api.js` | Base fetch helper + CSRF token + error throwing |
| `auth.js` | `/api/auth/*` (register, login, logout, profile, notifications) |
| `products.js` | `/api/products/*` (CRUD, search, categories, allergens) |
| `cart.js` | `/api/cart/*` (read, add/update item, clear) |
| `orders.js` | `/api/orders/*` (create, list, producer view, status update, cancel) |
| `paymentService.js` | `/api/orders/payments/*` (Stripe intent + confirm) + settlements |
| `adminService.js` | `/api/orders/admin/commission/` |
| `reviewService.js` | `/api/products/<id>/reviews/*` |
| `disputeService.js` | `/api/orders/<id>/dispute/`, `/api/orders/admin/disputes/*` |
| `notificationService.js` | `/api/products/<id>/notify/`, `/api/auth/notifications/` |
| `analyticsService.js` | `/api/producer/analytics/`, `/api/admin/revenue/` (CSV export helper too) |
| `wholesaleService.js` | `/api/products/<id>/wholesale/` |

The benefit isn't dependency injection or testability per se (no test runner uses these modules in isolation). It's **discoverability**: when Joel wants to wire a new dashboard widget, he looks at the service file matching his domain and knows what's available. When the URL changes, you change it in one place.

## Q. How does `frontend/src/utils/errors.js` turn a DRF 400 body into a one-line toast?

**A.** [frontend/src/utils/errors.js](frontend/src/utils/errors.js) exports `getErrorMessage(body, status)`. It tries, in order:

1. Status-code fallback if `body` is null (network error) — "Please log in" / "You do not have permission" / "Not found" / "Server error".
2. `body.detail` — DRF's default error key. If it's an array, joins with spaces.
3. `body.non_field_errors` — DRF's cross-field validation key.
4. The first field-level error: `body[firstKey]` — if it's an array, takes the first element.
5. Final status-code fallback if none of the above worked.

The result is a single string suitable for a toast (`showToast(msg, 'error')`). There's also a `getFieldErrors(body)` helper that returns a `{field: msg}` map for inline form display, ignoring `detail` and `non_field_errors`.

## Q. Per-page summary

**`#page-home`** ([frontend/index.html:74](frontend/index.html#L74)) — Hero, category grid, "How it works", featured producers. Pure marketing. No API calls.

**`#page-browse`** — Marketplace. `renderBrowse()` calls `getProducts({category, search})` and renders product cards. Category pills + search bar update `state.searchQuery` / `state.currentCategory` and re-render.

**`#page-product`** — Single product. Reviews section (anonymised customer names, average rating, write-review form for eligible customers), notify-me button if availability is `out_of_season`. Calls `getProduct(id)`, `loadReviewsForProduct(id)`.

**`#page-cart`** — Customer cart. `renderCart()` groups items by producer (so the Sprint 2 multi-vendor checkout makes sense). "Proceed to Checkout" opens the Stripe modal. Calls `getCart()`, `addOrUpdateCartItem`, `removeCartItem`.

**`#page-login`** — Email + password + demo-account quick-fill buttons. `handleLogin()` calls `login()` then `getProfile()` to populate `state.currentUser`.

**`#page-register`** — Single form with a role dropdown. JS shows/hides field panels per role (producer-fields / customer-fields / restaurant-fields / community-group-fields). Customer flow has the GDPR terms checkbox.

**`#page-producer-dash`** — Sidebar with tabs (Overview / Products / Orders / Settlements / Analytics / Reviews). Each tab has its own render function. Wholesale Price button per product opens `#wholesale-overlay`.

**`#page-customer-dash`** — Sidebar tabs: Orders, Notifications, Profile. Order rows show a dispute badge (TC-014); delivered orders show a "Raise Dispute" button that opens `#dispute-overlay`.

**`#page-admin-dash`** — Three tabs: Commission Report, Revenue Report, Disputes. Each has its own date filter + CSV export.

**`#page-restaurant-dash`** / **`#page-community-dash`** — Marketplace-with-wholesale-prices. Cards show the standard price crossed out + the green wholesale price + minimum quantity.

**`#page-order-confirm`** — Receipt page after Stripe success. Per-producer fulfilment summary + invoice number + total.

---

# Part 5 — DevOps & infrastructure

## Q. Walk me through `backend/Dockerfile`.

**A.** [backend/Dockerfile](backend/Dockerfile):

```dockerfile
FROM python:3.13-slim                                        # Small base image
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1             # No .pyc, flush logs
WORKDIR /app                                                 # Container-side root
RUN apt-get update && apt-get install -y gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*                          # psycopg2 needs gcc + libpq
COPY requirements.txt .                                      # Dependency layer first (cache)
RUN pip install --no-cache-dir -r requirements.txt           # Install deps
COPY entrypoint.sh /docker-entrypoint.sh                     # OUTSIDE /app — bind mount won't shadow
RUN sed -i 's/\r$//' /docker-entrypoint.sh \
    && chmod +x /docker-entrypoint.sh                        # CRLF fix + executable bit
COPY . .                                                     # Source code
EXPOSE 8000                                                  # Document: container listens on 8000
ENTRYPOINT ["/docker-entrypoint.sh"]                         # Run on every start
```

Two non-obvious decisions:

1. **`requirements.txt` copied + installed before the rest of the source.** Docker layers cache by content. If you change `views.py` but not `requirements.txt`, the `pip install` layer is cached and you skip ~30s of dependency resolution.

2. **`entrypoint.sh` copied to `/docker-entrypoint.sh` (outside `/app`).** Why? Because `docker-compose.yml` bind-mounts the host's `./backend` to `/app` for hot reload. That bind mount **replaces** anything Docker baked into `/app` at build time — including `entrypoint.sh`. So we copy it to a location the bind mount doesn't cover, and reference it explicitly in `ENTRYPOINT`. Without this trick, the script would silently disappear when the container starts.

## Q. Walk me through `backend/entrypoint.sh`.

**A.** [backend/entrypoint.sh](backend/entrypoint.sh) runs on every container start in this order:

1. **Wait for Postgres** — busy-loop a TCP connect to `db:5432` until it succeeds. Postgres takes a couple of seconds to come up; this avoids the backend crashing first time.
2. **Run migrations** — `python manage.py migrate --noinput`. Idempotent: if everything is already applied, it's a no-op.
3. **Create the admin superuser** — `admin@brfn.com / Admin123!`, only if it doesn't already exist.
4. **Upsert four demo accounts** — `customer@example.com`, `producer@example.com`, `restaurant@example.com`, `community@example.com`. Each `upsert_*` function:
   - Creates the User if missing, otherwise resets the password (so demo creds stay valid even if someone changed them in the DB).
   - Creates the matching profile row if missing, otherwise refreshes the standard fields.
5. **Start the dev server** — `exec python manage.py runserver 0.0.0.0:8000`. `exec` replaces the shell process so the Python signal-handling works correctly under Docker.

The whole thing takes ~3 seconds on a warm DB. Logs are visible in `docker compose logs backend`.

## Q. Walk me through `frontend/Dockerfile`.

**A.** [frontend/Dockerfile](frontend/Dockerfile):

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY style.css  /usr/share/nginx/html/style.css
COPY app.js     /usr/share/nginx/html/app.js
COPY src/       /usr/share/nginx/html/src/
COPY images/    /usr/share/nginx/html/images/
EXPOSE 80
```

Tiny image. nginx alpine is ~25 MB. The SPA files are baked in at build time — there's no bind mount for the frontend (unlike the backend). **This means changes to `index.html`, `app.js`, etc. require a rebuild for the running container to pick them up.**

```bash
docker compose up -d --build frontend
```

If a teammate pulls and only restarts (not rebuilds), they'll see the old SPA. Easiest way to remember: any time `git pull` brings frontend changes, run `--build`. There's a "why doesn't my code change show up?" entry in Part 8 FAQ for exactly this gotcha.

## Q. Walk me through `frontend/nginx.conf`.

**A.** [frontend/nginx.conf](frontend/nginx.conf):

```nginx
server {
    listen 80;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /admin/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
    }
}
```

- `listen 80` — internal port, mapped to host 3025 by Docker Compose.
- `location /` — serve static files; if the requested path isn't a real file (`$uri`) or directory (`$uri/`), fall back to `index.html` (SPA routing).
- `Cache-Control: no-cache, must-revalidate` — tells the browser to revalidate every static fetch. Useful in dev so you don't get stuck on a stale `app.js`.
- `location /api/` — reverse-proxy to `http://backend:8000`. Trailing-slash matters: `/api/foo` becomes `http://backend:8000/api/foo`. The headers `Host`, `X-Real-IP`, `X-Forwarded-For` let Django see the original request metadata if it ever cares.
- `location /admin/` — same thing for the Django admin UI.

If you wanted to add a new backend endpoint that doesn't live under `/api/` (say `/healthz`), you'd add another `location` block.

## Q. Walk me through `docker-compose.yml`.

**A.** [docker-compose.yml](docker-compose.yml) defines three services + one volume.

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: brfn_db
      POSTGRES_USER: brfn_user
      POSTGRES_PASSWORD: brfn_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5455:5432"

  backend:
    build: ./backend
    depends_on: [db]
    environment:
      DB_NAME: brfn_db
      DB_USER: brfn_user
      DB_PASSWORD: brfn_password
      DB_HOST: db
      DB_PORT: 5432
      SECRET_KEY: django-insecure-dev-key-change-in-production
      DEBUG: "True"
      ALLOWED_HOSTS: localhost,127.0.0.1
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      STRIPE_PUBLISHABLE_KEY: ${STRIPE_PUBLISHABLE_KEY}
    volumes:
      - ./backend:/app
    ports:
      - "8025:8000"

  frontend:
    build: ./frontend
    depends_on: [backend]
    ports:
      - "3025:80"

volumes:
  postgres_data:
```

Things worth pointing out:
- `depends_on` enforces start order but **not readiness** — Postgres might still be initialising when the backend starts. That's why entrypoint.sh has the wait-for-db loop.
- `volumes: - ./backend:/app` is the bind mount that lets you edit Python on the host and have it hot-reload inside the container.
- `volumes: - postgres_data:/var/lib/postgresql/data` is a **named volume**. It survives `docker compose down`. Only `docker compose down -v` removes it.
- The `.env` file at repo root is auto-loaded; that's where `${STRIPE_SECRET_KEY}` and `${STRIPE_PUBLISHABLE_KEY}` come from.

## Q. How do I add a new migration without breaking my teammates?

**A.**

1. Edit a model — add a field, change a choice, etc.
2. Run `docker compose exec backend python manage.py makemigrations`.
3. Inspect the generated file in `backend/<app>/migrations/`. **Read it.** If it touches a foreign key or a unique constraint, double-check the dependency declaration and that it makes sense in isolation.
4. Run `docker compose exec backend python manage.py migrate` to apply locally.
5. Test the app.
6. Commit both the model change AND the migration file. Never commit one without the other — your teammates' DBs will go out of sync.

If two people made conflicting migrations on the same app at once (`0007_a` and `0007_b`), Django will refuse to apply them. Solution: `python manage.py makemigrations --merge` to generate a merge migration that depends on both.

## Q. How do I add a new dependency?

**A.**

1. Add the line to [backend/requirements.txt](backend/requirements.txt) (e.g. `redis>=5.0,<6.0`).
2. `docker compose build backend` — re-runs `pip install` inside the image.
3. `docker compose up -d backend` — recreates the container with the new image.
4. Use the dependency in your code.

## Q. How do I reset everything?

**A.**

```bash
docker compose down -v               # stop containers + REMOVE the postgres volume
docker compose up -d --build         # rebuild images + start fresh
```

Everything in the database is gone. Migrations re-apply. Categories + allergens get re-seeded. Demo accounts get re-created. You're back to the state a fresh teammate gets after `git clone`.

If you only want to reset the frontend cache (no data loss):

```bash
docker compose up -d --build frontend
```

---

# Part 6 — Test cases (brief)

Twenty-five test cases, all PASS as of last verification. One paragraph each. Full per-TC code maps + curl commands + team contributions are in [TEST_CASES.md](TEST_CASES.md) — link out from here, don't duplicate.

### Sprint 1

- **TC-001 — Producer Registration.** A producer can register with business name, contact, phone, address, postcode. `User.role='producer'` and `ProducerProfile` row created atomically.
- **TC-002 — Customer Registration.** A customer must accept the GDPR terms checkbox; `terms_accepted_at` records the timestamp.
- **TC-003 — Product Listing (as Producer).** Authenticated producers can list products with allergens, harvest date, organic flag, traceability fields. Customers / restaurants / community groups get HTTP 403.
- **TC-004 — Browse Products by Category.** Public category list (5 entries) and `?category=N` filter on the products list.
- **TC-005 — Product Search.** Full-text search via DRF SearchFilter on `name` + `description`.
- **TC-006 — Shopping Cart.** Customers add / update / remove items; cart total recalculates server-side; out-of-stock requests return HTTP 400.
- **TC-015 — Allergen Display.** All 14 UK allergens (Food Information Regulations 2014 / Natasha's Law) are pre-seeded and nested into product responses.
- **TC-022 — Authentication & Security.** Wrong password → 400; unauthed profile → 403; passwords stored as `pbkdf2_sha256$100000$…` in the DB.

### Sprint 2

- **TC-007 — Single Producer Checkout.** Customer places order; system snapshots prices, calculates 5% commission + 95% payout, generates `BRFN-2026-NNNNNN` invoice number, creates Stripe PaymentIntent. 48-hour delivery validation.
- **TC-008 — Multi-Vendor Checkout.** One order with items from two producers creates two `OrderProducerGroup` rows with independent fulfilment, delivery fees, commissions, and payouts.
- **TC-009 — Producer Order Dashboard.** A producer hitting `/api/orders/producer/` sees only their own groups — never another producer's items, even on shared multi-vendor orders.
- **TC-010 — Order Status Update.** Producer advances `pending → confirmed → processing → ready → delivered`; each transition logged in `OrderStatusHistory`. Invalid transitions rejected with HTTP 400.
- **TC-011 — Producer Inventory Update.** PATCH `stock_quantity` and `availability` on own products; negative stock rejected; cross-producer attempts rejected via `IsOwner`.
- **TC-012 — Weekly Payment Settlements.** Producer GET `/api/orders/settlements/` returns `gross_sales`, `commission`, `net_payout` for the current ISO week, counting only `delivered` groups.
- **TC-021 — Customer Order History.** Customers see their own orders with status_history, can_cancel flag, and producer_groups. Other roles get HTTP 403.
- **TC-025 — Admin Commission Report.** Admin GET aggregates commission across all producers, optional `?from=&to=` filter, CSV export.

### Sprint 3

- **TC-013 — Special Delivery Instructions.** Order has a `special_instructions` text field, surfaced on the producer dashboard order row.
- **TC-014 — Dispute Resolution.** Customer raises dispute on a delivered order; admin resolves with note; customer sees the resolved status. Pending or cancelled orders cannot be disputed.
- **TC-016 — Seasonal Availability Notifications.** Customer subscribes to an out-of-season product; producer flips back to `in_season`; notification fires automatically (signal-style trigger inside `ProductDetailView.perform_update`).
- **TC-017 — Producer Analytics Dashboard.** Total revenue (lifetime delivered orders), total orders, average order value, top-5 products, 8-week revenue chart.
- **TC-018 — Platform Revenue Reporting.** Admin platform-wide revenue: `total_revenue`, `total_commission`, `total_producer_payouts`, per-producer breakdown, optional date filter, CSV export.
- **TC-019 — Community Group Bulk Ordering.** Producers set a discounted wholesale tier for `buyer_type=community_group` with a minimum quantity; community group accounts see it in green; standard customers get HTTP 403 on the wholesale endpoint.
- **TC-020 — Restaurant Wholesale Pricing.** Identical mechanics to TC-019 but for `buyer_type=restaurant`.
- **TC-023 — Product Reviews and Ratings.** Customers with a delivered order can review the product (1-5 stars + optional comment); names anonymised to "First L." for GDPR; one review per (product, customer, order) tuple.
- **TC-024 — Producer Response to Reviews.** Producers can publicly respond to reviews on their own products; cross-producer responses rejected with HTTP 403.

For the full code map (every model / serializer / view / URL / frontend page / service file), curl commands, and team contributions per TC, see [TEST_CASES.md](TEST_CASES.md).

---

# Part 7 — Per-file index

Every file in the repo. Skim this top-to-bottom to grasp the layout in 2 minutes.

| Path | Purpose |
|---|---|
| `README.md` | Setup + tech stack + sprint overview |
| `TEST_CASES.md` | Per-test-case code map, curl commands, team contributions |
| `CODEBASE_GUIDE.md` | This file — Q&A walkthrough of the whole system |
| `docker-compose.yml` | Three services (db, backend, frontend) + named volume |
| `.env` | Dev defaults: DB creds, SECRET_KEY, DEBUG, Stripe test keys |
| `.gitignore` | Ignores `__pycache__`, `db.sqlite3`, `node_modules`, `venv`, etc. (does NOT ignore `.env`) |
| **backend/** | |
| `backend/manage.py` | Django CLI shim — boilerplate |
| `backend/requirements.txt` | 7 deps: Django 5, DRF 3.14, psycopg2, corsheaders, Pillow, django-filter, stripe |
| `backend/Dockerfile` | python:3.13-slim, copies code, sets entrypoint at `/docker-entrypoint.sh` |
| `backend/entrypoint.sh` | Wait-for-DB → migrate → create admin → upsert 4 demo accounts → runserver |
| `backend/API_DOCS.md` | Sprint 1 endpoint cheat-sheet (partial; superseded by this guide + TEST_CASES) |
| `backend/API_DOCS.html` | Generated HTML of the same |
| `backend/config/__init__.py` | Empty package marker |
| `backend/config/settings.py` | INSTALLED_APPS, MIDDLEWARE, DATABASES, AUTH_USER_MODEL, REST_FRAMEWORK config |
| `backend/config/urls.py` | Top-level URL include — admin + 4 app URLConfs |
| `backend/config/asgi.py` | Standard Django ASGI boilerplate |
| `backend/config/wsgi.py` | Standard Django WSGI boilerplate |
| `backend/config/auth.py` | Dead stub — was a draft of CsrfExemptSessionAuthentication; not used |
| **users app** | |
| `backend/users/__init__.py` | Empty |
| `backend/users/apps.py` | Django AppConfig boilerplate |
| `backend/users/models.py` | `User`, `ProducerProfile`, `CustomerProfile`, `RestaurantProfile`, `CommunityGroupProfile` |
| `backend/users/serializers.py` | Registration, login, profile, profile-update serializers |
| `backend/users/views.py` | Register / login / logout / profile / CSRF / customer-notifications views |
| `backend/users/urls.py` | 8 routes mounted under `/api/auth/` |
| `backend/users/permissions.py` | `IsProducer`, `IsCustomer`, `IsOwner` |
| `backend/users/authentication.py` | `CsrfExemptSessionAuthentication` |
| `backend/users/admin.py` | User + Producer + Customer profiles registered |
| `backend/users/tests.py` | `Sprint1IntegrationTests.test_full_flow` — real test, 100+ lines |
| `backend/users/migrations/0001_initial.py` | User + Producer + Customer profile schemas |
| `backend/users/migrations/0002_communitygroupprofile_restaurantprofile.py` | Sprint 3 role profiles |
| **products app** | |
| `backend/products/models.py` | `Category`, `Product`, `Allergen`, `Review`, `Notification`, `WholesalePrice` |
| `backend/products/serializers.py` | All 6 model serializers + create/update variants + producer response |
| `backend/products/views.py` | List/detail + reviews + notifications + wholesale + analytics + admin revenue |
| `backend/products/urls.py` | 11 routes |
| `backend/products/admin.py` | All 6 models with rich admin (filters, badges) |
| `backend/products/apps.py` | AppConfig boilerplate |
| `backend/products/tests.py` | Stub (3 lines) |
| `backend/products/migrations/0001_initial.py` | Initial schema (Category, Product, Allergen) |
| `backend/products/migrations/0005_seed_categories_allergens.py` | **Data migration** — pre-loads 5 categories + 14 UK allergens |
| `backend/products/migrations/0006_notification_review_wholesaleprice.py` | Sprint 3 schema additions |
| **orders app** | |
| `backend/orders/models.py` | `Order`, `OrderProducerGroup`, `OrderItem`, `OrderStatusHistory`, `Payment`, `Dispute` |
| `backend/orders/serializers.py` | OrderCreate, OrderStatusUpdate (with transition table), Settlement, Dispute, Analytics |
| `backend/orders/views.py` | OrderListCreate, OrderDetail, ProducerOrderList, ProducerOrderStatus, Settlement, AdminCommission, Stripe payment, Dispute |
| `backend/orders/urls.py` | 12 routes |
| `backend/orders/admin.py` | All 6 models with colour-coded status badges + inline editing |
| `backend/orders/apps.py` | AppConfig boilerplate |
| `backend/orders/tests.py` | Stub (3 lines) |
| `backend/orders/migrations/0001_initial.py` | Order + OrderProducerGroup + OrderItem + OrderStatusHistory + Payment |
| `backend/orders/migrations/0002_add_status_to_producergroup.py` | Per-group status field added |
| `backend/orders/migrations/0003_dispute.py` | Sprint 3 dispute table |
| **cart app** | |
| `backend/cart/models.py` | `Cart` (OneToOne customer), `CartItem` |
| `backend/cart/serializers.py` | CartItem (with nested ProductSerializer), Cart (with computed cart_total) |
| `backend/cart/views.py` | CartView (GET/POST/DELETE) + CartItemView (PUT/DELETE) — both `IsCustomer` |
| `backend/cart/urls.py` | 2 routes |
| `backend/cart/admin.py` | Cart with CartItem inline |
| `backend/cart/apps.py` | AppConfig boilerplate |
| `backend/cart/tests.py` | Stub (3 lines) |
| `backend/cart/migrations/0001_initial.py` | Cart + CartItem schema |
| **frontend/** | |
| `frontend/index.html` | Single-page SPA shell — every `<div class="page">`, all 3 modals, the navbar |
| `frontend/app.js` | ~2900 lines — global `state`, navigation, all render functions, all handlers |
| `frontend/style.css` | 824 lines — design system (forest/sage/cream/gold palette, Cormorant Garamond + Outfit fonts), no preprocessor |
| `frontend/nginx.conf` | Static serve + `/api/` and `/admin/` reverse-proxy + SPA fallback |
| `frontend/Dockerfile` | nginx:alpine, copies index/app.js/css/src/images |
| **frontend/src/services/** | |
| `frontend/src/services/api.js` | Base fetch helper, CSRF token injection, throws on non-2xx |
| `frontend/src/services/auth.js` | `/api/auth/*` — register/login/logout/profile/notifications |
| `frontend/src/services/products.js` | `/api/products/*` — list/detail/create/update/categories/allergens/search |
| `frontend/src/services/cart.js` | `/api/cart/*` — read/add/update/remove/clear |
| `frontend/src/services/orders.js` | `/api/orders/*` — create/list/detail/producer/cancel |
| `frontend/src/services/paymentService.js` | Stripe `payments/*` + settlement report + CSV export |
| `frontend/src/services/adminService.js` | `/api/orders/admin/commission/` + CSV export |
| `frontend/src/services/reviewService.js` | `/api/products/<id>/reviews/*` |
| `frontend/src/services/disputeService.js` | `/api/orders/<id>/dispute/*` + admin disputes (URL fixed in this session) |
| `frontend/src/services/notificationService.js` | `/api/products/<id>/notify/*` + customer inbox |
| `frontend/src/services/analyticsService.js` | `/api/producer/analytics/` + `/api/admin/revenue/` + CSV export |
| `frontend/src/services/wholesaleService.js` | `/api/products/<id>/wholesale/*` |
| **frontend/src/utils/** | |
| `frontend/src/utils/errors.js` | `getErrorMessage` (DRF body → toast string) + `getFieldErrors` (form display) |
| **frontend/images/** | |
| `frontend/images/{apples,bakery,carrots,cheese,dairy,eggs,farm,hero,hillside,preserves,salad,seasonal,sourdough,strawberries,tomatoes,vegetables}.jpg` | Marketing imagery used in hero + category cards |

---

# Part 8 — FAQ & common pitfalls

## Q. Why doesn't my code change show up after `git pull`?

**A.** Two cases:

- **Backend code change** — the backend bind-mounts `./backend:/app`, so Python edits hot-reload via Django's `StatReloader`. You should see "Watching for file changes" in `docker compose logs backend`. If reload doesn't trigger, restart the container: `docker compose restart backend`.

- **Frontend code change** — the frontend image bakes the SPA in at build time. Nothing is bind-mounted. Solution: `docker compose up -d --build frontend`. Hard-refresh the browser (Cmd/Ctrl+Shift+R) to bust the local cache too.

- **`entrypoint.sh` change** — even though `./backend:/app` is bind-mounted, the entrypoint is referenced from `/docker-entrypoint.sh` (outside `/app`). So `entrypoint.sh` changes need a rebuild: `docker compose up -d --build backend`.

## Q. The wholesale / dispute modal isn't opening — what's going on?

**A.** This was a real bug. Earlier in development the modal **handler** was wired in `app.js` (`showWholesaleModal`, `submitDispute`, etc.) but the **markup** was missing from `index.html`. Calling `document.getElementById('wholesale-overlay')` returned `null` and the function exited silently with no error. Fixed in this session — see commit log around the modal additions. If it still doesn't open after a hard refresh, inspect the DOM in dev tools and confirm the overlay div is present.

## Q. Why does TC-019 / TC-020 only verify visibility, not actual purchase?

**A.** Because the test descriptions say "verify wholesale price shows in green / verify wholesale price shows differently from standard price" — display-only assertions. **Actual purchase by a restaurant or community group is currently broken** because:

1. Cart endpoint is gated by `IsCustomer` only (rejects restaurant + community).
2. Order create endpoint also rejects `request.user.role != 'customer'`.
3. Even if both were lifted, `OrderCreateSerializer.create` snapshots `product.price` not `WholesalePrice.price`.

Closing this gap (~30-45 min): swap `IsCustomer` for an `IsBuyer` permission allowing all three buyer roles, and extend `OrderCreateSerializer.create` to look up `WholesalePrice` based on `buyer_type=customer.role` and `minimum_quantity__lte=quantity`. Acknowledged-but-not-shipped because the test cases as written all pass.

## Q. Why is `products/0001` followed by `products/0005`?

**A.** Migrations 0002-0004 were squashed during a merge. Django doesn't require sequential numbers — it requires the dependency chain to be intact. The chain is `products/0001 ← products/0005 ← products/0006`, all dependencies declared, so `python manage.py migrate` applies them in the right order on a fresh DB.

## Q. How do I add a new role like `wholesaler`?

**A.** Touch all of these (in order):

1. **Model** — add `('wholesaler', 'Wholesaler')` to `User.ROLE_CHOICES` in [backend/users/models.py](backend/users/models.py).
2. **Profile model** — add `WholesalerProfile(models.Model)` in the same file with the role-specific fields you need.
3. **Migration** — `python manage.py makemigrations users`.
4. **Serializer + view + URL** — add `WholesalerRegistrationSerializer`, `WholesalerRegistrationView`, route `register/wholesaler/`.
5. **Admin** — register the new profile in [backend/users/admin.py](backend/users/admin.py).
6. **Permission** (optional) — add `IsWholesaler` if you need a class-based gate.
7. **`UserProfileSerializer`** — nest the new profile in the `/api/auth/profile/` payload.
8. **Frontend** — add the role to `<select id="reg-role-select">` in [frontend/index.html](frontend/index.html), add a `wholesaler-fields` panel, register the role with `auth.js`, add a dashboard page, gate it in `navigate()`.
9. **Demo seeding** — add an `upsert_wholesaler` block to [backend/entrypoint.sh](backend/entrypoint.sh) and a row to the demo accounts table in [README.md](README.md).
10. **Documentation** — add a row to TEST_CASES.md if you have a TC that exercises the new role.

About 3-4 files per area. The pattern for restaurant + community group (Sprint 3) is your template.

## Q. How do I run the tests?

**A.** `docker compose exec backend python manage.py test`. Today only `users/tests.py` has real test code (`Sprint1IntegrationTests`). The other three apps have stubs. Adding tests is straightforward — DRF's `APITestCase` gives you `self.client` for HTTP-style assertions; see `users/tests.py` for an example.

## Q. The Django admin loads but I see no Restaurant/Community Group profile pages — why?

**A.** [backend/users/admin.py](backend/users/admin.py) only registers `User`, `ProducerProfile`, `CustomerProfile`. The Sprint 3 profile models exist but aren't admin-registered. Easy fix: add `@admin.register(RestaurantProfile)` and `@admin.register(CommunityGroupProfile)` blocks following the same pattern. Not a functional bug — just a missing convenience.

## Q. Why do delivered orders sometimes show no `Payment.processed_at`?

**A.** `Payment.processed_at` is set by `OrderStatusUpdateSerializer.update` only when the **parent Order's** derived status hits `delivered` — meaning every non-rejected `OrderProducerGroup` has reached `delivered`. On a multi-vendor order where one producer hasn't shipped yet, the customer is paid (paid_at set) but the producer payouts are held until the last group delivers. That's by design — it protects the customer from paying for goods that never arrive.

## Q. The frontend says "Network error" / `net::ERR_FAILED` — what to check?

**A.** In order:

1. `docker compose ps` — all three containers Up?
2. `curl http://localhost:8025/api/products/` — backend reachable directly?
3. `curl http://localhost:3025/api/products/` — backend reachable through nginx?
4. Browser console — any CORS / 502 / 504?
5. If 502 from nginx: backend container is up but Django isn't responding. Check `docker compose logs backend` for migration errors or import errors.

The most common cause we hit during development was a fresh DB volume with not-yet-applied migrations — entrypoint hadn't finished, but the frontend was already trying to talk to the backend. Wait 10 seconds after `docker compose up` and refresh.

---

That's everything. If something's missing or unclear, tell me which question wasn't answered and I'll add it.
