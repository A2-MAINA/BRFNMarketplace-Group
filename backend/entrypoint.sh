#!/bin/sh
# Entrypoint script: wait for DB, run migrations, create admin, then start server.

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT..."
while ! python -c "import socket; s = socket.socket(); s.settimeout(2); s.connect(('$DB_HOST', $DB_PORT)); s.close()" 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

echo "Running migrations..."
python manage.py migrate --noinput

echo "Creating admin superuser (if not exists)..."
python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(email='admin@brfn.com').exists():
    User.objects.create_superuser(email='admin@brfn.com', password='Admin123!')
    print('Admin created: admin@brfn.com / Admin123!')
else:
    print('Admin already exists.')
"

echo "Starting Django server..."
exec python manage.py runserver 0.0.0.0:8000
