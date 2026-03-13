from rest_framework import views, status, permissions
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Cart, CartItem
from .serializers import CartSerializer, CartItemSerializer
from products.models import Product
from users.permissions import IsCustomer

class CartView(views.APIView):
    """
    GET: Retrieve the user's cart.
    POST: Add a product to the cart. Body: {"product_id": 1, "quantity": 2}
    DELETE: Clear the entire cart.
    """
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def get_cart(self, request):
        cart, created = Cart.objects.get_or_create(customer=request.user)
        return cart

    def get(self, request):
        cart = self.get_cart(request)
        serializer = CartSerializer(cart)
        return Response(serializer.data)

    def post(self, request):
        cart = self.get_cart(request)
        product_id = request.data.get('product_id')
        quantity = int(request.data.get('quantity', 1))

        if not product_id:
            return Response({"error": "Product ID is required"}, status=status.HTTP_400_BAD_REQUEST)

        product = get_object_or_404(Product, id=product_id)
        
        # Check stock (simple check, race conditions possible but out of scope for Sprint 1)
        if product.stock_quantity < quantity:
             return Response({"error": "Not enough stock"}, status=status.HTTP_400_BAD_REQUEST)

        # Get or create item
        # If item exists, update quantity
        cart_item, created = CartItem.objects.get_or_create(cart=cart, product=product)
        
        if not created:
            cart_item.quantity += quantity
        else:
            cart_item.quantity = quantity
        
        cart_item.save()
        
        # Return updated cart
        return Response(CartSerializer(cart).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        cart = self.get_cart(request)
        cart.items.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class CartItemView(views.APIView):
    """
    PUT: Update quantity of a specific item. Body: {"quantity": 5}
    DELETE: Remove a specific item from the cart.
    """
    permission_classes = [permissions.IsAuthenticated, IsCustomer]
    
    def put(self, request, item_id):
        cart = get_object_or_404(Cart, customer=request.user)
        item = get_object_or_404(CartItem, id=item_id, cart=cart)
        quantity = int(request.data.get('quantity', 1))
        
        if quantity <= 0:
            item.delete()
        else:
            if item.product.stock_quantity < quantity:
                 return Response({"error": "Not enough stock"}, status=status.HTTP_400_BAD_REQUEST)
            item.quantity = quantity
            item.save()
            
        return Response(CartSerializer(cart).data)

    def delete(self, request, item_id):
        cart = get_object_or_404(Cart, customer=request.user)
        item = get_object_or_404(CartItem, id=item_id, cart=cart)
        item.delete()
        return Response(CartSerializer(cart).data)
