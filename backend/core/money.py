"""Money and the deltas that travel with it: Decimal with three decimals (plan §3.7).

JOD carries three decimals, so every price, price delta and quantity delta is a
``DecimalField(12, 3)``. Responses carry them as JSON numbers rather than strings: the views build
their output dicts explicitly and DRF's encoder renders a Decimal as a number, which is what the
frontend's ``toLocaleString`` formatting expects.
"""

from django.db import models
from rest_framework import serializers

MAX_DIGITS = 12
DECIMAL_PLACES = 3


def amount_field(**kwargs) -> models.DecimalField:
    """A stored amount: a price, a price delta or a quantity delta."""
    return models.DecimalField(max_digits=MAX_DIGITS, decimal_places=DECIMAL_PLACES, **kwargs)


def amount_payload_field(**kwargs) -> serializers.DecimalField:
    """The same amount in a payload: a JSON number in, a Decimal out."""
    return serializers.DecimalField(max_digits=MAX_DIGITS, decimal_places=DECIMAL_PLACES, **kwargs)
