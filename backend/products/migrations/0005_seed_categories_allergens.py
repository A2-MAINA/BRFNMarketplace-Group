"""
Data migration: pre-load the 5 BRFN categories and 14 UK allergens.
Runs automatically when any team member runs `python manage.py migrate`.
"""

from django.db import migrations


CATEGORIES = [
    'Vegetables',
    'Dairy & Eggs',
    'Bakery',
    'Preserves',
    'Seasonal Specialties',
]

ALLERGENS = [
    ('Celery', 'Including celeriac'),
    ('Cereals containing gluten', 'Including wheat, rye, barley, oats'),
    ('Crustaceans', 'Including crabs, lobster, prawns'),
    ('Eggs', ''),
    ('Fish', ''),
    ('Lupin', ''),
    ('Milk', 'Including lactose'),
    ('Molluscs', 'Including mussels, oysters, snails, squid'),
    ('Mustard', ''),
    ('Nuts', 'Including almonds, cashews, walnuts, hazelnuts, pecans, Brazil nuts, pistachios, macadamia nuts'),
    ('Peanuts', ''),
    ('Sesame', 'Including sesame seeds and sesame oil'),
    ('Soybeans', ''),
    ('Sulphur dioxide', 'At concentration of more than 10mg/kg or 10mg/litre'),
]


def seed_data(apps, schema_editor):
    Category = apps.get_model('products', 'Category')
    Allergen = apps.get_model('products', 'Allergen')

    for name in CATEGORIES:
        Category.objects.get_or_create(name=name)

    for name, description in ALLERGENS:
        Allergen.objects.get_or_create(name=name, defaults={'description': description})


def reverse_seed(apps, schema_editor):
    Category = apps.get_model('products', 'Category')
    Allergen = apps.get_model('products', 'Allergen')
    Category.objects.filter(name__in=CATEGORIES).delete()
    Allergen.objects.filter(name__in=[a[0] for a in ALLERGENS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0004_merge_0002_allergen_product_0003_product_producer'),
    ]

    operations = [
        migrations.RunPython(seed_data, reverse_seed),
    ]
