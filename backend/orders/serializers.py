"""Input validation and output shaping for the order routes (plan §1.3, routes 16, 17, 20 to 28).

Payloads are the legacy ones: the order drawer sends one line per unit with the Modifier options
chosen for it, the customer page the same without a cashier, the edit dialog lines without
modifiers, and the offline queue a ``client_id`` (Idempotency key).
"""

from decimal import Decimal

from rest_framework import serializers

from core.money import amount_payload_field
from core.timestamps import iso_utc
from orders.models import Order


class ModifierLineSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    price_delta = amount_payload_field(required=False, default=Decimal("0"))
    inventory_item_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    quantity_delta = amount_payload_field(required=False, default=Decimal("0"))


class OrderLineSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    price = amount_payload_field()
    category = serializers.CharField(
        max_length=50, required=False, allow_blank=True, allow_null=True, default=""
    )
    modifiers = ModifierLineSerializer(many=True, required=False, default=list)


class OrderCreateSerializer(serializers.Serializer):
    items = OrderLineSerializer(many=True, allow_empty=False)
    table_number = serializers.IntegerField(required=False, default=1)
    cashier = serializers.CharField(
        max_length=100, required=False, allow_blank=True, allow_null=True, default=""
    )
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="")
    payment_method = serializers.ChoiceField(
        choices=Order.PaymentMethod.choices, required=False, allow_null=True, default=None
    )
    client_id = serializers.CharField(
        max_length=36, required=False, allow_blank=True, allow_null=True, default=None
    )


class OrderEditSerializer(serializers.Serializer):
    items = OrderLineSerializer(many=True, allow_empty=False)
    table_number = serializers.IntegerField(required=False, default=1)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="")


class PaymentSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(
        choices=Order.PaymentMethod.choices, required=False, default=Order.PaymentMethod.CASH
    )


def serialize_order(order: Order) -> dict:
    """The full legacy shape, for staff (route 16)."""
    return {
        "id": order.id,
        "table_number": order.table_number,
        "total_price": order.total_price,
        "status": order.status,
        "created_at": iso_utc(order.created_at),
        "items": order.items,
        "cashier": order.cashier or "",
        "notes": order.notes or "",
        "payment_method": order.payment_method or None,
    }


def serialize_order_for_customer(order: Order) -> dict:
    """What a Slug-resolved customer learns about an Open order: that their Table has one
    (spec story 45), and nothing about anyone's food, money or staff."""
    return {"id": order.id, "table_number": order.table_number, "status": order.status}
