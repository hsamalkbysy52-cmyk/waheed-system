"""The Provider interface every AI backend implements (plan §6.1).

Agents speak this vocabulary only: a system prompt, a list of messages, optional tools and an
optional JSON schema for the answer. Each Provider translates it to its SDK and back, so agents
never import a vendor SDK and a fake can stand in for both vendors in tests.
"""

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict  # JSON schema of the arguments


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class Message:
    """One turn. ``role`` is user, assistant or tool; a tool turn answers ``tool_call_id``."""

    role: str
    content: str = ""
    tool_calls: list = field(default_factory=list)  # assistant turns that asked for tools
    tool_call_id: Optional[str] = None  # tool turns
    name: Optional[str] = None  # tool turns: which tool answered


@dataclass(frozen=True)
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass(frozen=True)
class Completion:
    text: str
    tool_calls: list  # [ToolCall]; empty when the model answered in text
    model: str
    usage: Usage = Usage()


@dataclass(frozen=True)
class CompletionRequest:
    system: str
    messages: list  # [Message]
    tools: list = field(default_factory=list)  # [ToolSpec]
    response_schema: Optional[dict] = None  # ask for JSON matching this schema
    max_output_tokens: int = 800


class ProviderBusy(Exception):
    """Rate limited (429) or the vendor's servers failed (5xx): try the other Provider."""


class ProviderError(Exception):
    """Anything else the vendor refused: a bad key, a malformed request. Not retried elsewhere."""


class Provider:
    name: str = ""
    model: str = ""

    def complete(self, request: CompletionRequest) -> Completion:
        raise NotImplementedError


def tool_result_message(call: ToolCall, result: Any) -> Message:
    import json

    return Message(
        role="tool",
        content=json.dumps(result, ensure_ascii=False, default=str),
        tool_call_id=call.id,
        name=call.name,
    )
