from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from users.models import User, ProducerProfile, CustomerProfile
from products.models import Product, Category
from cart.models import Cart, CartItem

class Sprint1IntegrationTests(APITestCase):
    def setUp(self):
        # Create categories
        self.category_veg, _ = Category.objects.get_or_create(name='Vegetables')
        self.category_fruit, _ = Category.objects.get_or_create(name='Fruits')

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
