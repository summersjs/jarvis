from typing import Any, Optional

from pydantic import BaseModel, Field


class ForgeProjectCreate(BaseModel):
    user_id: str = "john"
    goal_id: Optional[str] = None
    title: str
    category: str
    status: str = "Active"
    summary: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    next_milestone: Optional[str] = None
    progress_percent: Optional[float] = 0
    project_type: Optional[str] = None
    cover_image_url: Optional[str] = None


class ForgeProjectUpdate(BaseModel):
    goal_id: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    next_milestone: Optional[str] = None
    progress_percent: Optional[float] = None
    project_type: Optional[str] = None
    cover_image_url: Optional[str] = None


class ForgeSparkCreate(BaseModel):
    user_id: str = "john"
    spark_text: str
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class ForgeSparkUpdate(BaseModel):
    spark_text: Optional[str] = None
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: Optional[list[str]] = None


class ForgeNoteCreate(BaseModel):
    user_id: str = "john"
    title: str
    body: Optional[str] = None
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    note_type: Optional[str] = None
    status: Optional[str] = "active"
    is_pinned: Optional[bool] = False
    linked_milestone: Optional[str] = None
    linked_tasks: list[str] = Field(default_factory=list)
    sort_order: Optional[int] = None


class ForgeNoteUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: Optional[list[str]] = None
    note_type: Optional[str] = None
    status: Optional[str] = None
    is_pinned: Optional[bool] = None
    linked_milestone: Optional[str] = None
    linked_tasks: Optional[list[str]] = None
    sort_order: Optional[int] = None


class ForgeFileCreate(BaseModel):
    user_id: str = "john"
    file_name: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    file_url: Optional[str] = None
    caption: Optional[str] = None
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ForgeFileUpdate(BaseModel):
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    file_url: Optional[str] = None
    caption: Optional[str] = None
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None


class ForgeTaskCreate(BaseModel):
    user_id: str = "john"
    project_id: str
    title: str
    description: Optional[str] = None
    status: str = "Backlog"
    priority: Optional[str] = None
    due_date: Optional[str] = None
    milestone_group: Optional[str] = None
    sort_order: int = 0
    completed_at: Optional[str] = None
    task_type: Optional[str] = "task"
    linked_goal_id: Optional[str] = None
    counts_toward_goal: Optional[bool] = True
    goal_event_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ForgeTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    milestone_group: Optional[str] = None
    sort_order: Optional[int] = None
    completed_at: Optional[str] = None
    task_type: Optional[str] = None
    linked_goal_id: Optional[str] = None
    counts_toward_goal: Optional[bool] = None
    goal_event_id: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
