from rest_framework import permissions
from products.models import Product

class IsProducer(permissions.BasePermission):
    """
    Custom permission to only allow producers to access the view.
    """
    # Grants access only to authenticated producer accounts.
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'producer'

class IsCustomer(permissions.BasePermission):
    """
    Custom permission to only allow customers to access the view.
    """
    # Grants access only to authenticated customer accounts.
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'customer'


class IsBuyer(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in {'customer', 'restaurant', 'community_group'}

class IsOwner(permissions.BasePermission):
    """
    Custom permission to only allow owners of an object to edit it.
    Checks for 'user' or 'producer' attribute on the object.
    """
    # Confirms that the current user owns the target object being modified.
    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed to any request,
        # so we'll always allow GET, HEAD or OPTIONS requests.
        # if request.method in permissions.SAFE_METHODS:
        #     return True

        # Write permissions are only allowed to the owner of the snippet.
        if hasattr(obj, 'user'):
            return obj.user == request.user
        if hasattr(obj, 'producer'):
            return obj.producer == request.user
        return False


class IsAdmin(permissions.BasePermission):
    # Grants access only to authenticated admin accounts.
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsRestaurant(permissions.BasePermission):
    # Grants access only to authenticated restaurant accounts.
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'restaurant'


class IsCommunityGroup(permissions.BasePermission):
    # Grants access only to authenticated community group accounts.
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'community_group'


class IsReviewOwner(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user.is_authenticated and request.user.role == 'producer'):
            return False
        product_id = view.kwargs.get('pk')
        if product_id is None:
            return False
        return Product.objects.filter(pk=product_id, producer=request.user).exists()
