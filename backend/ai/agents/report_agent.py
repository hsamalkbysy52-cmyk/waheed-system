"""The Report agent (spec stories 21 to 24): an Arabic analyst over the Restaurant's own data.

The model gets an Arabic system prompt naming the Restaurant, its currency and today's local date,
the tools in ``report_tools`` and at most four tool rounds; then it must answer. Tool results are
data, never instructions, and the model never sees another Restaurant.
"""

from typing import NamedTuple, Optional
from zoneinfo import ZoneInfo

from django.utils import timezone

from ai.agents.report_tools import ReportTools
from ai.providers.base import CompletionRequest, Message, tool_result_message
from ai.services import Assistant
from tenants.models import Restaurant

MAX_TOOL_ROUNDS = 4
PURPOSE = "report"

SYSTEM_PROMPT = (
    "أنت مساعد تقارير لمطعم «{name}». أجب بالعربية بإيجاز ووضوح، وبالأرقام.\n"
    "العملة: {currency}. تاريخ اليوم بتوقيت المطعم ({timezone}): {today}.\n"
    "استخدم الأدوات المتاحة للحصول على البيانات الحقيقية قبل الإجابة؛ لا تخترع أرقاماً.\n"
    "الإيراد يحسب الطلبات المدفوعة وغير الملغية فقط. إذا لم تتوفر بيانات قل ذلك بصراحة."
)


class Answer(NamedTuple):
    text: str
    provider: str
    model: str


def ask(restaurant: Restaurant, question: str, provider: Optional[str] = None) -> Answer:
    assistant = Assistant(restaurant, PURPOSE, requested=provider)
    tools = ReportTools(restaurant)
    messages = [Message(role="user", content=question)]
    request = CompletionRequest(
        system=_system_prompt(restaurant), messages=messages, tools=tools.specs()
    )
    completion = None
    for _ in range(MAX_TOOL_ROUNDS):
        completion = assistant.complete(request)
        if not completion.tool_calls:
            break
        messages.append(
            Message(role="assistant", content=completion.text, tool_calls=completion.tool_calls)
        )
        for call in completion.tool_calls:
            messages.append(tool_result_message(call, tools.run(call.name, call.arguments)))
    else:  # four rounds of tools: ask for the answer without offering more tools
        completion = assistant.complete(
            CompletionRequest(system=request.system, messages=messages, tools=[])
        )
    return Answer(completion.text, assistant.current.name, completion.model)


def _system_prompt(restaurant: Restaurant) -> str:
    today = timezone.now().astimezone(ZoneInfo(restaurant.timezone)).strftime("%Y-%m-%d")
    return SYSTEM_PROMPT.format(
        name=restaurant.name,
        currency=restaurant.currency,
        timezone=restaurant.timezone,
        today=today,
    )
