# 14: Frontend: chat bot through the backend

**What to build:** The floating chat bot talks to the backend Chat agent and confirms orders safely with the staff token.

**Blocked by:** 12, 13

**Status:** ready-for-agent

- [ ] The bot calls the Chat agent route with the staff token, renders the reply and any Order proposal, and confirms through the quantity-based order route
- [ ] The OpenAI npm dependency and the server-side chat route are removed
- [ ] Production build passes; the flow is verified manually and recorded in this ticket's comments
