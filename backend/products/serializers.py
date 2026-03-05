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
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    allergens = serializers.PrimaryKeyRelatedField(queryset=Allergen.objects.all(), many=True, required=False)
    # Read-only field to show producer's business name if available
    producer_business_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ['producer', 'created_at']

    def get_producer_business_name(self, obj):
        if hasattr(obj.producer, 'producer_profile'):
            return obj.producer.producer_profile.business_name
        return obj.producer.email
