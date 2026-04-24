from rest_framework import views, status, permissions
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Cart, CartItem
from .serializers import CartSerializer
from products.models import Product
from users.permissions import IsBuyer


class CartView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsBuyer]

    def get_cart(self, request):
        cart, _ = Cart.objects.get_or_create(customer=request.user)
        return cart

    def get(self, request):
        cart = self.get_cart(request)
        return Response(CartSerializer(cart).data)

    def post(self, request):
        cart = self.get_cart(request)
        product_id = request.data.get('product_id')
        quantity = int(request.data.get('quantity', 1))

        if not product_id:
            return Response({"error": "Product ID is required"}, status=status.HTTP_400_BAD_REQUEST)

        product = get_object_or_404(Product, id=product_id)
        if product.stock_quantity < quantity:
            return Response({"error": "Not enough stock"}, status=status.HTTP_400_BAD_REQUEST)

        cart_item, created = CartItem.objects.get_or_create(cart=cart, product=product)
        if not created:
            cart_item.quantity += quantity
        else:
            cart_item.quantity = quantity
        cart_item.save()

        return Response(CartSerializer(cart).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        cart = self.get_cart(request)
        cart.items.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CartItemView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsBuyer]

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

