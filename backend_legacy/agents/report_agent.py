# ===================================
# وكيل التقارير - Report Agent (OpenAI Version)
# ===================================
import openai  # تم تغيير المكتبة
from database.models import SessionLocal, Order, MenuItem
from datetime import datetime, date

def get_today_stats(restaurant_id: int):
    """جلب إحصائيات اليوم من قاعدة البيانات — مقيّد بمطعم واحد"""
    from database.tenant import tenant_query
    db = SessionLocal()

    # كل الطلبات (لهذا المطعم فقط)
    all_orders = tenant_query(db, Order, restaurant_id).all()
    today_orders = [o for o in all_orders if o.created_at and o.created_at.date() == date.today()]

    # المبيعات
    total_sales = sum(o.total_price for o in today_orders)
    pending = len([o for o in today_orders if o.status == "pending"])
    done = len([o for o in today_orders if o.status == "done"])

    # المنيو
    menu_items = tenant_query(db, MenuItem, restaurant_id).all()
    menu_list = [f"{i.name}: {i.price} د.ع" for i in menu_items]
    
    db.close()
    
    return {
        "today_orders": len(today_orders),
        "total_sales": total_sales,
        "pending": pending,
        "done": done,
        "menu": menu_list,
        "all_orders_count": len(all_orders),
        "all_sales": sum(o.total_price for o in all_orders),
    }

def ask_agent(question: str, api_key: str, restaurant_id: int) -> str:
    """سؤال الوكيل الذكي باستخدام OpenAI"""

    # جلب البيانات الحقيقية
    stats = get_today_stats(restaurant_id)
    
    # تجهيز السياق للوكيل
    context = f"""
    أنت مساعد ذكي لنظام إدارة مطعم Waheed.
    
    إحصائيات اليوم:
    - طلبات اليوم: {stats['today_orders']}
    - مبيعات اليوم: {stats['total_sales']} د.ع
    - طلبات قيد التنفيذ: {stats['pending']}
    - طلبات منجزة: {stats['done']}
    
    إجمالي كل الوقت:
    - إجمالي الطلبات: {stats['all_orders_count']}
    - إجمالي المبيعات: {stats['all_sales']} د.ع
    
    المنيو الحالي:
    {chr(10).join(stats['menu'])}
    
    أجب بالعربية بشكل مختصر ومفيد.
    """
    
    # إرسال لـ OpenAI
    client = openai.OpenAI(api_key=api_key)
    
    response = client.chat.completions.create(
        model="gpt-4o-mini",  # نموذج سريع واقتصادي وممتاز للتقارير
        messages=[
            {
                "role": "system",
                "content": context
            },
            {
                "role": "user",
                "content": question
            }
        ],
        max_tokens=500
    )
    
    return response.choices[0].message.content