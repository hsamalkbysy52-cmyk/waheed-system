import os
import threading
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_client = None


def get_client():
    return _client


def start_whatsapp_client(openai_key: str, session_path: str = "/data/wa_session.db"):
    """
    Start the WhatsApp Web client in a daemon thread.
    On first run: prints a QR code to the console — scan it with WhatsApp.
    On subsequent runs: resumes the saved session automatically.
    """
    global _client

    try:
        from neonize.client import NewClient
        from neonize.events import MessageEv

        Path(session_path).parent.mkdir(parents=True, exist_ok=True)

        _client = NewClient(session_path)

        @_client.event(MessageEv)
        def on_message(client: NewClient, message):
            try:
                # Skip messages sent by us
                if message.Info.MessageSource.IsFromMe:
                    return

                # Extract plain text from different message types
                text = (
                    message.Message.Conversation
                    or (message.Message.ExtendedTextMessage.Text if message.Message.HasField("ExtendedTextMessage") else "")
                ).strip()

                if not text:
                    return

                sender = message.Info.MessageSource.Chat
                logger.info(f"📩 WhatsApp message from {sender}: {text[:80]}")

                from agents.whatsapp_agent import process_whatsapp_message
                reply = process_whatsapp_message(text, openai_key)

                if reply:
                    client.reply_message(reply, message.Info.ID, message.Info.MessageSource)
                    logger.info(f"📤 Replied to {sender}")

            except Exception as e:
                logger.error(f"Error processing WhatsApp message: {e}")

        def _run():
            print("\n🚀 WhatsApp client starting — if this is the first run, scan the QR code below:\n")
            _client.connect()

        thread = threading.Thread(target=_run, daemon=True, name="whatsapp-client")
        thread.start()
        logger.info("✅ WhatsApp client thread started")

    except ImportError:
        logger.warning("⚠️  neonize not installed — WhatsApp client disabled")
    except Exception as e:
        logger.error(f"❌ Failed to start WhatsApp client: {e}")


def send_message(to: str, text: str):
    """Send a proactive WhatsApp message (used for fraud alerts to the owner)."""
    global _client

    if _client is None:
        logger.warning(f"[WA] Client not ready — dropping message to {to}: {text}")
        return

    try:
        from neonize.proto.waE2E.WAWebProtobufsE2E_pb2 import Message as WAMessage

        phone = "".join(c for c in to if c.isdigit())
        jid = f"{phone}@s.whatsapp.net"
        _client.send_message(jid, WAMessage(conversation=text))
        logger.info(f"[WA] Alert sent to {jid}")

    except Exception as e:
        logger.error(f"[WA] Failed to send message to {to}: {e}")
