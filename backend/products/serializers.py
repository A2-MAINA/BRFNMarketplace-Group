from rest_framework import serializers
from .models import Product, Category, Allergen


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'description']


class ProductSerializer(serializers.ModelSerializer):
    """Matches teammate's Product model; exposes image_url and stock for frontend compatibility."""
    category_name = serializers.CharField(source='category.name', read_only=True)
    # Frontend expects image_url (URL string) and stock; model has image (ImageField) and stock_quantity
    image_url = serializers.SerializerMethodField()
    stock = serializers.IntegerField(source='stock_quantity', read_only=True)
    # Allow blank description; create() will substitute placeholder so model is satisfied
    description = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'price', 'category', 'category_name',
            'unit', 'availability', 'stock_quantity', 'stock', 'image', 'image_url',
            'origin_location', 'is_organic', 'storage_instructions',
            'producer', 'harvest_date', 'production_date', 'best_before',
            'allergens', 'created_at',
        ]
        read_only_fields = ['producer', 'created_at']
        # Frontend (Add Product) only sends name, description, price, category, stock, image_url
        extra_kwargs = {
            'unit': {'required': False},
            'availability': {'required': False},
            'stock_quantity': {'required': False},
            'image': {'required': False},
            'origin_location': {'required': False},
            'is_organic': {'required': False},
            'storage_instructions': {'required': False},
            'harvest_date': {'required': False},
            'production_date': {'required': False},
            'best_before': {'required': False},
            'allergens': {'required': False},
        }

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return ''

    def create(self, validated_data):
        # Frontend sends 'stock' and 'image_url'; model uses stock_quantity and image
        validated_data.pop('image_url', None)
        stock = self.initial_data.get('stock')
        if stock is not None:
            validated_data['stock_quantity'] = int(stock) if int(stock) >= 0 else 1
        # Description is required by model; allow blank from API and default to placeholder
        if not (validated_data.get('description') or '').strip():
            validated_data['description'] = 'No description provided'
        # Defaults for required fields when frontend sends minimal payload (Sprint 1 Add Product)
        validated_data.setdefault('unit', 'each')
        validated_data.setdefault('availability', 'in_season')
        validated_data.setdefault('stock_quantity', 1)
        validated_data.setdefault('origin_location', 'Not specified')
        validated_data.setdefault('is_organic', False)
        validated_data.setdefault('storage_instructions', 'See product description.')
        return super().create(validated_data)
