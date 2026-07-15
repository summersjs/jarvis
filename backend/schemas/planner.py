from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ToolPlanStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    tool: str = Field(min_length=1, max_length=100)
    arguments: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[str] = Field(default_factory=list, max_length=5)


class ToolPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ready", "clarification_required", "unsupported"]
    intent: str = Field(min_length=1, max_length=120)
    steps: list[ToolPlanStep] = Field(default_factory=list, max_length=5)
    clarification_question: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_graph(self):
        ids = [step.step_id for step in self.steps]
        if len(ids) != len(set(ids)):
            raise ValueError("Plan step IDs must be unique.")
        known = set(ids)
        for step in self.steps:
            if step.step_id in step.depends_on or any(item not in known for item in step.depends_on):
                raise ValueError("Plan dependency is invalid.")
        visiting: set[str] = set()
        visited: set[str] = set()
        graph = {step.step_id: step.depends_on for step in self.steps}

        def visit(node: str):
            if node in visiting:
                raise ValueError("Plan contains a circular dependency.")
            if node in visited:
                return
            visiting.add(node)
            for dependency in graph[node]:
                visit(dependency)
            visiting.remove(node)
            visited.add(node)

        for step_id in ids:
            visit(step_id)
        return self

