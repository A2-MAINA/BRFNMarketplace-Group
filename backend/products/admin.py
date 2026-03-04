# Import Django's admin module
from django.contrib import admin
# Import our Category model from this app
from .models import Category, Product, Allergen


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'stock', 'created_at')
    list_filter = ('category',)
    search_fields = ('name',)

    # Admin configuration for Allergen
@admin.register(Allergen)
class AllergenAdmin(admin.ModelAdmin):
    # Columns shown in the allergen list page
    list_display = ('name', 'created_at')
    # Searchable fields
    search_fields = ('name',)


# Admin configuration for Product
@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    # Columns shown in the product list page
    list_display = ('name', 'producer', 'category', 'price', 'unit', 'availability', 'stock_quantity', 'is_organic', 'created_at')
    # Searchable fields
    search_fields = ('name', 'description', 'origin_location')
    # Sidebar filters for quick filtering
    list_filter = ('category', 'availability', 'is_organic')
    # ManyToManyField needs a special widget — horizontal filter for selecting allergens
    filter_horizontal = ('allergens',)