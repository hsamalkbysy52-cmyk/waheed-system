from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, text, UniqueConstraint
from sqlalchemy.orm import Session
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
    restaurant_id = Column(Integer, nullable=False, server_default="1", index=True)  # server_default جسر مؤقت — يُزال في المرحلة 7
    name = Column(String)
    price = Column(Float)
    category = Column(String)
    is_available = Column(Boolean, default=True)
    description = Column(String, nullable=True)
    parent_id = Column(Integer, nullable=True)   # set = this item is a variant of parent dish


class Order(Base):
    __tablename__ = "orders"
    # client_id فريد داخل المطعم الواحد — لا عالمياً (مطعمان قد يستخدمان نفس UUID)
    __table_args__ = (UniqueConstraint("restaurant_id", "client_id", name="uq_orders_restaurant_client"),)

    id = Column(Integer, primary_key=True)
    restaurant_id = Column(Integer, nullable=False, server_default="1", index=True)
    table_number = Column(Integer)
    total_price = Column(Float)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    items_json = Column(String, nullable=True)
    cashier = Column(String(100), nullable=True)
    notes = Column(String, nullable=True)
    payment_method = Column(String(10), nullable=True)   # null=unpaid; cash/card/qr=prepaid
    client_id = Column(String(36), nullable=True)  # UUID sent by client for idempotency — unique per restaurant (see __table_args__)


class CancellationLog(Base):
    __tablename__ = "cancellation_logs"

    id = Column(Integer, primary_key=True)
    restaurant_id = Column(Integer, nullable=False, server_default="1", index=True)
    order_id = Column(Integer)
    cashier = Column(String)
    cancelled_at = Column(DateTime, default=datetime.now)


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True)
    restaurant_id = Column(Integer, nullable=False, server_default="1", index=True)
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
    restaurant_id = Column(Integer, nullable=False, server_default="1", index=True)
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


class Restaurant(Base):
    __tablename__ = "restaurants"

    id = Column(Integer, primary_key=True)
    name = Column(String, default="Waheed Restaurant")
    last_heartbeat_at = Column(DateTime, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    status = Column(String, nullable=False, server_default="active")  # active / suspended
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)


def is_restaurant_online(db: Session) -> bool:
    """True if a heartbeat arrived within the last 90 seconds."""
    from datetime import datetime, timedelta
    r = db.query(Restaurant).filter(Restaurant.id == 1).first()
    if not r or r.last_heartbeat_at is None:
        return False
    return r.last_heartbeat_at >= datetime.utcnow() - timedelta(seconds=90)


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
            "ALTER TABLE orders ADD COLUMN client_id VARCHAR(36)",
            # --- Multi-tenant المرحلة 1: عمود المطعم في كل جدول بيانات ---
            "ALTER TABLE menu_items ADD COLUMN restaurant_id INTEGER",
            "ALTER TABLE orders ADD COLUMN restaurant_id INTEGER",
            "ALTER TABLE cancellation_logs ADD COLUMN restaurant_id INTEGER",
            "ALTER TABLE inventory_items ADD COLUMN restaurant_id INTEGER",
            "ALTER TABLE table_layout ADD COLUMN restaurant_id INTEGER",
            "ALTER TABLE users ADD COLUMN restaurant_id INTEGER",
            # --- تسجيل مطاعم جديدة + لوحة super_admin: أعمدة إضافية (المرحلة 1) ---
            "ALTER TABLE restaurants ADD COLUMN email VARCHAR",
            "ALTER TABLE restaurants ADD COLUMN phone VARCHAR",
            "ALTER TABLE restaurants ADD COLUMN status VARCHAR",
            "ALTER TABLE restaurants ADD COLUMN created_at DATETIME",
            "ALTER TABLE users ADD COLUMN email VARCHAR",
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass
        # قيم افتراضية للمطاعم الموجودة قبل إضافة هذه الأعمدة — غير ملتبسة، لا حاجة لفشل صارم
        for backfill_sql in [
            "UPDATE restaurants SET status = 'active' WHERE status IS NULL",
            "UPDATE restaurants SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL",
        ]:
            try:
                conn.execute(text(backfill_sql))
                conn.commit()
            except Exception:
                pass
        # فهارس restaurant_id — ضرورية لأداء الفلترة الإجبارية بكل استعلام
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS ix_menu_items_restaurant_id ON menu_items(restaurant_id)",
            "CREATE INDEX IF NOT EXISTS ix_orders_restaurant_id ON orders(restaurant_id)",
            "CREATE INDEX IF NOT EXISTS ix_cancellation_logs_restaurant_id ON cancellation_logs(restaurant_id)",
            "CREATE INDEX IF NOT EXISTS ix_inventory_items_restaurant_id ON inventory_items(restaurant_id)",
            "CREATE INDEX IF NOT EXISTS ix_table_layout_restaurant_id ON table_layout(restaurant_id)",
            "CREATE INDEX IF NOT EXISTS ix_users_restaurant_id ON users(restaurant_id)",
        ]:
            try:
                conn.execute(text(idx_sql))
                conn.commit()
            except Exception:
                pass
    print("DB tables ready")


# الجداول الخاضعة لعزل المستأجرين — كل صف فيها يجب أن يحمل restaurant_id
TENANT_TABLES = ["menu_items", "orders", "cancellation_logs", "inventory_items", "table_layout"]


def backfill_restaurant_id():
    """المرحلة 2: وسم كل الصفوف القديمة بالمطعم الحالي الوحيد (id=1).

    آمنة للتشغيل عند كل إقلاع (WHERE restaurant_id IS NULL فقط).
    لو بقي أي صف NULL بعد التعبئة: RuntimeError — السيرفر لا يعمل ببيانات غير موسومة.
    """
    with engine.connect() as conn:
        for t in TENANT_TABLES:
            conn.execute(text(f"UPDATE {t} SET restaurant_id = 1 WHERE restaurant_id IS NULL"))
        # المستخدمون: الجميع يتبع المطعم 1 ما عدا super_admin (مدير المنصة — بلا مطعم)
        conn.execute(text(
            "UPDATE users SET restaurant_id = 1 "
            "WHERE restaurant_id IS NULL AND role != 'super_admin'"
        ))
        conn.commit()

        # تحقق ذاتي صارم — أي NULL متبقٍ يوقف الإقلاع فوراً
        failures = []
        for t in TENANT_TABLES:
            remaining = conn.execute(
                text(f"SELECT COUNT(*) FROM {t} WHERE restaurant_id IS NULL")
            ).scalar()
            if remaining:
                failures.append(f"{t}: {remaining} rows still NULL")
        if failures:
            raise RuntimeError(
                "MIGRATION FAILED — restaurant_id backfill incomplete, refusing to start: "
                + "; ".join(failures)
            )
    print("Backfill OK: all tenant rows tagged with restaurant_id")


def enforce_not_null_restaurant_id():
    """المرحلة 3: فرض NOT NULL + استبدال القيود الفريدة الأحادية بمركّبة لكل مطعم.

    يُستدعى فقط بعد نجاح backfill_restaurant_id() (التي توقف السيرفر عند أي فشل).
    - PostgreSQL: فرض فعلي على مستوى القاعدة. DEFAULT 1 جسر مؤقت يُزال في المرحلة 7.
    - SQLite: لا يدعم ALTER COLUMN — يُغطى عبر تعريفات الـ models للقواعد الجديدة.
    الأوامر كلها idempotent فلا تُبتلع أخطاؤها — أي فشل حقيقي يجب أن يوقف الإقلاع.
    """
    with engine.connect() as conn:
        if engine.dialect.name == "postgresql":
            for t in TENANT_TABLES:
                conn.execute(text(f"ALTER TABLE {t} ALTER COLUMN restaurant_id SET DEFAULT 1"))
                conn.execute(text(f"ALTER TABLE {t} ALTER COLUMN restaurant_id SET NOT NULL"))
                conn.commit()
            # القيود الفريدة القديمة المعرفة inline عند إنشاء الجدول (إن وجدت)
            conn.execute(text("ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_client_id_key"))
            conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key"))
            conn.commit()

        # الفهارس المركّبة — صيغة تعمل على SQLite وPostgreSQL معاً
        for sql in [
            "DROP INDEX IF EXISTS ix_orders_client_id",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_restaurant_client ON orders(restaurant_id, client_id)",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_restaurant_username ON users(restaurant_id, username)",
            # حسابات super_admin (بلا مطعم): NULL لا يخضع للقيد المركّب — فهرس جزئي خاص بها
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_superadmin_username ON users(username) WHERE restaurant_id IS NULL",
        ]:
            conn.execute(text(sql))
            conn.commit()
    print("NOT NULL enforcement OK: restaurant_id constraints active")


def backfill_user_emails():
    """تسجيل مطاعم/دخول موحّد: users.email يصير معرّف الدخول الوحيد، فريد عالمياً.

    الحسابات القديمة (admin/cashier/superadmin) ما عندها بريد حقيقي — نعطيها بريد
    مؤقت مصطنع حصراً حتى يقبل القيد الفريد، لا يُقصد استخدامه فعلياً.
    آمنة للتشغيل عند كل إقلاع (WHERE email IS NULL فقط).
    لو بقي أي صف NULL بعد التعبئة: RuntimeError — نفس أسلوب backfill_restaurant_id().
    """
    with engine.connect() as conn:
        placeholder_count = conn.execute(
            text("SELECT COUNT(*) FROM users WHERE email IS NULL")
        ).scalar()

        conn.execute(text(
            "UPDATE users SET email = username || '@restaurant' || restaurant_id || '.local.placeholder' "
            "WHERE email IS NULL AND restaurant_id IS NOT NULL"
        ))
        # super_admin: بلا مطعم — نطاق مختلف يمنع أي تصادم مع بريد مطعم عادي
        conn.execute(text(
            "UPDATE users SET email = username || '@platform.local.placeholder' "
            "WHERE email IS NULL AND restaurant_id IS NULL"
        ))
        conn.commit()

        remaining = conn.execute(text("SELECT COUNT(*) FROM users WHERE email IS NULL")).scalar()
        if remaining:
            raise RuntimeError(
                f"MIGRATION FAILED — users.email backfill incomplete, refusing to start: {remaining} rows still NULL"
            )

        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users(email)"))
        conn.commit()

        if placeholder_count:
            print(
                f"WARNING: {placeholder_count} account(s) got a placeholder email "
                "(username@...local.placeholder) — replace with a real email before relying on it for login"
            )
    print("Email backfill OK: users.email is globally unique and ready as the login identifier")


def seed_restaurant():
    db = SessionLocal()
    if db.query(Restaurant).count() == 0:
        db.add(Restaurant(id=1, name="Waheed Restaurant", status="active", created_at=datetime.utcnow()))
        db.commit()
        print("Default restaurant record seeded")
    db.close()


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
