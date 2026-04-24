from rest_framework import serializers
from .models import Cart, CartItem
from products.models import Product
from products.serializers import ProductSerializer


class CartItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
        source='product',
        write_only=True
    )
    item_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, source='get_item_total')

    class Meta:
        model = CartItem
        fields = ['id', 'product', 'product_id', 'quantity', 'item_total']


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    cart_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, source='get_cart_total')

    class Meta:
        model = Cart
        fields = ['id', 'items', 'cart_total', 'updated_at']

