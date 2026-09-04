"""Table layout operations, inside the calling Restaurant's schema."""

from django.db import transaction

from layout.models import TableLayoutElement


def layout_elements():
    return TableLayoutElement.objects.all()


@transaction.atomic
def save_layout(elements: list) -> None:
    """Replace the whole floor plan (route 37): an empty list clears it. Atomic, so a failed save
    never leaves the page with half a plan."""
    TableLayoutElement.objects.all().delete()
    TableLayoutElement.objects.bulk_create(
        TableLayoutElement(**{**element, "label": element.get("label") or ""})
        for element in elements
    )


def table_numbers() -> list:
    """The Tables on the plan, for whoever needs to know a Table exists (orders, the QR flow)."""
    return list(
        TableLayoutElement.objects.filter(element_type="table", table_number__isnull=False)
        .order_by("table_number")
        .values_list("table_number", flat=True)
    )
