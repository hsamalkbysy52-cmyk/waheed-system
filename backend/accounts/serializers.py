"""Input validation for the account routes, with the legacy API's Arabic messages and its order of
checks: restaurant name, email format, password length, then email uniqueness."""

import re

from rest_framework import serializers

from accounts.models import User
from core import messages

# The legacy API's EMAIL_RE, kept so the same inputs pass and fail.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterSerializer(serializers.Serializer):
    restaurant_name = serializers.CharField(
        allow_blank=True, error_messages={"required": messages.RESTAURANT_NAME_REQUIRED}
    )
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.CharField(
        error_messages={"required": messages.INVALID_EMAIL, "blank": messages.INVALID_EMAIL}
    )
    password = serializers.CharField(
        trim_whitespace=False,
        error_messages={
            "required": messages.PASSWORD_TOO_SHORT,
            "blank": messages.PASSWORD_TOO_SHORT,
        },
    )

    def validate_restaurant_name(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError(messages.RESTAURANT_NAME_REQUIRED)
        return value

    def validate_email(self, value: str) -> str:
        value = User.objects.normalize_email(value)
        if not EMAIL_RE.match(value):
            raise serializers.ValidationError(messages.INVALID_EMAIL)
        return value

    def validate_password(self, value: str) -> str:
        if len(value) < 6:
            raise serializers.ValidationError(messages.PASSWORD_TOO_SHORT)
        return value

    def validate(self, attrs: dict) -> dict:
        if User.objects.filter(email=attrs["email"]).exists():
            raise serializers.ValidationError(messages.EMAIL_TAKEN)
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.CharField(
        error_messages={"required": messages.WRONG_CREDENTIALS, "blank": messages.WRONG_CREDENTIALS}
    )
    password = serializers.CharField(
        trim_whitespace=False,
        error_messages={
            "required": messages.WRONG_CREDENTIALS,
            "blank": messages.WRONG_CREDENTIALS,
        },
    )
