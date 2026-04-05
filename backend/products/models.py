from django.conf import settings
from django.db import models
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


class Review(models.Model):
    """
    Customer review for a product after a delivered order.
    
    UK Legal compliance:
    - Consumer Rights Act 2015: only customers who purchased the product can review
    - UK GDPR: customer name anonymised in public display (first name + last initial only)
    
    Covers TC-023 (product reviews) and TC-024 (producer response to reviews).
    """

    RATING_CHOICES = [
        (1, '1 Star'),
        (2, '2 Stars'),
        (3, '3 Stars'),
        (4, '4 Stars'),
        (5, '5 Stars'),
    ]

    # Which product is being reviewed
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='reviews'
    )

    # Who wrote the review — must be a customer with a delivered order for this product
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='reviews'
    )

    # Which order this review is for — used to verify purchase before allowing review
    # String reference avoids circular import between products and orders apps
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='reviews'
    )

    # Star rating 1-5 — enforced at model level with choices
    rating = models.PositiveIntegerField(choices=RATING_CHOICES)

    # Optional written review — blank=True because a star rating alone is valid
    comment = models.TextField(blank=True, default='')

    # TC-024 — producer can publicly respond to this review
    # blank=True because most reviews will not have a response initially
    producer_response = models.TextField(blank=True, default='')

    # Timestamp for when the producer responded — null until a response is added
    producer_response_at = models.DateTimeField(null=True, blank=True)

    # When the review was submitted
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # One review per customer per product per order — prevents spam reviews
        # A customer who orders the same product twice can leave two reviews (one per order)
        unique_together = ('product', 'customer', 'order')
        ordering = ['-created_at']

    def __str__(self):
        return (
            f"{self.customer.email} — {self.product.name} — "
            f"{self.rating} star{'s' if self.rating != 1 else ''}"
        )


class Notification(models.Model):
    """
    Tracks customer subscriptions for out-of-season product availability.
    
    When a customer sees a product marked as out_of_season, they can subscribe
    to be notified when the producer marks it back as in_season.
    
    Triggered via Django signals — when Product.availability changes to in_season,
    all Notification records for that product with notified=False are updated.
    
    Covers TC-016 (seasonal availability notifications).
    """

    # Which product the customer is watching
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='notifications'
    )

    # Which customer subscribed — must be authenticated
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )

    # False = waiting to be notified. True = notification has been sent.
    # Once notified, the subscription is considered fulfilled.
    notified = models.BooleanField(default=False)

    # When the notification was triggered — null until product comes back in season
    notified_at = models.DateTimeField(null=True, blank=True)

    # When the customer subscribed
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # One subscription per customer per product
        # Prevents a customer subscribing multiple times to the same product
        unique_together = ('product', 'customer')
        ordering = ['-created_at']

    def __str__(self):
        status = 'Notified' if self.notified else 'Waiting'
        return f"{self.customer.email} watching {self.product.name} — {status}"


class WholesalePrice(models.Model):
    """
    Allows producers to set special wholesale prices for restaurant and
    community group buyers.
    
    Standard customers always see the regular Product.price.
    Restaurant and community group users see the wholesale price instead
    when it exists and they meet the minimum quantity requirement.
    
    Covers TC-019 (community group bulk ordering) and TC-020 (restaurant wholesale pricing).
    """

    BUYER_TYPE_CHOICES = [
        ('restaurant', 'Restaurant'),
        ('community_group', 'Community Group'),
    ]

    # Which product this wholesale price applies to
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='wholesale_prices'
    )

    # Which buyer type gets this price — restaurant or community group
    # Matches the role values in User.ROLE_CHOICES exactly
    buyer_type = models.CharField(max_length=20, choices=BUYER_TYPE_CHOICES)

    # The discounted wholesale price — must be less than Product.price
    # Validated in the serializer, not the model — keeps model clean
    price = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )

    # Minimum quantity the buyer must order to qualify for wholesale price
    # Default 1 — producer can set higher minimums (e.g. minimum 10 kg for restaurant pricing)
    minimum_quantity = models.PositiveIntegerField(default=1)

    # Producer can temporarily disable without deleting the record
    is_active = models.BooleanField(default=True)

    # When this wholesale price was created
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # One wholesale price per product per buyer type
        # A producer cannot set two different restaurant prices for the same product
        unique_together = ('product', 'buyer_type')
        ordering = ['buyer_type']

    def __str__(self):
        return (
            f"{self.product.name} — {self.get_buyer_type_display()} — "
            f"£{self.price} (min {self.minimum_quantity})"
        )
