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


class ForgeSparkCreate(BaseModel):
    user_id: str = "john"
    spark_text: str
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class ForgeNoteCreate(BaseModel):
    user_id: str = "john"
    title: str
    body: Optional[str] = None
    category: Optional[str] = None
    project_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


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
