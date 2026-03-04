from django.conf import settings
from django.db import models
# Reference User model via settings instead of importing directly — Django best practice
from django.conf import settings
# Validators for enforcing minimum price (prevents £0.00 or negative prices)
from django.core.validators import MinValueValidator
# Decimal type for precise money handling — floats have rounding issues with currency
from decimal import Decimal


# Product categories for organising the marketplace
# "browse products by category"
class Category(models.Model):
    """
    Product categories for the BRFN marketplace.
    Pre-loaded with: Vegetables, Dairy & Eggs, Bakery, Preserves, Seasonal Specialties.
    """

    # Category name — prevent duplicate values . unique so we can't accidentally create two "Vegetables" categories

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    #We pre-loaded them via the Django shell using get_or_create, which creates the record if it doesn't 
    # exist or retrieves it if it does — safe to run multiple times without creating duplicates.

    # Fix the plural name in admin panel — without this Django shows "Categorys" instead of "Categories"
    # override this to display the correct plural form 'Categories' 
    class Meta:
        verbose_name_plural = 'Categories'

    # What shows in admin panel — e.g. "Vegetables"
    def __str__(self):
        return self.name
    

    # Product listing model
class Product(models.Model):
    

    # Unit choices — standardised measurement units for consistent pricing display
    UNIT_CHOICES = [
        ('each', 'Each'),
        ('dozen', 'Dozen'),
        ('kg', 'Kilogram'),
        ('g', 'Grams'),
        ('lb', 'Pound'),
        ('bunch', 'Bunch'),
        ('bag', 'Bag'),
        ('box', 'Box'),
        ('litre', 'Litre'),
    ]

    # Seasonal availability choices — BRFN is a seasonal food network
    # Pre-order supports TC-016 (seasonal availability, medium priority for later sprints)
    AVAILABILITY_CHOICES = [
        ('in_season', 'In Season'),
        ('out_of_season', 'Out of Season'),
        ('pre_order', 'Pre-Order'),
    ]

    # Core fields 

    # Enter product name
    name = models.CharField(max_length=200)

    # "Product is linked to the authenticated producer"
    # Uses settings.AUTH_USER_MODEL instead of importing User directly — Django best practice
    producer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='products'
    )

    # Select category
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='products'
    )

    # "Enter detailed description"
    description = models.TextField()

    # "Enter price: 
    # max_digits=6, decimal_places=2 allows prices up to £9999.99
    # MinValueValidator prevents £0.00 or negative prices
    #used DecimalField for precise money handling — floats can have rounding issues with currency 
    price = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))] # '0.01' as a string to avoid floating point issues
    )

    # the "per dozen" part — standardised unit choices
    unit = models.CharField(max_length=10, choices=UNIT_CHOICES)

    #  "Set availability
    availability = models.CharField(
        max_length=20,
        choices=AVAILABILITY_CHOICES,
        default='in_season'
    )

    # "Enter stock quantity:
    # Default is 1 — you can't list a product without having at least one
    stock_quantity = models.PositiveIntegerField(default=1)

    # Upload product image (optional)
    image = models.ImageField(upload_to='products/', blank=True, null=True)


    # ── Date fields — optional because different product types use different dates ──

    # Set harvest date: Current date
    harvest_date = models.DateField(blank=True, null=True)

    # For produced goods (bakery, preserves) — BRFN categories include Bakery and Preserves
    production_date = models.DateField(blank=True, null=True)

    # UK food labelling law — best before indicates quality, distinct from use-by which is safety
    best_before = models.DateField(blank=True, null=True)

    # ── Allergens "All 14 major allergens recognised by UK law" ──

    # ManyToManyField because a product can have multiple allergens and one allergen applies to many products
    # blank=True because TC-015 tests for products with no allergens: "Fresh Apples — No common allergens"
    allergens = models.ManyToManyField('Allergen', blank=True, related_name='products')

    # wider context awareness (legal, ethical, environmental) ──

   
    # Required — enforces traceability and supports UK food traceability regulations
    origin_location = models.CharField(max_length=100)

    # producers must actively declare organic status
    # null=True with blank=False means the form won't submit until they explicitly choose Yes or No
    is_organic = models.BooleanField(null=True, blank=False)

    # UK Food Information Regulations 2014 require storage conditions for perishable goods
    storage_instructions = models.TextField()

    # ── Auto timestamp ──

    # Automatically records when the product listing was created — audit trail
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Default ordering — newest products first in queries
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} — {self.producer.email}"
    
    
    # Allergen model "All 14 major allergens recognised by UK law"
class Allergen(models.Model):
    """
    The 14 major allergens from UK Food Information Regulations 2014.
    Pre-loaded with: Celery, Cereals containing gluten, Crustaceans, Eggs,
    Fish, Lupin, Milk, Molluscs, Mustard, Nuts, Peanuts, Sesame, Soybeans,
    Sulphur dioxide.
    """

    # Allergen name — unique to prevent duplicates
    name = models.CharField(max_length=100, unique=True)

    # Optional detail — e.g. "Includes almonds, cashews, walnuts, hazelnuts"
    description = models.TextField(blank=True, default='')

    # Auto-set when the allergen is first created
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
