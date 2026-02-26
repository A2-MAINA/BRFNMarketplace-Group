from django.contrib.auth import login, logout
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    ProducerRegisterSerializer,
    CustomerRegisterSerializer,
    LoginSerializer,
    UserProfileSerializer,
)


# Eugene Dalla — Backend API & Business Logic: auth endpoints
# CSRF exempt in urls.py; DRF uses SessionAuthenticationNoCSRF so no CSRF required


class ProducerRegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # no auth for register

    def post(self, request):
        serializer = ProducerRegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            data = UserProfileSerializer(user).data
            return Response(data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomerRegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # no auth for register

    def post(self, request):
        serializer = CustomerRegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            data = UserProfileSerializer(user).data
            return Response(data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # no auth before login

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data["user"]
            login(request, user)
            data = UserProfileSerializer(user).data
            return Response(data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out."}, status=status.HTTP_200_OK)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    # Eugene Dalla — Backend API: profile endpoint consumed by frontend
    def get(self, request):
        data = UserProfileSerializer(request.user).data
        return Response(data, status=status.HTTP_200_OK)
