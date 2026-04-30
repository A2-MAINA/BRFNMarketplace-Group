from rest_framework import serializers
from .models import Product, Category, Allergen, Review, Notification, WholesalePrice

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

class AllergenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allergen
        fields = '__all__'
class ProductSerializer(serializers.ModelSerializer):
    producer_business_name = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ['producer', 'created_at']

    def validate(self, data):
        """At least one date field must be provided — business rule for food traceability."""
        harvest = data.get('harvest_date')
        production = data.get('production_date')
        best_before = data.get('best_before')

        if not any([harvest, production, best_before]):
            raise serializers.ValidationError(
                "At least one date must be provided: harvest_date, production_date, or best_before."
            )
        return data

    def to_representation(self, instance):
        """Override read output to nest category, allergens, and producer info."""
        data = super().to_representation(instance)
        data['category'] = CategorySerializer(instance.category).data
        data['allergens'] = AllergenSerializer(instance.allergens.all(), many=True).data
        data['producer_business_name'] = self.get_producer_business_name(instance)
        return data

    def get_producer_business_name(self, obj):
        if hasattr(obj.producer, 'producer_profile'):
            return obj.producer.producer_profile.business_name
        return obj.producer.email

class ProductInventoryUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['stock_quantity', 'availability']

    def validate_stock_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError('Stock quantity cannot be negative.')
        return value


# ============================
# Review Serializer (GET) — TC-023
# ============================

class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = [
            'id',
            'rating',
            'comment',
            'customer_name',
            'producer_response',
            'producer_response_at',
            'created_at',
        ]
        read_only_fields = fields

    def get_customer_name(self, obj):
        """
        Anonymise customer name for public display — UK GDPR compliance.
        Returns first name + last initial only e.g. 'Robert J.'
        Never expose full customer name publicly.
        """
        try:
            name = obj.customer.customer_profile.full_name
            parts = name.split()
            if len(parts) >= 2:
                return f"{parts[0]} {parts[-1][0]}."
            return parts[0] if parts else obj.customer.email
        except Exception:
            return 'Customer'


# ============================
# Review Create Serializer (POST) — TC-023
# ============================

class ReviewCreateSerializer(serializers.ModelSerializer):
    order = serializers.PrimaryKeyRelatedField(
        queryset=__import__('orders.models', fromlist=['Order']).Order.objects.all()
    )

    class Meta:
        model = Review
        fields = ['rating', 'comment', 'order']

    def validate(self, data):
        request = self.context['request']
        product = self.context['product']
        order = data['order']

        # Verify the customer owns this order
        if order.customer != request.user:
            raise serializers.ValidationError(
                'You can only review products from your own orders.'
            )

        # Verify the order is delivered
        if order.status != 'delivered':
            raise serializers.ValidationError(
                'You can only review products from delivered orders.'
            )

        # Verify the product is in this order
        from orders.models import OrderItem
        if not OrderItem.objects.filter(order=order, product=product).exists():
            raise serializers.ValidationError(
                'This product was not part of the selected order.'
            )

        # Check unique_together — one review per customer per product per order
        if Review.objects.filter(
            product=product,
            customer=request.user,
            order=order
        ).exists():
            raise serializers.ValidationError(
                'You have already reviewed this product for this order.'
            )

        return data

    def create(self, validated_data):
        request = self.context['request']
        product = self.context['product']
        return Review.objects.create(
            product=product,
            customer=request.user,
            **validated_data
        )


# ============================
# Producer Response Serializer (PATCH) — TC-024
# ============================

class ProducerResponseSerializer(serializers.Serializer):
    producer_response = serializers.CharField(min_length=1)

    def update(self, review, validated_data):
        from django.utils import timezone
        review.producer_response = validated_data['producer_response']
        review.producer_response_at = timezone.now()
        review.save(update_fields=['producer_response', 'producer_response_at'])
        return review


# ============================
# Notification Serializer — TC-016
# ============================

class NotificationSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_id = serializers.IntegerField(source='product.id', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id',
            'product_id',
            'product_name',
            'notified',
            'notified_at',
            'created_at',
        ]
        read_only_fields = fields


# ============================
# WholesalePrice Serializer — TC-019, TC-020
# ============================

class WholesalePriceSerializer(serializers.ModelSerializer):

    class Meta:
        model = WholesalePrice
        fields = [
            'id',
            'buyer_type',
            'price',
            'minimum_quantity',
            'is_active',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate(self, data):
        """
        Wholesale price must be strictly less than the standard product price.
        Validates on both create and update.
        """
        product = self.context.get('product')
        price = data.get('price')

        if product and price is not None:
            if price >= product.price:
                raise serializers.ValidationError(
                    {
                        'price': (
                            f'Wholesale price (£{price}) must be less than '
                            f'the standard product price (£{product.price}).'
                        )
                    }
                )
        return data
