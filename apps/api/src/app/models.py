from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


StepId = Literal[
    "story-structure",
    "script-creation",
    "asset-setting",
    "storyboard-planning",
    "prompt-generation",
    "image-generation",
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
    image_url: str = ""
    image_prompt: str = ""


class AssetScene(BaseModel):
    id: str = ""
    name: str = ""
    location: str = ""
    atmosphere: str = ""
    episodes: str = ""
    image_url: str = ""
    image_prompt: str = ""


class AssetProp(BaseModel):
    id: str = ""
    name: str = ""
    type: str = ""
    story_function: str = ""
    image_url: str = ""
    image_prompt: str = ""


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
    story_beat: str = ""
    visual_description: str = ""
    action: str = ""
    blocking: str = ""
    duration_seconds: int = 5
    shot_size: str = ""
    camera_angle: str = ""
    composition: str = ""
    lens: str = ""
    movement: str = ""
    camera_motion: str = ""
    lighting: str = ""
    color_mood: str = ""
    dialogue: str = ""
    sound_design: str = ""
    rhythm: str = ""
    transition: str = ""
    continuity_notes: str = ""
    asset_requirements: str = ""
    generation_notes: str = ""
    vfx_notes: str = ""
    risk_flags: str = ""
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
    status: Literal["candidate", "keyframe", "first-frame", "selected", "discarded"] = "candidate"
    metadata: str = ""
    repaint_instruction: str = ""
    repaint_prompt: str = ""


class StepSixData(BaseModel):
    selected_shot_id: str = ""
    generation_filter: str = "待生成"
    candidates: list[ImageCandidate] = Field(default_factory=list)
    repaint_mask_note: str = ""
    repaint_prompt: str = ""
    selected_package_note: str = ""
    validation_report: str = ""


class VideoClipItem(BaseModel):
    id: str = ""
    shot_id: str = ""
    shot_label: str = ""
    source_image_id: str = ""
    url: str = ""
    duration_seconds: int = 5
    motion_prompt: str = ""
    reference_note: str = ""
    status: Literal["submitted", "processing", "candidate", "final", "failed"] = "submitted"
    fail_reason: str = ""
    regeneration_strategy: str = ""
    version: str = ""
    metadata: str = ""


class StepEightData(BaseModel):
    selected_clip_id: str = ""
    filter_text: str = ""
    clips: list[VideoClipItem] = Field(default_factory=list)
    motion_settings: str = "动作：自然推进；表情：贴合台词；环境动态：轻微；运镜：按分镜；时长：跟随镜头。"
    reference_bindings: str = ""
    integrity_report: str = ""
    validation_report: str = ""


class DialogueLine(BaseModel):
    id: str = ""
    shot_id: str = ""
    shot_label: str = ""
    speaker: str = ""
    text: str = ""
    emotion: str = ""
    pause_seconds: float = 0
    audio_status: Literal["pending", "planned", "generated", "failed"] = "pending"
    voice_id: str = ""
    audio_url: str = ""
    audio_provider: str = ""
    audio_model: str = ""
    audio_metadata: str = ""
    audio_fail_reason: str = ""


class VoiceProfile(BaseModel):
    id: str = ""
    character: str = ""
    voice_id: str = ""
    tone: str = ""
    speed: str = ""
    emotion_strength: str = ""


class SubtitleCue(BaseModel):
    id: str = ""
    shot_id: str = ""
    start_seconds: float = 0
    end_seconds: float = 0
    text: str = ""


class SoundEffectItem(BaseModel):
    id: str = ""
    shot_label: str = ""
    type: Literal["环境音", "动作音效", "转场音效"] = "环境音"
    description: str = ""
    volume: int = 60


class StepNineData(BaseModel):
    dialogue_lines: list[DialogueLine] = Field(default_factory=list)
    voice_profiles: list[VoiceProfile] = Field(default_factory=list)
    subtitle_cues: list[SubtitleCue] = Field(default_factory=list)
    subtitle_style: str = "字号 42，白字黑描边，底部安全区 12%，横竖版自适应。"
    sound_effects: list[SoundEffectItem] = Field(default_factory=list)
    bgm_settings: str = "BGM：悬疑铺底；音量 35%；淡入 1s；淡出 1.5s。"
    mix_settings: str = "对白 100%，BGM 35%，音效 65%，旁白优先。"
    lip_sync_tasks: list[str] = Field(default_factory=list)
    validation_report: str = ""


class TimelineClip(BaseModel):
    id: str = ""
    track: Literal["video", "audio", "subtitle", "effect"] = "video"
    name: str = ""
    source_id: str = ""
    start_seconds: float = 0
    end_seconds: float = 0
    transition: str = ""
    notes: str = ""


class ExportVersion(BaseModel):
    id: str = ""
    format: Literal["横版", "竖版", "预告版", "正片版"] = "正片版"
    status: Literal["draft", "queued", "exported"] = "draft"
    settings: str = ""
    url: str = ""
    metadata: str = ""


class CoverCandidate(BaseModel):
    id: str = ""
    image_url: str = ""
    title: str = ""
    subtitle: str = ""
    tags: str = ""
    selected: bool = False


class StepTenData(BaseModel):
    timeline_clips: list[TimelineClip] = Field(default_factory=list)
    rhythm_marks: list[str] = Field(default_factory=list)
    transition_settings: str = "默认硬切；情绪段落使用 0.3s 叠化；转折点使用闪白。"
    edit_qc_report: str = ""
    export_versions: list[ExportVersion] = Field(default_factory=list)
    cover_candidates: list[CoverCandidate] = Field(default_factory=list)
    package_checklist: str = ""
    validation_report: str = ""


class PublishRecord(BaseModel):
    id: str = ""
    platform: str = ""
    publish_time: str = ""
    version: str = ""
    title: str = ""
    cover: str = ""


class PlatformMetric(BaseModel):
    id: str = ""
    platform: str = ""
    plays: int = 0
    completion_rate: float = 0
    likes: int = 0
    comments: int = 0
    favorites: int = 0
    shares: int = 0
    followers: int = 0


class OptimizationTask(BaseModel):
    id: str = ""
    target_step: StepId = "story-structure"
    issue: str = ""
    suggestion: str = ""
    priority: Literal["低", "中", "高"] = "中"
    status: Literal["todo", "done"] = "todo"


class StepElevenData(BaseModel):
    publish_copy: str = ""
    platform_adaptations: str = "抖音/快手：竖版优先；B站：横版或合集；视频号：封面标题清晰。"
    publish_records: list[PublishRecord] = Field(default_factory=list)
    metrics: list[PlatformMetric] = Field(default_factory=list)
    data_import_note: str = ""
    retention_analysis: str = ""
    comment_summary: str = ""
    review_report: str = ""
    optimization_tasks: list[OptimizationTask] = Field(default_factory=list)
    next_episode_suggestions: str = ""
    project_completion_status: Literal["进行中", "已完结", "进入下一轮"] = "进行中"


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
    step_eight: StepEightData = Field(default_factory=StepEightData)
    step_nine: StepNineData = Field(default_factory=StepNineData)
    step_ten: StepTenData = Field(default_factory=StepTenData)
    step_eleven: StepElevenData = Field(default_factory=StepElevenData)


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


class JianyingProjectExportResponse(BaseModel):
    url: str
    filename: str
    status: str = "exported"
    metadata: str = ""


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


class SaveStepEightRequest(BaseModel):
    data: StepEightData


class SaveStepNineRequest(BaseModel):
    data: StepNineData


class SaveStepTenRequest(BaseModel):
    data: StepTenData


class SaveStepElevenRequest(BaseModel):
    data: StepElevenData


class GenerationRequest(BaseModel):
    project_name: str = ""
    prompt: str = ""
    mode: str = "generic"
    task_id: str | None = None
    project_id: str | None = None
    target_id: str | None = None
    target_type: str | None = None
    context_mode: str = "auto"

    @model_validator(mode="after")
    def build_minimized_context(self) -> "GenerationRequest":
        if self.context_mode == "raw" or self.prompt.startswith("AI_CONTEXT_GATEWAY_V1"):
            return self
        from .context_builder import (
            ContextValidationError,
            build_fallback_context_prompt,
            build_task_context_prompt,
        )
        from .prompt_registry import get_prompt_task
        from .storage import get_project

        task = get_prompt_task(self.task_id, self.mode)
        try:
            project = get_project(self.project_id) if self.project_id else None
            if project is not None:
                bundle = build_task_context_prompt(task, project, self.prompt, self.target_type, self.target_id)
            else:
                bundle = build_fallback_context_prompt(task, self.project_name, self.prompt)
        except ContextValidationError as exc:
            raise ValueError(f"AI 输入上下文不符合要求：{exc}") from exc
        self.prompt = bundle.prompt
        self.project_name = self.project_name or (project.name if project is not None else "")
        return self


class GeneratedTextResponse(BaseModel):
    content: str
    updated_by: str = "AI"
    record: str


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    shot_id: str = ""
    shot_label: str = ""


class GeneratedImageResponse(BaseModel):
    url: str
    prompt: str
    provider: str
    model: str
    metadata: str = ""


class VideoGenerationRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    shot_id: str = ""
    shot_label: str = ""
    source_image_url: str | None = None
    duration_seconds: int = 6


class GeneratedVideoResponse(BaseModel):
    task_id: str
    provider: str
    model: str
    status: str
    metadata: str = ""


class VideoTaskStatusResponse(BaseModel):
    task: dict


class AudioGenerationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    shot_id: str = ""
    shot_label: str = ""
    line_id: str = ""
    speaker: str = ""
    voice_id: str = ""
    speed: float = 1
    vol: float = 1
    pitch: int = 0


class GeneratedAudioResponse(BaseModel):
    url: str
    provider: str
    model: str
    voice_id: str
    status: str
    metadata: str = ""
