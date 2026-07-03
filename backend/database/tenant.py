# ===================================
# طبقة العزل الإجبارية — Multi-Tenant Access Layer
# ===================================
# كل وصول لجداول المستأجرين يمر من هنا. لا تستدعِ db.query() مباشرة
# على MenuItem / Order / CancellationLog / InventoryItem / TableLayoutElement / User.
#
# قواعد تحديد هوية المطعم (get_restaurant_id):
#   - مستخدم عادي (admin/cashier): مطعمه يُقرأ من الـ JWT حصراً.
#     أي محاولة لتمرير X-Restaurant-Id مخالف تُرفض بـ 403 — الهوية من التوكن لا من الطلب.
#   - super_admin (restaurant_id = NULL في التوكن): يحدد المطعم الذي يعمل عليه
#     عبر هيدر X-Restaurant-Id، وإن لم يحدده يعمل على المطعم 1.
#   - بلا توكن: جسر المرحلة الانتقالية — المطعم 1 (الواجهة الحالية لا ترسل
#     توكن مع كل طلب). يُشدد لاحقاً عند تفعيل مطاعم إضافية.

import os
from typing import Optional

from fastapi import Header, HTTPException
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from database.models import MenuItem, ModifierGroup, ModifierOption, InventoryItem, Order

SECRET_KEY = os.getenv("JWT_SECRET", "waheed-secret-2024")

# الجسر الانتقالي: المطعم الوحيد الحالي — يُستخدم عند غياب التوكن
DEFAULT_RESTAURANT_ID = 1


def get_restaurant_id(
    authorization: Optional[str] = Header(None),
    x_restaurant_id: Optional[int] = Header(None),
) -> int:
    """FastAPI dependency: هوية المطعم للطلب الحالي — من التوكن، لا من العميل."""
    if authorization and authorization.startswith("Bearer "):
        try:
            payload = jwt.decode(authorization[7:], SECRET_KEY)
        except JWTError:
            raise HTTPException(status_code=401, detail="توكن غير صالح")

        role = payload.get("role")
        token_rid = payload.get("restaurant_id")

        # super_admin: بلا مطعم في التوكن — يختار مطعم العمل عبر الهيدر
        if role == "super_admin":
            return x_restaurant_id if x_restaurant_id is not None else DEFAULT_RESTAURANT_ID

        # مستخدم عادي: مطعمه من التوكن حصراً — الهيدر المخالف انتهاك عزل
        if token_rid is not None:
            if x_restaurant_id is not None and x_restaurant_id != token_rid:
                raise HTTPException(status_code=403, detail="غير مسموح بالوصول لمطعم آخر")
            return token_rid

        # توكن قديم (قبل الترحيل) بلا restaurant_id — جسر انتقالي
    return DEFAULT_RESTAURANT_ID


def tenant_query(db: Session, model, restaurant_id: int):
    """نقطة البداية الوحيدة لأي استعلام على جدول مستأجرين — الفلترة مدمجة لا اختيارية."""
    assert hasattr(model, "restaurant_id"), f"{model.__name__} ليس جدول مستأجرين"
    return db.query(model).filter(model.restaurant_id == restaurant_id)


def tenant_add(db: Session, obj, restaurant_id: int):
    """الإضافة الوحيدة المسموحة لجداول المستأجرين — الوسم يُحقن هنا، لا يُترك للمستدعي."""
    assert hasattr(obj, "restaurant_id"), f"{type(obj).__name__} ليس جدول مستأجرين"
    obj.restaurant_id = restaurant_id
    db.add(obj)
    return obj


# ---------- الجداول التابعة (بلا restaurant_id خاص): تُؤمَّن عبر سلسلة الأب ----------

def owned_menu_item(db: Session, restaurant_id: int, item_id: int) -> Optional[MenuItem]:
    """الصنف إن كان يخص المطعم — وإلا None (لا فرق بين غير موجود وملك غيرك)."""
    return tenant_query(db, MenuItem, restaurant_id).filter(MenuItem.id == item_id).first()


def owned_inventory_item(db: Session, restaurant_id: int, inv_id: int) -> Optional[InventoryItem]:
    return tenant_query(db, InventoryItem, restaurant_id).filter(InventoryItem.id == inv_id).first()


def owned_order(db: Session, restaurant_id: int, order_id: int) -> Optional[Order]:
    """الطلب إن كان يخص المطعم — وإلا None."""
    return tenant_query(db, Order, restaurant_id).filter(Order.id == order_id).first()


def owned_modifier_group(db: Session, restaurant_id: int, group_id: int) -> Optional[ModifierGroup]:
    """المجموعة إن كان صنفها الأب يخص المطعم."""
    return (
        db.query(ModifierGroup)
        .join(MenuItem, MenuItem.id == ModifierGroup.menu_item_id)
        .filter(ModifierGroup.id == group_id, MenuItem.restaurant_id == restaurant_id)
        .first()
    )


def owned_modifier_option(db: Session, restaurant_id: int, option_id: int) -> Optional[ModifierOption]:
    """الخيار إن كانت سلسلته (خيار ← مجموعة ← صنف) تعود للمطعم."""
    return (
        db.query(ModifierOption)
        .join(ModifierGroup, ModifierGroup.id == ModifierOption.group_id)
        .join(MenuItem, MenuItem.id == ModifierGroup.menu_item_id)
        .filter(ModifierOption.id == option_id, MenuItem.restaurant_id == restaurant_id)
        .first()
    )
