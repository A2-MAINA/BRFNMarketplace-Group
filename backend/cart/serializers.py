from rest_framework import serializers

from products.serializers import ProductSerializer
from .models import Cart, CartItem


# Eugene Dalla — Backend API: cart serializers


class CartItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        source="product", queryset=ProductSerializer.Meta.model.objects.all(), write_only=True
    )

    class Meta:
        model = CartItem
        fields = ["id", "product", "product_id", "quantity", "created_at"]


class CartSerializer(serializers.Serializer):
    items = CartItemSerializer(many=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    count = serializers.IntegerField()

