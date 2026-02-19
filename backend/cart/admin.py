# Import Django's admin module
from django.contrib import admin
# Import our Cart models
from .models import Cart, CartItem


# Show cart items inline inside the Cart admin page — no need to manage them separately
class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    readonly_fields = ('added_at',)


# Admin configuration for Cart
@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    # Columns shown in the cart list page
    list_display = ('customer', 'created_at', 'updated_at')
    # Searchable fields
    search_fields = ('customer__email',)
    # Show cart items inside the cart page
    inlines = [CartItemInline]

    # Key thing here — CartItemInline with TabularInline means when you open a cart in 
    # admin, you see all the items inside it in a table. 
    # No need for a separate CartItem admin page. This is how real e-commerce admin panels work — you view the cart and its items together.