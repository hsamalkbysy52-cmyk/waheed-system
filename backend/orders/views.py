"""Order routes (plan §1.3, routes 16, 17, 20 to 28).

Staff (Cashier or Admin, by token) run the kanban, kitchen and payments pages. Customers reach two
of these routes by Slug: ``GET /orders`` tells them only whether their Table has Open orders, and
``POST /orders/create`` (with ``/orders/qr-create`` as its alias) files a Customer order while the
Restaurant is Online (spec stories 43 to 45).
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated

from core import messages
from core.decorators import public_tenant_allowed, tenant_required
from core.exceptions import ServiceUnavailable
from core.middleware import TenantSource
from core.permissions import IsCashierOrAdmin, require_staff
from core.responses import ok
from orders import services
from orders.models import Order
from orders.serializers import (
    OrderCreateSerializer,
    OrderEditSerializer,
    PaymentSerializer,
    QuantityOrderSerializer,
    serialize_order,
    serialize_order_for_customer,
)

STAFF = [IsAuthenticated, IsCashierOrAdmin]


def _validated(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def _is_customer(request) -> bool:
    return request.tenant_source == TenantSource.SLUG


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
@public_tenant_allowed
@tenant_required
def orders_collection(request):
    """``GET /orders`` for staff and, redacted, for customers; ``POST /orders`` is the new
    quantity-based creation the Chat agent's proposals are confirmed through (staff only)."""
    if request.method == "POST":
        require_staff(request)
        return _create_quantity_order(request)
    if _is_customer(request):
        rows = [serialize_order_for_customer(order) for order in services.open_orders()]
        return ok({"orders": rows})
    require_staff(request)
    return ok({"orders": [serialize_order(order) for order in services.orders()]})


def _create_quantity_order(request):
    payload = _validated(QuantityOrderSerializer, request)
    order = services.create_order(
        items=services.expand_quantity_lines(payload["items"]),
        table_number=payload["table_number"],
        cashier=request.user.username,
        notes=payload["notes"],
        payment_method=None,
        client_id=payload["client_id"],
    )
    # The chat bot reads the id under either name (plan §1.3).
    return ok(
        {
            "message": messages.ORDER_SAVED,
            "total": order.total_price,
            "order_id": order.id,
            "id": order.id,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@public_tenant_allowed
@tenant_required
def orders_create(request):
    if _is_customer(request):
        if not request.tenant.is_online:
            raise ServiceUnavailable()
        payload = _validated(OrderCreateSerializer, request)
        # Customer-order rules (spec): the cashier is "QR" and no payment is recorded.
        order = services.create_order(
            **{**payload, "cashier": services.CUSTOMER_CASHIER, "payment_method": None}
        )
    else:
        require_staff(request)
        payload = _validated(OrderCreateSerializer, request)
        cashier = payload["cashier"] or request.user.username
        order = services.create_order(**{**payload, "cashier": cashier})
    return ok({"message": messages.ORDER_SAVED, "total": order.total_price, "order_id": order.id})


@api_view(["PUT"])
@permission_classes(STAFF)
@tenant_required
def order_ready(request, order_id: int):
    services.set_status(order_id, Order.Status.READY, not_found=messages.ORDER_NOT_FOUND_ALT)
    return ok({"message": messages.ORDER_READY})


@api_view(["PUT"])
@permission_classes(STAFF)
@tenant_required
def order_preparing(request, order_id: int):
    services.set_status(order_id, Order.Status.PREPARING)
    return ok({"message": messages.ORDER_BACK_TO_PREPARING})


@api_view(["PUT"])
@permission_classes(STAFF)
@tenant_required
def order_served(request, order_id: int):
    services.set_status(order_id, Order.Status.SERVED)
    return ok({"message": messages.ORDER_SERVED})


@api_view(["PUT"])
@permission_classes(STAFF)
@tenant_required
def order_done(request, order_id: int):
    services.set_status(order_id, Order.Status.DONE, not_found=messages.ORDER_NOT_FOUND_ALT)
    return ok({"message": messages.ORDER_DONE})


@api_view(["PUT"])
@permission_classes(STAFF)
@tenant_required
def order_pay(request, order_id: int):
    services.record_payment(order_id, **_validated(PaymentSerializer, request))
    return ok({"message": messages.PAYMENT_RECORDED})


@api_view(["PUT", "DELETE"])
@permission_classes(STAFF)
@tenant_required
def order_edit_or_cancel(request, order_id: int):
    if request.method == "DELETE":
        cancellation = services.cancel_order(
            order_id, cashier=request.user.username, not_found=messages.ORDER_NOT_FOUND
        )
        return ok(_cancelled(messages.ORDER_DELETED, order_id, cancellation))
    services.edit_order(order_id, **_validated(OrderEditSerializer, request))
    return ok({"message": messages.ORDER_EDITED, "order_id": order_id})


@api_view(["POST"])
@permission_classes(STAFF)
@tenant_required
def order_cancel(request, order_id: int):
    """Cancel with an audit trail. The legacy ``?cashier=`` query parameter is accepted but the
    log records the token's username, which cannot be spoofed (spec story 34)."""
    cancellation = services.cancel_order(
        order_id, cashier=request.user.username, not_found=messages.ORDER_NOT_FOUND_ALT
    )
    return ok(_cancelled(messages.ORDER_CANCELLED, order_id, cancellation))


def _cancelled(message: str, order_id: int, cancellation: services.Cancellation) -> dict:
    body = {"message": message, "order_id": order_id}
    if cancellation.fraud_alert:  # ticket 10 dispatches the alert from here
        body["fraud_alert"] = messages.FRAUD_ALERT.format(cashier=cancellation.cashier)
    return body
