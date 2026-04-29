from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


StepId = Literal[
    "story-structure",
    "script-creation",
    "asset-setting",
    "storyboard-planning",
    "prompt-generation",
    "image-generation",
    "quality-rework",
    "video-generation",
    "audio-subtitle",
    "final-editing",
    "publish-review",
]


class EpisodeDraft(BaseModel):
    episode_number: int
    title: str = ""
    content: str = ""
    hook: str = ""


class StoryRelationship(BaseModel):
    id: str = ""
    character_a: str = ""
    character_b: str = ""
    relationship: str = ""
    conflict: str = ""


class StepOneData(BaseModel):
    project_name: str = ""
    genre: str = ""
    target_audience: str = ""
    target_platform: str = ""
    core_story_idea: str = ""
    core_story_title: str = ""
    world_background: str = ""
    era_setting: str = ""
    rule_system: str = ""
    conflict_environment: str = ""
    protagonist_goal: str = ""
    antagonist_pressure: str = ""
    core_conflict: str = ""
    character_growth: str = ""
    relationship_notes: str = ""
    relationships: list[StoryRelationship] = Field(default_factory=list)
    season_outline: str = ""
    season_episode_count: str = "12集"
    custom_episode_count: int | None = None
    imported_story_name: str | None = None
    import_parse_status: str = "未导入"
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
    current_step: StepId = "story-structure"
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
