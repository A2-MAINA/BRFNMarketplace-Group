from rest_framework.permissions import BasePermission, SAFE_METHODS


# Eugene Dalla — Backend API & Business Logic: role-based permissions


class IsProducer(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "role", None) == "producer")


class IsCustomer(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "role", None) == "customer")


class IsOwner(BasePermission):
    """
    Generic owner check used for resources linked to a user.
    Tries obj.user, then obj.cart.user as a simple heuristic.
    """

    # Eugene Dalla — Backend API: ownership checks for cart and future resources
    def has_object_permission(self, request, view, obj):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        owner = getattr(obj, "user", None)
        if owner is None and hasattr(obj, "cart"):
            owner = getattr(obj.cart, "user", None)

        return owner == user

