import type {
  ProjectRecord,
  StepCompletionStatus,
  StepId,
  StepOneData,
  StepTwoData,
  WorkflowStepDetail,
} from "./types";

export const workflowSteps: Array<{ id: StepId; label: string }> = [
  { id: "story-structure", label: "01 故事架构" },
  { id: "script-creation", label: "02 剧本创作" },
  { id: "asset-setting", label: "03 资产设定" },
  { id: "storyboard-planning", label: "04 分镜规划" },
  { id: "prompt-generation", label: "05 提词生成" },
  { id: "image-generation", label: "06 画面生成" },
  { id: "quality-rework", label: "07 质检返工" },
  { id: "video-generation", label: "08 视频生成" },
  { id: "audio-subtitle", label: "09 音频字幕" },
  { id: "final-editing", label: "10 剪辑成片" },
  { id: "publish-review", label: "11 发布复盘" },
];

export const workflowStepDetails: WorkflowStepDetail[] = [
  {
    id: "story-structure",
    no: "01",
    label: "01 故事架构",
    short_title: "故事架构",
    title: "故事架构",
    summary: "建立世界观、主线目标、人物关系、季集结构和单集钩子。",
    primary_output: "世界观、主线、人物关系、季集大纲、单集钩子",
    upstream: "项目名称、故事想法、导入文本",
    downstream: "剧本创作、资产设定",
    status_hint: "先把故事骨架搭稳，再进入剧本文本生产。",
  },
  {
    id: "script-creation",
    no: "02",
    label: "02 剧本创作",
    short_title: "剧本创作",
    title: "剧本创作",
    summary: "把故事架构转成单集剧本，包含对白、旁白、动作和审核意见。",
    primary_output: "单集剧本、对白、旁白、动作、审核意见、版本记录",
    upstream: "故事架构、单集大纲、角色关系",
    downstream: "资产设定、分镜规划、音频字幕",
    status_hint: "确保文本可生产、可审核、可拆镜头。",
  },
  {
    id: "asset-setting",
    no: "03",
    label: "03 资产设定",
    short_title: "资产设定",
    title: "资产设定",
    summary: "建立角色、场景、道具、风格板和一致性规则。",
    primary_output: "角色卡、场景卡、道具卡、风格板、参考图、提示词模板",
    upstream: "剧本、人物关系、世界观",
    downstream: "分镜规划、提词生成、画面生成",
    status_hint: "统一视觉资产，避免后续生成风格漂移。",
  },
  {
    id: "storyboard-planning",
    no: "04",
    label: "04 分镜规划",
    short_title: "分镜规划",
    title: "分镜规划",
    summary: "把剧本拆成镜头级生产表，明确画面、动作、构图和时长。",
    primary_output: "镜头表、景别、构图、动作、台词、时长、任务队列",
    upstream: "剧本、资产设定",
    downstream: "提词生成、画面生成、视频生成",
    status_hint: "让每个镜头都有可执行的生产目标。",
  },
  {
    id: "prompt-generation",
    no: "05",
    label: "05 提词生成",
    short_title: "提词生成",
    title: "提词生成",
    summary: "为图片和视频生成结构化提示词、负面词和参数模板。",
    primary_output: "T2I 提示词、I2V 提示词、负面词、参数模板",
    upstream: "分镜表、资产库、风格板",
    downstream: "画面生成、视频生成",
    status_hint: "降低 AI 生成随机性，提高镜头一致性。",
  },
  {
    id: "image-generation",
    no: "06",
    label: "06 画面生成",
    short_title: "画面生成",
    title: "画面生成",
    summary: "批量生成首帧、关键帧、分镜图和候选图。",
    primary_output: "首帧、关键帧、分镜图、候选图、入选图",
    upstream: "T2I 提示词、资产库、镜头表",
    downstream: "质检返工、视频生成",
    status_hint: "先选出稳定关键帧，再进入动态生产。",
  },
  {
    id: "quality-rework",
    no: "07",
    label: "07 质检返工",
    short_title: "质检返工",
    title: "质检返工",
    summary: "检查角色、场景、道具、分镜匹配和生成错误，并形成返工建议。",
    primary_output: "质检报告、问题清单、返工建议、通过素材",
    upstream: "画面素材、分镜要求、资产一致性规则",
    downstream: "视频生成",
    status_hint: "只让通过质检的素材进入视频生成。",
  },
  {
    id: "video-generation",
    no: "08",
    label: "08 视频生成",
    short_title: "视频生成",
    title: "视频生成",
    summary: "把通过质检的关键帧转成动态镜头视频片段。",
    primary_output: "镜头视频片段、候选版本、失败原因、最终片段",
    upstream: "通过质检的关键帧、I2V 提示词、镜头时长",
    downstream: "音频字幕、剪辑成片",
    status_hint: "为剪辑阶段准备可追溯的视频片段。",
  },
  {
    id: "audio-subtitle",
    no: "09",
    label: "09 音频字幕",
    short_title: "音频字幕",
    title: "音频字幕",
    summary: "生成配音、旁白、字幕时间轴、音效、BGM 和口型同步任务。",
    primary_output: "配音、旁白、字幕时间轴、音效、BGM、口型同步任务",
    upstream: "剧本、视频片段、角色声音设定",
    downstream: "剪辑成片",
    status_hint: "让画面能讲清故事并适配短视频观看。",
  },
  {
    id: "final-editing",
    no: "10",
    label: "10 剪辑成片",
    short_title: "剪辑成片",
    title: "剪辑成片",
    summary: "把视频、音频、字幕、音乐和封面整合为可发布成片。",
    primary_output: "成片时间线、横竖版视频、预告版、封面候选、发布素材包",
    upstream: "视频片段、音频、字幕、封面素材",
    downstream: "发布复盘",
    status_hint: "形成不同平台可发布的最终素材包。",
  },
  {
    id: "publish-review",
    no: "11",
    label: "11 发布复盘",
    short_title: "发布复盘",
    title: "发布复盘",
    summary: "完成发布记录、平台适配、数据追踪、复盘报告和优化回流。",
    primary_output: "发布文案、平台适配、数据看板、复盘报告、优化建议",
    upstream: "成片、封面、标题、平台数据",
    downstream: "下一集/下一季创作",
    status_hint: "让数据反哺下一轮故事、剧本、封面和节奏。",
  },
];

export const stepCompletionStatusMeta: Record<StepCompletionStatus, { label: string; tone: "muted" | "draft" | "active" | "review" | "done" }> = {
  "not-started": { label: "未开始", tone: "muted" },
  drafting: { label: "草稿中", tone: "draft" },
  generated: { label: "已生成", tone: "active" },
  reviewing: { label: "待审核", tone: "review" },
  completed: { label: "已完成", tone: "done" },
};

export function getWorkflowStepDetail(stepId: StepId) {
  return workflowStepDetails.find((step) => step.id === stepId) ?? workflowStepDetails[0];
}

export function defaultStepOneData(projectName = ""): StepOneData {
  return {
    project_name: projectName,
    core_story_idea: "",
    season_episode_count: "12集",
    custom_episode_count: null,
    imported_story_name: null,
    linked_project: false,
    episodes: Array.from({ length: 12 }, (_, index) => ({
      episode_number: index + 1,
      title: `第 ${index + 1} 集`,
      content: "",
      hook: "",
    })),
  };
}

export function defaultStepTwoData(projectName = ""): StepTwoData {
  return {
    project_name: projectName,
    project_status: "草稿中",
    body_readiness: 0,
    script_status: "未生成",
    last_modified_by: "人工",
    source_material: "",
    imported_source_name: null,
    reference_text: "",
    novel_text: "",
    imported_novel_name: null,
    character_profiles: "",
    terminology_library: "",
    writing_guidance: "",
    version_status: "v1 草稿",
    script_text: "",
    review_notes: "",
    rewrite_tool: {
      mode: "partial",
      selected_target: "novel",
      selection_text: "",
      rewrite_prompt: "",
    },
    modification_records: [],
  };
}

export function mergeProjectDefaults(project: ProjectRecord): ProjectRecord {
  const stepOneDefaults = defaultStepOneData(project.name);
  const stepTwoDefaults = defaultStepTwoData(project.name);

  return {
    ...project,
    cover_image_url: project.cover_image_url ?? null,
    step_one: {
      ...stepOneDefaults,
      ...project.step_one,
      episodes: project.step_one.episodes.length ? project.step_one.episodes : stepOneDefaults.episodes,
    },
    step_two: {
      ...stepTwoDefaults,
      ...project.step_two,
      rewrite_tool: {
        ...stepTwoDefaults.rewrite_tool,
        ...project.step_two.rewrite_tool,
      },
      modification_records: project.step_two.modification_records ?? [],
    },
  };
}
