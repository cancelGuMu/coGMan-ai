from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


StepId = Literal[
    "topic-planning",
    "script-creation",
    "storyboard-design",
    "character-image",
    "image-to-video",
    "voice-subtitle",
    "editing-export",
    "distribution",
    "data-review",
]


class EpisodeDraft(BaseModel):
    episode_number: int
    title: str = ""
    content: str = ""
    hook: str = ""


class StepOneData(BaseModel):
    project_name: str = ""
    core_story_idea: str = ""
    season_episode_count: str = "12集"
    custom_episode_count: int | None = None
    imported_story_name: str | None = None
    linked_project: bool = False
    episodes: list[EpisodeDraft] = Field(default_factory=list)


class RewriteToolState(BaseModel):
    mode: Literal["partial", "batch"] = "partial"
    selected_target: Literal["novel", "script"] = "novel"
    selection_text: str = ""
    rewrite_prompt: str = ""


class StepTwoData(BaseModel):
    project_name: str = ""
    project_status: str = "草稿中"
    body_readiness: int = 0
    script_status: str = "未生成"
    last_modified_by: str = "人工"
    source_material: str = ""
    imported_source_name: str | None = None
    reference_text: str = ""
    novel_text: str = ""
    imported_novel_name: str | None = None
    character_profiles: str = ""
    terminology_library: str = ""
    writing_guidance: str = ""
    version_status: str = "v1 草稿"
    script_text: str = ""
    review_notes: str = ""
    rewrite_tool: RewriteToolState = Field(default_factory=RewriteToolState)
    modification_records: list[str] = Field(default_factory=list)


class ProjectSummary(BaseModel):
    id: str
    name: str
    status: str
    progress: int
    updated_at: datetime
    cover_style: str
    cover_image_url: str | None = None


class ProjectRecord(BaseModel):
    id: str
    name: str
    status: str = "草稿中"
    progress: int = 10
    cover_style: str = "starlight"
    cover_image_url: str | None = None
    created_at: datetime
    updated_at: datetime
    current_step: StepId = "topic-planning"
    step_one: StepOneData = Field(default_factory=StepOneData)
    step_two: StepTwoData = Field(default_factory=StepTwoData)


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class RenameProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class UpdateProjectCoverRequest(BaseModel):
    cover_image_url: str | None = None


class ProjectListResponse(BaseModel):
    projects: list[ProjectSummary]


class ProjectDetailResponse(BaseModel):
    project: ProjectRecord


class ProjectDeleteResponse(BaseModel):
    success: bool = True


class SaveStepOneRequest(BaseModel):
    data: StepOneData


class SaveStepTwoRequest(BaseModel):
    data: StepTwoData


class GenerationRequest(BaseModel):
    project_name: str = ""
    prompt: str = ""
    mode: str = "generic"


class GeneratedTextResponse(BaseModel):
    content: str
    updated_by: str = "AI"
    record: str
