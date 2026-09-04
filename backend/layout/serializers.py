"""Input validation and output shaping for the Table layout routes (plan §1.3, routes 36, 37).

The payload is the legacy one: the tables page sends every element with ``table_number`` and
``capacity`` as null for walls and doors and ``label`` as the Zone name or an empty string.
"""

from rest_framework import serializers

from layout.models import TableLayoutElement


class LayoutElementSerializer(serializers.Serializer):
    element_id = serializers.CharField(max_length=50)
    element_type = serializers.CharField(max_length=20)
    x = serializers.FloatField()
    y = serializers.FloatField()
    w = serializers.FloatField()
    h = serializers.FloatField()
    table_number = serializers.IntegerField(required=False, allow_null=True, default=None)
    capacity = serializers.IntegerField(required=False, allow_null=True, default=None)
    label = serializers.CharField(
        max_length=100, required=False, allow_blank=True, allow_null=True, default=""
    )


class LayoutSavePayloadSerializer(serializers.Serializer):
    elements = LayoutElementSerializer(many=True)


def serialize_element(element: TableLayoutElement) -> dict:
    return {
        "element_id": element.element_id,
        "element_type": element.element_type,
        "x": element.x,
        "y": element.y,
        "w": element.w,
        "h": element.h,
        "table_number": element.table_number,
        "capacity": element.capacity,
        "label": element.label or "",
    }
