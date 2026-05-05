import type {
  ProjectRecord,
  ShotItem,
  StepEightData,
  StepElevenData,
  StepCompletionStatus,
  StepFiveData,
  StepFourData,
  StepNineData,
  StepSixData,
  StepTenData,
  StepThreeData,
  StepId,
  StepOneData,
  StepTwoData,
  WorkflowStepDetail,
} from "./types";

function hasShotText(value: string | undefined) {
  const text = (value ?? "").trim();
  return Boolean(text) && !/^(待确认|待补充|未填写|暂无|无|none|n\/a)([:：\s].*)?$/i.test(text);
}

function firstShotText(...values: Array<string | undefined>) {
  return values.find((value) => hasShotText(value))?.trim() ?? "";
}

function listText(values: string[] | undefined, empty = "") {
  return values?.filter((item) => item.trim()).join("、") || empty;
}

function inferLensFromShotSize(shotSize: string | undefined) {
  const value = shotSize ?? "";
  if (/全景|远景|大远景/.test(value)) return "广角视角，优先交代空间关系";
  if (/特写|近景|细节/.test(value)) return "中长焦或近距视角，突出表情/关键物";
  if (/中景/.test(value)) return "35mm-50mm 标准视角，兼顾人物和环境";
  return "";
}

function withDefaultShotFields(shot: Partial<ShotItem>, index: number, selectedEpisodeNumber: number): ShotItem {
  const scene = shot.scene ?? "";
  const purpose = shot.purpose ?? "";
  const shotSize = shot.shot_size ?? "";
  const cameraAngle = shot.camera_angle ?? "";
  const composition = shot.composition ?? "";
  const movement = shot.movement ?? "";
  const dialogue = shot.dialogue ?? "";
  const characters = shot.characters ?? [];
  const props = shot.props ?? [];
  const characterText = listText(characters, "本镜头无明确角色");
  const propText = listText(props, "本镜头无明确道具");
  const cameraText = [shotSize, cameraAngle, composition, movement].filter(hasShotText).join("；");
  const assetRequirements = [`场景：${scene || "未指定"}`, `角色：${characterText}`, `道具：${propText}`].join("；");

  return {
    id: shot.id ?? `shot-${index + 1}`,
    episode_number: shot.episode_number ?? selectedEpisodeNumber,
    shot_number: shot.shot_number ?? index + 1,
    scene,
    characters,
    props,
    purpose,
    story_beat: firstShotText(shot.story_beat, purpose, shot.rhythm),
    visual_description: firstShotText(shot.visual_description, [scene, composition, shotSize, cameraAngle].filter(hasShotText).join("；")),
    action: firstShotText(shot.action, purpose, dialogue),
    blocking: firstShotText(shot.blocking, composition, characters.length ? `${characterText} 按构图站位，围绕 ${scene || "当前场景"} 调度` : ""),
    duration_seconds: shot.duration_seconds ?? 5,
    shot_size: shotSize,
    camera_angle: cameraAngle,
    composition,
    lens: firstShotText(shot.lens, inferLensFromShotSize(shotSize)),
    movement,
    camera_motion: firstShotText(shot.camera_motion, movement),
    lighting: firstShotText(shot.lighting, scene ? `${scene} 的既有光源与氛围照明` : ""),
    color_mood: firstShotText(shot.color_mood, purpose),
    dialogue,
    sound_design: firstShotText(shot.sound_design, dialogue ? `对白/旁白：${dialogue}` : scene ? `${scene} 环境底噪，音效跟随主要动作` : ""),
    rhythm: shot.rhythm ?? "",
    transition: firstShotText(shot.transition, "硬切，保持镜头顺序连续"),
    continuity_notes: firstShotText(shot.continuity_notes, `${assetRequirements}；保持与前后镜头一致`),
    asset_requirements: firstShotText(shot.asset_requirements, assetRequirements),
    generation_notes: firstShotText(shot.generation_notes, `${assetRequirements}；${cameraText || "按当前分镜执行"}；不在画面中生成字幕或无关文字`),
    vfx_notes: firstShotText(shot.vfx_notes, "无特殊后期"),
    risk_flags: firstShotText(shot.risk_flags, "自动回填字段需在生成前复核角色、场景、道具一致性"),
    status: shot.status ?? "draft",
  };
}

export const workflowSteps: Array<{ id: StepId; label: string }> = [
  { id: "story-structure", label: "01 故事架构" },
  { id: "script-creation", label: "02 剧本创作" },
  { id: "asset-setting", label: "03 资产设定" },
  { id: "storyboard-planning", label: "04 分镜规划" },
  { id: "prompt-generation", label: "05 提词生成" },
  { id: "image-generation", label: "06 画面生成" },
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
    downstream: "视频生成",
    status_hint: "先选出稳定关键帧，再进入动态生产。",
  },
  {
    id: "video-generation",
    no: "08",
    label: "08 视频生成",
    short_title: "视频生成",
    title: "视频生成",
    summary: "把入选关键帧转成动态镜头视频片段。",
    primary_output: "镜头视频片段、候选版本、失败原因、最终片段",
    upstream: "入选关键帧、I2V 提示词、镜头时长",
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
    genre: "",
    target_audience: "",
    target_platform: "",
    core_story_idea: "",
    core_story_title: "",
    world_background: "",
    era_setting: "",
    rule_system: "",
    conflict_environment: "",
    protagonist_goal: "",
    antagonist_pressure: "",
    core_conflict: "",
    character_growth: "",
    relationship_notes: "",
    relationships: [],
    season_outline: "",
    continuity_report: "",
    continuity_issues: [],
    season_episode_count: "12集",
    custom_episode_count: null,
    imported_story_name: null,
    import_parse_status: "未导入",
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
    selected_episode_number: 1,
    current_episode_context: "",
    source_material: "",
    imported_source_name: null,
    reference_text: "",
    novel_text: "",
    imported_novel_name: null,
    terminology_import_name: null,
    guidance_import_name: null,
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
    rhythm_nodes: [],
    version_records: [],
    modification_records: [],
  };
}

export function defaultStepThreeData(): StepThreeData {
  return {
    candidates: [],
    characters: [],
    scenes: [],
    props: [],
    style_board: "",
    reference_notes: "",
    prompt_templates: "",
    consistency_rules: "",
  };
}

export function defaultStepFourData(): StepFourData {
  return {
    selected_episode_number: 1,
    shots: [],
    task_preview: "",
    total_duration_seconds: 0,
  };
}

export function defaultStepFiveData(): StepFiveData {
  return {
    selected_episode_number: 1,
    filter_text: "",
    prompts: [],
    negative_template: "low resolution, deformed fingers, character inconsistency, subtitle artifacts, overexposure, blurry",
    parameter_template: "16:9, 1080p, cinematic lighting, seed fixed",
    batch_replace_from: "",
    batch_replace_to: "",
  };
}

export function defaultStepSixData(): StepSixData {
  return {
    selected_shot_id: "",
    generation_filter: "待生成",
    candidates: [],
    repaint_mask_note: "",
    repaint_prompt: "",
    selected_package_note: "",
    validation_report: "",
  };
}

export function defaultStepEightData(): StepEightData {
  return {
    selected_clip_id: "",
    filter_text: "",
    clips: [],
    motion_settings: "动作：自然推进；表情：贴合台词；环境动态：轻微；运镜：按分镜；时长：跟随镜头。",
    reference_bindings: "",
    integrity_report: "",
    validation_report: "",
  };
}

export function defaultStepNineData(): StepNineData {
  return {
    dialogue_lines: [],
    voice_profiles: [],
    subtitle_cues: [],
    subtitle_style: "字号 42，白字黑描边，底部安全区 12%，横竖版自适应。",
    sound_effects: [],
    bgm_settings: "BGM：悬疑铺底；音量 35%；淡入 1s；淡出 1.5s。",
    mix_settings: "对白 100%，BGM 35%，音效 65%，旁白优先。",
    lip_sync_tasks: [],
    validation_report: "",
  };
}

export function defaultStepTenData(): StepTenData {
  return {
    timeline_clips: [],
    rhythm_marks: [],
    transition_settings: "默认硬切；情绪段落使用 0.3s 叠化；转折点使用闪白。",
    edit_qc_report: "",
    export_versions: [],
    cover_candidates: [],
    package_checklist: "",
    validation_report: "",
  };
}

export function defaultStepElevenData(): StepElevenData {
  return {
    publish_copy: "",
    platform_adaptations: "抖音/快手：竖版优先；B站：横版或合集；视频号：封面标题清晰。",
    publish_records: [],
    metrics: [],
    data_import_note: "",
    retention_analysis: "",
    comment_summary: "",
    review_report: "",
    optimization_tasks: [],
    next_episode_suggestions: "",
    project_completion_status: "进行中",
  };
}

export function mergeProjectDefaults(project: ProjectRecord): ProjectRecord {
  const stepOneDefaults = defaultStepOneData(project.name);
  const stepTwoDefaults = defaultStepTwoData(project.name);
  const stepThreeDefaults = defaultStepThreeData();
  const stepFourDefaults = defaultStepFourData();
  const stepFiveDefaults = defaultStepFiveData();
  const stepSixDefaults = defaultStepSixData();
  const stepEightDefaults = defaultStepEightData();
  const stepNineDefaults = defaultStepNineData();
  const stepTenDefaults = defaultStepTenData();
  const stepElevenDefaults = defaultStepElevenData();

  return {
    ...project,
    cover_image_url: project.cover_image_url ?? null,
    step_one: {
      ...stepOneDefaults,
      ...project.step_one,
      relationships: project.step_one.relationships ?? stepOneDefaults.relationships,
      episodes: project.step_one.episodes.length ? project.step_one.episodes : stepOneDefaults.episodes,
    },
    step_two: {
      ...stepTwoDefaults,
      ...project.step_two,
      rewrite_tool: {
        ...stepTwoDefaults.rewrite_tool,
        ...project.step_two.rewrite_tool,
      },
      rhythm_nodes: project.step_two.rhythm_nodes ?? stepTwoDefaults.rhythm_nodes,
      version_records: project.step_two.version_records ?? stepTwoDefaults.version_records,
      modification_records: project.step_two.modification_records ?? [],
    },
    step_three: {
      ...stepThreeDefaults,
      ...(project.step_three ?? stepThreeDefaults),
    },
    step_four: {
      ...stepFourDefaults,
      ...(project.step_four ?? stepFourDefaults),
      shots: (project.step_four?.shots ?? stepFourDefaults.shots).map((shot, index) =>
        withDefaultShotFields(shot, index, project.step_four?.selected_episode_number ?? stepFourDefaults.selected_episode_number)
      ),
    },
    step_five: {
      ...stepFiveDefaults,
      ...(project.step_five ?? stepFiveDefaults),
    },
    step_six: {
      ...stepSixDefaults,
      ...(project.step_six ?? stepSixDefaults),
      candidates: (project.step_six?.candidates ?? stepSixDefaults.candidates).map((candidate) => ({
        ...candidate,
        repaint_instruction: candidate.repaint_instruction ?? "",
        repaint_prompt: candidate.repaint_prompt ?? "",
      })),
    },
    step_eight: {
      ...stepEightDefaults,
      ...(project.step_eight ?? stepEightDefaults),
    },
    step_nine: {
      ...stepNineDefaults,
      ...(project.step_nine ?? stepNineDefaults),
      dialogue_lines: (project.step_nine?.dialogue_lines ?? stepNineDefaults.dialogue_lines).map((line) => ({
        ...line,
        audio_status: line.audio_url ? "generated" : line.audio_status === "generated" ? "planned" : line.audio_status ?? "pending",
        voice_id: line.voice_id || (line.speaker === "旁白" ? "presenter_female" : "male-qn-qingse"),
        audio_url: line.audio_url ?? "",
        audio_provider: line.audio_provider ?? "",
        audio_model: line.audio_model ?? "",
        audio_metadata: line.audio_metadata ?? "",
        audio_fail_reason: line.audio_fail_reason ?? "",
      })),
      voice_profiles: (project.step_nine?.voice_profiles ?? stepNineDefaults.voice_profiles).map((profile) => ({
        ...profile,
        voice_id: profile.voice_id || "male-qn-qingse",
      })),
    },
    step_ten: {
      ...stepTenDefaults,
      ...(project.step_ten ?? stepTenDefaults),
      export_versions: (project.step_ten?.export_versions ?? stepTenDefaults.export_versions).map((version) => ({
        ...version,
        url: version.url ?? "",
        metadata: version.metadata ?? "",
      })),
    },
    step_eleven: {
      ...stepElevenDefaults,
      ...(project.step_eleven ?? stepElevenDefaults),
    },
  };
}
