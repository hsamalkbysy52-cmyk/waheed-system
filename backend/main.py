import json
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from jose import jwt
from datetime import datetime, timedelta
import os

from database.models import SessionLocal, create_tables, seed_menu, MenuItem, Order, CancellationLog, InventoryItem, RecipeIngredient, TableLayoutElement
from database.auth import create_users, verify_password, get_user, User

SECRET_KEY = "waheed-secret-2024"

app = FastAPI(title="Waheed System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    create_tables()
    create_users()
    seed_menu()
except Exception as e:
    print(f"DB init warning: {e}")

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
OPENAI_KEY = os.getenv("OPENAI_KEY", "")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def home():
    return {"message": "Waheed System Running!", "status": "ok"}


@app.get("/menu")
def get_menu(db: Session = Depends(get_db)):
    items = db.query(MenuItem).all()
    return {"menu": [
        {"id": i.id, "name": i.name, "price": i.price, "category": i.category,
         "is_available": i.is_available, "description": i.description or "",
         "out_of_stock": _is_out_of_stock(i.id, db),
         "max_qty": _get_max_qty(i.id, db)}
        for i in items
    ]}


class MenuItemPayload(BaseModel):
    name: str
    price: float
    category: str
    description: str = ""


@app.post("/menu/add")
def add_item(payload: MenuItemPayload, db: Session = Depends(get_db)):
    item = MenuItem(name=payload.name, price=payload.price, category=payload.category, description=payload.description or None)
    db.add(item)
    db.commit()
    return {"message": f"تم إضافة {payload.name}", "id": item.id}


@app.put("/menu/{item_id}")
def edit_item(item_id: int, payload: MenuItemPayload, db: Session = Depends(get_db)):
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        return {"error": "الصنف غير موجود"}
    item.name = payload.name
    item.price = payload.price
    item.category = payload.category
    item.description = payload.description or None
    db.commit()
    return {"message": "تم تعديل الصنف"}


@app.delete("/menu/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        return {"error": "الصنف غير موجود"}
    db.delete(item)
    db.commit()
    return {"message": "تم حذف الصنف"}


@app.put("/menu/{item_id}/toggle")
def toggle_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        return {"error": "الصنف غير موجود"}
    item.is_available = not item.is_available
    db.commit()
    return {"message": "تم تغيير الحالة", "is_available": item.is_available}


class OrderItem(BaseModel):
    name: str
    price: float
    category: str = ""


class OrderRequest(BaseModel):
    items: List[OrderItem]
    table_number: int = 1
    cashier: str = ""
    notes: str = ""
    payment_method: Optional[str] = None   # cash / card / qr for prepaid orders


@app.get("/orders")
def get_orders(db: Session = Depends(get_db)):
    orders = db.query(Order).all()
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


def _deduct_inventory(items_data: list, db: Session):
    from collections import Counter
    counts = Counter(it["name"] for it in items_data)
    for item_name, qty in counts.items():
        menu_item = db.query(MenuItem).filter(MenuItem.name == item_name).first()
        if not menu_item:
            continue
        recipe = db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item.id).all()
        for ri in recipe:
            inv = db.query(InventoryItem).filter(InventoryItem.id == ri.inventory_item_id).first()
            if inv:
                inv.quantity = max(0.0, inv.quantity - ri.amount * qty)


def _check_stock(items_data: list, db: Session) -> list:
    """Returns names of items that lack sufficient ingredients for the requested quantity."""
    from collections import Counter
    counts = Counter(it["name"] for it in items_data)
    unavailable = []
    for item_name, qty in counts.items():
        menu_item = db.query(MenuItem).filter(MenuItem.name == item_name).first()
        if not menu_item:
            continue
        recipe = db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item.id).all()
        for ri in recipe:
            inv = db.query(InventoryItem).filter(InventoryItem.id == ri.inventory_item_id).first()
            if inv and inv.quantity < ri.amount * qty:
                if item_name not in unavailable:
                    unavailable.append(item_name)
    return unavailable


def _restore_inventory(items_data: list, db: Session):
    """Return previously deducted ingredients back to inventory."""
    from collections import Counter
    counts = Counter(it["name"] for it in items_data)
    for item_name, qty in counts.items():
        menu_item = db.query(MenuItem).filter(MenuItem.name == item_name).first()
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


@app.post("/orders/create")
def create_order(order: OrderRequest, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    total = sum(item.price for item in order.items)
    items_data = [{"name": i.name, "price": i.price, "category": i.category} for i in order.items]
    unavailable = _check_stock(items_data, db)
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
    )
    db.add(new_order)
    _deduct_inventory(items_data, db)
    db.commit()
    return {
        "message": "تم حفظ الطلب!",
        "total": total,
        "order_id": new_order.id
    }


@app.put("/orders/{order_id}/ready")
def mark_order_ready(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"error": "الطلب مو موجود"}
    order.status = "ready"
    db.commit()
    return {"message": "الطلب جاهز للتقديم!"}


@app.put("/orders/{order_id}/preparing")
def mark_order_preparing(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
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
def edit_order(order_id: int, payload: OrderEditPayload, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"error": "الطلب غير موجود"}
    if order.status not in ("preparing", "pending"):
        return {"error": "لا يمكن تعديل الطلب بعد إعداده"}
    old_items = json.loads(order.items_json) if order.items_json else []
    new_items = [{"name": i.name, "price": i.price, "category": i.category} for i in payload.items]
    _restore_inventory(old_items, db)
    unavailable = _check_stock(new_items, db)
    if unavailable:
        _deduct_inventory(old_items, db)
        raise HTTPException(status_code=400, detail=f"مخزون غير كافٍ: {', '.join(unavailable)}")
    _deduct_inventory(new_items, db)
    order.items_json = json.dumps(new_items, ensure_ascii=False)
    order.total_price = sum(i.price for i in payload.items)
    order.table_number = payload.table_number
    order.notes = payload.notes
    db.commit()
    return {"message": "تم تعديل الطلب", "order_id": order_id}


@app.delete("/orders/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"error": "الطلب غير موجود"}
    if order.status in ("preparing", "pending"):
        items_data = json.loads(order.items_json) if order.items_json else []
        _restore_inventory(items_data, db)
    order.status = "cancelled"
    db.commit()
    return {"message": "تم حذف الطلب", "order_id": order_id}


@app.put("/orders/{order_id}/served")
def mark_order_served(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"error": "الطلب غير موجود"}
    order.status = "served"
    db.commit()
    return {"message": "تم تقديم الطلب للطاولة"}


@app.put("/orders/{order_id}/done")
def complete_order(order_id: int, db: Session = Depends(get_db)):
    """Payment completion only — called by BillModal after cashier confirms payment."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"error": "الطلب مو موجود"}
    order.status = "done"
    db.commit()
    return {"message": "تم الدفع وإنجاز الطلب!"}


@app.post("/orders/{order_id}/cancel")
def cancel_order(order_id: int, cashier: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"error": "الطلب مو موجود"}
    if order.status == "cancelled":
        return {"error": "الطلب ملغي مسبقاً"}
    order.status = "cancelled"
    db.commit()

    from agents.fraud_agent import run_fraud_check
    fraud_detected = run_fraud_check(order_id, cashier, db)

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
def get_inventory(db: Session = Depends(get_db)):
    items = db.query(InventoryItem).all()
    return {"items": [
        {"id": i.id, "name": i.name, "unit": i.unit, "quantity": i.quantity, "min_quantity": i.min_quantity}
        for i in items
    ]}


@app.post("/inventory/add")
def add_inventory_item(payload: InventoryPayload, db: Session = Depends(get_db)):
    item = InventoryItem(name=payload.name, unit=payload.unit, quantity=payload.quantity, min_quantity=payload.min_quantity)
    db.add(item)
    db.commit()
    return {"message": f"تم إضافة {payload.name}", "id": item.id}


@app.put("/inventory/{item_id}")
def update_inventory_item(item_id: int, payload: InventoryPayload, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        return {"error": "المادة غير موجودة"}
    item.name = payload.name
    item.unit = payload.unit
    item.quantity = payload.quantity
    item.min_quantity = payload.min_quantity
    db.commit()
    return {"message": "تم تعديل المادة"}


@app.delete("/inventory/{item_id}")
def delete_inventory_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        return {"error": "المادة غير موجودة"}
    db.query(RecipeIngredient).filter(RecipeIngredient.inventory_item_id == item_id).delete()
    db.delete(item)
    db.commit()
    return {"message": "تم حذف المادة"}


@app.get("/inventory/recipe/{menu_item_id}")
def get_recipe(menu_item_id: int, db: Session = Depends(get_db)):
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
def save_recipe(menu_item_id: int, payload: RecipePayload, db: Session = Depends(get_db)):
    db.query(RecipeIngredient).filter(RecipeIngredient.menu_item_id == menu_item_id).delete()
    for ing in payload.ingredients:
        db.add(RecipeIngredient(menu_item_id=menu_item_id, inventory_item_id=ing.inventory_item_id, amount=ing.amount))
    db.commit()
    return {"message": "تم حفظ الوصفة"}


@app.post("/inventory/deduct/{order_id}")
def deduct_inventory_for_order(order_id: int, db: Session = Depends(get_db)):
    from collections import Counter
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"error": "الطلب غير موجود"}
    items = json.loads(order.items_json) if order.items_json else []
    counts = Counter(it["name"] for it in items)
    low_stock = []
    for item_name, qty in counts.items():
        menu_item = db.query(MenuItem).filter(MenuItem.name == item_name).first()
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
def get_table_layout(db: Session = Depends(get_db)):
    elements = db.query(TableLayoutElement).all()
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
def save_table_layout(payload: LayoutSavePayload, db: Session = Depends(get_db)):
    db.query(TableLayoutElement).delete()
    for el in payload.elements:
        db.add(TableLayoutElement(
            element_id=el.element_id,
            element_type=el.element_type,
            x=el.x, y=el.y, w=el.w, h=el.h,
            table_number=el.table_number,
            capacity=el.capacity,
            label=el.label,
        ))
    db.commit()
    return {"message": "تم حفظ المخطط"}


@app.post("/login")
def login(username: str, password: str, db: Session = Depends(get_db)):
    user = get_user(username)
    if not user or not verify_password(password, user.password):
        return {"error": "اسم المستخدم أو كلمة السر غلط"}
    token = jwt.encode(
        {
            "username": user.username,
            "role": user.role,
            "exp": datetime.utcnow() + timedelta(hours=8)
        },
        SECRET_KEY
    )
    return {
        "token": token,
        "role": user.role,
        "username": user.username,
        "message": f"أهلاً {user.username}!"
    }


@app.post("/agent/ask")
def ask_report_agent(question: str, api_key: str):
    from agents.report_agent import ask_agent
    try:
        answer = ask_agent(question, api_key)
        return {"answer": answer}
    except Exception as e:
        return {"error": str(e)}


@app.post("/whatsapp")
async def whatsapp_webhook(request: Request):
    from agents.whatsapp_agent import process_whatsapp_message
    from twilio.twiml.messaging_response import MessagingResponse
    form = await request.form()
    message = form.get("Body", "")
    reply = process_whatsapp_message(message, OPENAI_KEY)
    twiml = MessagingResponse()
    twiml.message(reply)
    return Response(content=str(twiml), media_type="application/xml")
