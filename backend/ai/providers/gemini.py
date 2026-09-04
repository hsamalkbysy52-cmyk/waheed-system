"""Gemini through the google-genai SDK (plan §6.1): ``generate_content`` with manual function
calling, so the agent, not the SDK, runs the tool loop and every call is logged."""

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

RATE_LIMITED = 429


class GeminiProvider(Provider):
    def __init__(self, name: str = "gemini", model: Optional[str] = None):
        self.name = name
        self.model = model or "gemini-2.5-flash"

    def complete(self, request: CompletionRequest) -> Completion:
        from google import genai
        from google.genai import errors, types

        client = genai.Client(api_key=settings.AI_PROVIDER_KEYS["gemini"])
        config = types.GenerateContentConfig(
            system_instruction=request.system,
            max_output_tokens=request.max_output_tokens,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        if request.tools:
            config.tools = [
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=tool.name,
                            description=tool.description,
                            parameters_json_schema=tool.parameters,
                        )
                        for tool in request.tools
                    ]
                )
            ]
        if request.response_schema is not None:
            config.response_mime_type = "application/json"
            config.response_json_schema = request.response_schema
        try:
            response = client.models.generate_content(
                model=self.model, contents=_contents(request.messages, types), config=config
            )
        except errors.ServerError as failure:
            raise ProviderBusy(str(failure)) from failure
        except errors.ClientError as failure:
            if failure.code == RATE_LIMITED:
                raise ProviderBusy(str(failure)) from failure
            raise ProviderError(str(failure)) from failure
        except errors.APIError as failure:
            raise ProviderError(str(failure)) from failure
        return _completion(response, self.model)


def _contents(messages: list, types) -> list:
    """Our turns as Gemini contents: tool results ride in a user turn as function responses."""
    contents = []
    for message in messages:
        if message.role == "assistant":
            parts = [types.Part(text=message.content)] if message.content else []
            parts += [
                types.Part(
                    function_call=types.FunctionCall(
                        id=call.id, name=call.name, args=call.arguments
                    )
                )
                for call in message.tool_calls
            ]
            contents.append(types.Content(role="model", parts=parts))
        elif message.role == "tool":
            part = types.Part.from_function_response(
                name=message.name, response={"result": _loads(message.content)}
            )
            if contents and contents[-1].role == "user" and _is_function_response(contents[-1]):
                contents[-1].parts.append(part)  # several tool answers share one turn
            else:
                contents.append(types.Content(role="user", parts=[part]))
        else:
            contents.append(types.Content(role="user", parts=[types.Part(text=message.content)]))
    return contents


def _is_function_response(content) -> bool:
    return bool(content.parts) and content.parts[0].function_response is not None


def _loads(text: str):
    try:
        return json.loads(text)
    except ValueError:
        return text


def _completion(response, model: str) -> Completion:
    calls = [
        ToolCall(id=call.id or f"call-{index}", name=call.name, arguments=dict(call.args or {}))
        for index, call in enumerate(response.function_calls or [])
    ]
    usage = response.usage_metadata
    return Completion(
        text=(response.text or "") if not calls else "",
        tool_calls=calls,
        model=model,
        usage=Usage(
            prompt_tokens=(usage.prompt_token_count or 0) if usage else 0,
            completion_tokens=(usage.candidates_token_count or 0) if usage else 0,
        ),
    )
