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
            username=validated_data["email"],
            role="producer",
            password=password,
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

    full_name = serializers.CharField()
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
            username=validated_data["email"],
            role="customer",
            password=password,
        )

        CustomerProfile.objects.create(
            user=user,
            full_name=validated_data["full_name"],
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

    class Meta:
        model = User
        fields = ["id", "email", "role", "first_name", "last_name"]

