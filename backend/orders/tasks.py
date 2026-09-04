"""Background work of the orders app: the Fraud alert (spec story 48; grilling Q21)."""

import logging
from zoneinfo import ZoneInfo

from django.db import connection
from django.utils import timezone

from core import messages
from core.tasks import tenant_task
from messaging.senders import outbound_sender
from orders.models import CancellationLog
from orders.services import FRAUD_WINDOW
from tenants.models import Restaurant

logger = logging.getLogger("waheed.orders")


@tenant_task
def send_fraud_alert(order_id: int, cashier: str) -> str:
    """Tell the owner that a Cashier tripped the rule. The text is the legacy alert with the
    Restaurant's own name and local time; it goes through the configured sender to the owner's
    WhatsApp number (or the Restaurant's contact phone), or is only logged when neither is known."""
    restaurant = Restaurant.objects.get(schema_name=connection.schema_name)
    since = timezone.now() - FRAUD_WINDOW
    count = CancellationLog.objects.filter(cashier=cashier, cancelled_at__gte=since).count()
    local_time = timezone.now().astimezone(ZoneInfo(restaurant.timezone))
    text = messages.FRAUD_ALERT_MESSAGE.format(
        restaurant=restaurant.name,
        cashier=cashier,
        count=count,
        order_id=order_id,
        time=local_time.strftime("%Y-%m-%d %H:%M"),
    )
    recipient = _owner_phone(restaurant)
    if not recipient:
        logger.warning("fraud alert for %s has no owner phone; logged only: %s", restaurant, text)
        return text
    parameters = [restaurant.name, cashier, str(count), str(order_id)]  # the template's body slots
    outbound_sender().send_alert(recipient, text, parameters)
    return text


def _owner_phone(restaurant: Restaurant) -> str:
    """The WhatsApp account's owner phone when the Restaurant has one, else its contact phone."""
    account = getattr(restaurant, "whatsapp_account", None)
    if account is not None and account.enabled and account.owner_phone:
        return account.owner_phone
    return restaurant.phone
