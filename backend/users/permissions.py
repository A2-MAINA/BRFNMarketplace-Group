from rest_framework import permissions

class IsProducer(permissions.BasePermission):
    """
    Custom permission to only allow producers to access the view.
    """
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'producer'

class IsCustomer(permissions.BasePermission):
    """
    Custom permission to only allow customers to access the view.
    """
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'customer'

class IsOwner(permissions.BasePermission):
    """
    Custom permission to only allow owners of an object to edit it.
    Checks for 'user' or 'producer' attribute on the object.
    """
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
