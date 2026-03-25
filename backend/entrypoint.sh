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

echo "Creating demo accounts (if not exists)..."
python manage.py shell -c "
from django.contrib.auth import get_user_model
from django.utils import timezone
from users.models import ProducerProfile, CustomerProfile

User = get_user_model()

demo_customer_email = 'customer@example.com'
demo_producer_email = 'producer@example.com'
demo_password = 'Password1!'

def upsert_customer(email):
    user = User.objects.filter(email=email).first()
    if not user:
        user = User.objects.create_user(email=email, username=email, password=demo_password, role='customer')
        print('Demo customer created:', email)
    else:
        # Reset password in case demo user already exists with wrong credentials.
        user.set_password(demo_password)
        user.role = 'customer'
        user.save(update_fields=['password', 'role'])
        print('Demo customer reset password:', email)

    profile = CustomerProfile.objects.filter(user=user).first()
    if not profile:
        CustomerProfile.objects.create(
            user=user,
            full_name='Demo Customer',
            phone_number='07700 900123',
            delivery_address='45 Park Street, Bristol',
            postcode='BS1 5JG',
            terms_accepted=True,
            terms_accepted_at=timezone.now()
        )
        print('Demo customer profile created:', email)
    else:
        profile.full_name = 'Demo Customer'
        profile.phone_number = '07700 900123'
        profile.delivery_address = '45 Park Street, Bristol'
        profile.postcode = 'BS1 5JG'
        if not profile.terms_accepted:
            profile.terms_accepted = True
            profile.terms_accepted_at = timezone.now()
        profile.save()
        print('Demo customer profile ensured:', email)

def upsert_producer(email):
    user = User.objects.filter(email=email).first()
    if not user:
        user = User.objects.create_user(email=email, username=email, password=demo_password, role='producer')
        print('Demo producer created:', email)
    else:
        # Reset password in case demo producer already exists with wrong credentials.
        user.set_password(demo_password)
        user.role = 'producer'
        user.save(update_fields=['password', 'role'])
        print('Demo producer reset password:', email)

    profile = ProducerProfile.objects.filter(user=user).first()
    if not profile:
        ProducerProfile.objects.create(
            user=user,
            business_name='Demo Producer',
            contact_name='Demo Producer Contact',
            phone_number='01179 123456',
            address='Demo Producer Farm, Bristol',
            postcode='BS1 4DJ',
            crn='',
            description='Demo producer account for sprint testing.',
            food_hygiene_rating=None,
        )
        print('Demo producer profile created:', email)
    else:
        profile.business_name = 'Demo Producer'
        profile.contact_name = 'Demo Producer Contact'
        profile.phone_number = '01179 123456'
        profile.address = 'Demo Producer Farm, Bristol'
        profile.postcode = 'BS1 4DJ'
        if profile.description is None:
            profile.description = 'Demo producer account for sprint testing.'
        profile.save()
        print('Demo producer profile ensured:', email)

upsert_customer(demo_customer_email)
upsert_producer(demo_producer_email)
"

echo "Starting Django server..."
exec python manage.py runserver 0.0.0.0:8000
