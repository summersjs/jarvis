from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


def _storage_reference(value: Optional[str]) -> Optional[str]:
    if value and value.strip().lower().startswith(("data:", "blob:")):
        raise ValueError("Forge media must use a Storage path or URL; inline base64/blob data is not accepted.")
    return value


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

    _validate_cover = field_validator("cover_image_url")(_storage_reference)


class ForgeProjectUpdate(BaseModel):
    goal_id: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    archived_at: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    next_milestone: Optional[str] = None
    progress_percent: Optional[float] = None
    project_type: Optional[str] = None
    cover_image_url: Optional[str] = None

    _validate_cover = field_validator("cover_image_url")(_storage_reference)


class ForgeSparkCreate(BaseModel):
    user_id: str = "john"
    spark_text: str
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    folder_path: list[str] = Field(default_factory=list)


class ForgeSparkUpdate(BaseModel):
    spark_text: Optional[str] = None
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: Optional[list[str]] = None
    folder_path: Optional[list[str]] = None


class ForgeNoteCreate(BaseModel):
    user_id: str = "john"
    title: str
    body: Optional[str] = None
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    folder_path: list[str] = Field(default_factory=list)
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
    folder_path: Optional[list[str]] = None
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

    _validate_file_url = field_validator("file_url")(_storage_reference)


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

    _validate_file_url = field_validator("file_url")(_storage_reference)


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


class ForgeLedgerEntryCreate(BaseModel):
    user_id: str = "john"
    project_id: str
    note_id: Optional[str] = None
    entry_type: str
    title: Optional[str] = None
    body: str
    tags: list[str] = Field(default_factory=list)
    folder: Optional[str] = None
    subfolder: Optional[str] = None
    linked_task_id: Optional[str] = None
    linked_milestone: Optional[str] = None
    is_pinned: bool = False
    status: str = "active"
    resolved: bool = False
    resolution_text: Optional[str] = None
    resolved_into_entry_id: Optional[str] = None
    resolved_at: Optional[str] = None


class ForgeLedgerEntryUpdate(BaseModel):
    note_id: Optional[str] = None
    entry_type: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    tags: Optional[list[str]] = None
    folder: Optional[str] = None
    subfolder: Optional[str] = None
    linked_task_id: Optional[str] = None
    linked_milestone: Optional[str] = None
    is_pinned: Optional[bool] = None
    status: Optional[str] = None
    resolved: Optional[bool] = None
    resolution_text: Optional[str] = None
    resolved_into_entry_id: Optional[str] = None
    resolved_at: Optional[str] = None


class ForgeSessionCreate(BaseModel):
    user_id: str = "john"
    project_id: str
    task_id: Optional[str] = None
    linked_goal_id: Optional[str] = None
    session_type: str = "Continue Current Mission"
    title: str
    scratchpad: Optional[str] = None
    decisions: Optional[str] = None
    follow_up_task: Optional[str] = None
    convert_scratchpad_to_note: bool = False
    mark_task_complete: bool = False
    count_toward_goal: bool = False
    status: str = "completed"
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ForgeSessionUpdate(BaseModel):
    task_id: Optional[str] = None
    linked_goal_id: Optional[str] = None
    session_type: Optional[str] = None
    title: Optional[str] = None
    scratchpad: Optional[str] = None
    decisions: Optional[str] = None
    follow_up_task: Optional[str] = None
    convert_scratchpad_to_note: Optional[bool] = None
    mark_task_complete: Optional[bool] = None
    count_toward_goal: Optional[bool] = None
    status: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
