from rest_framework import serializers
from django.db import IntegrityError
from django.utils import timezone
from decimal import Decimal
from .models import Product, Category, Allergen, Review, AvailabilitySubscription, WholesalePrice
from orders.models import Order

# Returns every field for product categories.
class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

# Returns every field for allergen records.
class AllergenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allergen
        fields = '__all__'

# Handles full product read/write behavior for the marketplace API.
class ProductSerializer(serializers.ModelSerializer):
    producer_business_name = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ['producer', 'created_at']

    # Enforces the traceability rule that at least one date is supplied.
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

    # Reshapes product output so related data is returned in a friendlier API format.
    def to_representation(self, instance):
        """Override read output to nest category, allergens, and producer info."""
        data = super().to_representation(instance)
        data['category'] = CategorySerializer(instance.category).data
        data['allergens'] = AllergenSerializer(instance.allergens.all(), many=True).data
        data['producer_business_name'] = self.get_producer_business_name(instance)
        return data

    # Shows the producer business name when a producer profile exists.
    def get_producer_business_name(self, obj):
        if hasattr(obj.producer, 'producer_profile'):
            return obj.producer.producer_profile.business_name
        return obj.producer.email

# Restricts updates to stock and seasonal availability only.
class ProductInventoryUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['stock_quantity', 'availability']

    # Prevents invalid negative inventory values.
    def validate_stock_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError('Stock quantity cannot be negative.')
        return value

    def update(self, instance, validated_data):
        previous_availability = instance.availability
        updated = super().update(instance, validated_data)
        if previous_availability != 'in_season' and updated.availability == 'in_season':
            AvailabilitySubscription.objects.filter(
                product=updated,
                notified=False,
            ).update(
                notified=True,
                notified_at=timezone.now(),
            )
        return updated


# Formats review data for public display on a product.
class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = [
            'rating',
            'comment',
            'customer_name',
            'producer_response',
            'producer_response_at',
            'created_at',
        ]
        read_only_fields = fields

    # Applies simple customer-name anonymisation for GDPR-friendly display.
    def get_customer_name(self, obj):
        try:
            profile = obj.customer.customer_profile
            name = profile.full_name or ''
            parts = name.split()
            if len(parts) >= 2 and parts[-1]:
                return f"{parts[0]} {parts[-1][0]}."
            if len(parts) == 1:
                return parts[0]
            return 'Customer'
        except Exception:
            return 'Customer'


# Accepts review submissions and enforces delivered-order ownership rules.
class ReviewCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True)
    order = serializers.IntegerField()

    # Creates one review for a delivered order that contains the product.
    def create(self, validated_data):
        request = self.context['request']
        product = self.context['product']
        order_id = validated_data['order']

        can_review = Order.objects.filter(
            pk=order_id,
            customer=request.user,
            status='delivered',
            items__product=product,
        ).exists()
        if not can_review:
            raise serializers.ValidationError("You can only review products from delivered orders.")

        try:
            review = Review.objects.create(
                product=product,
                customer=request.user,
                order_id=order_id,
                rating=validated_data['rating'],
                comment=validated_data.get('comment', ''),
            )
            return review
        except IntegrityError:
            raise serializers.ValidationError("You have already reviewed this product for that order.")


# Accepts the producer's text reply to a customer review.
class ProducerResponseSerializer(serializers.Serializer):
    producer_response = serializers.CharField(allow_blank=False)

    # Stores the producer reply and timestamps when it was made.
    def update(self, instance, validated_data):
        instance.producer_response = validated_data['producer_response']
        instance.producer_response_at = timezone.now()
        instance.save(update_fields=['producer_response', 'producer_response_at'])
        return instance

    # This serializer is update-only because producer responses are applied to existing reviews.
    def create(self, validated_data):
        raise NotImplementedError()


# Returns notification subscription details for a customer and product.
class NotificationSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(source='product.id', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = AvailabilitySubscription
        fields = ['product_id', 'product_name', 'notified', 'notified_at', 'created_at']
        read_only_fields = fields


# Returns wholesale price data for a specific buyer type.
class WholesalePriceSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(source='product.id', read_only=True)

    class Meta:
        model = WholesalePrice
        fields = ['product_id', 'buyer_type', 'price', 'minimum_quantity', 'is_active', 'updated_at']
        read_only_fields = fields


# Validates producer input when setting a wholesale price.
class WholesalePriceSetSerializer(serializers.Serializer):
    buyer_type = serializers.ChoiceField(choices=[('restaurant', 'restaurant'), ('community_group', 'community_group')])
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))
    minimum_quantity = serializers.IntegerField(min_value=1, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        product = self.context.get('product')
        if product is not None and attrs['price'] >= product.price:
            raise serializers.ValidationError("Wholesale price must be lower than the standard product price.")
        return attrs
