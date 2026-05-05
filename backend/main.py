from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from jose import jwt
from datetime import datetime, timedelta
import os

from database.models import SessionLocal, create_tables, seed_menu, MenuItem, Order
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
    return {"menu": items}


@app.post("/menu/add")
def add_item(name: str, price: float, category: str, db: Session = Depends(get_db)):
    item = MenuItem(name=name, price=price, category=category)
    db.add(item)
    db.commit()
    return {"message": f"تم إضافة {name}", "price": price}


class OrderItem(BaseModel):
    name: str
    price: float


class OrderRequest(BaseModel):
    items: List[OrderItem]
    table_number: int = 1


@app.get("/orders")
def get_orders(db: Session = Depends(get_db)):
    orders = db.query(Order).all()
    return {"orders": [
        {
            "id": o.id,
            "table_number": o.table_number,
            "total_price": o.total_price,
            "status": o.status,
            "created_at": str(o.created_at)
        }
        for o in orders
    ]}


@app.post("/orders/create")
def create_order(order: OrderRequest, db: Session = Depends(get_db)):
    total = sum(item.price for item in order.items)
    new_order = Order(
        table_number=order.table_number,
        total_price=total,
        status="pending"
    )
    db.add(new_order)
    db.commit()
    return {
        "message": "تم حفظ الطلب!",
        "total": total,
        "order_id": new_order.id
    }


@app.put("/orders/{order_id}/done")
def complete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"error": "الطلب مو موجود"}
    order.status = "done"
    db.commit()
    return {"message": "تم إنجاز الطلب!"}


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


@app.post("/whatsapp", response_class=PlainTextResponse)
async def whatsapp_webhook(request: Request):
    from agents.whatsapp_agent import process_whatsapp_message
    from twilio.twiml.messaging_response import MessagingResponse
    form = await request.form()
    message = form.get("Body", "")
    reply = process_whatsapp_message(message, OPENAI_KEY)
    response = MessagingResponse()
    response.message(reply)
    return str(response)
