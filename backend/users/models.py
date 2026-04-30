# Import Django's built-in User model as a base — gives us password hashing, sessions, permissions for free
from django.contrib.auth.models import AbstractUser, BaseUserManager
# Import Django's model field types — EmailField, CharField, etc.
from django.db import models


class UserManager(BaseUserManager):
    """Manager for custom User with email as USERNAME_FIELD. Avoids 500 on create_user."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address.")
        email = self.normalize_email(email)
        # Django's auth still expects a unique username; use email so it's always set
        extra_fields.setdefault("username", email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "admin")
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


# Our custom User model — inherits everything from AbstractUser and adds role + email login
class User(AbstractUser):
    """
    Custom User model for BRFN Marketplace.
    Uses email as the login identifier instead of username.
    Supports 5 roles: producer, customer, community_group, restaurant, admin.
    """

    # The 5 roles  first value is stored in DB, second is display label
    ROLE_CHOICES = [
        ('producer', 'Producer'),               # TC-001: producer registration
        ('customer', 'Customer'),               # TC-002: customer registration
        ('community_group', 'Community Group'), # TC-017: bulk orders for schools etc.
        ('restaurant', 'Restaurant'),           # TC-018: recurring weekly orders
        ('admin', 'Admin'),                     # TC-025: commission monitoring
    ]

    # Override default email field to make it unique — needed because email is now the login identifier
    email = models.EmailField(unique=True)
    # Store which type of user this is — max_length=20 fits 'community_group' (15 chars) with room to spare
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)

    # Tell Django auth system: use email to log in, not username 
    USERNAME_FIELD = 'email'
    # Django requires this when USERNAME_FIELD is changed — username still exists but is auto-generated, users never type it
    REQUIRED_FIELDS = ['username']

    objects = UserManager()

    # What shows in admin panel and print statements — e.g. "jane.smith@bristolvalleyfarm.com (Producer)"
    def __str__(self):
        # get_role_display() converts 'producer' to 'Producer' using the ROLE_CHOICES labels
        return f"{self.email} ({self.get_role_display()})"
    

    # Producer's business profile — linked to User via OneToOneField
# Satisfies TC-001: business name, contact name, phone, address, postcode
class ProducerProfile(models.Model):
    """
    Stores business information for producer accounts.
    Created when a producer registers. One profile per user.
    """

    # Links this profile to exactly one User — if the User is deleted, the profile is deleted too (CASCADE)
    user = models.OneToOneField(
        User,                           # The model we're linking to
        on_delete=models.CASCADE,       # Delete profile when user is deleted — no orphaned profiles
        related_name='producer_profile'  # Lets us do user.producer_profile to access this from a User object
    )
    # "Enter business name"
    business_name = models.CharField(max_length=255)
    # "Enter contact name"
    contact_name = models.CharField(max_length=255)
    #"Enter phone: 01179 123456"
    phone_number = models.CharField(max_length=20, blank=True, default='')
    # "Enter business address" — TextField for multi-line addresses
    address = models.TextField()
    # "postcode: BS1 4DJ" — also used for food miles calculation in TC-013
    postcode = models.CharField(max_length=10)
    # UK Companies House Registration Number — shows awareness of UK business regulation
    crn = models.CharField(max_length=8, blank=True, default='', verbose_name='Company Registration Number')
    # Producer bio/description for their profile page 
    description = models.TextField(blank=True, default='')
    # UK Food Standards Agency hygiene rating 0-5 — shows awareness of food safety law
    food_hygiene_rating = models.IntegerField(null=True, blank=True, verbose_name='Food Hygiene Rating')
    # Auto-set when the profile is first created — useful for admin and reporting
    created_at = models.DateTimeField(auto_now_add=True)

    # What shows in admin panel "
    def __str__(self):
        return self.business_name
    

    # Customer's personal profile — linked to User via OneToOneField
# full name, phone, delivery address, postcode, terms acceptance
class CustomerProfile(models.Model):
    """
    Stores personal and delivery information for customer accounts.
    Created when a customer registers. One profile per user.
    """

    # Links this profile to exactly one User — same pattern as ProducerProfile
    # Putting all of these on one User model would mean every producer has empty customer fields and vice versa 
    user = models.OneToOneField(
        User,                            # The model we're linking to
        on_delete=models.CASCADE,        # Delete profile when user is deleted
        related_name='customer_profile'  # Lets us do user.customer_profile from a User object
                                        # It also prevents naming conflicts since we have two OneToOneFields pointing to User
    )
    # "Enter full name"
    full_name = models.CharField(max_length=255)

    # "Enter phone: 07700 900123" — optional, CharField for leading zeros
    phone_number = models.CharField(max_length=20, blank=True, default='')

    # "Enter delivery address: 45 Park Street, Bristol" — required per test case
    delivery_address = models.TextField()

    # "Enter postcode: BS1 5JG" — also used for food miles calculation in TC-013
    postcode = models.CharField(max_length=10)

    # "Accept terms and conditions" — must be True to complete registration
    terms_accepted = models.BooleanField(default=False)

    # GDPR Article 7 requires proof of WHEN consent was given — stores the exact timestamp
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    
    # Auto-set when the profile is first created
    created_at = models.DateTimeField(auto_now_add=True)

    # What shows in admin panel — e.g. "Robert Johnson"
    def __str__(self):
        return self.full_name

class RestaurantProfile(models.Model):
    """
    Stores business information for restaurant accounts.
    Created when a restaurant registers.
    Covers TC-020: restaurant wholesale pricing.
    """

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='restaurant_profile'
    )
    # Restaurant or pub name
    business_name = models.CharField(max_length=255)
    # Manager or owner name
    contact_name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=20, blank=True, default='')
    # Delivery address for food orders
    delivery_address = models.TextField()
    postcode = models.CharField(max_length=10)
    # Optional — e.g. Italian, Farm-to-table
    cuisine_type = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.business_name


class CommunityGroupProfile(models.Model):
    """
    Stores organisation information for community group accounts.
    Created when a community group registers.
    Covers TC-019: community group bulk ordering.
    """

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='community_group_profile'
    )
    # Name of the group or organisation
    organisation_name = models.CharField(max_length=255)
    # Name of the coordinator
    contact_name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=20, blank=True, default='')
    # Delivery address for bulk orders
    delivery_address = models.TextField()
    postcode = models.CharField(max_length=10)
    # e.g. Food Bank, School, Charity, Community Kitchen
    group_type = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.organisation_name
