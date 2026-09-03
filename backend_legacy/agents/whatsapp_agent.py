# ===================================
# واتساب بوت - WhatsApp Agent
# ===================================
from openai import OpenAI
from database.models import SessionLocal, MenuItem, Order
from datetime import date

def get_menu_text():
    """جلب المنيو كنص"""
    db = SessionLocal()
    items = db.query(MenuItem).filter(MenuItem.is_available == True).all()
    db.close()
    
    menu_text = "📋 منيونا:\n"
    for item in items:
        menu_text += f"• {item.name} - {item.price} د.ع\n"
    return menu_text

def create_order_from_items(item_names: list, table_number: int = 0):
    """إنشاء طلب من قائمة أصناف"""
    db = SessionLocal()
    total = 0
    found_items = []
    
    for name in item_names:
        item = db.query(MenuItem).filter(MenuItem.name.contains(name)).first()
        if item:
            found_items.append(item)
            total += item.price
    
    if found_items:
        new_order = Order(
            table_number=table_number,
            total_price=total,
            status="pending"
        )
        db.add(new_order)
        db.commit()
        items_data = [{"name": item.name, "price": item.price} for item in found_items]
        db.close()
        return items_data, total

    db.close()
    return [], 0

def process_whatsapp_message(message: str, api_key: str) -> str:
    """معالجة رسالة واتساب والرد عليها"""
    
    menu_text = get_menu_text()
    
    system_prompt = f"""
    أنت بوت طلبات مطعم Waheed على واتساب.
    
    {menu_text}
    
    مهمتك:
    1. لو العميل يسأل عن المنيو → أرسل له المنيو
    2. لو العميل يطلب أصناف → استخرج الأصناف وأكد الطلب
    3. لو العميل يقول أي شي ثاني → رد بلطف وأعد توجيهه للطلب
    
    ردودك لازم تكون:
    - قصيرة ومختصرة
    - باللهجة العربية المحلية
    - تنتهي دائماً بـ 🍔
    
    لو العميل طلب أصناف، ردك يكون بهذا الشكل بالضبط:
    ORDER:برجر,كولا
    ثم رسالة التأكيد
    """
    
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=200,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message}
        ]
    )
    
    reply = response.choices[0].message.content
    
    # لو فيه طلب في الرد
    if "ORDER:" in reply:
        lines = reply.split("\n")
        for line in lines:
            if line.startswith("ORDER:"):
                items_text = line.replace("ORDER:", "").strip()
                item_names = [i.strip() for i in items_text.split(",")]
                found_items, total = create_order_from_items(item_names)
                
                if found_items:
                    items_list = "\n".join([f"• {i['name']} - {i['price']} د.ع" for i in found_items])
                    reply = f"✅ تم استلام طلبك!\n\n{items_list}\n\nالمجموع: {total} د.ع\n\nسيصلك طلبك قريباً 🍔"
    
    return reply