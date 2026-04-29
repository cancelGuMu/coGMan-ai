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


class ContinuityIssue(BaseModel):
    id: str = ""
    episode_number: int = 1
    severity: Literal["low", "medium", "high"] = "low"
    issue: str = ""
    suggestion: str = ""
    status: Literal["open", "fixed"] = "open"


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
    continuity_report: str = ""
    continuity_issues: list[ContinuityIssue] = Field(default_factory=list)
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


class ScriptRhythmNode(BaseModel):
    id: str = ""
    label: str = ""
    description: str = ""
    emotion_intensity: int = 50


class ScriptVersionRecord(BaseModel):
    id: str = ""
    title: str = ""
    snapshot: str = ""
    created_at: str = ""


class StepTwoData(BaseModel):
    project_name: str = ""
    project_status: str = "草稿中"
    body_readiness: int = 0
    script_status: str = "未生成"
    last_modified_by: str = "人工"
    selected_episode_number: int = 1
    current_episode_context: str = ""
    source_material: str = ""
    imported_source_name: str | None = None
    reference_text: str = ""
    novel_text: str = ""
    imported_novel_name: str | None = None
    terminology_import_name: str | None = None
    guidance_import_name: str | None = None
    character_profiles: str = ""
    terminology_library: str = ""
    writing_guidance: str = ""
    version_status: str = "v1 草稿"
    script_text: str = ""
    review_notes: str = ""
    rewrite_tool: RewriteToolState = Field(default_factory=RewriteToolState)
    rhythm_nodes: list[ScriptRhythmNode] = Field(default_factory=list)
    version_records: list[ScriptVersionRecord] = Field(default_factory=list)
    modification_records: list[str] = Field(default_factory=list)


class AssetCharacter(BaseModel):
    id: str = ""
    name: str = ""
    role: str = ""
    age: str = ""
    personality: str = ""
    appearance: str = ""
    motivation: str = ""
    outfit: str = ""


class AssetScene(BaseModel):
    id: str = ""
    name: str = ""
    location: str = ""
    atmosphere: str = ""
    episodes: str = ""


class AssetProp(BaseModel):
    id: str = ""
    name: str = ""
    type: str = ""
    story_function: str = ""


class AssetCandidate(BaseModel):
    id: str = ""
    category: Literal["character", "scene", "prop"] = "character"
    name: str = ""
    description: str = ""
    selected: bool = False


class StepThreeData(BaseModel):
    candidates: list[AssetCandidate] = Field(default_factory=list)
    characters: list[AssetCharacter] = Field(default_factory=list)
    scenes: list[AssetScene] = Field(default_factory=list)
    props: list[AssetProp] = Field(default_factory=list)
    style_board: str = ""
    reference_notes: str = ""
    prompt_templates: str = ""
    consistency_rules: str = ""


class ShotItem(BaseModel):
    id: str = ""
    episode_number: int = 1
    shot_number: int = 1
    scene: str = ""
    characters: list[str] = Field(default_factory=list)
    props: list[str] = Field(default_factory=list)
    purpose: str = ""
    duration_seconds: int = 5
    shot_size: str = ""
    camera_angle: str = ""
    composition: str = ""
    movement: str = ""
    dialogue: str = ""
    rhythm: str = ""
    status: Literal["draft", "ready", "queued"] = "draft"


class StepFourData(BaseModel):
    selected_episode_number: int = 1
    shots: list[ShotItem] = Field(default_factory=list)
    task_preview: str = ""
    total_duration_seconds: int = 0


class PromptItem(BaseModel):
    id: str = ""
    shot_id: str = ""
    shot_label: str = ""
    selected: bool = False
    t2i_prompt: str = ""
    i2v_prompt: str = ""
    negative_prompt: str = ""
    parameters: str = ""
    locked_terms: str = ""
    version: str = ""


class StepFiveData(BaseModel):
    selected_episode_number: int = 1
    filter_text: str = ""
    prompts: list[PromptItem] = Field(default_factory=list)
    negative_template: str = "低清晰度、畸形手指、角色不一致、字幕残影、过曝、模糊"
    parameter_template: str = "16:9, 1080p, cinematic lighting, seed fixed"
    batch_replace_from: str = ""
    batch_replace_to: str = ""


class ImageCandidate(BaseModel):
    id: str = ""
    shot_id: str = ""
    shot_label: str = ""
    url: str = ""
    prompt: str = ""
    status: Literal["candidate", "keyframe", "first-frame", "discarded"] = "candidate"
    metadata: str = ""


class StepSixData(BaseModel):
    selected_shot_id: str = ""
    generation_filter: str = "待生成"
    candidates: list[ImageCandidate] = Field(default_factory=list)


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
    step_three: StepThreeData = Field(default_factory=StepThreeData)
    step_four: StepFourData = Field(default_factory=StepFourData)
    step_five: StepFiveData = Field(default_factory=StepFiveData)
    step_six: StepSixData = Field(default_factory=StepSixData)


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


class SaveStepThreeRequest(BaseModel):
    data: StepThreeData


class SaveStepFourRequest(BaseModel):
    data: StepFourData


class SaveStepFiveRequest(BaseModel):
    data: StepFiveData


class SaveStepSixRequest(BaseModel):
    data: StepSixData


class GenerationRequest(BaseModel):
    project_name: str = ""
    prompt: str = ""
    mode: str = "generic"


class GeneratedTextResponse(BaseModel):
    content: str
    updated_by: str = "AI"
    record: str
