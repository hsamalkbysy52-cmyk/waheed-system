import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const { messages, menuText } = await req.json();

  const key = process.env.OPENAI_API_KEY;

  if (!key || key.startsWith("sk-your")) {
    return NextResponse.json(
      { error: "يرجى ضبط OPENAI_API_KEY في ملف .env.local" },
      { status: 500 }
    );
  }

  const client = new OpenAI({ apiKey: key });

  const system = `أنت مساعد مطعم Waheed الذكي والودود.
تساعد الزبائن في:
- الاستفسار عن المنيو والأسعار والمكونات
- التوصيات بناءً على الذوق والحساسية الغذائية
- إنشاء طلبات مباشرة

المنيو المتاح حالياً:
${menuText || "لا توجد أصناف متاحة حالياً"}

قواعد الرد:
- كن ودوداً ومختصراً (2-3 جمل كحد أقصى)
- رد بنفس لغة الزبون (عربي أو إنجليزي)
- عند تأكيد الطلب اذكر الأصناف بسعرها الكامل
- عندما يريد الزبون وضع طلب وتعرف رقم الطاولة والأصناف، أضف في نهاية ردك السطر التالي حرفياً بدون أي تعديل:
  __ORDER__{"table":رقم_الطاولة,"items":[{"name":"اسم_الصنف","quantity":الكمية,"price":السعر}]}__END__`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 500,
      messages: [
        { role: "system", content: system },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `خطأ في OpenAI: ${msg}` }, { status: 500 });
  }
}
