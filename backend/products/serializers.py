from rest_framework import serializers
from .models import Product, Category, Allergen

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
