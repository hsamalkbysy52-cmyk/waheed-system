"""JWT issuing. Claims carry ``role``, ``restaurant_id`` and ``username`` exactly as the legacy
token did (plan §3.5), on top of Simple JWT's own; lifetimes come from SIMPLE_JWT (8 h / 30 d)."""

from typing import NamedTuple

from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User


class TokenPair(NamedTuple):
    access: str
    refresh: str


def issue_tokens(user: User) -> TokenPair:
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    refresh["restaurant_id"] = user.restaurant_id
    refresh["username"] = user.username
    return TokenPair(access=str(refresh.access_token), refresh=str(refresh))
