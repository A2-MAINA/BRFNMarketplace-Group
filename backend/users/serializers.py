from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from .models import ProducerProfile, CustomerProfile


# Eugene Dalla — Backend API & Business Logic: auth + profile serializers

User = get_user_model()


class ProducerRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    business_name = serializers.CharField()
    contact_name = serializers.CharField()
    phone_number = serializers.CharField(allow_blank=True, required=False)
    address = serializers.CharField()
    postcode = serializers.CharField()
    crn = serializers.CharField(allow_blank=True, required=False)
    description = serializers.CharField(allow_blank=True, required=False)
    food_hygiene_rating = serializers.IntegerField(required=False, allow_null=True)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already in use.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")

        user = User.objects.create_user(
            email=validated_data["email"],
            password=password,
            role="producer",
        )

        ProducerProfile.objects.create(
            user=user,
            business_name=validated_data["business_name"],
            contact_name=validated_data["contact_name"],
            phone_number=validated_data.get("phone_number", ""),
            address=validated_data["address"],
            postcode=validated_data["postcode"],
            crn=validated_data.get("crn", ""),
            description=validated_data.get("description", ""),
            food_hygiene_rating=validated_data.get("food_hygiene_rating"),
        )

        return user


class CustomerRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    first_name = serializers.CharField()
    last_name = serializers.CharField()
    phone_number = serializers.CharField(allow_blank=True, required=False)
    delivery_address = serializers.CharField()
    postcode = serializers.CharField()
    terms_accepted = serializers.BooleanField()

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already in use.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        if not attrs.get("terms_accepted"):
            raise serializers.ValidationError({"terms_accepted": "You must accept the terms and conditions."})
        validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")

        terms_accepted = validated_data.pop("terms_accepted")

        user = User.objects.create_user(
            email=validated_data["email"],
            password=password,
            role="customer",
            first_name=validated_data["first_name"].strip(),
            last_name=validated_data["last_name"].strip(),
        )

        full_name = f"{validated_data['first_name'].strip()} {validated_data['last_name'].strip()}".strip()
        CustomerProfile.objects.create(
            user=user,
            full_name=full_name,
            phone_number=validated_data.get("phone_number", ""),
            delivery_address=validated_data["delivery_address"],
            postcode=validated_data["postcode"],
            terms_accepted=terms_accepted,
            terms_accepted_at=timezone.now() if terms_accepted else None,
        )

        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    # Eugene Dalla — Backend API: login endpoint
    def validate(self, attrs):
        user = authenticate(email=attrs["email"], password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid credentials.")
        if not user.is_active:
            raise serializers.ValidationError("Account is inactive.")
        attrs["user"] = user
        return attrs


class UserProfileSerializer(serializers.ModelSerializer):
    # Eugene Dalla — Backend API: profile payload for frontend
    role = serializers.CharField(read_only=True)
    # Display name from role-specific profile (customer full_name, producer contact_name)
    name = serializers.SerializerMethodField()
    business_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "role", "first_name", "last_name", "name", "business_name"]

    def get_name(self, user):
        if user.role == "customer":
            # Prefer User.first_name/last_name (DB columns); fallback to profile.full_name for legacy
            full = " ".join(p for p in [user.first_name, user.last_name] if p).strip()
            if full:
                return full
            if hasattr(user, "customer_profile"):
                return user.customer_profile.full_name
            return user.email
        if user.role == "producer" and hasattr(user, "producer_profile"):
            return user.producer_profile.contact_name
        parts = [user.first_name, user.last_name]
        return " ".join(p for p in parts if p).strip() or user.email

    def get_business_name(self, user):
        if user.role == "producer" and hasattr(user, "producer_profile"):
            return user.producer_profile.business_name
        return None

