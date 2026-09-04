"""Meta's webhook (ADR-0004; plan §6.4): ``GET`` answers the verification challenge, ``POST``
checks the signature, answers 200 at once and hands each text message to a Celery task inside the
Restaurant that owns the receiving number. Plain Django views: Meta wants the challenge as text."""

import json

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from messaging import whatsapp
from messaging.tasks import process_inbound_message


@csrf_exempt
@require_http_methods(["GET", "POST"])
def whatsapp_webhook(request):
    if request.method == "GET":
        return _verify(request)
    if not whatsapp.signature_is_valid(request.body, request.headers.get("X-Hub-Signature-256")):
        return HttpResponseForbidden("bad signature")
    try:
        payload = json.loads(request.body or b"{}")
    except ValueError:
        return JsonResponse({"status": "ignored"})
    for message in whatsapp.inbound_texts(payload if isinstance(payload, dict) else {}):
        account = whatsapp.account_for(message.phone_number_id)
        if account is None:
            continue  # a number we do not know: acknowledged and ignored
        process_inbound_message.delay(
            account.restaurant.schema_name, message.sender, message.message_id, message.text
        )
    return JsonResponse({"status": "ok"})


def _verify(request):
    if (
        request.GET.get("hub.mode") == "subscribe"
        and settings.WHATSAPP_VERIFY_TOKEN
        and request.GET.get("hub.verify_token") == settings.WHATSAPP_VERIFY_TOKEN
    ):
        return HttpResponse(request.GET.get("hub.challenge", ""), content_type="text/plain")
    return HttpResponseForbidden("verification failed")
