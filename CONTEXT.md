# Waheed System

A multi-tenant restaurant operating system: every Restaurant runs its cashier, kitchen, tables, inventory and AI assistants on one shared platform while its data stays isolated from every other Restaurant.

## Language

### Platform & tenancy

**Restaurant**:
A single restaurant location that uses the platform; the unit of data isolation. (The tenancy library calls this the "tenant" in code.)
_Avoid_: client, branch, store, tenant (in prose)

**Slug**:
The short public identifier of a Restaurant carried in customer-facing links such as table QR codes.
_Avoid_: code, key, handle

**Super admin**:
A platform operator who manages Restaurants and belongs to none of them.
_Avoid_: root, platform owner

**Admin**:
The account that runs a Restaurant: menu, inventory, layout, staff, reports.
_Avoid_: owner, manager

**Cashier**:
A Restaurant staff account that takes, serves and settles Orders.
_Avoid_: staff, waiter, employee

**Suspended**:
A Restaurant state in which nobody can sign in or order until a Super admin reactivates it.
_Avoid_: blocked, disabled, banned

**Heartbeat**:
The periodic signal a signed-in staff device sends to show its Restaurant is open for business.
_Avoid_: ping, keep-alive

**Online**:
A Restaurant that has received a Heartbeat within the last 90 seconds; Customer orders are accepted only while Online.
_Avoid_: open, active, live

### Menu

**Menu item**:
A sellable dish or drink with a price and a Category.
_Avoid_: product, dish, SKU

**Variant**:
A Menu item sold as a size or flavour version of a parent Menu item; it inherits the parent's Modifier groups and Recipe unless it defines its own.
_Avoid_: option, size, child item

**Category**:
The free-text group a Menu item is listed under.
_Avoid_: section, type

**Modifier group**:
A named set of choices offered on a Menu item with a maximum number of selections.
_Avoid_: option group, add-ons, extras

**Modifier option**:
One choice within a Modifier group, with a price delta and an optional effect on an Inventory item.
_Avoid_: add-on, extra, topping

**Available**:
Whether a Menu item is currently offered for sale, toggled by the Admin.
_Avoid_: active, enabled, visible

**Out of stock**:
A Menu item whose Recipe cannot be fulfilled from current inventory for even one unit.
_Avoid_: sold out, unavailable

### Inventory

**Inventory item**:
A raw material tracked as a quantity in a unit, with a minimum quantity below which it is Low stock.
_Avoid_: ingredient (as a noun on its own), stock item, material

**Recipe**:
The Inventory items and amounts consumed by one unit of a Menu item.
_Avoid_: bill of materials, ingredients list

**Low stock**:
An Inventory item at or below its minimum quantity.
_Avoid_: shortage, running out

### Ordering

**Order**:
The Order lines for one table, placed by a Cashier, by a customer through the table QR page, or by a bot.
_Avoid_: ticket, transaction, sale

**Order line**:
One unit of a Menu item on an Order with its chosen Modifier options, at the price captured when the Order was placed.
_Avoid_: item, entry, product line

**Customer order**:
An Order placed from the table QR page without signing in; accepted only while the Restaurant is Online.
_Avoid_: QR order, guest order, online order

**Idempotency key**:
The client-generated identifier that makes resubmitting the same Order harmless, used for offline replay.
_Avoid_: client id (in prose), UUID

**Preparing / Ready / Served / Done / Cancelled**:
The Order statuses: the kitchen is making it; it is made and waiting to go to the table; it is at the table; it is closed by the cashier; it was withdrawn (terminal).
_Avoid_: in progress, completed, finished, deleted

**Open order**:
An Order that is Preparing, Ready or Served: it occupies its Table and still awaits closing.
_Avoid_: active order, pending order, live order

**Paid**:
An Order whose Payment method has been recorded; independent of its status.
_Avoid_: settled, closed

**Payment method**:
How an Order was paid: cash, card or QR transfer.
_Avoid_: payment type, tender

**Bill**:
The settlement view of one or more Orders of a table, used to take payment in full or split.
_Avoid_: invoice, receipt, check

**Table layout**:
The Restaurant's floor plan: Tables, walls and doors arranged in Zones.
_Avoid_: floor map, seating chart

**Zone**:
A named area of the Table layout.
_Avoid_: section, area, room

**Table**:
A numbered seating position in the Table layout with a capacity; the target of Orders and QR codes.
_Avoid_: seat, desk

**Cancellation log**:
The record of who cancelled which Order and when, kept for fraud detection.
_Avoid_: audit log

**Fraud alert**:
The notification sent to the Restaurant's owner when one Cashier cancels three or more Orders within an hour.
_Avoid_: warning, flag

### AI

**Report agent**:
The assistant that answers an Admin's questions about the Restaurant's sales, orders and stock.
_Avoid_: analytics bot, dashboard AI

**Chat agent**:
The assistant that helps staff, and customers over WhatsApp, browse the menu and draft an Order.
_Avoid_: chatbot, GPT, assistant (unqualified)

**Order proposal**:
A structured draft Order produced by the Chat agent that a person confirms before it becomes an Order.
_Avoid_: suggested order, cart

**Provider**:
The external model service (Gemini or OpenAI) behind an agent.
_Avoid_: LLM, vendor, model (for the company)
