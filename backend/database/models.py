# قاعدة بيانات نظام Waheed
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# إنشاء قاعدة البيانات
DATABASE_URL = "sqlite:///./waheed.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

# ===========================
# جدول المنيو
# ===========================
class MenuItem(Base):
    __tablename__ = "menu_items"
    
    id = Column(Integer, primary_key=True)
    name = Column(String)           # اسم الصنف
    price = Column(Float)           # السعر
    category = Column(String)       # الفئة (مشروبات، وجبات...)
    is_available = Column(Boolean, default=True)  # متوفر؟

# ===========================
# جدول الطلبات
# ===========================
class Order(Base):
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True)
    table_number = Column(Integer)  # رقم الطاولة
    total_price = Column(Float)     # المجموع
    status = Column(String, default="pending")  # pending/done
    created_at = Column(DateTime, default=datetime.now)

# إنشاء الجداول
def create_tables():
    Base.metadata.create_all(engine)
    print("✅ قاعدة البيانات جاهزة!")

if __name__ == "__main__":
    create_tables()