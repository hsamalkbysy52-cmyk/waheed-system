# 06: Inventory and recipes

**What to build:** Admins track Inventory items and Recipes; the menu shows what is Out of stock and how many units can still be sold; Modifier options may consume inventory.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Models: Inventory item (unit, quantity, minimum quantity) and Recipe ingredient (unique per Menu item and Inventory item, Decimal amount); deleting an Inventory item removes its recipe rows
- [ ] Routes 29 to 34 match the goldens; the legacy deduct route is gone and its removal noted in the contract table
- [ ] `out_of_stock` and `max_qty` are computed from Recipes with Variant inheritance; Low stock is derivable (quantity at or below minimum)
- [ ] A Modifier option's inventory link must belong to the same Restaurant (404 otherwise)
- [ ] HTTP tests including inheritance and cross-Restaurant inventory ids
