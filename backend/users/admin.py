# Import Django's admin module — lets us register models to appear in the admin panel
from django.contrib import admin
# Import Django's built-in UserAdmin — gives us the proper user admin interface with password handling
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
# Import our three models from this app
from .models import User, ProducerProfile, CustomerProfile


# Custom admin configuration for our User model
@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """
    Extends Django's built-in UserAdmin to show our custom role field.
    BaseUserAdmin gives us password hashing in admin, permission checkboxes, etc.
    """

    # Columns shown in the user list page — what you see when you click "Users" in admin
    list_display = ('email', 'role', 'is_active', 'date_joined')
    # Filter sidebar — lets you filter the user list by role or active status
    list_filter = ('role', 'is_active')
    # Which fields are searchable from the search bar
    search_fields = ('email', 'username')
    # Default sort order — newest users first
    ordering = ('-date_joined',)

    # Fields shown on the ADD USER page — this is what was missing
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'username', 'password1', 'password2', 'role'),
        }),
    )

    # Fields shown on the EDIT USER page — organised in sections
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('username', 'first_name', 'last_name')}),
        ('Role', {'fields': ('role',)}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )


# Admin configuration for ProducerProfile
@admin.register(ProducerProfile)
class ProducerProfileAdmin(admin.ModelAdmin):
    # Columns shown in the producer list page
    list_display = ('business_name', 'contact_name', 'postcode', 'created_at')
    # Searchable fields
    search_fields = ('business_name', 'contact_name', 'postcode')


# Admin configuration for CustomerProfile
@admin.register(CustomerProfile)
class CustomerProfileAdmin(admin.ModelAdmin):
    # Columns shown in the customer list page
    list_display = ('full_name', 'postcode', 'terms_accepted', 'created_at')
    # Searchable fields
    search_fields = ('full_name', 'postcode')
    # Filter sidebar — handy to see who has/hasn't accepted terms
    list_filter = ('terms_accepted',)