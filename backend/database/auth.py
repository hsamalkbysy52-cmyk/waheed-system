from sqlalchemy import Column, Integer, String, UniqueConstraint
from database.models import Base, engine, SessionLocal
from passlib.context import CryptContext

# أداة تشفير كلمة السر
pwd_context = CryptContext(schemes=["bcrypt"])

# جدول المستخدمين
class User(Base):
    __tablename__ = "users"
    # username فريد داخل المطعم الواحد — قيد super_admin في فهرس جزئي (enforce_not_null_restaurant_id)
    __table_args__ = (UniqueConstraint("restaurant_id", "username", name="uq_users_restaurant_username"),)
    id = Column(Integer, primary_key=True)
    # NULL مسموح فقط لدور super_admin (مدير المنصة بلا مطعم محدد) — يُفرض في طبقة التطبيق
    restaurant_id = Column(Integer, nullable=True, index=True)
    username = Column(String)  # فريد داخل المطعم الواحد (فهرس مركّب في create_tables)
    password = Column(String)
    role = Column(String)  # super_admin / admin / cashier

# إنشاء الجدول + مستخدمين افتراضيين
def create_users():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    
    # لو ما في مستخدمين — أضف الافتراضيين (تابعين للمطعم 1)
    if db.query(User).count() == 0:
        users = [
            User(
                username="admin",
                password=pwd_context.hash("admin123"),
                role="admin",
                restaurant_id=1
            ),
            User(
                username="cashier",
                password=pwd_context.hash("cashier123"),
                role="cashier",
                restaurant_id=1
            ),
        ]
        for u in users:
            db.add(u)
        db.commit()
        print("✅ تم إنشاء المستخدمين!")

    # super_admin: مدير المنصة — بلا مطعم محدد (restaurant_id = NULL)
    # يُنشأ حتى على القواعد القائمة، وليس فقط عند أول تشغيل
    if db.query(User).filter(User.role == "super_admin").count() == 0:
        db.add(User(
            username="superadmin",
            password=pwd_context.hash("superadmin123"),
            role="super_admin",
            restaurant_id=None
        ))
        db.commit()
        print("✅ تم إنشاء حساب super_admin (غيّر كلمة السر الافتراضية!)")
    db.close()

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def get_user(username: str):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    db.close()
    return user