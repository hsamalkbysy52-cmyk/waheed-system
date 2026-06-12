from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////tmp/waheed.db")

# Railway provides postgres:// but SQLAlchemy requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    price = Column(Float)
    category = Column(String)
    is_available = Column(Boolean, default=True)
    description = Column(String, nullable=True)
    parent_id = Column(Integer, nullable=True)   # set = this item is a variant of parent dish


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    table_number = Column(Integer)
    total_price = Column(Float)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    items_json = Column(String, nullable=True)
    cashier = Column(String(100), nullable=True)
    notes = Column(String, nullable=True)
    payment_method = Column(String(10), nullable=True)   # null=unpaid; cash/card/qr=prepaid


class CancellationLog(Base):
    __tablename__ = "cancellation_logs"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer)
    cashier = Column(String)
    cancelled_at = Column(DateTime, default=datetime.now)


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    unit = Column(String, default="قطعة")
    quantity = Column(Float, default=0)
    min_quantity = Column(Float, default=5)


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id = Column(Integer, primary_key=True)
    menu_item_id = Column(Integer)
    inventory_item_id = Column(Integer)
    amount = Column(Float, default=1)


class TableLayoutElement(Base):
    __tablename__ = "table_layout"

    id = Column(Integer, primary_key=True)
    element_id = Column(String)
    element_type = Column(String)
    x = Column(Float, default=0)
    y = Column(Float, default=0)
    w = Column(Float, default=90)
    h = Column(Float, default=90)
    table_number = Column(Integer, nullable=True)
    capacity = Column(Integer, nullable=True)
    label = Column(String, nullable=True)


class ModifierGroup(Base):
    __tablename__ = "modifier_groups"

    id = Column(Integer, primary_key=True)
    menu_item_id = Column(Integer)
    name = Column(String)
    max_selections = Column(Integer, default=1)
    sort_order = Column(Integer, default=0)


class ModifierOption(Base):
    __tablename__ = "modifier_options"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer)
    name = Column(String)
    price_delta = Column(Float, default=0)
    inventory_item_id = Column(Integer, nullable=True)
    quantity_delta = Column(Float, default=0)
    sort_order = Column(Integer, default=0)


def create_tables():
    Base.metadata.create_all(engine)
    # Safe migration: add new columns if they don't exist (works on both SQLite and PostgreSQL)
    with engine.connect() as conn:
        for sql in [
            "ALTER TABLE orders ADD COLUMN items_json TEXT",
            "ALTER TABLE orders ADD COLUMN cashier VARCHAR(100)",
            "ALTER TABLE orders ADD COLUMN notes TEXT",
            "ALTER TABLE menu_items ADD COLUMN description TEXT",
            "ALTER TABLE orders ADD COLUMN payment_method VARCHAR(10)",
            "ALTER TABLE modifier_groups ADD COLUMN sort_order INTEGER DEFAULT 0",
            "ALTER TABLE modifier_options ADD COLUMN sort_order INTEGER DEFAULT 0",
            "ALTER TABLE menu_items ADD COLUMN parent_id INTEGER",
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass
    print("DB tables ready")


def seed_menu():
    db = SessionLocal()
    if db.query(MenuItem).count() == 0:
        items = [
            MenuItem(name="برجر",  price=5000, category="وجبات"),
            MenuItem(name="بيتزا", price=8000, category="وجبات"),
            MenuItem(name="باستا", price=6000, category="وجبات"),
            MenuItem(name="كولا",  price=1500, category="مشروبات"),
            MenuItem(name="عصير",  price=2000, category="مشروبات"),
            MenuItem(name="شاي",   price=1000, category="مشروبات"),
        ]
        db.add_all(items)
        db.commit()
        print("Menu seeded with default items")
    db.close()
