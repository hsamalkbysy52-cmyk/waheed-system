import os
import sys
from datetime import datetime, timedelta
from sqlalchemy.orm import Session


def _safe_print(text: str):
    """print() يفشل بـ UnicodeEncodeError على كونسولات لا تدعم UTF-8 (مثل cp1252
    بويندوز) عند طباعة إيموجي — وده كان يُسقط طلب /orders/{id}/cancel كامل.
    تنبيه الاحتيال أهم من نجاح سطر log، فلا يصح أن يفشل أحدهما الثاني."""
    try:
        print(text)
    except UnicodeEncodeError:
        encoding = getattr(sys.stdout, "encoding", None) or "ascii"
        print(text.encode(encoding, errors="replace").decode(encoding))


def _log_cancellation(order_id: int, cashier: str, db: Session, restaurant_id: int):
    from database.models import CancellationLog
    from database.tenant import tenant_add
    tenant_add(db, CancellationLog(order_id=order_id, cashier=cashier), restaurant_id)
    db.commit()


def _cancellations_last_hour(cashier: str, db: Session, restaurant_id: int) -> int:
    from database.models import CancellationLog
    from database.tenant import tenant_query
    cutoff = datetime.now() - timedelta(hours=1)
    return (
        tenant_query(db, CancellationLog, restaurant_id)
        .filter(
            CancellationLog.cashier == cashier,
            CancellationLog.cancelled_at >= cutoff,
        )
        .count()
    )


def send_whatsapp_alert(message: str):
    """Send a WhatsApp alert to the owner via the Python WhatsApp client."""
    owner_phone = os.getenv("OWNER_PHONE", "")

    if not owner_phone:
        _safe_print(f"[FraudAgent] Alert (OWNER_PHONE not set): {message}")
        return

    try:
        from agents.whatsapp_client import send_message
        send_message(owner_phone, message)
        _safe_print("[FraudAgent] WhatsApp alert sent to owner.")
    except Exception as e:
        _safe_print(f"[FraudAgent] Failed to send alert: {e}")


def run_fraud_check(order_id: int, cashier: str, db: Session, restaurant_id: int) -> bool:
    """Log cancellation, return True and alert owner if fraud pattern detected."""
    _log_cancellation(order_id, cashier, db, restaurant_id)

    count = _cancellations_last_hour(cashier, db, restaurant_id)
    if count >= 3:
        message = (
            f"🚨 تحذير احتيال - مطعم Waheed\n"
            f"الكاشير '{cashier}' ألغى {count} طلبات خلال ساعة واحدة.\n"
            f"آخر إلغاء: طلب #{order_id}\n"
            f"الوقت: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        )
        send_whatsapp_alert(message)
        return True
    return False
