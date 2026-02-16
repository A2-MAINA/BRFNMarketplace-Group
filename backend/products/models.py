# Import Django's model field types
from django.db import models


# Product categories for organising the marketplace
# "browse products by category"
class Category(models.Model):
    """
    Product categories for the BRFN marketplace.
    Pre-loaded with: Vegetables, Dairy & Eggs, Bakery, Preserves, Seasonal Specialties.
    """

    # Category name — unique so we can't accidentally create two "Vegetables" categories
    name = models.CharField(max_length=100, unique=True)
    # Optional description of what belongs in this category
    description = models.TextField(blank=True, default='')
    # Auto-set when the category is first created
    created_at = models.DateTimeField(auto_now_add=True)

    # Fix the plural name in admin panel — without this Django shows "Categorys" instead of "Categories"
    class Meta:
        verbose_name_plural = 'Categories'

    # What shows in admin panel — e.g. "Vegetables"
    def __str__(self):
        return self.name