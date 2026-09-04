"""Arabic messages the API answers with. The frontend displays them, so they stay byte-identical
to the legacy API's wherever the legacy API had one (tests/goldens/legacy)."""

# Authentication and tenancy (legacy database/tenant.py)
MISSING_TOKEN = "توكن غير موجود"
INVALID_TOKEN = "توكن غير صالح"
FOREIGN_RESTAURANT = "غير مسموح بالوصول لمطعم آخر"
RESTAURANT_SUSPENDED = "هذا المطعم موقوف حالياً"
PLATFORM_ADMIN_ONLY = "هذه الصفحة لمدير المنصة فقط"
RESTAURANT_NOT_FOUND = "المطعم غير موجود"

# New with the rebuild
RESTAURANT_UNAVAILABLE = "المطعم غير متاح حالياً"  # customers of a Suspended Restaurant (Q4)
RESTAURANT_NOT_SPECIFIED = "المطعم غير محدد"  # tenant route called without a Restaurant
PLATFORM_ROUTE_ONLY = "هذا المسار للمنصة فقط"  # platform route called with a Restaurant
RESTAURANT_ADMIN_ONLY = "هذه العملية لمدير المطعم فقط"
STAFF_ONLY = "هذه العملية لموظفي المطعم فقط"

# Super admin console (legacy main.py, routes 40 and 41)
INVALID_RESTAURANT_STATUS = "قيمة status غير صالحة — active أو suspended فقط"
RESTAURANT_STATUS_UPDATED = "تم تحديث حالة المطعم"

# Accounts (legacy main.py)
WRONG_CREDENTIALS = "البريد الإلكتروني أو كلمة السر غلط"
RESTAURANT_NAME_REQUIRED = "اسم المطعم مطلوب"
INVALID_EMAIL = "البريد الإلكتروني غير صالح"
PASSWORD_TOO_SHORT = "كلمة السر لازم تكون 6 أحرف على الأقل"
EMAIL_TAKEN = "البريد الإلكتروني مستخدم مسبقاً"

# Menu, Variants and modifiers (legacy main.py, routes 2 to 15)
MENU_ITEM_NOT_FOUND = "الصنف غير موجود"
MENU_ITEM_ADDED = "تم إضافة {name}"
MENU_ITEM_EDITED = "تم تعديل الصنف"
MENU_ITEM_DELETED = "تم حذف الصنف"
MENU_ITEM_TOGGLED = "تم تغيير الحالة"
MODIFIER_GROUP_NOT_FOUND = "المجموعة غير موجودة"
MODIFIER_GROUP_CREATED = "تم إنشاء المجموعة"
MODIFIER_GROUP_EDITED = "تم تعديل المجموعة"
MODIFIER_GROUP_DELETED = "تم حذف المجموعة والخيارات"
MODIFIER_GROUPS_REORDERED = "تم ترتيب المجموعات"
MODIFIER_OPTION_NOT_FOUND = "الخيار غير موجود"
MODIFIER_OPTION_ADDED = "تم إضافة الخيار"
MODIFIER_OPTION_EDITED = "تم تعديل الخيار"
MODIFIER_OPTION_DELETED = "تم حذف الخيار"
MODIFIER_OPTIONS_REORDERED = "تم ترتيب الخيارات"

# Inventory and Recipes (legacy main.py, routes 29 to 34)
INVENTORY_ITEM_ADDED = "تم إضافة {name}"
INVENTORY_ITEM_EDITED = "تم تعديل المادة"
INVENTORY_ITEM_DELETED = "تم حذف المادة"
INVENTORY_ITEM_NOT_FOUND = "المادة غير موجودة"
LINKED_INVENTORY_ITEM_NOT_FOUND = "مادة المخزون غير موجودة"  # named by a Recipe or an option
RECIPE_SAVED = "تم حفظ الوصفة"
RECIPE_DUPLICATE_INGREDIENT = "مادة المخزون مكررة في الوصفة"  # new: the database keeps one line

# Table layout (legacy main.py, route 37)
LAYOUT_SAVED = "تم حفظ المخطط"

# Orders and payments (legacy main.py, routes 16, 17, 20 to 28)
ORDER_SAVED = "تم حفظ الطلب!"
INSUFFICIENT_STOCK = "مخزون غير كافٍ: {names}"
ORDER_NOT_FOUND = "الطلب غير موجود"
ORDER_NOT_FOUND_ALT = "الطلب مو موجود"  # the legacy spelling on the ready, done and cancel routes
ORDER_READY = "الطلب جاهز للتقديم!"
ORDER_BACK_TO_PREPARING = "تم إرجاع الطلب لقيد التحضير"
ORDER_EDITED = "تم تعديل الطلب"
ORDER_NOT_EDITABLE = "لا يمكن تعديل الطلب بعد إعداده"
ORDER_DELETED = "تم حذف الطلب"
ORDER_SERVED = "تم تقديم الطلب للطاولة"
PAYMENT_RECORDED = "تم تسجيل الدفع"
ORDER_DONE = "تم الدفع وإنجاز الطلب!"
ORDER_CANCELLED = "تم إلغاء الطلب!"
ORDER_ALREADY_CANCELLED = "الطلب ملغي مسبقاً"
ORDER_CLOSED = "الطلب مغلق ولا يمكن تغييره"  # new: done and cancelled are final
FRAUD_ALERT = "⚠️ {cashier} ألغى 3 طلبات أو أكثر خلال ساعة — تم إبلاغ المالك."
ONLINE_ORDERING_UNAVAILABLE = "الطلب الإلكتروني غير متاح حالياً، الرجاء الطلب من الكاشير مباشرة."

# Quantity-based orders (new route POST /orders, spec)
ORDER_LINE_QUANTITY_INVALID = "الكمية يجب أن تكون 1 أو أكثر"
ORDER_ITEM_NOT_ON_MENU = "الصنف غير موجود في القائمة: {name}"
