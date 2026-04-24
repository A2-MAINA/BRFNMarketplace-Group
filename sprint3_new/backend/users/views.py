from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from .serializers import (
    ProducerRegistrationSerializer,
    CustomerRegistrationSerializer,
    LoginSerializer,
    UserSerializer,
    UserProfileSerializer,
    CustomerProfileUpdateSerializer
)
from .authentication import CsrfExemptSessionAuthentication
from products.models import AvailabilitySubscription
from products.serializers import NotificationSerializer
from .permissions import IsCustomer


# Registers new producer accounts.
class ProducerRegistrationView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.AllowAny]

    # Validates producer signup data and creates the user account.
    def post(self, request):
        serializer = ProducerRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# Registers new customer accounts.
class CustomerRegistrationView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.AllowAny]

    # Validates customer signup data and creates the user account.
    def post(self, request):
        serializer = CustomerRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(ensure_csrf_cookie, name='dispatch')
# Logs a user into the session-based API.
class LoginView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.AllowAny]

    # Authenticates the user and starts a session.
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            login(request, user)
            return Response(UserSerializer(user).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# Logs out the current authenticated user.
class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    # Ends the current authenticated session.
    def post(self, request):
        logout(request)
        return Response({"message": "Successfully logged out."}, status=status.HTTP_200_OK)


@method_decorator(ensure_csrf_cookie, name='dispatch')
# Returns and updates the authenticated user's profile.
class ProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    # Returns the current user's profile payload.
    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # Updates the customer profile for supported user roles.
    def patch(self, request):
        user = request.user
        if user.role == 'customer' and hasattr(user, 'customer_profile'):
            serializer = CustomerProfileUpdateSerializer(data=request.data)
            if serializer.is_valid():
                serializer.update(user.customer_profile, serializer.validated_data)
                return Response(UserProfileSerializer(user).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": "Profile update not supported for this role."}, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(ensure_csrf_cookie, name='dispatch')
# Provides an endpoint that sets the CSRF cookie for the frontend.
class CSRFView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    # Returns a simple response once the CSRF cookie has been set.
    def get(self, request):
        return Response({"detail": "CSRF cookie set"})


# Returns notification subscriptions for the current customer.
class NotificationsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    # Marks newly available products as notified and returns the customer's subscriptions.
    def get(self, request):
        subs = AvailabilitySubscription.objects.filter(customer=request.user).select_related('product')
        return Response(NotificationSerializer(subs, many=True).data, status=status.HTTP_200_OK)
