from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from decimal import Decimal
import datetime
from users.models import User, ProducerProfile, CustomerProfile
from products.models import Product, Category, AvailabilitySubscription, WholesalePrice
from cart.models import Cart, CartItem

# Covers the core Sprint 1 integration flow across auth, products, and cart APIs.
class Sprint1IntegrationTests(APITestCase):
    # Creates shared setup data used by the integration test flow.
    def setUp(self):
        # Create categories
        self.category_veg, _ = Category.objects.get_or_create(name='Vegetables')
        self.category_fruit, _ = Category.objects.get_or_create(name='Fruits')

    # Verifies the happy-path flow from producer setup through customer cart actions.
    def test_full_flow(self):
        # 1. Register Producer
        producer_data = {
            'email': 'producer@example.com',
            'password': 'password123',
            'password_confirm': 'password123',
            'business_name': 'Farm Fresh',
            'contact_name': 'John Farmer',
            'phone_number': '1234567890',
            'address': '123 Farm Lane',
            'postcode': '12345'
        }
        response = self.client.post('/api/auth/register/producer/', producer_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, f"Producer reg failed: {response.data}")
        
        # 2. Login as Producer
        login_data = {'email': 'producer@example.com', 'password': 'password123'}
        response = self.client.post('/api/auth/login/', login_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK, "Producer login failed")
        
        # 3. Create Product (as Producer)
        product_data = {
            'category': self.category_veg.id,
            'name': 'Carrots',
            'description': 'Organic Carrots',
            'price': '2.50',
            'stock_quantity': 100,
            'unit': 'kg',
            'origin_location': 'Somerset',
            'is_organic': True,
            'storage_instructions': 'Store in a cool, dry place',
            'harvest_date': '2026-04-01',
        }
        response = self.client.post('/api/products/', product_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, f"Create product failed: {response.data}")
        product_id = response.data['id']
        
        # 4. Logout Producer
        response = self.client.post('/api/auth/logout/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # 5. Register Customer
        customer_data = {
            'email': 'customer@example.com',
            'password': 'password123',
            'password_confirm': 'password123',
            'full_name': 'Jane Shopper',
            'phone_number': '0987654321',
            'delivery_address': '456 Market St',
            'postcode': '54321',
            'terms_accepted': True
        }
        response = self.client.post('/api/auth/register/customer/', customer_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, f"Customer reg failed: {response.data}")
        
        # 6. Login as Customer
        response = self.client.post('/api/auth/login/', {'email': 'customer@example.com', 'password': 'password123'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # 7. List Products (Search/Filter)
        response = self.client.get('/api/products/?search=Carrots')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Carrots')
        
        # 8. Add to Cart
        cart_data = {'product_id': product_id, 'quantity': 2}
        response = self.client.post('/api/cart/', cart_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, f"Add to cart failed: {response.data}")
        
        # 9. View Cart
        response = self.client.get('/api/cart/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['items']), 1)
        self.assertEqual(response.data['items'][0]['quantity'], 2)
        # Check total (2 * 2.50 = 5.00)
        self.assertEqual(float(response.data['cart_total']), 5.00)
        
        # 10. Remove from Cart
        item_id = response.data['items'][0]['id']
        response = self.client.delete(f'/api/cart/items/{item_id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify empty in the response itself
        self.assertEqual(len(response.data['items']), 0)
        
        # Verify empty via GET
        response = self.client.get('/api/cart/')
        self.assertEqual(len(response.data['items']), 0)


class Sprint3DallaRequirementsTests(APITestCase):
    def setUp(self):
        self.category_veg, _ = Category.objects.get_or_create(name='Vegetables')

        self.producer = User.objects.create_user(email='producer2@example.com', password='password123', role='producer')
        ProducerProfile.objects.create(
            user=self.producer,
            business_name='Farm Fresh 2',
            contact_name='John Farmer',
            phone_number='1234567890',
            address='123 Farm Lane',
            postcode='12345',
        )

        self.customer = User.objects.create_user(email='customer2@example.com', password='password123', role='customer')
        CustomerProfile.objects.create(
            user=self.customer,
            full_name='Robert Johnson',
            phone_number='0987654321',
            delivery_address='456 Market St',
            postcode='54321',
            terms_accepted=True,
        )

        self.restaurant = User.objects.create_user(email='restaurant@example.com', password='password123', role='restaurant')

        self.product = Product.objects.create(
            category=self.category_veg,
            name='Potatoes',
            description='Local Potatoes',
            price=Decimal('10.00'),
            stock_quantity=100,
            unit='kg',
            origin_location='Somerset',
            is_organic=True,
            storage_instructions='Store cool',
            harvest_date=datetime.date(2026, 4, 1),
            availability='out_of_season',
            producer=self.producer,
        )

    def login(self, email, password='password123'):
        response = self.client.post('/api/auth/login/', {'email': email, 'password': password})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def logout(self):
        self.client.post('/api/auth/logout/')

    def test_notifications_trigger_on_availability_to_in_season(self):
        self.login('customer2@example.com')
        response = self.client.post(f'/api/products/{self.product.id}/notify/', {})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.logout()

        self.login('producer2@example.com')
        response = self.client.patch(f'/api/products/{self.product.id}/', {'availability': 'in_season'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        sub = AvailabilitySubscription.objects.get(customer=self.customer, product=self.product)
        self.assertTrue(sub.notified)
        self.assertIsNotNone(sub.notified_at)

    def test_wholesale_price_validation_and_cart_application(self):
        self.login('producer2@example.com')
        response = self.client.post(
            f'/api/products/{self.product.id}/wholesale/',
            {'buyer_type': 'restaurant', 'price': '10.00'},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

        response = self.client.post(
            f'/api/products/{self.product.id}/wholesale/',
            {'buyer_type': 'restaurant', 'price': '8.00', 'minimum_quantity': 10, 'is_active': True},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.logout()

        self.login('restaurant@example.com')
        response = self.client.post('/api/cart/', {'product_id': self.product.id, 'quantity': 9})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(float(response.data['cart_total']), 90.0)

        response = self.client.post('/api/cart/', {'product_id': self.product.id, 'quantity': 1})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['items'][0]['quantity'], 10)
        self.assertEqual(float(response.data['cart_total']), 80.0)

    def test_producer_analytics_schema(self):
        self.login('producer2@example.com')
        response = self.client.get('/api/producer/analytics/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        for key in ['total_revenue', 'total_orders', 'average_order_value', 'total_commission_paid', 'top_products', 'weekly_revenue']:
            self.assertIn(key, response.data)
