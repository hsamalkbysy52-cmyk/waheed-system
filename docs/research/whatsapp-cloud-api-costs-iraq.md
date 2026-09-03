# WhatsApp channel options for the ordering bot — cost facts (Iraq, +964)

Researched 2026-09-03 from Meta, Twilio and 360dialog primary sources. Meta states its rates are "effective July 1, 2026".

## 1. Meta Cloud API per-message prices (recipient in Iraq)

- Iraq is priced under **"Rest of Middle East"** (Bahrain, Iraq, Jordan, Kuwait, Lebanon, Oman, Yemen). — https://developers.facebook.com/docs/whatsapp/pricing
- Rest of Middle East, USD per delivered template message: **Marketing $0.0341**, **Utility $0.0091** (volume tiers down to $0.0068 above 100k/month), **Authentication $0.0091**, **Service $0**. — https://whatsappbusiness.com/products/platform-pricing/
- **Free:** "All non-template messages are free" (inside an open 24 h customer-service window) and "Utility templates delivered within an open customer service window are free." All marketing templates are charged. — https://developers.facebook.com/docs/whatsapp/pricing
- Scheduled change 2026-10-01: Iraq moves off the regional card with **lower** utility and authentication rates. — https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing/

**Implication for us:** a customer who messages the restaurant opens a service window; every bot reply (menu, order confirmation) inside it is free. Only business-initiated messages outside a window cost money: an owner fraud alert as a utility template ≈ **$0.009**.

## 2. Onboarding requirements

- Prerequisites: a Facebook/Meta account, developer registration, a WhatsApp Business Account. — https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
- Business verification is **not** required to send. New business portfolios start with a **250 unique-recipient / 24 h** limit (business-initiated only; replies inside a service window do not count). Tiers 250 → 2,000 → 10,000 → 100,000 → unlimited, raised automatically by quality/volume or by verifying. — https://developers.facebook.com/docs/whatsapp/messaging-limits
- Phone number: must be owned by the business and able to receive SMS/voice; **a number already used in consumer WhatsApp must be deleted from the app first**. — https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers
- A free **test phone number** is auto-generated per app, with relaxed limits and no payment method required (the exact test-recipient cap is not stated on Meta pages). — https://developers.facebook.com/docs/whatsapp/cloud-api/overview
- Webhook: public **HTTPS** URL with a valid certificate (self-signed rejected); GET verification via `hub.verify_token` echoing `hub.challenge`; respond 200 quickly; failed deliveries retried for up to 7 days. — https://developers.facebook.com/docs/graph-api/webhooks/getting-started

## 3. Other Meta fees

- "There is no additional fee to access our platform directly." No hosting, monthly or API fee. — https://whatsappbusiness.com/resources/faq/

## 4. Business Solution Providers (for comparison)

- **Twilio:** $0.005 per message (inbound and outbound) on top of Meta's fees. — https://www.twilio.com/en-us/whatsapp/pricing
- **360dialog:** cheapest plan €49 (≈ $59) per number per month plus Meta fees. — https://www.360dialog.com/pricing

## 5. Unofficial clients (whatsmeow / neonize, WhatsApp Web automation)

- Business terms: businesses "must not … develop or use any applications that interact with our Business Services without our prior written consent"; Meta may "limit, throttle, suspend, or terminate" the account. — https://www.whatsapp.com/legal/business-terms
- Consumer terms ban "bulk messaging, auto-messaging, auto-dialing"; violations may lead to account suspension. — https://www.whatsapp.com/legal/terms-of-service

## Cost model for one restaurant (monthly)

| Scenario | neonize (unofficial) | Cloud API direct | Twilio | 360dialog |
|---|---|---|---|---|
| 1,000 customer conversations, all replies inside windows | $0 (+ban risk, + one always-on worker & volume per restaurant) | **$0** | $10 (2 msgs × 1,000 × $0.005) | $59 |
| + 30 owner fraud alerts (utility templates) | $0 | **$0.27** | $0.42 | $59.27 |

**Recommendation: Meta Cloud API direct.** Ordering traffic is free by construction, the only paid messages are owner alerts at under a cent each, no per-restaurant worker process or volume is needed (one HTTPS webhook + Celery), and it is multi-tenant by design (one business phone number per Restaurant). The unofficial client is suitable only as a local development toy.
