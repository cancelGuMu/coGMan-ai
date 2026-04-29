export type StepId =
  | "story-structure"
  | "script-creation"
  | "asset-setting"
  | "storyboard-planning"
  | "prompt-generation"
  | "image-generation"
  | "quality-rework"
  | "video-generation"
  | "audio-subtitle"
  | "final-editing"
  | "publish-review";

export type StepCompletionStatus = "not-started" | "drafting" | "generated" | "reviewing" | "completed";

export type WorkflowStepDetail = {
  id: StepId;
  no: string;
  label: string;
  short_title: string;
  title: string;
  summary: string;
  primary_output: string;
  upstream: string;
  downstream: string;
  status_hint: string;
};

export type EpisodeDraft = {
  episode_number: number;
  title: string;
  content: string;
  hook: string;
};

export type StoryRelationship = {
  id: string;
  character_a: string;
  character_b: string;
  relationship: string;
  conflict: string;
};

export type ContinuityIssue = {
  id: string;
  episode_number: number;
  severity: "low" | "medium" | "high";
  issue: string;
  suggestion: string;
  status: "open" | "fixed";
};

export type StepOneData = {
  project_name: string;
  genre: string;
  target_audience: string;
  target_platform: string;
  core_story_idea: string;
  core_story_title: string;
  world_background: string;
  era_setting: string;
  rule_system: string;
  conflict_environment: string;
  protagonist_goal: string;
  antagonist_pressure: string;
  core_conflict: string;
  character_growth: string;
  relationship_notes: string;
  relationships: StoryRelationship[];
  season_outline: string;
  continuity_report: string;
  continuity_issues: ContinuityIssue[];
  season_episode_count: string;
  custom_episode_count: number | null;
  imported_story_name: string | null;
  import_parse_status: string;
  linked_project: boolean;
  episodes: EpisodeDraft[];
};

export type RewriteToolState = {
  mode: "partial" | "batch";
  selected_target: "novel" | "script";
  selection_text: string;
  rewrite_prompt: string;
};

export type ScriptRhythmNode = {
  id: string;
  label: string;
  description: string;
  emotion_intensity: number;
};

export type ScriptVersionRecord = {
  id: string;
  title: string;
  snapshot: string;
  created_at: string;
};

export type StepTwoData = {
  project_name: string;
  project_status: string;
  body_readiness: number;
  script_status: string;
  last_modified_by: string;
  selected_episode_number: number;
  current_episode_context: string;
  source_material: string;
  imported_source_name: string | null;
  reference_text: string;
  novel_text: string;
  imported_novel_name: string | null;
  terminology_import_name: string | null;
  guidance_import_name: string | null;
  character_profiles: string;
  terminology_library: string;
  writing_guidance: string;
  version_status: string;
  script_text: string;
  review_notes: string;
  rewrite_tool: RewriteToolState;
  rhythm_nodes: ScriptRhythmNode[];
  version_records: ScriptVersionRecord[];
  modification_records: string[];
};

export type AssetCharacter = {
  id: string;
  name: string;
  role: string;
  age: string;
  personality: string;
  appearance: string;
  motivation: string;
  outfit: string;
};

export type AssetScene = {
  id: string;
  name: string;
  location: string;
  atmosphere: string;
  episodes: string;
};

export type AssetProp = {
  id: string;
  name: string;
  type: string;
  story_function: string;
};

export type AssetCandidate = {
  id: string;
  category: "character" | "scene" | "prop";
  name: string;
  description: string;
  selected: boolean;
};

export type StepThreeData = {
  candidates: AssetCandidate[];
  characters: AssetCharacter[];
  scenes: AssetScene[];
  props: AssetProp[];
  style_board: string;
  reference_notes: string;
  prompt_templates: string;
  consistency_rules: string;
};

export type ShotItem = {
  id: string;
  episode_number: number;
  shot_number: number;
  scene: string;
  characters: string[];
  props: string[];
  purpose: string;
  duration_seconds: number;
  shot_size: string;
  camera_angle: string;
  composition: string;
  movement: string;
  dialogue: string;
  rhythm: string;
  status: "draft" | "ready" | "queued";
};

export type StepFourData = {
  selected_episode_number: number;
  shots: ShotItem[];
  task_preview: string;
  total_duration_seconds: number;
};

export type PromptItem = {
  id: string;
  shot_id: string;
  shot_label: string;
  selected: boolean;
  t2i_prompt: string;
  i2v_prompt: string;
  negative_prompt: string;
  parameters: string;
  locked_terms: string;
  version: string;
};

export type StepFiveData = {
  selected_episode_number: number;
  filter_text: string;
  prompts: PromptItem[];
  negative_template: string;
  parameter_template: string;
  batch_replace_from: string;
  batch_replace_to: string;
};

export type ImageCandidate = {
  id: string;
  shot_id: string;
  shot_label: string;
  url: string;
  prompt: string;
  status: "candidate" | "keyframe" | "first-frame" | "selected" | "discarded";
  metadata: string;
  repaint_prompt: string;
};

export type StepSixData = {
  selected_shot_id: string;
  generation_filter: string;
  candidates: ImageCandidate[];
  repaint_mask_note: string;
  repaint_prompt: string;
  selected_package_note: string;
  validation_report: string;
};

export type QualityReportItem = {
  id: string;
  asset_id: string;
  shot_label: string;
  severity: "low" | "medium" | "high";
  category: "角色一致性" | "场景道具" | "分镜符合性" | "生成错误";
  issue: string;
  suggestion: string;
  repair_prompt: string;
  status: "pending" | "rework" | "passed";
  recheck_result: string;
};

export type ReworkTask = {
  id: string;
  source_issue_id: string;
  asset_id: string;
  title: string;
  prompt: string;
  status: "todo" | "done";
};

export type StepSevenData = {
  selected_asset_id: string;
  reports: QualityReportItem[];
  rework_tasks: ReworkTask[];
  checklist_note: string;
  export_text: string;
  validation_report: string;
};

export type VideoClipItem = {
  id: string;
  shot_id: string;
  shot_label: string;
  source_image_id: string;
  url: string;
  duration_seconds: number;
  motion_prompt: string;
  reference_note: string;
  status: "candidate" | "final" | "failed";
  fail_reason: string;
  regeneration_strategy: string;
  version: string;
  metadata: string;
};

export type StepEightData = {
  selected_clip_id: string;
  filter_text: string;
  clips: VideoClipItem[];
  motion_settings: string;
  reference_bindings: string;
  integrity_report: string;
  validation_report: string;
};

export type DialogueLine = {
  id: string;
  shot_id: string;
  shot_label: string;
  speaker: string;
  text: string;
  emotion: string;
  pause_seconds: number;
  audio_status: "pending" | "generated";
};

export type VoiceProfile = {
  id: string;
  character: string;
  tone: string;
  speed: string;
  emotion_strength: string;
};

export type SubtitleCue = {
  id: string;
  shot_id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
};

export type SoundEffectItem = {
  id: string;
  shot_label: string;
  type: "环境音" | "动作音效" | "转场音效";
  description: string;
  volume: number;
};

export type StepNineData = {
  dialogue_lines: DialogueLine[];
  voice_profiles: VoiceProfile[];
  subtitle_cues: SubtitleCue[];
  subtitle_style: string;
  sound_effects: SoundEffectItem[];
  bgm_settings: string;
  mix_settings: string;
  lip_sync_tasks: string[];
  validation_report: string;
};

export type TimelineClip = {
  id: string;
  track: "video" | "audio" | "subtitle" | "effect";
  name: string;
  source_id: string;
  start_seconds: number;
  end_seconds: number;
  transition: string;
  notes: string;
};

export type ExportVersion = {
  id: string;
  format: "横版" | "竖版" | "预告版" | "正片版";
  status: "draft" | "queued" | "exported";
  settings: string;
};

export type CoverCandidate = {
  id: string;
  image_url: string;
  title: string;
  subtitle: string;
  tags: string;
  selected: boolean;
};

export type StepTenData = {
  timeline_clips: TimelineClip[];
  rhythm_marks: string[];
  transition_settings: string;
  edit_qc_report: string;
  export_versions: ExportVersion[];
  cover_candidates: CoverCandidate[];
  package_checklist: string;
  validation_report: string;
};

export type PublishRecord = {
  id: string;
  platform: string;
  publish_time: string;
  version: string;
  title: string;
  cover: string;
};

export type PlatformMetric = {
  id: string;
  platform: string;
  plays: number;
  completion_rate: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  followers: number;
};

export type OptimizationTask = {
  id: string;
  target_step: StepId;
  issue: string;
  suggestion: string;
  priority: "低" | "中" | "高";
  status: "todo" | "done";
};

export type StepElevenData = {
  publish_copy: string;
  platform_adaptations: string;
  publish_records: PublishRecord[];
  metrics: PlatformMetric[];
  data_import_note: string;
  retention_analysis: string;
  comment_summary: string;
  review_report: string;
  optimization_tasks: OptimizationTask[];
  next_episode_suggestions: string;
  project_completion_status: "进行中" | "已完结" | "进入下一轮";
};

export type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  progress: number;
  updated_at: string;
  cover_style: string;
  cover_image_url: string | null;
};

export type ProjectRecord = {
  id: string;
  name: string;
  status: string;
  progress: number;
  cover_style: string;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
  current_step: StepId;
  step_one: StepOneData;
  step_two: StepTwoData;
  step_three: StepThreeData;
  step_four: StepFourData;
  step_five: StepFiveData;
  step_six: StepSixData;
  step_seven: StepSevenData;
  step_eight: StepEightData;
  step_nine: StepNineData;
  step_ten: StepTenData;
  step_eleven: StepElevenData;
};

export type GeneratedTextResponse = {
  content: string;
  updated_by: string;
  record: string;
};

export type GeneratedImageResponse = {
  url: string;
  prompt: string;
  provider: string;
  model: string;
  metadata: string;
};

export type GeneratedVideoResponse = {
  task_id: string;
  provider: string;
  model: string;
  status: string;
  metadata: string;
};

export type DeleteProjectResponse = {
  success: boolean;
};

export type DashboardRange = "24h" | "7d" | "30d" | "all";

export type DashboardMetric = {
  label: string;
  value: string;
  growth: string;
};

export type DashboardTrafficSource = {
  label: string;
  value: string;
  numeric_value?: number;
};

export type DashboardTrendPoint = {
  label: string;
  value: number;
  display_value: string;
};

export type DashboardTopWork = {
  order: string;
  title: string;
  value: string;
  width: number;
};

export type DashboardDistributionRow = {
  platform: string;
  plays: string;
  interactions: string;
  completion_rate: string;
};

export type DashboardOverview = {
  range: DashboardRange;
  range_label: string;
  metrics: DashboardMetric[];
  trend_title: string;
  trend_total: string;
  trend_peak_note: string;
  trend_yaxis: string[];
  trend_points?: DashboardTrendPoint[];
  trend_area_path: string;
  trend_line_path: string;
  trend_highlight: {
    label: string;
    value: string;
    cx: number;
    cy: number;
  };
  trend_xaxis: string[];
  traffic_sources: DashboardTrafficSource[];
  top_works: DashboardTopWork[];
  distribution_rows: DashboardDistributionRow[];
};
