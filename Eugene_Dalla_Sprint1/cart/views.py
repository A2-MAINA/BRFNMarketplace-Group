from decimal import Decimal

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import IsCustomer
from products.models import Product
from .models import Cart, CartItem
from .serializers import CartItemSerializer


# Eugene Dalla — Backend API: cart endpoint (add/view/update/remove/total)


class CartView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def _get_cart(self, user):
        cart, _ = Cart.objects.get_or_create(user=user)
        return cart

    def get(self, request):
        cart = self._get_cart(request.user)
        items = CartItem.objects.filter(cart=cart).select_related("product")
        item_data = CartItemSerializer(items, many=True).data

        total = sum((item.product.price * item.quantity for item in items), Decimal("0.00"))
        count = sum((item.quantity for item in items), 0)

        return Response(
            {"items": item_data, "total": f"{total:.2f}", "count": count},
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        """
        Add or update a product in the cart.
        Expects: {"product_id": ID, "quantity": N}
        """
        cart = self._get_cart(request.user)
        product_id = request.data.get("product_id")
        quantity = int(request.data.get("quantity", 1))

        if not product_id:
            return Response({"detail": "product_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if quantity <= 0:
            return Response({"detail": "quantity must be positive."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            product = Product.objects.get(pk=product_id)
        except Product.DoesNotExist:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        item, _ = CartItem.objects.get_or_create(cart=cart, product=product)
        item.quantity = quantity
        item.save()

        return self.get(request)

    def delete(self, request):
        """
        Remove a product from the cart.
        Expects: {"product_id": ID}
        """
        cart = self._get_cart(request.user)
        product_id = request.data.get("product_id")
        if not product_id:
            return Response({"detail": "product_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        CartItem.objects.filter(cart=cart, product_id=product_id).delete()
        return self.get(request)
