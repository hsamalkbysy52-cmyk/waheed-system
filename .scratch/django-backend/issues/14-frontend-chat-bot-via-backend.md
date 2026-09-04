# 14: Frontend: chat bot through the backend

**What to build:** The floating chat bot talks to the backend Chat agent and confirms orders safely with the staff token.

**Blocked by:** 12, 13

**Status:** implemented (2026-09-05) by a Sonnet subagent on the fast track; type check and production build pass; the manual browser run is still open (ready-for-human)

- [x] The bot calls the Chat agent route with the staff token, renders the reply and any Order proposal, and confirms through the quantity-based order route
- [x] The OpenAI npm dependency and the server-side chat route are removed
- [~] Production build passes; the flow is verified manually and recorded in this ticket's comments

## Comments

- 2026-09-05 — implemented. `components/ChatBot.tsx` keeps one `conversation_id`
  (`crypto.randomUUID()` in a ref) per widget session and posts the local history to
  `POST /agent/chat` through `authFetch` with `table_number: null` (the agent extracts the table
  from the conversation and the backend's Conversation state keeps it); the reply is rendered from
  `reply`, a non-null `order_proposal` is drawn as a card (table when known, lines with
  `formatMoney(price × quantity)`, total) with the confirm button; errors show the backend's
  `error`/`detail`. Confirming posts `{table_number, items: [{name, quantity}]}` to `POST /orders`
  through `authFetch` and shows `order_id ?? id`. The `__ORDER__…__END__` sentinel parsing and
  the `menuText` prompt are gone; `app/api/chat/route.ts` and `lib/store.ts` (only the bot used it)
  are deleted; `openai` is uninstalled (`package.json` and the lock file). The header subtitle now
  reads `مدعوم بالذكاء الاصطناعي ✨` instead of naming GPT-4o, since the Provider is chosen
  server-side. `zustand` is now unused and left in `package.json` (`backlog.md`).
- 2026-09-05 — verification: `npx tsc --noEmit` clean, `npm run build` 18/18 pages, no `openai`
  reference remains. **For the human**: open the bot as a Cashier against a backend with a Gemini
  key, ask for two burgers for table 4, confirm, and check the Order on the kanban with cashier =
  the Cashier's username; record the result here.

