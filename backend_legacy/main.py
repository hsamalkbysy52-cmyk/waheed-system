import json
import re
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from jose import jwt
from datetime import datetime, timedelta
import os

from database.models import SessionLocal, create_tables, seed_menu, seed_restaurant, backfill_restaurant_id, enforce_not_null_restaurant_id, backfill_user_emails, MenuItem, Order, CancellationLog, InventoryItem, RecipeIngredient, TableLayoutElement, ModifierGroup, ModifierOption, Restaurant, is_restaurant_online
from database.auth import create_users, verify_password, get_user, get_user_by_email, pwd_context, User
from database.tenant import (
    SECRET_KEY,
    get_restaurant_id,
    require_super_admin,
    tenant_query,
    tenant_add,
    owned_menu_item,
    owned_inventory_item,
    owned_modifier_group,
    owned_modifier_option,
    owned_order,
)

app = FastAPI(title="Waheed System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    create_tables()
    seed_restaurant()   # يجب أن يسبق الـ backfill — سجل المطعم 1 هو مرجع الوسم
    create_users()
    seed_menu()
except Exception as e:
    print(f"DB init warning: {e}")

# Multi-tenant migration — خارج try/except عمداً:
# فشل الـ backfill يجب أن يوقف السيرفر، لا أن يُبتلع كتحذير
backfill_restaurant_id()
enforce_not_null_restaurant_id()   # لا يصل هنا إلا بعد تحقق backfill بنجاح (صفر NULL)
backfill_user_emails()   # نفس المبدأ: email يصير معرّف دخول فريد عالمياً، لا يُبتلع فشله

OPENAI_KEY = os.getenv("OPENAI_KEY", "")
WA_SESSION_PATH = os.getenv("WA_SESSION_PATH", "/data/wa_session.db")


@app.on_event("startup")
async def startup_event():
    if OPENAI_KEY:
        from agents.whatsapp_client import start_whatsapp_client
        start_whatsapp_client(OPENAI_KEY, WA_SESSION_PATH)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def home():
    return {"message": "Waheed System Running!", "status": "ok"}


def _get_item_modifiers(menu_item_id: int, db: Session) -> list:
    """Returns modifier groups with their options for a given menu item."""
    groups = db.query(ModifierGroup).filter(ModifierGroup.menu_item_id == menu_item_id).order_by(ModifierGroup.sort_order).all()
    result = []
    for g in groups:
        options = db.query(ModifierOption).filter(ModifierOption.group_id == g.id).order_by(ModifierOption.sort_order).all()
        result.append({
            "id": g.id,
            "name": g.name,
            "max_selections": g.max_selections,
            "options": [
                {
                    "id": o.id,
                    "name": o.name,
                    "price_delta": o.price_delta,
                    "inventory_item_id": o.inventory_item_id,
                    "quantity_delta": o.quantity_delta,
                }
                for o in options
            ],
        })
    return result


def _serialize_menu_item(i, db: Session) -> dict:
    return {"id": i.id, "name": i.name, "price": i.price, "category": i.category,
            "is_available": i.is_available, "description": i.description or "",
            "parent_id": i.parent_id,
            "out_of_stock": _is_out_of_stock(i.id, db),
            "max_qty": _get_max_qty(i.id, db),
            "modifiers": _get_item_modifiers(i.id, db)}


@app.get("/menu")
def get_menu(db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    items = tenant_query(db, MenuItem, restaurant_id).all()
    parents = [i for i in items if not i.parent_id]
    children = [i for i in items if i.parent_id]
    menu = []
    for p in parents:
        d = _serialize_menu_item(p, db)
        d["variants"] = [_serialize_menu_item(c, db) for c in children if c.parent_id == p.id]
        menu.append(d)
    return {"menu": menu}


class MenuItemPayload(BaseModel):
    name: str
    price: float
    category: str
    description: str = ""
    parent_id: Optional[int] = None


@app.post("/menu/add")
def add_item(payload: MenuItemPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    item = MenuItem(name=payload.name, price=payload.price, category=payload.category,
                    description=payload.description or None, parent_id=payload.parent_id)
    tenant_add(db, item, restaurant_id)
    db.commit()
    return {"message": f"تم إضافة {payload.name}", "id": item.id}


@app.put("/menu/{item_id}")
def edit_item(item_id: int, payload: MenuItemPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    item = owned_menu_item(db, restaurant_id, item_id)
    if not item:
        return {"error": "الصنف غير موجود"}
    item.name = payload.name
    item.price = payload.price
    item.category = payload.category
    item.description = payload.description or None
    db.commit()
    return {"message": "تم تعديل الصنف"}


@app.delete("/menu/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    item = owned_menu_item(db, restaurant_id, item_id)
    if not item:
        return {"error": "الصنف غير موجود"}
    tenant_query(db, MenuItem, restaurant_id).filter(MenuItem.parent_id == item_id).delete()
    db.delete(item)
    db.commit()
    return {"message": "تم حذف الصنف"}


@app.get("/menu/{item_id}/modifiers/groups")
def get_modifier_groups(item_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    if not owned_menu_item(db, restaurant_id, item_id):
        return {"error": "الصنف غير موجود"}
    return {"groups": _get_item_modifiers(item_id, db)}


class ModifierGroupPayload(BaseModel):
    name: str
    max_selections: int = 1


@app.post("/menu/{item_id}/modifiers/groups")
def create_modifier_group(item_id: int, payload: ModifierGroupPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    if not owned_menu_item(db, restaurant_id, item_id):
        return {"error": "الصنف غير موجود"}
    group = ModifierGroup(menu_item_id=item_id, name=payload.name, max_selections=payload.max_selections)
    db.add(group)
    db.commit()
    return {"message": "تم إنشاء المجموعة", "id": group.id}


@app.delete("/modifiers/groups/{group_id}")
def delete_modifier_group(group_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    group = owned_modifier_group(db, restaurant_id, group_id)
    if not group:
        return {"error": "المجموعة غير موجودة"}
    db.query(ModifierOption).filter(ModifierOption.group_id == group_id).delete()
    db.delete(group)
    db.commit()
    return {"message": "تم حذف المجموعة والخيارات"}


class ModifierOptionPayload(BaseModel):
    name: str
    price_delta: float = 0
    inventory_item_id: Optional[int] = None
    quantity_delta: float = 0


@app.post("/modifiers/groups/{group_id}/options")
def create_modifier_option(group_id: int, payload: ModifierOptionPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    if not owned_modifier_group(db, restaurant_id, group_id):
        return {"error": "المجموعة غير موجودة"}
    # inventory_item_id يأتي من العميل — يجب أن يخص نفس المطعم
    if payload.inventory_item_id is not None and not owned_inventory_item(db, restaurant_id, payload.inventory_item_id):
        return {"error": "مادة المخزون غير موجودة"}
    option = ModifierOption(
        group_id=group_id,
        name=payload.name,
        price_delta=payload.price_delta,
        inventory_item_id=payload.inventory_item_id,
        quantity_delta=payload.quantity_delta,
    )
    db.add(option)
    db.commit()
    return {"message": "تم إضافة الخيار", "id": option.id}


@app.delete("/modifiers/options/{option_id}")
def delete_modifier_option(option_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    option = owned_modifier_option(db, restaurant_id, option_id)
    if not option:
        return {"error": "الخيار غير موجود"}
    db.delete(option)
    db.commit()
    return {"message": "تم حذف الخيار"}


class ModifierGroupEditPayload(BaseModel):
    name: str
    max_selections: int = 1


@app.put("/modifiers/groups/{group_id}")
def edit_modifier_group(group_id: int, payload: ModifierGroupEditPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    group = owned_modifier_group(db, restaurant_id, group_id)
    if not group:
        return {"error": "not found"}
    group.name = payload.name
    group.max_selections = payload.max_selections
    db.commit()
    return {"message": "تم تعديل المجموعة"}


class ModifierOptionEditPayload(BaseModel):
    name: str
    price_delta: float = 0


@app.put("/modifiers/options/{option_id}")
def edit_modifier_option(option_id: int, payload: ModifierOptionEditPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    option = owned_modifier_option(db, restaurant_id, option_id)
    if not option:
        return {"error": "not found"}
    option.name = payload.name
    option.price_delta = payload.price_delta
    db.commit()
    return {"message": "تم تعديل الخيار"}


class ReorderPayload(BaseModel):
    order: List[int]


@app.put("/menu/{item_id}/modifiers/groups/reorder")
def reorder_modifier_groups(item_id: int, payload: ReorderPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    if not owned_menu_item(db, restaurant_id, item_id):
        return {"error": "الصنف غير موجود"}
    for i, gid in enumerate(payload.order):
        # مقيد بمجموعات هذا الصنف فقط — لا يمكن ترتيب مجموعات صنف آخر
        db.query(ModifierGroup).filter(ModifierGroup.id == gid, ModifierGroup.menu_item_id == item_id).update({"sort_order": i})
    db.commit()
    return {"message": "تم ترتيب المجموعات"}


@app.put("/modifiers/groups/{group_id}/options/reorder")
def reorder_modifier_options(group_id: int, payload: ReorderPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    if not owned_modifier_group(db, restaurant_id, group_id):
        return {"error": "المجموعة غير موجودة"}
    for i, oid in enumerate(payload.order):
        db.query(ModifierOption).filter(ModifierOption.id == oid, ModifierOption.group_id == group_id).update({"sort_order": i})
    db.commit()
    return {"message": "تم ترتيب الخيارات"}


@app.put("/menu/{item_id}/toggle")
def toggle_item(item_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    item = owned_menu_item(db, restaurant_id, item_id)
    if not item:
        return {"error": "الصنف غير موجود"}
    item.is_available = not item.is_available
    db.commit()
    return {"message": "تم تغيير الحالة", "is_available": item.is_available}


class OrderItem(BaseModel):
    name: str
    price: float
    category: str = ""
    modifiers: List[dict] = []


class OrderRequest(BaseModel):
    items: List[OrderItem]
    table_number: int = 1
    cashier: str = ""
    notes: str = ""
    payment_method: Optional[str] = None   # cash / card / qr for prepaid orders
    client_id: Optional[str] = None        # UUID from client for idempotency


@app.get("/orders")
def get_orders(db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    orders = tenant_query(db, Order, restaurant_id).all()
    return {"orders": [
        {
            "id": o.id,
            "table_number": o.table_number,
            "total_price": o.total_price,
            "status": o.status,
            "created_at": o.created_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "items": json.loads(o.items_json) if o.items_json else [],
            "cashier": o.cashier or "",
            "notes": o.notes or "",
            "payment_method": o.payment_method or None,
        }
        for o in orders
    ]}


def _deduct_inventory(items_data: list, db: Session, restaurant_id: int):
    from collections import Counter
    counts = Counter(it["name"] for it in items_data)
    for item_name, qty in counts.items():
        # البحث بالاسم يجب أن يتقيد بالمطعم — الأسماء تتكرر بين المطاعم
        menu_item = tenant_query(db, MenuItem, restaurant_id).filter(MenuItem.name == item_name).first()
        if not menu_item:
            continue
        recipe = db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item.id).all()
        for ri in recipe:
            inv = db.query(InventoryItem).filter(InventoryItem.id == ri.inventory_item_id).first()
            if inv:
                inv.quantity = max(0.0, inv.quantity - ri.amount * qty)


def _check_stock(items_data: list, db: Session, restaurant_id: int) -> list:
    """Returns names of items that lack sufficient ingredients for the requested quantity."""
    from collections import Counter
    counts = Counter(it["name"] for it in items_data)
    unavailable = []
    for item_name, qty in counts.items():
        menu_item = tenant_query(db, MenuItem, restaurant_id).filter(MenuItem.name == item_name).first()
        if not menu_item:
            continue
        recipe = db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item.id).all()
        for ri in recipe:
            inv = db.query(InventoryItem).filter(InventoryItem.id == ri.inventory_item_id).first()
            if inv and inv.quantity < ri.amount * qty:
                if item_name not in unavailable:
                    unavailable.append(item_name)
    return unavailable


def _restore_inventory(items_data: list, db: Session, restaurant_id: int):
    """Return previously deducted ingredients back to inventory."""
    from collections import Counter
    counts = Counter(it["name"] for it in items_data)
    for item_name, qty in counts.items():
        menu_item = tenant_query(db, MenuItem, restaurant_id).filter(MenuItem.name == item_name).first()
        if not menu_item:
            continue
        recipe = db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item.id).all()
        for ri in recipe:
            inv = db.query(InventoryItem).filter(InventoryItem.id == ri.inventory_item_id).first()
            if inv:
                inv.quantity += ri.amount * qty


def _get_max_qty(menu_item_id: int, db: Session):
    """Returns max servings possible given current inventory, or None if item has no recipe."""
    recipe = db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item_id).all()
    if not recipe:
        return None
    max_q = None
    for ri in recipe:
        inv = db.query(InventoryItem).filter(InventoryItem.id == ri.inventory_item_id).first()
        if inv and ri.amount > 0:
            possible = int(inv.quantity / ri.amount)
            if max_q is None or possible < max_q:
                max_q = possible
    return max_q if max_q is not None else None


def _check_and_deduct_atomic(items_data: list, db: Session, restaurant_id: int) -> list:
    """
    Check inventory and deduct in one atomic pass.
    Uses SELECT FOR UPDATE to lock rows on PostgreSQL, preventing
    double-deduction under concurrent requests.
    Returns a list of item names with insufficient stock (empty = all OK).
    """
    from collections import Counter, defaultdict

    # --- Build deduction map: inventory_item_id -> total amount needed ---
    deductions: defaultdict = defaultdict(float)
    inv_to_names: defaultdict = defaultdict(list)

    name_counts = Counter(it["name"] for it in items_data)
    for item_name, qty in name_counts.items():
        menu_item = tenant_query(db, MenuItem, restaurant_id).filter(MenuItem.name == item_name).first()
        if not menu_item:
            continue
        recipe = db.query(RecipeIngredient).filter(
            RecipeIngredient.menu_item_id == menu_item.id
        ).all()
        for ri in recipe:
            deductions[ri.inventory_item_id] += ri.amount * qty
            if item_name not in inv_to_names[ri.inventory_item_id]:
                inv_to_names[ri.inventory_item_id].append(item_name)

    # Include modifier inventory deductions
    for item in items_data:
        for mod in item.get("modifiers", []):
            inv_id = mod.get("inventory_item_id")
            qty_delta = mod.get("quantity_delta", 0)
            if inv_id is not None and qty_delta > 0:
                deductions[inv_id] += qty_delta

    if not deductions:
        return []

    # --- Lock all needed rows in one query (FOR UPDATE on PostgreSQL) ---
    # فلتر المطعم هنا يحمي من inventory_item_id مزروع في الـ modifiers من العميل
    inv_items = (
        tenant_query(db, InventoryItem, restaurant_id)
        .filter(InventoryItem.id.in_(list(deductions.keys())))
        .with_for_update()
        .all()
    )
    inv_map = {i.id: i for i in inv_items}

    # --- Check stock ---
    unavailable = []
    for inv_id, needed in deductions.items():
        inv = inv_map.get(inv_id)
        if inv and inv.quantity < needed:
            for name in inv_to_names.get(inv_id, []):
                if name not in unavailable:
                    unavailable.append(name)

    if unavailable:
        return unavailable

    # --- Deduct ---
    for inv_id, amount in deductions.items():
        inv = inv_map.get(inv_id)
        if inv:
            inv.quantity = max(0.0, inv.quantity - amount)

    return []


def _is_out_of_stock(menu_item_id: int, db: Session) -> bool:
    """True if any recipe ingredient is insufficient for a single serving."""
    recipe = db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item_id).all()
    if not recipe:
        return False
    for ri in recipe:
        inv = db.query(InventoryItem).filter(InventoryItem.id == ri.inventory_item_id).first()
        if inv and inv.quantity < ri.amount:
            return True
    return False


def _create_order_record(order: OrderRequest, db: Session, restaurant_id: int) -> dict:
    """Shared order-creation logic for both cashier and QR channels."""
    from fastapi import HTTPException

    if order.client_id:
        existing = tenant_query(db, Order, restaurant_id).filter(Order.client_id == order.client_id).first()
        if existing:
            return {"message": "تم حفظ الطلب!", "total": existing.total_price, "order_id": existing.id}

    total = sum(item.price for item in order.items)
    items_data = [
        {"name": i.name, "price": i.price, "category": i.category, "modifiers": i.modifiers}
        for i in order.items
    ]

    unavailable = _check_and_deduct_atomic(items_data, db, restaurant_id)
    if unavailable:
        raise HTTPException(status_code=400, detail=f"مخزون غير كافٍ: {', '.join(unavailable)}")

    new_order = Order(
        table_number=order.table_number,
        total_price=total,
        status="preparing",
        items_json=json.dumps(items_data, ensure_ascii=False),
        cashier=order.cashier,
        notes=order.notes,
        payment_method=order.payment_method or None,
        client_id=order.client_id or None,
    )
    tenant_add(db, new_order, restaurant_id)
    db.commit()
    return {"message": "تم حفظ الطلب!", "total": total, "order_id": new_order.id}


@app.post("/orders/create")
def create_order(order: OrderRequest, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    """Cashier endpoint — no heartbeat check (cashier works offline)."""
    return _create_order_record(order, db, restaurant_id)


@app.post("/heartbeat")
def heartbeat(db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    """Cashier device calls this every 60 s to signal the restaurant is online.
    restaurant_id يأتي من JWT عبر get_restaurant_id — لا يُقبل من جسم الطلب،
    وإلا يقدر أي طرف مجهول يزوّر حالة "أونلاين" لأي مطعم أو ينشئ مطاعم وهمية."""
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        restaurant = Restaurant(id=restaurant_id, name="Waheed Restaurant")
        db.add(restaurant)
    restaurant.last_heartbeat_at = datetime.utcnow()
    db.commit()
    return {"status": "ok", "last_heartbeat_at": restaurant.last_heartbeat_at.isoformat()}


@app.get("/restaurant/status")
def restaurant_status(db: Session = Depends(get_db)):
    """Public status endpoint — useful for debugging and monitoring.
    TODO(multi-tenant, مؤجل عمداً): مقفول على المطعم 1 فقط. عميل QR بلا توكن
    فلا يوجد restaurant_id من JWT — يحتاج تصميم لكيفية تعريف QR بمطعمه (رابط/مسار؟).
    يُحل مع تصميم ربط بوت الواتساب وQR بالمطعم لاحقاً، مو بترقيع هنا."""
    restaurant = db.query(Restaurant).filter(Restaurant.id == 1).first()
    online = is_restaurant_online(db)
    last_beat = restaurant.last_heartbeat_at.isoformat() if restaurant and restaurant.last_heartbeat_at else None
    return {"online": online, "last_heartbeat_at": last_beat}


@app.post("/orders/qr-create")
def create_qr_order(order: OrderRequest, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    """QR menu endpoint — rejected while cashier device is offline.
    TODO(multi-tenant, مؤجل عمداً): is_restaurant_online() مقفولة على المطعم 1 —
    نفس قرار /restaurant/status المؤجل. restaurant_id هنا من الجسر الافتراضي
    (لا توكن لعميل QR) فيساوي 1 حالياً، فلا يوجد تعارض فعلي لحد تفعيل مطعم ثاني."""
    from fastapi import HTTPException
    if not is_restaurant_online(db):
        raise HTTPException(
            status_code=503,
            detail="الطلب الإلكتروني غير متاح حالياً، الرجاء الطلب من الكاشير مباشرة."
        )
    return _create_order_record(order, db, restaurant_id)


@app.put("/orders/{order_id}/ready")
def mark_order_ready(order_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    order = owned_order(db, restaurant_id, order_id)
    if not order:
        return {"error": "الطلب مو موجود"}
    order.status = "ready"
    db.commit()
    return {"message": "الطلب جاهز للتقديم!"}


@app.put("/orders/{order_id}/preparing")
def mark_order_preparing(order_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    order = owned_order(db, restaurant_id, order_id)
    if not order:
        return {"error": "الطلب غير موجود"}
    order.status = "preparing"
    db.commit()
    return {"message": "تم إرجاع الطلب لقيد التحضير"}


class OrderEditPayload(BaseModel):
    items: List[OrderItem]
    table_number: int = 1
    notes: str = ""


@app.put("/orders/{order_id}")
def edit_order(order_id: int, payload: OrderEditPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    from fastapi import HTTPException
    order = owned_order(db, restaurant_id, order_id)
    if not order:
        return {"error": "الطلب غير موجود"}
    if order.status not in ("preparing", "pending"):
        return {"error": "لا يمكن تعديل الطلب بعد إعداده"}
    old_items = json.loads(order.items_json) if order.items_json else []
    new_items = [{"name": i.name, "price": i.price, "category": i.category} for i in payload.items]
    _restore_inventory(old_items, db, restaurant_id)
    unavailable = _check_stock(new_items, db, restaurant_id)
    if unavailable:
        _deduct_inventory(old_items, db, restaurant_id)
        raise HTTPException(status_code=400, detail=f"مخزون غير كافٍ: {', '.join(unavailable)}")
    _deduct_inventory(new_items, db, restaurant_id)
    order.items_json = json.dumps(new_items, ensure_ascii=False)
    order.total_price = sum(i.price for i in payload.items)
    order.table_number = payload.table_number
    order.notes = payload.notes
    db.commit()
    return {"message": "تم تعديل الطلب", "order_id": order_id}


@app.delete("/orders/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    order = owned_order(db, restaurant_id, order_id)
    if not order:
        return {"error": "الطلب غير موجود"}
    if order.status in ("preparing", "pending"):
        items_data = json.loads(order.items_json) if order.items_json else []
        _restore_inventory(items_data, db, restaurant_id)
    order.status = "cancelled"
    db.commit()
    return {"message": "تم حذف الطلب", "order_id": order_id}


@app.put("/orders/{order_id}/served")
def mark_order_served(order_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    order = owned_order(db, restaurant_id, order_id)
    if not order:
        return {"error": "الطلب غير موجود"}
    order.status = "served"
    db.commit()
    return {"message": "تم تقديم الطلب للطاولة"}


class PayOrderPayload(BaseModel):
    payment_method: str = "cash"

@app.put("/orders/{order_id}/pay")
def pay_order(order_id: int, payload: PayOrderPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    """Record payment without changing operational status — order stays on kanban board."""
    order = owned_order(db, restaurant_id, order_id)
    if not order:
        return {"error": "الطلب غير موجود"}
    order.payment_method = payload.payment_method
    db.commit()
    return {"message": "تم تسجيل الدفع"}


@app.put("/orders/{order_id}/done")
def complete_order(order_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    """Payment completion only — called by BillModal after cashier confirms payment."""
    order = owned_order(db, restaurant_id, order_id)
    if not order:
        return {"error": "الطلب مو موجود"}
    order.status = "done"
    db.commit()
    return {"message": "تم الدفع وإنجاز الطلب!"}


@app.post("/orders/{order_id}/cancel")
def cancel_order(order_id: int, cashier: str, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    order = owned_order(db, restaurant_id, order_id)
    if not order:
        return {"error": "الطلب مو موجود"}
    if order.status == "cancelled":
        return {"error": "الطلب ملغي مسبقاً"}
    order.status = "cancelled"
    db.commit()

    from agents.fraud_agent import run_fraud_check
    fraud_detected = run_fraud_check(order_id, cashier, db, restaurant_id)

    result = {"message": "تم إلغاء الطلب!", "order_id": order_id}
    if fraud_detected:
        result["fraud_alert"] = f"⚠️ {cashier} ألغى 3 طلبات أو أكثر خلال ساعة — تم إبلاغ المالك."
    return result


class InventoryPayload(BaseModel):
    name: str
    unit: str = "قطعة"
    quantity: float = 0
    min_quantity: float = 5


@app.get("/inventory")
def get_inventory(db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    items = tenant_query(db, InventoryItem, restaurant_id).all()
    return {"items": [
        {"id": i.id, "name": i.name, "unit": i.unit, "quantity": i.quantity, "min_quantity": i.min_quantity}
        for i in items
    ]}


@app.post("/inventory/add")
def add_inventory_item(payload: InventoryPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    item = InventoryItem(name=payload.name, unit=payload.unit, quantity=payload.quantity, min_quantity=payload.min_quantity)
    tenant_add(db, item, restaurant_id)
    db.commit()
    return {"message": f"تم إضافة {payload.name}", "id": item.id}


@app.put("/inventory/{item_id}")
def update_inventory_item(item_id: int, payload: InventoryPayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    item = owned_inventory_item(db, restaurant_id, item_id)
    if not item:
        return {"error": "المادة غير موجودة"}
    item.name = payload.name
    item.unit = payload.unit
    item.quantity = payload.quantity
    item.min_quantity = payload.min_quantity
    db.commit()
    return {"message": "تم تعديل المادة"}


@app.delete("/inventory/{item_id}")
def delete_inventory_item(item_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    item = owned_inventory_item(db, restaurant_id, item_id)
    if not item:
        return {"error": "المادة غير موجودة"}
    db.query(RecipeIngredient).filter(RecipeIngredient.inventory_item_id == item_id).delete()
    db.delete(item)
    db.commit()
    return {"message": "تم حذف المادة"}


@app.get("/inventory/recipe/{menu_item_id}")
def get_recipe(menu_item_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    if not owned_menu_item(db, restaurant_id, menu_item_id):
        return {"error": "الصنف غير موجود"}
    rows = db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item_id).all()
    result = []
    for r in rows:
        inv = db.query(InventoryItem).filter(InventoryItem.id == r.inventory_item_id).first()
        result.append({
            "id": r.id,
            "inventory_item_id": r.inventory_item_id,
            "amount": r.amount,
            "inventory_name": inv.name if inv else "",
            "unit": inv.unit if inv else "",
        })
    return {"recipe": result}


class RecipeItem(BaseModel):
    inventory_item_id: int
    amount: float


class RecipePayload(BaseModel):
    ingredients: List[RecipeItem]


@app.post("/inventory/recipe/{menu_item_id}")
def save_recipe(menu_item_id: int, payload: RecipePayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    if not owned_menu_item(db, restaurant_id, menu_item_id):
        return {"error": "الصنف غير موجود"}
    # كل مادة مخزون بالوصفة يجب أن تخص نفس المطعم
    for ing in payload.ingredients:
        if not owned_inventory_item(db, restaurant_id, ing.inventory_item_id):
            return {"error": "مادة المخزون غير موجودة"}
    db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item_id).delete()
    for ing in payload.ingredients:
        db.add(RecipeIngredient(menu_item_id=menu_item_id, inventory_item_id=ing.inventory_item_id, amount=ing.amount))
    db.commit()
    return {"message": "تم حفظ الوصفة"}


@app.post("/inventory/deduct/{order_id}")
def deduct_inventory_for_order(order_id: int, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    from collections import Counter
    order = owned_order(db, restaurant_id, order_id)
    if not order:
        return {"error": "الطلب غير موجود"}
    items = json.loads(order.items_json) if order.items_json else []
    counts = Counter(it["name"] for it in items)
    low_stock = []
    for item_name, qty in counts.items():
        menu_item = tenant_query(db, MenuItem, restaurant_id).filter(MenuItem.name == item_name).first()
        if not menu_item:
            continue
        recipe = db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item.id).all()
        for ri in recipe:
            inv = db.query(InventoryItem).filter(InventoryItem.id == ri.inventory_item_id).first()
            if inv:
                inv.quantity = max(0, inv.quantity - ri.amount * qty)
                if inv.quantity <= inv.min_quantity:
                    low_stock.append(inv.name)
    db.commit()
    return {"message": "تم خصم المكونات", "low_stock": low_stock}


@app.get("/table-layout")
def get_table_layout(db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    elements = tenant_query(db, TableLayoutElement, restaurant_id).all()
    return {"elements": [
        {
            "element_id": e.element_id,
            "element_type": e.element_type,
            "x": e.x, "y": e.y, "w": e.w, "h": e.h,
            "table_number": e.table_number,
            "capacity": e.capacity,
            "label": e.label or "",
        }
        for e in elements
    ]}


class LayoutElementPayload(BaseModel):
    element_id: str
    element_type: str
    x: float
    y: float
    w: float
    h: float
    table_number: Optional[int] = None
    capacity: Optional[int] = None
    label: str = ""


class LayoutSavePayload(BaseModel):
    elements: List[LayoutElementPayload]


@app.post("/table-layout/save")
def save_table_layout(payload: LayoutSavePayload, db: Session = Depends(get_db), restaurant_id: int = Depends(get_restaurant_id)):
    tenant_query(db, TableLayoutElement, restaurant_id).delete()
    for el in payload.elements:
        tenant_add(db, TableLayoutElement(
            element_id=el.element_id,
            element_type=el.element_type,
            x=el.x, y=el.y, w=el.w, h=el.h,
            table_number=el.table_number,
            capacity=el.capacity,
            label=el.label,
        ), restaurant_id)
    db.commit()
    return {"message": "تم حفظ المخطط"}


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user.password):
        return {"error": "البريد الإلكتروني أو كلمة السر غلط"}
    if user.restaurant_id is not None:
        restaurant = db.query(Restaurant).filter(Restaurant.id == user.restaurant_id).first()
        if restaurant and restaurant.status == "suspended":
            return {"error": "هذا المطعم موقوف حالياً"}
    token = jwt.encode(
        {
            "username": user.username,
            "role": user.role,
            "restaurant_id": user.restaurant_id,
            "exp": datetime.utcnow() + timedelta(hours=8)
        },
        SECRET_KEY,
        algorithm="HS256"
    )
    return {
        "token": token,
        "role": user.role,
        "username": user.username,
        "message": f"أهلاً {user.username}!"
    }


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterRequest(BaseModel):
    restaurant_name: str
    phone: str
    email: str
    password: str


@app.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """تسجيل مطعم جديد بالكامل — الاستثناء الشرعي الوحيد لإنشاء Restaurant بلا مصادقة.
    عمداً لا يستخدم tenant_add: هنا أصل هوية مطعم جديدة، لا كتابة داخل مطعم قائم."""
    if not payload.restaurant_name.strip():
        return {"error": "اسم المطعم مطلوب"}
    if not EMAIL_RE.match(payload.email):
        return {"error": "البريد الإلكتروني غير صالح"}
    if len(payload.password) < 6:
        return {"error": "كلمة السر لازم تكون 6 أحرف على الأقل"}
    if get_user_by_email(payload.email):
        return {"error": "البريد الإلكتروني مستخدم مسبقاً"}

    restaurant = Restaurant(
        name=payload.restaurant_name.strip(),
        phone=payload.phone,
        email=payload.email,
        status="active",
        created_at=datetime.utcnow(),
    )
    db.add(restaurant)
    db.flush()  # للحصول على restaurant.id قبل إنشاء المستخدم المالك

    owner = User(
        restaurant_id=restaurant.id,
        username=payload.email,
        email=payload.email,
        password=pwd_context.hash(payload.password),
        role="admin",
    )
    db.add(owner)
    db.commit()

    token = jwt.encode(
        {
            "username": owner.username,
            "role": owner.role,
            "restaurant_id": owner.restaurant_id,
            "exp": datetime.utcnow() + timedelta(hours=8)
        },
        SECRET_KEY,
        algorithm="HS256"
    )
    return {
        "token": token,
        "role": owner.role,
        "username": owner.username,
        "message": f"تم تسجيل مطعم {restaurant.name} بنجاح! أهلاً {owner.username}!"
    }


@app.get("/admin/restaurants")
def list_restaurants(db: Session = Depends(get_db), _: None = Depends(require_super_admin)):
    """لوحة super_admin — عبر كل المطاعم عمداً، Restaurant نفسه جدول الهوية لا TENANT_TABLES."""
    restaurants = db.query(Restaurant).order_by(Restaurant.created_at.desc()).all()
    return {"restaurants": [
        {
            "id": r.id,
            "name": r.name,
            "email": r.email,
            "phone": r.phone,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in restaurants
    ]}


class RestaurantStatusPayload(BaseModel):
    status: str  # "active" | "suspended"


@app.post("/admin/restaurants/{restaurant_id}/status")
def set_restaurant_status(restaurant_id: int, payload: RestaurantStatusPayload, db: Session = Depends(get_db), _: None = Depends(require_super_admin)):
    if payload.status not in ("active", "suspended"):
        return {"error": "قيمة status غير صالحة — active أو suspended فقط"}
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        return {"error": "المطعم غير موجود"}
    restaurant.status = payload.status
    db.commit()
    return {"id": restaurant.id, "status": restaurant.status, "message": "تم تحديث حالة المطعم"}


@app.post("/agent/ask")
def ask_report_agent(question: str, api_key: str, restaurant_id: int = Depends(get_restaurant_id)):
    from agents.report_agent import ask_agent
    try:
        answer = ask_agent(question, api_key, restaurant_id)
        return {"answer": answer}
    except Exception as e:
        return {"error": str(e)}


