from rest_framework import serializers
from django.contrib.auth import get_user_model, authenticate
from django.db import transaction
from django.utils import timezone
from .models import ProducerProfile, CustomerProfile

User = get_user_model()


# ============================
# Basic User Serializer (Response Only)
# ============================

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'role']
        read_only_fields = ['id', 'email', 'role']


# ============================
# Producer Registration (TC-001)
# ============================

class ProducerRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    # ProducerProfile fields
    business_name = serializers.CharField(max_length=200)
    contact_name = serializers.CharField(max_length=200)
    phone_number = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True
    )
    address = serializers.CharField()
    postcode = serializers.CharField(max_length=10)

    class Meta:
        model = User
        fields = [
            'email',
            'password',
            'password_confirm',
            'business_name',
            'contact_name',
            'phone_number',
            'address',
            'postcode',
        ]

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        return data

    @transaction.atomic
    def create(self, validated_data):
        # Remove profile + confirm fields before creating User
        password = validated_data.pop('password')
        validated_data.pop('password_confirm')

        business_name = validated_data.pop('business_name')
        contact_name = validated_data.pop('contact_name')
        phone_number = validated_data.pop('phone_number', '')
        address = validated_data.pop('address')
        postcode = validated_data.pop('postcode')

        # Use email as username to ensure uniqueness
        email = validated_data['email']
        username = email

        user = User.objects.create_user(
            email=email,
            username=username,
            password=password,
            role='producer'
        )

        ProducerProfile.objects.create(
            user=user,
            business_name=business_name,
            contact_name=contact_name,
            phone_number=phone_number,
            address=address,
            postcode=postcode
        )

        return user


# ============================
# Customer Registration (TC-002)
# ============================

class CustomerRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    # CustomerProfile fields
    full_name = serializers.CharField(max_length=200)
    phone_number = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True
    )
    delivery_address = serializers.CharField()
    postcode = serializers.CharField(max_length=10)
    terms_accepted = serializers.BooleanField()

    class Meta:
        model = User
        fields = [
            'email',
            'password',
            'password_confirm',
            'full_name',
            'phone_number',
            'delivery_address',
            'postcode',
            'terms_accepted',
        ]

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )

        if not data.get('terms_accepted'):
            raise serializers.ValidationError(
                {"terms_accepted": "You must accept the terms and conditions."}
            )

        return data

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop('password')
        validated_data.pop('password_confirm')

        full_name = validated_data.pop('full_name')
        phone_number = validated_data.pop('phone_number', '')
        delivery_address = validated_data.pop('delivery_address')
        postcode = validated_data.pop('postcode')
        terms_accepted = validated_data.pop('terms_accepted')

        # Use email as username to ensure uniqueness
        email = validated_data['email']
        username = email

        user = User.objects.create_user(
            email=email,
            username=username,
            password=password,
            role='customer'
        )

        CustomerProfile.objects.create(
            user=user,
            full_name=full_name,
            phone_number=phone_number,
            delivery_address=delivery_address,
            postcode=postcode,
            terms_accepted=terms_accepted,
            terms_accepted_at=timezone.now()
        )

        return user


# ============================
# Login Serializer (TC-022)
# ============================

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email = data.get('email')
        password = data.get('password')

        user = authenticate(username=email, password=password)

        if not user:
            raise serializers.ValidationError(
                "Invalid email or password."
            )

        if not user.is_active:
            raise serializers.ValidationError(
                "Account is disabled."
            )

        data['user'] = user
        return data


# ============================
# User Profile Serializer (Profile View)
# ============================

class ProducerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProducerProfile
        fields = ['business_name', 'contact_name', 'phone_number', 'address', 'postcode', 'crn','description', 'food_hygiene_rating', 'created_at']

class CustomerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerProfile
        fields = ['full_name', 'phone_number', 'delivery_address', 'postcode', 'terms_accepted', 'terms_accepted_at', 'created_at']
        read_only_fields = ['terms_accepted', 'terms_accepted_at', 'created_at']

class UserProfileSerializer(serializers.ModelSerializer):
    producer_profile = ProducerProfileSerializer(read_only=True)
    customer_profile = CustomerProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'role', 'producer_profile', 'customer_profile', 'date_joined']


class CustomerProfileUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, required=False)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    delivery_address = serializers.CharField(required=False)
    postcode = serializers.CharField(max_length=10, required=False)

    def update(self, profile, validated_data):
        for field, value in validated_data.items():
            setattr(profile, field, value)
        profile.save()
        return profile