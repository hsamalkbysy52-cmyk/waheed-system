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
