# Import Django's admin module
from django.contrib import admin
# Import our Category model from this app
from .models import Category


# Admin configuration for Category
@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    # Columns shown in the category list page
    list_display = ('name', 'created_at')
    # Searchable fields
    search_fields = ('name',)