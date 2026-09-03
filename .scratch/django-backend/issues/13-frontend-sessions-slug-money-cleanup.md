# 13: Frontend: sessions, Slug, money and cleanup

**What to build:** The existing UI works against the new API for every role; QR links identify the Restaurant; sessions refresh and expire cleanly; money shows the Restaurant's currency; dead and unsafe code is gone.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Table QR links include the Slug obtained from `/me`; the customer page and its proxies forward the Slug header; offline and unavailable messages are shown to the customer
- [ ] The dashboard sends the question in the request body and has no key input
- [ ] The authenticated fetch helper refreshes once on 401 and otherwise clears the session and redirects to login; Heartbeats fire only when a token exists; the offline sync treats 401 as retry after login
- [ ] A single money formatter uses currency and decimals from `/me` and replaces every hard-coded dinar label; the old orders page shows Open orders instead of pending and computes revenue from Paid, non-cancelled Orders
- [ ] The debug route, the QR-create proxy, the unused chat proxy method, the unused store order fetch and the public OpenAI key fallback are removed; every call imports the base URL from one module
- [ ] Type check and production build pass; the parity checklist (contract table and page list from the plan) is walked and recorded in this ticket's comments
