"""OpenAI through the official SDK (plan §6.1), chat completions with tools: our message list maps
onto it one to one, which keeps the fallback path simple."""

import json
from typing import Optional

from django.conf import settings

from ai.providers.base import (
    Completion,
    CompletionRequest,
    Provider,
    ProviderBusy,
    ProviderError,
    ToolCall,
    Usage,
)


class OpenAIProvider(Provider):
    def __init__(self, name: str = "openai", model: Optional[str] = None):
        self.name = name
        self.model = model or "gpt-4o-mini"

    def complete(self, request: CompletionRequest) -> Completion:
        import openai

        client = openai.OpenAI(api_key=settings.AI_PROVIDER_KEYS["openai"])
        options = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": request.system},
                *_messages(request.messages),
            ],
            "max_completion_tokens": request.max_output_tokens,
        }
        if request.tools:
            options["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    },
                }
                for tool in request.tools
            ]
        if request.response_schema is not None:
            options["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "answer", "schema": request.response_schema},
            }
        try:
            response = client.chat.completions.create(**options)
        except (openai.RateLimitError, openai.InternalServerError, openai.APIConnectionError) as e:
            raise ProviderBusy(str(e)) from e
        except openai.APIStatusError as e:
            if e.status_code >= 500:
                raise ProviderBusy(str(e)) from e
            raise ProviderError(str(e)) from e
        return _completion(response, self.model)


def _messages(messages: list) -> list:
    rows = []
    for message in messages:
        if message.role == "assistant":
            row = {"role": "assistant", "content": message.content or None}
            if message.tool_calls:
                row["tool_calls"] = [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": json.dumps(call.arguments, ensure_ascii=False),
                        },
                    }
                    for call in message.tool_calls
                ]
            rows.append(row)
        elif message.role == "tool":
            rows.append(
                {"role": "tool", "tool_call_id": message.tool_call_id, "content": message.content}
            )
        else:
            rows.append({"role": "user", "content": message.content})
    return rows


def _completion(response, model: str) -> Completion:
    choice = response.choices[0].message
    calls = [
        ToolCall(id=call.id, name=call.function.name, arguments=_arguments(call.function.arguments))
        for call in (choice.tool_calls or [])
    ]
    usage = response.usage
    return Completion(
        text=choice.content or "",
        tool_calls=calls,
        model=response.model or model,
        usage=Usage(
            prompt_tokens=(usage.prompt_tokens or 0) if usage else 0,
            completion_tokens=(usage.completion_tokens or 0) if usage else 0,
        ),
    )


def _arguments(raw: str) -> dict:
    try:
        parsed = json.loads(raw or "{}")
    except ValueError:
        return {}
    return parsed if isinstance(parsed, dict) else {}
