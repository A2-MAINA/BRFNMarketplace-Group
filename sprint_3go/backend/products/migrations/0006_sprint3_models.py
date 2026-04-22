from django.conf import settings
from django.db import migrations, models
import django.core.validators
import decimal


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0002_add_status_to_producergroup'),
        ('products', '0005_seed_categories_allergens'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AvailabilitySubscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notified', models.BooleanField(default=False)),
                ('notified_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('customer', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='availability_subscriptions', to=settings.AUTH_USER_MODEL)),
                ('product', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='availability_subscriptions', to='products.product')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Review',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rating', models.PositiveSmallIntegerField()),
                ('comment', models.TextField(blank=True, default='')),
                ('producer_response', models.TextField(blank=True, default='')),
                ('producer_response_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('customer', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='reviews', to=settings.AUTH_USER_MODEL)),
                ('order', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='reviews', to='orders.order')),
                ('product', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='reviews', to='products.product')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='WholesalePrice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('buyer_type', models.CharField(choices=[('restaurant', 'Restaurant'), ('community_group', 'Community Group')], max_length=20)),
                ('price', models.DecimalField(decimal_places=2, max_digits=10, validators=[django.core.validators.MinValueValidator(decimal.Decimal('0.01'))])),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('product', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='wholesale_prices', to='products.product')),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='availabilitysubscription',
            constraint=models.UniqueConstraint(fields=('customer', 'product'), name='unique_product_availability_subscription'),
        ),
        migrations.AddConstraint(
            model_name='review',
            constraint=models.UniqueConstraint(fields=('product', 'customer', 'order'), name='unique_review_per_order_product'),
        ),
        migrations.AddConstraint(
            model_name='wholesaleprice',
            constraint=models.UniqueConstraint(fields=('product', 'buyer_type'), name='unique_wholesale_price_per_buyer_type'),
        ),
    ]
