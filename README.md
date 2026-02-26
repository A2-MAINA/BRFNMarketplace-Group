# BRFN Digital Marketplace

A digital marketplace platform for the Bristol Regional Food Network (BRFN), connecting local food producers with customers. Built as a group project for the Distributed & Enterprise Software Development module.

The platform allows producers to register, list products with allergen information, and manage orders. Customers can browse products by category, view allergen details, add items to a shopping cart, and place orders. The system enforces UK food safety regulations including the 14 major allergens required by the Food Information Regulations 2014.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Backend     | Django 5.x, Django REST Framework   |
| Frontend    | React (placeholder — in development)|
| Database    | PostgreSQL 16                       |
| Containers  | Docker, Docker Compose              |
| Web Server  | Nginx (frontend container)          |

---

## Prerequisites

Before running the project, make sure you have the following installed:

- **Docker Desktop** — [Download here](https://www.docker.com/products/docker-desktop/)
- **Git** — [Download here](https://git-scm.com/downloads)

Docker Desktop includes Docker Compose, so you don't need to install it separately.

Verify your installation:
```bash
docker --version
docker compose version
git --version
```

---

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd BRFNMarketplace-Group
```

### 2. Set Up Environment Variables

Copy the example environment file and create your own `.env`:

```bash
cp .env.example .env
```

The default values in `.env.example` work for local development — no changes needed. If you want to customise the database credentials or secret key, edit the `.env` file.

### 3. Build and Start the Containers

```bash
docker-compose up --build
```

This builds all three containers (database, backend, frontend) and starts them. The first build takes a few minutes. Subsequent starts are faster due to Docker layer caching.

Wait until you see:
```
brfn_backend | Starting development server at http://0.0.0.0:8000/
```

### 4. Run Database Migrations

Open a **new terminal window** (keep the containers running) and run:

```bash
docker exec brfn_backend python manage.py migrate
```

This creates the database tables (including `users_user`). You only need to do this once, or whenever new migrations are added.

**Important:** Run this command **inside Docker** (as above). If you run `python manage.py migrate` on your host machine, you'll get "ModuleNotFoundError: No module named 'rest_framework'" because the Python dependencies are installed in the container, not locally.

### 5. Create a Superuser (Optional)

To access the Django admin panel:

```bash
docker exec -it brfn_backend python manage.py createsuperuser
```

Follow the prompts to set a username, email, and password.

---

## Accessing the Application

When using Docker Compose, ports are mapped as below (backend 8025, frontend 3025):

| Service          | URL                            | Description                        |
|------------------|--------------------------------|------------------------------------|
| Django Backend   | http://localhost:8025          | API and backend application        |
| Django Admin     | http://localhost:8025/admin/   | Admin panel (requires superuser)   |
| Frontend         | http://localhost:3025          | Customer-facing marketplace UI     |

**Check the backend is running:** open http://localhost:8025/healthz/ in your browser — you should see a simple response. If that fails, the frontend will show "Network error" or "backend not working" when you log in or register.

---

## Troubleshooting: "Backend not working" / net::ERR_FAILED

If you see **"Network error. Please check the backend is running"** or the browser console shows **`POST http://localhost:8025/... net::ERR_FAILED`**:

1. **Start all services** (from the project root):
   ```bash
   docker-compose up --build
   ```
   Wait until you see `Starting development server at http://0.0.0.0:8000/` from the backend.

2. **Check the backend is reachable:** open **http://localhost:8025/healthz/** in your browser. If it loads, the backend is running and the frontend should be able to call it.

3. **Running the backend without Docker?** If you run Django with `python manage.py runserver`, it listens on **port 8000**. The frontend defaults to **8025**. Either:
   - Run the backend on 8025: `python manage.py runserver 8025`, or
   - Point the frontend at 8000: in `frontend/index.html` (in `<head>`), add:
     ```html
     <meta name="brfn-api-base" content="http://localhost:8000" />
     ```
     The app reads this and uses it as the API base URL.

4. **Containers not running?** Run `docker-compose ps` and ensure `brfn_backend` is Up. If it exited, run `docker-compose logs backend` to see errors.

5. **Open the frontend via HTTP, not as a file.** Use **http://localhost:3025** in the browser (with Docker running). Do not open `index.html` directly from the file system (`file:///...`) — that can cause CORS/security errors and `net::ERR_FAILED` when calling the API.

6. **After changing backend settings** (e.g. CORS/CSRF), restart the backend: `docker-compose restart backend`, then hard-refresh the frontend (Ctrl+Shift+R).

7. **"InconsistentMigrationHistory" when migrating** (e.g. *admin.0001_initial is applied before its dependency users.0001_initial*): the database migration history is out of order. **Reset the database** (this deletes all data) and run migrations from scratch:
   ```bash
   docker-compose down -v
   docker-compose up -d
   docker exec brfn_backend python manage.py migrate
   ```
   Then create a superuser again if you need one: `docker exec -it brfn_backend python manage.py createsuperuser`

---

## Useful Commands

All commands should be run from the project root directory.

### Starting and Stopping

```bash
# Start all containers
docker-compose up

# Start all containers and rebuild images
docker-compose up --build

# Start containers in the background (detached mode)
docker-compose up -d

# Stop all containers
docker-compose down

# Stop all containers and remove database volume (resets all data)
docker-compose down -v
```

### Django Management

```bash
# Run migrations
docker exec brfn_backend python manage.py migrate

# Create new migrations after model changes
docker exec brfn_backend python manage.py makemigrations

# Create a superuser
docker exec -it brfn_backend python manage.py createsuperuser

# Open Django shell (for testing queries)
docker exec -it brfn_backend python manage.py shell

# Check for configuration issues
docker exec brfn_backend python manage.py check
```

### Debugging

```bash
# View logs for all containers
docker-compose logs

# View logs for a specific container
docker-compose logs backend
docker-compose logs db
docker-compose logs frontend

# Follow logs in real time
docker-compose logs -f backend

# Check which containers are running
docker ps
```

---

## Project Structure

```
BRFNMarketplace-Group/
├── docker-compose.yml          # Defines all 3 containers and how they connect
├── .env                        # Environment variables (not committed to Git)
├── .env.example                # Template for environment variables
├── .gitignore                  # Files excluded from Git
├── README.md                   # This file
│
├── backend/                    # Django backend application
│   ├── Dockerfile              # Instructions to build the backend container
│   ├── requirements.txt        # Python dependencies
│   ├── manage.py               # Django CLI tool
│   ├── config/                 # Project configuration
│   │   ├── settings.py         # All Django settings (database, apps, middleware)
│   │   ├── urls.py             # Main URL routing
│   │   ├── wsgi.py             # WSGI entry point
│   │   └── asgi.py             # ASGI entry point
│   ├── users/                  # User registration, authentication, profiles
│   │   ├── models.py           # User, ProducerProfile, CustomerProfile models
│   │   ├── views.py            # Registration and authentication views
│   │   ├── admin.py            # Admin panel registration
│   │   └── migrations/         # Database migration files
│   ├── products/               # Product listings, categories, allergens
│   │   ├── models.py           # Product, Category, Allergen models
│   │   ├── views.py            # Product browsing and management views
│   │   ├── admin.py            # Admin panel registration
│   │   └── migrations/         # Database migration files
│   ├── orders/                 # Order creation, tracking, status management
│   │   ├── models.py           # Order, OrderItem models
│   │   ├── views.py            # Order management views
│   │   ├── admin.py            # Admin panel registration
│   │   └── migrations/         # Database migration files
│   └── cart/                   # Shopping cart functionality
│       ├── models.py           # Cart, CartItem models
│       ├── views.py            # Cart management views
│       ├── admin.py            # Admin panel registration
│       └── migrations/         # Database migration files
│
└── frontend/                   # React frontend application
    ├── Dockerfile              # Instructions to build the frontend container
    └── index.html              # Placeholder page (React app will replace this)
```

---

## Git Workflow

### Branch Naming

All work is done on feature branches, never directly on `main`.

```
feature/tc-001-producer-registration
feature/tc-006-shopping-cart
fix/cart-price-calculation
```

Format: `feature/tc-XXX-short-description` for new features, `fix/short-description` for bug fixes.

### Working on a Task

```bash
# 1. Make sure you're on main and it's up to date
git checkout main
git pull origin main

# 2. Create a feature branch
git checkout -b feature/tc-001-producer-registration

# 3. Do your work, commit regularly with descriptive messages
git add .
git commit -m "Add producer registration model with business fields"

# 4. Push your branch
git push origin feature/tc-001-producer-registration

# 5. Create a Pull Request on GitHub/GitLab
# - Add a description of what you changed
# - Request a review from at least one team member
# - Only merge after approval
```

### Commit Messages

Write clear, descriptive commit messages that explain what you did:

```
Good:  "Add producer registration model with business name and address fields"
Good:  "Fix allergen display not showing on product detail page"
Good:  "Add category browsing API endpoint with filtering"

Bad:   "update"
Bad:   "fix stuff"
Bad:   "wip"
```

### Pull Requests

- Every feature branch must be merged via a Pull Request
- At least one team member must review and approve before merging
- The PR description should explain what was changed and which test case it relates to
- After merging, delete the feature branch

---

## Architecture

The application runs as three Docker containers:

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend    │  │   Backend    │  │   Database   │  │
│  │   (Nginx)     │  │   (Django)   │  │ (PostgreSQL) │  │
│  │              │  │              │  │              │  │
│  │  Port: 3000   │  │  Port: 8000  │  │  Port: 5432  │  │
│  │              │  │              │  │              │  │
│  │  Serves React │  │  REST API    │  │  Data store  │  │
│  │  static files │  │  Business    │  │  Persistent  │  │
│  │              │  │  logic       │  │  volume      │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
│                           │                  │          │
│                           └──────────────────┘          │
│                         DB_HOST: db                     │
│                         Port: 5432                      │
└─────────────────────────────────────────────────────────┘
```

- **Frontend** sends API requests to the **Backend**
- **Backend** queries the **Database** using the service name `db` as the host
- **Database** data persists via a Docker named volume (`postgres_data`)
- All three containers share a Docker network and communicate using service names

---

## Environment Variables

| Variable       | Description                          | Default Value      |
|----------------|--------------------------------------|--------------------|
| DB_NAME        | PostgreSQL database name             | brfn_db            |
| DB_USER        | PostgreSQL username                  | brfn_user          |
| DB_PASSWORD    | PostgreSQL password                  | (set in .env)      |
| DB_HOST        | Database hostname (Docker service)   | db                 |
| DB_PORT        | PostgreSQL port                      | 5432               |
| SECRET_KEY     | Django cryptographic secret key      | (set in .env)      |
| DEBUG          | Enable Django debug mode             | True               |
| ALLOWED_HOSTS  | Comma-separated list of allowed hosts| localhost,127.0.0.1|

---

## Team

| Name            | Role                          | Responsibilities                                    |
|-----------------|-------------------------------|-----------------------------------------------------|
| Al-amin Maina   | Backend Models & Team Lead    | Database models, project management, repo setup      |
| Dalla Eugene    | Backend API & Business Logic  | DRF serializers, viewsets, API endpoints, permissions |
| Joel Rowland    | Frontend Development          | React pages, UI components, forms                    |
| Saad            | Frontend Integration & DevOps | API integration, Docker configuration, testing       |