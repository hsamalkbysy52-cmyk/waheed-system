import os
from datetime import datetime, timedelta
from sqlalchemy.orm import Session


def _log_cancellation(order_id: int, cashier: str, db: Session):
    from database.models import CancellationLog
    db.add(CancellationLog(order_id=order_id, cashier=cashier))
    db.commit()


def _cancellations_last_hour(cashier: str, db: Session) -> int:
    from database.models import CancellationLog
    cutoff = datetime.now() - timedelta(hours=1)
    return (
        db.query(CancellationLog)
        .filter(
            CancellationLog.cashier == cashier,
            CancellationLog.cancelled_at >= cutoff,
        )
        .count()
    )


def send_whatsapp_alert(message: str):
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    owner_phone = os.getenv("OWNER_PHONE", "")
    from_number = os.getenv("TWILIO_FROM_NUMBER", "whatsapp:+14155238886")

    if not all([account_sid, auth_token, owner_phone]):
        print(f"[FraudAgent] Alert skipped — missing credentials. Message: {message}")
        return

    try:
        from twilio.rest import Client
        client = Client(account_sid, auth_token)
        client.messages.create(
            from_=from_number,
            to=f"whatsapp:{owner_phone}",
            body=message,
        )
        print(f"[FraudAgent] WhatsApp alert sent to owner.")
    except Exception as e:
        print(f"[FraudAgent] Failed to send alert: {e}")


def run_fraud_check(order_id: int, cashier: str, db: Session) -> bool:
    """Log cancellation, return True and alert owner if fraud pattern detected."""
    _log_cancellation(order_id, cashier, db)

    count = _cancellations_last_hour(cashier, db)
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
