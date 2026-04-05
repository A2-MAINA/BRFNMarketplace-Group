# Import Django's admin module
from django.contrib import admin
# Import our Category model from this app
from .models import Category, Product, Allergen, Review, Notification, WholesalePrice


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


# Admin configuration for Allergen
@admin.register(Allergen)
class AllergenAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


# Admin configuration for Product (single registration)
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

@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'product_name', 'customer_email',
        'rating', 'has_response', 'created_at'
    )
    list_filter = ('rating', 'created_at')
    search_fields = ('product__name', 'customer__email', 'comment')
    readonly_fields = ('product', 'customer', 'order', 'created_at')

    def product_name(self, obj):
        return obj.product.name
    product_name.short_description = 'Product'

    def customer_email(self, obj):
        return obj.customer.email
    customer_email.short_description = 'Customer'

    def has_response(self, obj):
        return bool(obj.producer_response)
    has_response.boolean = True
    has_response.short_description = 'Producer Responded'


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'customer_email', 'product_name',
        'notified', 'notified_at', 'created_at'
    )
    list_filter = ('notified', 'created_at')
    search_fields = ('customer__email', 'product__name')
    readonly_fields = ('product', 'customer', 'created_at')

    def customer_email(self, obj):
        return obj.customer.email
    customer_email.short_description = 'Customer'

    def product_name(self, obj):
        return obj.product.name
    product_name.short_description = 'Product'


@admin.register(WholesalePrice)
class WholesalePriceAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'product_name', 'buyer_type',
        'price', 'minimum_quantity', 'is_active', 'created_at'
    )
    list_filter = ('buyer_type', 'is_active')
    search_fields = ('product__name',)

    def product_name(self, obj):
        return obj.product.name
    product_name.short_description = 'Product'
