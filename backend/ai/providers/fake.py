"""The scripted Provider for tests (spec story 50): answers come from a script, calls are recorded.

A script is a list of steps consumed in order; a step is a ``Completion`` (text or tool calls),
an exception instance to raise, or a plain string (shorthand for a text answer). Scripts are kept
per Provider name so a test can make Gemini busy and OpenAI answer.
"""

from typing import Optional

from ai.providers.base import Completion, CompletionRequest, Provider, ToolCall


class FakeProvider(Provider):
    scripts: dict = {}  # provider name -> list of steps
    calls: list = []  # (provider name, CompletionRequest) in order

    def __init__(self, name: str = "fake", model: Optional[str] = None):
        self.name = name
        self.model = model or f"fake-{name}"

    def complete(self, request: CompletionRequest) -> Completion:
        self.calls.append((self.name, request))
        script = self.scripts.get(self.name) or []
        step = script.pop(0) if script else "..."
        if isinstance(step, BaseException):
            raise step
        if isinstance(step, str):
            return Completion(text=step, tool_calls=[], model=self.model)
        return step

    @classmethod
    def reset(cls) -> None:
        cls.scripts = {}
        cls.calls = []

    @classmethod
    def script(cls, name: str, *steps) -> None:
        cls.scripts[name] = list(steps)


def tool_call_step(name: str, arguments: dict, call_id: str = "call-1") -> Completion:
    """A scripted turn in which the model asks for one tool."""
    return Completion(
        text="", tool_calls=[ToolCall(id=call_id, name=name, arguments=arguments)], model="fake"
    )
