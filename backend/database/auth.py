from sqlalchemy import Column, Integer, String
from database.models import Base, engine, SessionLocal
from passlib.context import CryptContext

# أداة تشفير كلمة السر
pwd_context = CryptContext(schemes=["bcrypt"])

# جدول المستخدمين
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True)
    password = Column(String)
    role = Column(String)  # admin / cashier

# إنشاء الجدول + مستخدمين افتراضيين
def create_users():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    
    # لو ما في مستخدمين — أضف الافتراضيين
    if db.query(User).count() == 0:
        users = [
            User(
                username="admin",
                password=pwd_context.hash("admin123"),
                role="admin"
            ),
            User(
                username="cashier",
                password=pwd_context.hash("cashier123"),
                role="cashier"
            ),
        ]
        for u in users:
            db.add(u)
        db.commit()
        print("✅ تم إنشاء المستخدمين!")
    db.close()

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def get_user(username: str):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    db.close()
    return user