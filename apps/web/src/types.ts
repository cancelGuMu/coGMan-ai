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

export type StepTwoData = {
  project_name: string;
  project_status: string;
  body_readiness: number;
  script_status: string;
  last_modified_by: string;
  source_material: string;
  imported_source_name: string | null;
  reference_text: string;
  novel_text: string;
  imported_novel_name: string | null;
  character_profiles: string;
  terminology_library: string;
  writing_guidance: string;
  version_status: string;
  script_text: string;
  review_notes: string;
  rewrite_tool: RewriteToolState;
  modification_records: string[];
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
};

export type GeneratedTextResponse = {
  content: string;
  updated_by: string;
  record: string;
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
