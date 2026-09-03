# 08: Orders, stock and payments

**What to build:** Cashiers create, edit, move, cancel, pay and close Orders with stock handled atomically and offline replays deduplicated; the kitchen and payments pages work; Heartbeats keep the Restaurant Online.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Order model: Decimal totals, JSON Order lines with captured names and prices, statuses preparing/ready/served/done/cancelled, Payment method, Idempotency key unique per schema, cashier, notes, creation time; Cancellation log model
- [ ] Order service: one atomic pass with row locks; a shortage answers 400 naming the short Menu items; a repeated Idempotency key returns the original Order; positive and negative modifier quantity deltas (floored at zero); editing only while preparing with stock rebalanced; cancelling through either route restores stock only while preparing; the state machine is enforced (done terminal, cancelled reachable from preparing, ready, served)
- [ ] Routes 16, 17, 18 and 21 to 28 match the goldens; creation time keeps the legacy format; recording payment is idempotent under concurrent calls; cancel writes the Cancellation log and returns the fraud flag when three or more cancellations by the same cashier fall within 60 minutes (dispatch is ticket 10)
- [ ] Heartbeat updates the Restaurant's last Heartbeat; Online means within 90 seconds; only token callers may send Heartbeats
- [ ] Tests: every route; two Orders competing for the last unit of stock; idempotent replay; the full status transition matrix; revenue-relevant data (Paid, non-cancelled) visible in responses
