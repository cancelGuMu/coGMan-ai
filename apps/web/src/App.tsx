import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AIActionButton,
  AIGenerationButtonGroup,
  DualColumnLayout,
  ImportFileButton,
  LoadingSkeleton,
  NextStepButton,
  StepStatusDot,
  VersionHistoryPanel,
  type VersionRecord,
} from "./components";
import {
  createProject,
  deleteProject,
  fetchDashboardOverview,
  fetchProject,
  fetchProjects,
  fetchVideoTaskStatus,
  generateImageCandidate,
  generateStepOneOutline,
  generateStepOneTask,
  generateTextTask,
  generateVideoCandidate,
  importTextFile,
  renameProject,
  saveStepEight,
  saveStepEleven,
  saveStepFive,
  saveStepFour,
  saveStepNine,
  saveStepOne,
  saveStepSeven,
  saveStepSix,
  saveStepTen,
  saveStepThree,
  saveStepTwo,
  updateProjectCover,
} from "./api";
import { defaultStepOneData, defaultStepTwoData, mergeProjectDefaults, workflowSteps } from "./data";
import {
  assertImportableFile,
  buildStepOneChunks,
  buildStepTwoChunks,
  mergeChunkResults,
  parseSeasonOutlineResult,
  parseStepOneFoundationResult,
} from "./payload";
import type {
  DashboardOverview,
  DashboardRange,
  AssetCharacter,
  AssetProp,
  AssetScene,
  DialogueLine,
  EpisodeDraft,
  ExportVersion,
  CoverCandidate,
  ImageCandidate,
  OptimizationTask,
  PlatformMetric,
  PromptItem,
  ProjectRecord,
  ProjectSummary,
  QualityReportItem,
  ReworkTask,
  ScriptRhythmNode,
  ShotItem,
  StepCompletionStatus,
  StepEightData,
  StepElevenData,
  StepFiveData,
  StepFourData,
  StepNineData,
  StepSevenData,
  StepSixData,
  StepTenData,
  StepOneData,
  StepThreeData,
  StepTwoData,
  TimelineClip,
  VideoClipItem,
  VoiceProfile,
} from "./types";

const dashboardRangeOptions: Array<{ value: DashboardRange; label: string }> = [
  { value: "24h", label: "24h 内" },
  { value: "7d", label: "近七天" },
  { value: "30d", label: "近一月" },
  { value: "all", label: "总计" },
];

const fallbackProtagonistCoverUrl = "/images/hero-role-rin.png";
const dashboardChartWidth = 600;
const dashboardChartHeight = 240;
const dashboardChartPaddingTop = 34;
const dashboardChartPaddingBottom = 24;
const dashboardTrafficColors = ["#f2d99a", "#d9ab51", "#8b5b21", "#473116"];
const dashboardDonutRadius = 74;
const dashboardDonutCircumference = 2 * Math.PI * dashboardDonutRadius;

type DashboardChartPoint = {
  label: string;
  value: number;
  display_value: string;
  x: number;
  y: number;
};

type DashboardDonutSegment = {
  label: string;
  value: string;
  color: string;
  dashLength: number;
  dashOffset: number;
};

function resolveStepId(value?: string) {
  const legacyStepMap: Record<string, string> = {
    "topic-planning": "story-structure",
    "storyboard-design": "storyboard-planning",
    "character-image": "image-generation",
    "image-to-video": "video-generation",
    "voice-subtitle": "audio-subtitle",
    "editing-export": "final-editing",
    distribution: "publish-review",
    "data-review": "publish-review",
  };
  const normalizedValue = value ? legacyStepMap[value] ?? value : value;
  return workflowSteps.some((step) => step.id === normalizedValue) ? normalizedValue : workflowSteps[0].id;
}

function createCenterPath(stepId: string, projectId?: string) {
  return `/create-center/${stepId}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`;
}

function firstStepPath(projectId?: string) {
  return createCenterPath(workflowSteps[0].id, projectId);
}

function getStepProgressIndex(stepId: string) {
  return Math.max(0, workflowSteps.findIndex((step) => step.id === stepId));
}

function getStepCompletionStatus(project: ProjectRecord, stepId: string): StepCompletionStatus {
  const activeIndex = getStepProgressIndex(project.current_step);
  const stepIndex = getStepProgressIndex(stepId);
  if (stepIndex < activeIndex) return "completed";
  if (stepIndex > activeIndex) return "not-started";
  if (project.progress >= 72) return "generated";
  if (project.progress >= 35) return "drafting";
  return "not-started";
}

function parseDashboardValue(value: string): number {
  const normalized = value.trim();
  const numeric = Number.parseFloat(normalized.replace(/,/g, ""));
  if (Number.isNaN(numeric)) return 0;
  if (normalized.includes("亿")) return numeric * 100000000;
  if (normalized.includes("万")) return numeric * 10000;
  return numeric;
}

function formatDashboardValue(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)} 亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 1 : 2)} 万`;
  return Math.round(value).toLocaleString("zh-CN");
}

function getMetricValueLength(value: string): number {
  return Math.max(4, value.replace(/\s/g, "").length);
}

function getMetricValueFontSize(value: string): string {
  const length = getMetricValueLength(value);
  return `${Math.max(28, Math.min(44, 56 - length * 2))}px`;
}

async function copyTextToClipboard(text: string, onSuccess: string, setStatusMessage: (message: string) => void) {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
    setStatusMessage(onSuccess);
  } catch {
    setStatusMessage("浏览器未授予剪贴板权限，内容已保留在页面中，可手动选择复制。");
  }
}

function collectJsonObjects(raw: string): Array<Record<string, unknown>> {
  const candidates: string[] = [];
  const fenced = raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fenced) candidates.push(match[1].trim());

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(raw.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates.flatMap((candidate) => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
}

function firstJsonObject(raw: string): Record<string, unknown> {
  return collectJsonObjects(raw)[0] ?? {};
}

function textValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join("\n");
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return fallback;
}

const modelPromptCjkPattern = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;

function modelPromptFieldsContainCjk(parsed: Record<string, unknown>, mode: "t2i" | "i2v") {
  const fields =
    mode === "t2i"
      ? ["positive_prompt", "negative_prompt", "parameters", "locked_terms"]
      : ["motion_prompt", "camera_prompt", "full_prompt", "negative_prompt", "parameters", "locked_terms"];
  return fields.some((field) => modelPromptCjkPattern.test(textValue(parsed[field])));
}

const directorGrammarGuide = [
  "导演镜头语言规则：",
  "1. 每个镜头必须有明确叙事功能：建立空间、交代关系、揭示线索、隐藏信息、推进动作、制造悬念、展示反应或完成情绪转折；不得只写“好看”的镜头。",
  "2. 景别含义：大远景/远景用于建立环境、孤立感和人物处境；全景用于交代人物与空间关系；中景用于动作、对峙和交流；近景/中近景用于心理压力和表情；特写用于线索、手部动作、关键道具和情绪爆点；极特写用于惊觉、疑点、证据和危险预兆。",
  "3. 机位含义：平视让观众平等观察；低机位增强压迫、威胁、权力或不安；高机位削弱人物、制造脆弱或被监视感；俯拍用于空间关系、调查布局和命运感，但不能误用成无动机上帝视角；仰拍用于压迫和权力；斜角用于心理失衡；肩后和主观视角用于信息共享、秘密窥视和角色代入；反应镜头用于让观众感受信息造成的情绪结果。",
  "4. 焦段与透视：广角强调空间压迫、距离、畸变和环境威胁；标准焦段保持真实观察；长焦压缩空间、制造窥视感或隔离感；微距/特写用于证据细节。焦段必须服务剧情，不得随意堆叠。",
  "5. 构图与视线：角色看的东西必须处在角色视线逻辑内；信息载体朝向角色或处在主观/肩后/侧后视角中；重要信息先给动作动机，再给插入镜头或反应镜头；不得把本应给角色看的物件正面摆给观众。",
  "6. 运镜含义：定镜用于压抑、冷静观察和不安等待；缓慢推近用于发现、逼迫和心理压力；拉远用于孤立、失控和真相扩大；横移/跟拍用于调查流程和空间搜索；摇移用于揭示隐藏信息；手持用于紧张、不稳定和主观慌乱；快速运动只用于明确惊变，不能破坏信息可读性。",
  "7. 信息展示顺序：先建立观众的位置和角色动机，再展示线索；需要观众知道的信息用插入镜头、主观视角或角色反应承接；需要保密的信息用遮挡、浅景深、背面、反光、局部可见或延迟揭示。",
  "8. 情绪表达：恐惧来自未知与遮挡，悬疑来自缺失信息，压迫来自低调光、空间挤压和低/高机位，震惊来自特写与反应，孤独来自远景和负空间，对峙来自正反打、轴线和视线匹配。",
  "9. 连续性：保持轴线、视线方向、角色站位、道具朝向、光源方向和动作接续；镜头切换必须让观众知道谁在看、看什么、为什么看，以及看完之后情绪如何变化。",
  "10. 输出到图片/视频模型时，把导演意图翻译成可执行英文镜头词，如 establishing shot, medium close-up, over-the-shoulder, POV, insert shot, reaction shot, low angle, high angle, slow push-in, shallow depth of field, motivated framing。",
].join("\n");

function limitTextForAi(value: unknown, maxLength = 12000): string {
  const text = textValue(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[??? ${text.length - maxLength} ?????? AI ?????]`;
}

async function runLimitedConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R | null | undefined>
): Promise<R[]> {
  const results: Array<R | null | undefined> = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results.filter((item): item is R => item != null);
}

function summarizeAssetLibraryForAi(library: StepThreeData) {
  return {
    candidates: library.candidates.map((item) => ({
      category: item.category,
      name: item.name,
      description: item.description,
      selected: item.selected,
    })),
    characters: library.characters.map((item) => ({
      name: item.name,
      role: item.role,
      age: item.age,
      personality: item.personality,
      appearance: item.appearance,
      motivation: item.motivation,
      outfit: item.outfit,
      image_prompt: item.image_prompt,
      has_image: Boolean(item.image_url),
    })),
    scenes: library.scenes.map((item) => ({
      name: item.name,
      location: item.location,
      atmosphere: item.atmosphere,
      episodes: item.episodes,
      image_prompt: item.image_prompt,
      has_image: Boolean(item.image_url),
    })),
    props: library.props.map((item) => ({
      name: item.name,
      type: item.type,
      story_function: item.story_function,
      image_prompt: item.image_prompt,
      has_image: Boolean(item.image_url),
    })),
    style_board: library.style_board,
    reference_notes: library.reference_notes,
    prompt_templates: library.prompt_templates,
    consistency_rules: library.consistency_rules,
  };
}

function summarizeAssetCardForAi(kind: "character" | "scene" | "prop", asset: AssetCharacter | AssetScene | AssetProp) {
  if (kind === "character") {
    const item = asset as AssetCharacter;
    return {
      name: item.name,
      role: item.role,
      age: item.age,
      personality: item.personality,
      appearance: item.appearance,
      motivation: item.motivation,
      outfit: item.outfit,
      image_prompt: item.image_prompt,
      has_image: Boolean(item.image_url),
    };
  }
  if (kind === "scene") {
    const item = asset as AssetScene;
    return {
      name: item.name,
      location: item.location,
      atmosphere: item.atmosphere,
      episodes: item.episodes,
      image_prompt: item.image_prompt,
      has_image: Boolean(item.image_url),
    };
  }
  const item = asset as AssetProp;
  return {
    name: item.name,
    type: item.type,
    story_function: item.story_function,
    image_prompt: item.image_prompt,
    has_image: Boolean(item.image_url),
  };
}


function compactForCompare(value: string): string {
  return value.replace(/\s|，|。|；|、|:|：|,|\.|;/g, "");
}

function hasText(value: string): boolean {
  const text = value.trim();
  return Boolean(text) && !["待补充", "未填写", "暂无", "无", "待定"].includes(text);
}

function pickText(record: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = textValue(record[key]);
    if (value) return value;
  }
  return fallback;
}

function splitAssetText(value: string): string[] {
  return value
    .split(/\n|。|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rejectMixedCharacterField(field: keyof Pick<AssetCharacter, "personality" | "appearance" | "motivation" | "outfit">, value: string): string | null {
  const text = value.trim();
  if (!hasText(text)) return "字段为空";
  const mixedHints: Record<typeof field, string[]> = {
    personality: ["穿", "外套", "胎记", "身形", "服装", "发型", "案件", "投毒"],
    appearance: ["动机", "目标", "案后", "消失", "可能", "调查", "投毒案", "定位"],
    motivation: ["外套", "服装", "高瘦", "身形", "发型", "站姿", "穿"],
    outfit: ["动机", "目标", "案件", "可能", "调查", "性格", "胎记"],
  };
  const hit = mixedHints[field].find((hint) => text.includes(hint));
  return hit ? `字段疑似串位：${hit}` : null;
}

function validateCharacterCard(card: AssetCharacter): string[] {
  const issues: string[] = [];
  const required: Array<[keyof AssetCharacter, string]> = [
    ["name", "角色名"],
    ["role", "定位"],
    ["age", "年龄"],
    ["personality", "性格"],
    ["appearance", "外貌"],
    ["motivation", "动机"],
    ["outfit", "服装"],
  ];
  required.forEach(([key, label]) => {
    if (!hasText(String(card[key] ?? ""))) issues.push(`${label}缺失`);
  });
  (["personality", "appearance", "motivation", "outfit"] as const).forEach((key) => {
    const issue = rejectMixedCharacterField(key, card[key]);
    if (issue) issues.push(`${key} ${issue}`);
  });
  const comparable = [
    ["性格", card.personality],
    ["外貌", card.appearance],
    ["动机", card.motivation],
    ["服装", card.outfit],
  ].map(([label, value]) => [label, compactForCompare(String(value))] as const);
  comparable.forEach(([label, value], index) => {
    comparable.slice(index + 1).forEach(([otherLabel, otherValue]) => {
      if (value.length > 16 && value === otherValue) issues.push(`${label}与${otherLabel}重复`);
    });
  });
  return issues;
}

function normalizeCharacterRecord(record: Record<string, unknown>, fallbackId: string, fallbackName: string): { card: AssetCharacter; issues: string[] } {
  const card: AssetCharacter = {
    id: fallbackId,
    name: pickText(record, ["name", "character_name", "角色名"], fallbackName),
    role: pickText(record, ["role", "position", "identity", "role_position", "定位"]),
    age: pickText(record, ["age", "visual_age", "年龄"]),
    personality: pickText(record, ["personality", "traits", "temperament", "性格"]),
    appearance: pickText(record, ["appearance", "visual_appearance", "face_body", "body_shape", "signature_marks", "外貌"]),
    motivation: pickText(record, ["motivation", "goal", "desire", "story_goal", "动机"]),
    outfit: pickText(record, ["outfit", "costume", "clothing", "wardrobe", "服装"]),
  };
  return { card, issues: validateCharacterCard(card) };
}

function buildCharacterCardPrompt(projectName: string, source: string, currentAsset?: AssetCharacter): string {
  return [
    `项目名称：${projectName}`,
    "强制字段要求：角色卡必须一次性补齐 name、role、age、personality、motivation、appearance、outfit。",
    "字段边界：",
    "1. role 只写身份/剧情定位，不写外貌、动机或案情长句。",
    "2. age 必须给明确年龄；原文没有时写“视觉年龄约X岁，真实年龄待确认”。",
    "3. personality 只写性格和行为习惯，不写服装、外貌、案件事实。",
    "4. motivation 只写角色欲望、目标、秘密或行动驱动力，不写外貌、服装。",
    "5. appearance 只写脸型、体型、发色/发型、五官、标志物，不写身份、动机、案件经过。",
    "6. outfit 只写服装、配饰、材质、颜色和可复用穿搭，不写动机、案件经过。",
    "7. 每个字段必须是独立内容，禁止把同一段文本复制到多个字段。",
    "8. 不得输出空字段、待补充、暂无、主要角色这类占位。",
    "如果上游没有明确字段，请基于已有故事做保守视觉设定，并在字段内写明“待确认”的事实边界。",
    currentAsset ? "只补全/修复这一张角色卡，不要新增其他角色。" : "按上游素材生成角色卡。",
    currentAsset ? `当前角色卡：\n${JSON.stringify(currentAsset, null, 2)}` : "",
    "上游来源：",
    source,
  ].filter(Boolean).join("\n");
}

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function splitTextLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean);
  return textValue(value)
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function severityValue(value: unknown): "low" | "medium" | "high" {
  const severity = textValue(value, "medium");
  return severity === "low" || severity === "medium" || severity === "high" ? severity : "medium";
}

type ProjectTextTaskMeta = {
  projectId?: string;
  targetId?: string;
  targetType?: string;
  contextMode?: string;
};

async function generateProjectTextTask(projectName: string, taskId: string, prompt: string, meta?: ProjectTextTaskMeta) {
  return generateTextTask({
    project_name: projectName,
    task_id: taskId,
    mode: taskId.toLowerCase(),
    prompt,
    project_id: meta?.projectId,
    target_id: meta?.targetId,
    target_type: meta?.targetType,
    context_mode: meta?.contextMode,
  });
}

function parseStrictJsonOutput(raw: string): Record<string, unknown> {
  return firstJsonObject(raw);
}

function hasProductionValue(value: string | undefined) {
  const text = (value ?? "").trim();
  if (!text) return false;
  return !/^(待确认|待补充|未填写|暂无|无|none|n\/a)([:：\s].*)?$/i.test(text);
}

function validateProductShot(shot: ShotItem): string[] {
  const missing: string[] = [];
  const requireField = (label: string, value: string | undefined) => {
    if (!hasProductionValue(value)) missing.push(label);
  };

  requireField("场景", shot.scene);
  requireField("剧情目的", shot.purpose);
  requireField("故事节拍", shot.story_beat);
  requireField("画面描述", shot.visual_description);
  requireField("动作", shot.action);
  requireField("走位调度", shot.blocking);
  requireField("景别", shot.shot_size);
  requireField("机位", shot.camera_angle);
  requireField("构图", shot.composition);
  if (!hasProductionValue(shot.lens) && !hasProductionValue(shot.camera_motion) && !hasProductionValue(shot.movement)) {
    missing.push("镜头语言");
  }
  if (!hasProductionValue(shot.dialogue) && !hasProductionValue(shot.sound_design)) {
    missing.push("声音/对白");
  }
  requireField("节奏", shot.rhythm);
  if (!hasProductionValue(shot.transition) && !hasProductionValue(shot.continuity_notes)) {
    missing.push("转场/连续性");
  }
  requireField("资产绑定", shot.asset_requirements);
  requireField("生成约束", shot.generation_notes);
  requireField("风险点", shot.risk_flags);
  return missing;
}

function inspectProductStoryboard(shots: ShotItem[]) {
  const issues = shots.flatMap((shot) => validateProductShot(shot).map((field) => `#${shot.shot_number} ${field}`));
  const sequenceIssues = shots
    .map((shot, index) => (shot.shot_number === index + 1 ? "" : `#${shot.shot_number} 编号不连续`))
    .filter(Boolean);
  const allIssues = [...sequenceIssues, ...issues];
  const totalDuration = shots.reduce((sum, item) => sum + item.duration_seconds, 0);
  const summary = shots.length
    ? allIssues.length
      ? `产品级分镜检验：${shots.length} 个镜头，总时长 ${totalDuration}s，发现 ${allIssues.length} 个字段/编号待补齐：${allIssues.slice(0, 6).join("、")}${allIssues.length > 6 ? "..." : ""}`
      : `产品级分镜检验：${shots.length} 个镜头，总时长 ${totalDuration}s，字段完整，可进入提词、生图、视频和音频字幕。`
    : "产品级分镜检验：暂无镜头，请先自动拆镜或新增镜头。";

  return { missingCount: allIssues.length, summary, issues: allIssues };
}

function buildStoryboardPreview(shots: ShotItem[]) {
  return inspectProductStoryboard(shots).summary;
}

function firstProductionText(...values: Array<string | undefined>) {
  return values.find((value) => hasProductionValue(value))?.trim() ?? "";
}

function joinProductionText(values: Array<string | undefined>, separator = "；") {
  return values.filter((value): value is string => hasProductionValue(value)).join(separator);
}

function inferLensFromShotSize(shotSize: string) {
  if (/全景|远景|大远景/.test(shotSize)) return "广角视角，优先交代空间关系";
  if (/特写|近景|细节/.test(shotSize)) return "中长焦或近距视角，突出表情/关键物";
  if (/中景/.test(shotSize)) return "35mm-50mm 标准视角，兼顾人物和环境";
  return "";
}

function enrichShotProductionFields(shot: ShotItem): ShotItem {
  const characterText = shot.characters.filter(Boolean).join("、") || "本镜头无明确角色";
  const propText = shot.props.filter(Boolean).join("、") || "本镜头无明确道具";
  const assetRequirements = `场景：${shot.scene || "未指定"}；角色：${characterText}；道具：${propText}`;
  const cameraText = joinProductionText([shot.shot_size, shot.camera_angle, shot.composition, shot.camera_motion || shot.movement]);
  const dialogueOrSound = firstProductionText(shot.dialogue ? `对白/旁白：${shot.dialogue}` : "", shot.scene ? `${shot.scene} 环境底噪，音效跟随主要动作` : "");

  return {
    ...shot,
    story_beat: firstProductionText(shot.story_beat, shot.purpose, shot.rhythm),
    visual_description: firstProductionText(shot.visual_description, joinProductionText([shot.scene, shot.composition, shot.shot_size, shot.camera_angle])),
    action: firstProductionText(shot.action, shot.purpose, shot.dialogue),
    blocking: firstProductionText(
      shot.blocking,
      shot.composition,
      shot.characters.length ? `${characterText} 按构图站位，围绕 ${shot.scene || "当前场景"} 调度` : ""
    ),
    lens: firstProductionText(shot.lens, inferLensFromShotSize(shot.shot_size)),
    camera_motion: firstProductionText(shot.camera_motion, shot.movement),
    lighting: firstProductionText(shot.lighting, shot.scene ? `${shot.scene} 的既有光源与氛围照明` : ""),
    color_mood: firstProductionText(shot.color_mood, shot.purpose),
    sound_design: firstProductionText(shot.sound_design, dialogueOrSound),
    transition: firstProductionText(shot.transition, "硬切，保持镜头顺序连续"),
    continuity_notes: firstProductionText(shot.continuity_notes, `${assetRequirements}；保持与前后镜头一致`),
    asset_requirements: firstProductionText(shot.asset_requirements, assetRequirements),
    generation_notes: firstProductionText(
      shot.generation_notes,
      `${assetRequirements}；${cameraText || "按当前分镜执行"}；不在画面中生成字幕或无关文字`
    ),
    vfx_notes: firstProductionText(shot.vfx_notes, "无特殊后期"),
    risk_flags: firstProductionText(shot.risk_flags, "自动回填字段需在生成前复核角色、场景、道具一致性"),
  };
}

const stepTwoTaskIds: Record<string, string> = {
  reference: "S02_REFERENCE",
  novel: "S02_NOVEL",
  roles: "S02_ROLES",
  terms: "S02_TERMS",
  guidance: "S02_GUIDANCE",
  script: "S02_SCRIPT",
  check: "S02_CHECK",
};

function formatGeneratedStepTwoOutput(mode: string, raw: string): string {
  const parsed = firstJsonObject(raw);
  if (!Object.keys(parsed).length) return raw.trim();

  if (mode === "roles") {
    const roles = listValue(parsed.roles || parsed.characters || parsed.character_profiles);
    const normalizedRoles = roles.length ? roles : (parsed.name || parsed.character_name ? [parsed] : []);
    if (normalizedRoles.length) {
      return normalizedRoles.map((item, index) => {
        const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const name = textValue(record.name || record.character_name, `角色 ${index + 1}`);
        const lines = [
          `【${name}】`,
          `角色定位：${textValue(record.role || record.position || record.role_position || record.type, "待补充")}`,
          `动机：${textValue(record.motivation, "待补充")}`,
          `性格：${textValue(record.personality, "待补充")}`,
          `说话风格：${textValue(record.speech_style || record.speaking_style || record.dialogue_style, "待补充")}`,
          `视觉线索：${textValue(record.visual_cues || record.visual, "待补充")}`,
          `关系引用：${textValue(record.relationships || record.relationship_refs || record.relationship_references, "待补充")}`,
          `置信度：${textValue(record.confidence, "待评估")}`,
        ];
        return lines.join("\n");
      }).join("\n\n");
    }
    return textValue(parsed.character_profiles || parsed.summary, raw).trim();
  }

  if (mode === "terms") {
    const terms = listValue(parsed.terms || parsed.terminology || parsed.items);
    if (terms.length) {
      return terms.map((item, index) => {
        const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return [
          `${index + 1}. ${textValue(record.term || record.name, "未命名术语")}`,
          `类型：${textValue(record.type, "待分类")}`,
          `定义：${textValue(record.definition || record.description, "待补充")}`,
          `首次出现：${textValue(record.first_seen || record.first_appearance, "待确认")}`,
          `允许别名：${textValue(record.aliases || record.allowed_aliases, "无")}`,
          `禁用别名：${textValue(record.forbidden_aliases || record.disallowed_aliases, "无")}`,
          `使用说明：${textValue(record.usage_note || record.notes, "无")}`,
        ].join("\n");
      }).join("\n\n");
    }
    return textValue(parsed.terminology_library || parsed.summary, raw).trim();
  }

  if (mode === "guidance") {
    return [
      textValue(parsed.writing_guidance || parsed.summary),
      splitTextLines(parsed.dialogue_rules).length ? `对白规则：\n${splitTextLines(parsed.dialogue_rules).map((item) => `- ${item}`).join("\n")}` : "",
      splitTextLines(parsed.narration_rules).length ? `旁白规则：\n${splitTextLines(parsed.narration_rules).map((item) => `- ${item}`).join("\n")}` : "",
      splitTextLines(parsed.pacing_rules).length ? `节奏规则：\n${splitTextLines(parsed.pacing_rules).map((item) => `- ${item}`).join("\n")}` : "",
      splitTextLines(parsed.do_not).length ? `禁用项：\n${splitTextLines(parsed.do_not).map((item) => `- ${item}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n") || raw.trim();
  }

  if (mode === "reference") {
    return [
      textValue(parsed.reference_summary || parsed.summary),
      splitTextLines(parsed.usable_plots || parsed.key_beats).length ? `可用情节：\n${splitTextLines(parsed.usable_plots || parsed.key_beats).map((item) => `- ${item}`).join("\n")}` : "",
      splitTextLines(parsed.style_tips || parsed.style_notes).length ? `风格提示：\n${splitTextLines(parsed.style_tips || parsed.style_notes).map((item) => `- ${item}`).join("\n")}` : "",
      splitTextLines(parsed.risks || parsed.risk_tips).length ? `风险提示：\n${splitTextLines(parsed.risks || parsed.risk_tips).map((item) => `- ${item}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n") || raw.trim();
  }

  if (mode === "novel") return textValue(parsed.novel_text, raw).trim();
  if (mode === "script") return textValue(parsed.script_text || parsed.script, raw).trim();
  if (mode === "check") {
    return [
      textValue(parsed.review_notes || parsed.summary),
      splitTextLines(parsed.issues).length ? `问题：\n${splitTextLines(parsed.issues).map((item) => `- ${item}`).join("\n")}` : "",
      typeof parsed.pass_for_storyboard === "boolean" ? `是否可进入分镜：${parsed.pass_for_storyboard ? "是" : "否"}` : "",
    ].filter(Boolean).join("\n\n") || raw.trim();
  }

  return raw.trim();
}

function renderRollingMetricValue(value: string) {
  return value.split("").map((char, index) => (
    <span
      className="metric-roll-char"
      key={`${char}-${index}`}
      style={{ "--char-index": index } as React.CSSProperties}
    >
      {char === " " ? "\u00a0" : char}
    </span>
  ));
}

function renderRollingTableValue(value: string) {
  return value.split("").map((char, index) => (
    <span
      className="table-roll-char"
      key={`${char}-${index}`}
      style={{ "--char-index": index } as React.CSSProperties}
    >
      {char === " " ? "\u00a0" : char}
    </span>
  ));
}

function getDashboardTrendPoints(overview: DashboardOverview): DashboardChartPoint[] {
  const labels = overview.trend_xaxis.length ? overview.trend_xaxis : [overview.trend_highlight.label];
  const sourcePoints = overview.trend_points?.length
    ? overview.trend_points
    : labels.map((label, index) => {
        const highlightValue = Math.max(1, parseDashboardValue(overview.trend_highlight.value));
        const ratio = labels.length <= 1 ? 1 : index / (labels.length - 1);
        const wave = 0.45 + Math.sin(ratio * Math.PI * 1.28) * 0.28 + (index % 2 ? 0.1 : -0.04);
        const value = label === overview.trend_highlight.label ? highlightValue : Math.max(1, Math.round(highlightValue * wave));
        return { label, value, display_value: formatDashboardValue(value) };
      });
  const maxValue = Math.max(...sourcePoints.map((item) => item.value), 1);
  const drawableHeight = dashboardChartHeight - dashboardChartPaddingTop - dashboardChartPaddingBottom;
  const step = sourcePoints.length <= 1 ? 0 : dashboardChartWidth / (sourcePoints.length - 1);

  return sourcePoints.map((point, index) => ({
    ...point,
    x: index * step,
    y: dashboardChartPaddingTop + (1 - point.value / maxValue) * drawableHeight,
  }));
}

function getDashboardMiniTrendPath(overview: DashboardOverview) {
  const points = getDashboardTrendPoints(overview);
  if (!points.length) return "";

  const maxX = Math.max(...points.map((point) => point.x), 1);
  return points
    .map((point, index) => {
      const x = (point.x / maxX) * 112;
      const y = 34 - ((dashboardChartHeight - point.y) / dashboardChartHeight) * 28;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${Math.max(4, Math.min(34, y)).toFixed(1)}`;
    })
    .join(" ");
}

function getDashboardDonutSegments(overview: DashboardOverview): DashboardDonutSegment[] {
  const rawValues = overview.traffic_sources.map((item) => Math.max(0, parseDashboardValue(item.value)));
  const total = rawValues.reduce((sum, value) => sum + value, 0) || 1;
  let usedLength = 0;

  return overview.traffic_sources.map((item, index) => {
    const dashLength = (rawValues[index] / total) * dashboardDonutCircumference;
    const segment = {
      label: item.label,
      value: item.value,
      color: dashboardTrafficColors[index % dashboardTrafficColors.length],
      dashLength,
      dashOffset: -usedLength,
    };
    usedLength += dashLength;
    return segment;
  });
}

const workflowShowcase = [
  {
    no: "01",
    title: "故事架构",
    summary: "建立世界观、主线目标、人物关系与季集结构，先把整季故事骨架搭稳。",
    tags: ["世界观", "季集结构"],
  },
  {
    no: "02",
    title: "剧本创作",
    summary: "基于正文、术语库和角色画像，生成可审核、可改写的剧本文本。",
    tags: ["剧本生成", "一致性检查"],
  },
  {
    no: "03",
    title: "资产设定",
    summary: "沉淀角色、场景、道具、服装、画风和生成规则，统一后续视觉资产。",
    tags: ["资产库", "风格板"],
  },
  {
    no: "04",
    title: "分镜规划",
    summary: "把剧本文字拆成镜头级生产表，明确画面、动作、景别、台词和时长。",
    tags: ["镜头表", "节奏规划"],
  },
  {
    no: "05",
    title: "提词生成",
    summary: "把分镜和资产转成图片、视频模型可执行的结构化提示词。",
    tags: ["T2I 提词", "I2V 提词"],
  },
  {
    no: "06",
    title: "画面生成",
    summary: "批量生成静帧、关键帧和分镜图，为视频生成准备高质量素材。",
    tags: ["关键帧", "批量生成"],
  },
  {
    no: "07",
    title: "质检返工",
    summary: "检查角色、场景、风格和镜头逻辑，修复问题素材后再进入视频环节。",
    tags: ["素材质检", "返工修复"],
  },
  {
    no: "08",
    title: "视频生成",
    summary: "把通过质检的关键帧转为动态镜头，产出可剪辑的视频片段。",
    tags: ["动态镜头", "片段预览"],
  },
  {
    no: "09",
    title: "音频字幕",
    summary: "完成配音、旁白、口型同步、字幕、音效和背景音乐等声音层生产。",
    tags: ["配音", "字幕轨"],
  },
  {
    no: "10",
    title: "剪辑成片",
    summary: "整合镜头视频、配音、字幕、音乐和音效，导出可发布成片。",
    tags: ["成片剪辑", "平台版本"],
  },
  {
    no: "11",
    title: "发布复盘",
    summary: "完成发布适配、数据追踪和复盘报告，让数据反哺下一轮创作。",
    tags: ["发布适配", "数据回流"],
  },
] as const;

const localDashboardOverviewMap: Record<DashboardRange, DashboardOverview> = {
  "24h": {
    range: "24h",
    range_label: "24h 内",
    metrics: [
      { label: "播放量", value: "320,456", growth: "较昨日 +8.6%" },
      { label: "互动量", value: "16,284", growth: "较昨日 +5.1%" },
      { label: "涨粉量", value: "3,642", growth: "较昨日 +9.3%" },
      { label: "完播率", value: "71.2%", growth: "较昨日 +2.4%" },
    ],
    trend_title: "播放趋势",
    trend_total: "24h 总播放量 320,456",
    trend_peak_note: "18:00 峰值 46,231",
    trend_yaxis: ["50K", "40K", "30K", "20K", "10K", "0"],
    trend_area_path:
      "M0 214 C34 204, 66 176, 106 184 S182 202, 230 154 S320 80, 366 108 S446 188, 498 128 S552 96, 600 70 L600 240 L0 240 Z",
    trend_line_path:
      "M0 214 C34 204, 66 176, 106 184 S182 202, 230 154 S320 80, 366 108 S446 188, 498 128 S552 96, 600 70",
    trend_highlight: { label: "18:00", value: "46,231", cx: 498, cy: 128 },
    trend_xaxis: ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"],
    traffic_sources: [
      { label: "推荐页", value: "58%" },
      { label: "关注页", value: "21%" },
      { label: "搜索", value: "13%" },
      { label: "其他", value: "8%" },
    ],
    top_works: [
      { order: "1", title: "都市异能：觉醒之城", value: "46.2 万", width: 100 },
      { order: "2", title: "古风武侠：剑雨苍穹", value: "32.8 万", width: 72 },
      { order: "3", title: "未来纪元：星际追航", value: "25.4 万", width: 55 },
      { order: "4", title: "异世界之门", value: "18.6 万", width: 40 },
      { order: "5", title: "爱在次元站", value: "12.1 万", width: 28 },
    ],
    distribution_rows: [
      { platform: "抖音", plays: "180,345", interactions: "11,268", completion_rate: "73.4%" },
      { platform: "快手", plays: "74,210", interactions: "3,942", completion_rate: "66.8%" },
      { platform: "B站", plays: "42,356", interactions: "1,980", completion_rate: "75.2%" },
      { platform: "视频号", plays: "23,545", interactions: "1,094", completion_rate: "69.7%" },
    ],
  },
  "7d": {
    range: "7d",
    range_label: "近七天",
    metrics: [
      { label: "播放量", value: "2,345,678", growth: "较上周 +18.6%" },
      { label: "互动量", value: "128,765", growth: "较上周 +12.4%" },
      { label: "涨粉量", value: "23,456", growth: "较上周 +24.8%" },
      { label: "完播率", value: "68.7%", growth: "较上周 +6.3%" },
    ],
    trend_title: "播放趋势",
    trend_total: "近七天总播放量 2,345,678",
    trend_peak_note: "06-20 峰值 320,456",
    trend_yaxis: ["400K", "300K", "200K", "100K", "0"],
    trend_area_path:
      "M0 214 C40 206, 78 158, 126 162 S214 190, 262 126 S348 74, 392 112 S468 186, 516 124 S566 120, 600 68 L600 240 L0 240 Z",
    trend_line_path:
      "M0 214 C40 206, 78 158, 126 162 S214 190, 262 126 S348 74, 392 112 S468 186, 516 124 S566 120, 600 68",
    trend_highlight: { label: "06-20", value: "320,456", cx: 362, cy: 92 },
    trend_xaxis: ["06-14", "06-16", "06-18", "06-20", "06-22", "06-24", "06-26"],
    traffic_sources: [
      { label: "推荐页", value: "60%" },
      { label: "关注页", value: "20%" },
      { label: "搜索", value: "10%" },
      { label: "其他", value: "10%" },
    ],
    top_works: [
      { order: "1", title: "都市异能：觉醒之城", value: "120.3 万", width: 100 },
      { order: "2", title: "古风武侠：剑雨苍穹", value: "96.6 万", width: 80 },
      { order: "3", title: "未来纪元：星际追航", value: "76.4 万", width: 63 },
      { order: "4", title: "异世界之门", value: "54.7 万", width: 45 },
      { order: "5", title: "爱在次元站", value: "42.1 万", width: 35 },
    ],
    distribution_rows: [
      { platform: "抖音", plays: "1,234,567", interactions: "80,456", completion_rate: "70.3%" },
      { platform: "快手", plays: "567,890", interactions: "30,231", completion_rate: "65.2%" },
      { platform: "B站", plays: "345,678", interactions: "15,678", completion_rate: "72.1%" },
      { platform: "视频号", plays: "197,543", interactions: "9,876", completion_rate: "68.9%" },
    ],
  },
  "30d": {
    range: "30d",
    range_label: "近一月",
    metrics: [
      { label: "播放量", value: "8,926,341", growth: "较上月 +22.1%" },
      { label: "互动量", value: "468,902", growth: "较上月 +17.5%" },
      { label: "涨粉量", value: "86,420", growth: "较上月 +30.4%" },
      { label: "完播率", value: "66.4%", growth: "较上月 +4.1%" },
    ],
    trend_title: "播放趋势",
    trend_total: "近一月累计播放量 8,926,341",
    trend_peak_note: "06-20 峰值 920,456",
    trend_yaxis: ["1M", "800K", "600K", "400K", "200K", "0"],
    trend_area_path:
      "M0 220 C34 198, 86 172, 124 174 S212 194, 258 144 S334 82, 388 98 S462 180, 520 118 S570 82, 600 56 L600 240 L0 240 Z",
    trend_line_path:
      "M0 220 C34 198, 86 172, 124 174 S212 194, 258 144 S334 82, 388 98 S462 180, 520 118 S570 82, 600 56",
    trend_highlight: { label: "06-20", value: "920,456", cx: 520, cy: 118 },
    trend_xaxis: ["05-28", "06-02", "06-07", "06-12", "06-17", "06-22", "06-27"],
    traffic_sources: [
      { label: "推荐页", value: "62%" },
      { label: "关注页", value: "18%" },
      { label: "搜索", value: "12%" },
      { label: "其他", value: "8%" },
    ],
    top_works: [
      { order: "1", title: "都市异能：觉醒之城", value: "420.8 万", width: 100 },
      { order: "2", title: "古风武侠：剑雨苍穹", value: "356.4 万", width: 85 },
      { order: "3", title: "未来纪元：星际追航", value: "298.5 万", width: 70 },
      { order: "4", title: "异世界之门", value: "210.3 万", width: 50 },
      { order: "5", title: "爱在次元站", value: "168.9 万", width: 40 },
    ],
    distribution_rows: [
      { platform: "抖音", plays: "4,120,563", interactions: "260,456", completion_rate: "68.7%" },
      { platform: "快手", plays: "2,102,847", interactions: "112,830", completion_rate: "64.9%" },
      { platform: "B站", plays: "1,546,202", interactions: "62,148", completion_rate: "71.5%" },
      { platform: "视频号", plays: "768,994", interactions: "33,468", completion_rate: "67.2%" },
    ],
  },
  all: {
    range: "all",
    range_label: "总计",
    metrics: [
      { label: "播放量", value: "30,245,678", growth: "累计稳定增长" },
      { label: "互动量", value: "1,628,765", growth: "累计互动持续提升" },
      { label: "涨粉量", value: "302,456", growth: "累计沉淀核心用户" },
      { label: "完播率", value: "69.8%", growth: "长期表现稳定" },
    ],
    trend_title: "累计趋势",
    trend_total: "累计播放量 30,245,678",
    trend_peak_note: "阶段峰值 2,320,456",
    trend_yaxis: ["3M", "2M", "1M", "500K", "0"],
    trend_area_path:
      "M0 226 C52 214, 96 188, 148 180 S242 148, 292 126 S378 92, 432 94 S520 82, 600 34 L600 240 L0 240 Z",
    trend_line_path:
      "M0 226 C52 214, 96 188, 148 180 S242 148, 292 126 S378 92, 432 94 S520 82, 600 34",
    trend_highlight: { label: "累计峰值", value: "2,320,456", cx: 520, cy: 82 },
    trend_xaxis: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Now"],
    traffic_sources: [
      { label: "推荐页", value: "61%" },
      { label: "关注页", value: "19%" },
      { label: "搜索", value: "11%" },
      { label: "其他", value: "9%" },
    ],
    top_works: [
      { order: "1", title: "都市异能：觉醒之城", value: "980.3 万", width: 100 },
      { order: "2", title: "古风武侠：剑雨苍穹", value: "866.6 万", width: 88 },
      { order: "3", title: "未来纪元：星际追航", value: "676.4 万", width: 69 },
      { order: "4", title: "异世界之门", value: "454.7 万", width: 46 },
      { order: "5", title: "爱在次元站", value: "342.1 万", width: 35 },
    ],
    distribution_rows: [
      { platform: "抖音", plays: "13,234,567", interactions: "780,456", completion_rate: "70.3%" },
      { platform: "快手", plays: "7,567,890", interactions: "330,231", completion_rate: "65.2%" },
      { platform: "B站", plays: "5,345,678", interactions: "215,678", completion_rate: "72.1%" },
      { platform: "视频号", plays: "4,097,543", interactions: "129,876", completion_rate: "68.9%" },
    ],
  },
};

function normalizeWorkflowAngle(angle: number) {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

function PreviewIcon({
  name,
  className,
}: {
  name:
    | "create"
    | "script"
    | "role"
    | "storyboard"
    | "edit"
    | "audio"
    | "voice"
    | "video"
    | "back"
    | "rewind"
    | "pause"
    | "forward"
    | "target"
    | "spark"
    | "shortcut"
    | "focus"
    | "more"
    | "magic"
    | "link"
    | "refresh"
    | "expand"
    | "add";
  className?: string;
}) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "create":
      return (
        <svg className={className} {...commonProps}>
          <path d="M12 3 14.7 8.3 20 11l-5.3 2.7L12 19l-2.7-5.3L4 11l5.3-2.7L12 3Z" />
        </svg>
      );
    case "script":
      return (
        <svg className={className} {...commonProps}>
          <path d="M7 4.5h7l3 3V19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4.5Z" />
          <path d="M14 4.5v3h3" />
          <path d="M9 11h6" />
          <path d="M9 14.5h6" />
        </svg>
      );
    case "role":
      return (
        <svg className={className} {...commonProps}>
          <circle cx="12" cy="8.2" r="3.2" />
          <path d="M6.5 18.4c1.2-2.6 3.2-4 5.5-4s4.3 1.4 5.5 4" />
        </svg>
      );
    case "storyboard":
      return (
        <svg className={className} {...commonProps}>
          <rect x="4.5" y="6" width="15" height="11.5" rx="2.6" />
          <path d="M9.5 9.3h5.5" />
          <path d="M9.5 12h4.2" />
          <path d="M9.5 14.7h3" />
        </svg>
      );
    case "edit":
      return (
        <svg className={className} {...commonProps}>
          <path d="m6.2 16.8 1.3-4 7.8-7.8a1.8 1.8 0 1 1 2.6 2.6L10.1 15.4l-3.9 1.4Z" />
          <path d="M13.8 6.5 17.5 10.2" />
        </svg>
      );
    case "audio":
      return (
        <svg className={className} {...commonProps}>
          <path d="M6 15.5V8.5" />
          <path d="M10 18V6" />
          <path d="M14 15V9" />
          <path d="M18 13V11" />
        </svg>
      );
    case "voice":
      return (
        <svg className={className} {...commonProps}>
          <rect x="9.2" y="4.5" width="5.6" height="9.4" rx="2.8" />
          <path d="M6.8 10.8a5.2 5.2 0 0 0 10.4 0" />
          <path d="M12 16v3.4" />
        </svg>
      );
    case "video":
      return (
        <svg className={className} {...commonProps}>
          <rect x="4.5" y="6.5" width="11.8" height="11" rx="2.5" />
          <path d="m16.3 10 3.2-1.8v7.6L16.3 14" />
        </svg>
      );
    case "back":
      return (
        <svg className={className} {...commonProps}>
          <path d="m14.8 6.5-5.3 5.5 5.3 5.5" />
        </svg>
      );
    case "rewind":
      return (
        <svg className={className} {...commonProps}>
          <path d="m18 7.4-5.7 4.6L18 16.6V7.4Z" />
          <path d="m11.7 7.4-5.7 4.6 5.7 4.6V7.4Z" />
        </svg>
      );
    case "pause":
      return (
        <svg className={className} {...commonProps}>
          <path d="M9 7v10" />
          <path d="M15 7v10" />
        </svg>
      );
    case "forward":
      return (
        <svg className={className} {...commonProps}>
          <path d="m6 7.4 5.7 4.6L6 16.6V7.4Z" />
          <path d="m12.3 7.4 5.7 4.6-5.7 4.6V7.4Z" />
        </svg>
      );
    case "target":
      return (
        <svg className={className} {...commonProps}>
          <circle cx="12" cy="12" r="6.4" />
          <path d="M12 3.8v3" />
          <path d="M12 17.2v3" />
          <path d="M3.8 12h3" />
          <path d="M17.2 12h3" />
        </svg>
      );
    case "spark":
      return (
        <svg className={className} {...commonProps}>
          <path d="M12 4.2 13.8 8.2 17.8 10 13.8 11.8 12 15.8 10.2 11.8 6.2 10l4-1.8L12 4.2Z" />
        </svg>
      );
    case "shortcut":
      return (
        <svg className={className} {...commonProps}>
          <path d="M7.2 7.2h4.2v4.2" />
          <path d="m16.8 16.8-5.4-5.4" />
          <path d="M16.8 7.2h-4.2" />
          <path d="M7.2 16.8h4.2" />
        </svg>
      );
    case "focus":
      return (
        <svg className={className} {...commonProps}>
          <path d="M8.2 5.2H5.2v3" />
          <path d="M15.8 5.2h3v3" />
          <path d="M18.8 15.8v3h-3" />
          <path d="M5.2 15.8v3h3" />
          <circle cx="12" cy="12" r="2.4" />
        </svg>
      );
    case "more":
      return (
        <svg className={className} {...commonProps}>
          <circle cx="6.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "magic":
      return (
        <svg className={className} {...commonProps}>
          <path d="m5.5 17.8 8.8-8.8" />
          <path d="m13.4 5.6.9-2.4.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9Z" />
          <path d="m6.1 14.5.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5Z" />
        </svg>
      );
    case "link":
      return (
        <svg className={className} {...commonProps}>
          <path d="M8.9 15.1 6.7 17.3a2.6 2.6 0 0 1-3.7-3.7l2.2-2.2" />
          <path d="m15.1 8.9 2.2-2.2a2.6 2.6 0 0 1 3.7 3.7l-2.2 2.2" />
          <path d="m8 16 8-8" />
        </svg>
      );
    case "refresh":
      return (
        <svg className={className} {...commonProps}>
          <path d="M18.2 10.2A6.5 6.5 0 1 0 18 15" />
          <path d="M18.2 6.2v4h-4" />
        </svg>
      );
    case "expand":
      return (
        <svg className={className} {...commonProps}>
          <path d="M14 6h4v4" />
          <path d="m18 6-6 6" />
          <path d="M10 18H6v-4" />
          <path d="m6 18 6-6" />
        </svg>
      );
    case "add":
      return (
        <svg className={className} {...commonProps}>
          <path d="M12 6v12" />
          <path d="M6 12h12" />
        </svg>
      );
    default:
      return null;
  }
}

export function App() {
  useEffect(() => {
    function handleButtonFeedback(event: PointerEvent) {
      const target = event.target instanceof Element
        ? event.target.closest("button, .import-file-button, .primary-pill, .hero-button, .ghost-button, .next-step-button, .step-nav-item, .project-preview-card, .project-switch-option, .nav-link")
        : null;
      if (!(target instanceof HTMLElement) || target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true") {
        return;
      }
      target.classList.remove("button-click-feedback");
      window.setTimeout(() => target.classList.add("button-click-feedback"), 0);
      window.setTimeout(() => target.classList.remove("button-click-feedback"), 520);
    }

    window.addEventListener("pointerdown", handleButtonFeedback, true);
    return () => window.removeEventListener("pointerdown", handleButtonFeedback, true);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/create-center"
        element={<CreateCenterRedirect />}
      />
      <Route
        path="/create-center/:stepId"
        element={<CreateCenterPage />}
      />
      <Route
        path="/gallery"
        element={<ComingSoonPage title="作品广场" description="这里将展示项目作品、案例样片和精选内容。" />}
      />
      <Route
        path="/models"
        element={<ComingSoonPage title="模型与工具" description="这里将放置模型能力、工具市场和调用入口。" />}
      />
      <Route
        path="/docs"
        element={<ComingSoonPage title="教程文档" description="这里将整理项目文档、流程说明与操作指南。" />}
      />
      <Route
        path="/community"
        element={<ComingSoonPage title="社区" description="这里将承接社区动态、讨论入口和创作者互动内容。" />}
      />
      <Route path="/workspace/:projectId" element={<WorkspacePage />} />
    </Routes>
  );
}

function HomePage() {
  const workflowStepAngle = 360 / workflowShowcase.length;
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [error, setError] = useState("");
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>("7d");
  const [remoteDashboardOverview, setRemoteDashboardOverview] = useState<Partial<Record<DashboardRange, DashboardOverview>>>(
    {}
  );
  const [activeTrendIndex, setActiveTrendIndex] = useState<number | null>(null);
  const [activeTrafficIndex, setActiveTrafficIndex] = useState<number | null>(null);
  const [isRankVisible, setIsRankVisible] = useState(false);
  const [isDistributionVisible, setIsDistributionVisible] = useState(false);
  const [workflowRotation, setWorkflowRotation] = useState(-12);
  const [isWorkflowDragging, setIsWorkflowDragging] = useState(false);
  const navigate = useNavigate();
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const rankListRef = useRef<HTMLDivElement | null>(null);
  const distributionTableRef = useRef<HTMLDivElement | null>(null);
  const workflowRotationRef = useRef(-12);
  const workflowTargetRotationRef = useRef(-12);
  const workflowVelocityRef = useRef(0);
  const workflowAnimationRef = useRef<number | null>(null);
  const workflowDragRef = useRef({
    active: false,
    startX: 0,
    lastX: 0,
    baseRotation: -12,
  });

  const dashboardOverview = remoteDashboardOverview[dashboardRange] ?? localDashboardOverviewMap[dashboardRange];
  const dashboardTotalPlayRows = dashboardRangeOptions.map((option) => {
    const overview = remoteDashboardOverview[option.value] ?? localDashboardOverviewMap[option.value];
    const playsMetric = overview.metrics.find((metric) => metric.label.includes("播放")) ?? overview.metrics[0];
    return {
      label: option.label,
      value: playsMetric?.value ?? "-",
      growth: playsMetric?.growth ?? "",
      trendPath: getDashboardMiniTrendPath(overview),
    };
  });
  const dashboardTrendPoints = useMemo(() => getDashboardTrendPoints(dashboardOverview), [dashboardOverview]);
  const dashboardDonutSegments = useMemo(() => getDashboardDonutSegments(dashboardOverview), [dashboardOverview]);
  const activeTrendPoint =
    activeTrendIndex !== null && dashboardTrendPoints[activeTrendIndex] ? dashboardTrendPoints[activeTrendIndex] : null;

  function handleTrendPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dashboardTrendPoints.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const chartX = ratio * dashboardChartWidth;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    dashboardTrendPoints.forEach((point, index) => {
      const distance = Math.abs(point.x - chartX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveTrendIndex(nearestIndex);
  }

  useEffect(() => {
    void (async () => {
      try {
        setProjects(await fetchProjects());
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载项目失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const overview = await fetchDashboardOverview(dashboardRange);
        if (!cancelled) {
          setRemoteDashboardOverview((current) => ({ ...current, [dashboardRange]: overview }));
        }
      } catch {
        if (!cancelled) {
          setRemoteDashboardOverview((current) => current);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardRange]);

  useEffect(() => {
    const target = rankListRef.current;
    if (!target) return undefined;

    setIsRankVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRankVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.28, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [dashboardRange]);

  useEffect(() => {
    const target = distributionTableRef.current;
    if (!target) return undefined;

    setIsDistributionVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsDistributionVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.24, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [dashboardRange]);

  useEffect(() => {
    return () => {
      if (workflowAnimationRef.current !== null) {
        window.cancelAnimationFrame(workflowAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!projectMenuRef.current) return;
      if (!projectMenuRef.current.contains(event.target as Node)) {
        setProjectMenuId(null);
      }
    }

    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  function animateWorkflowRotation() {
    if (workflowAnimationRef.current !== null) return;

    const step = () => {
      const current = workflowRotationRef.current;
      const target = workflowTargetRotationRef.current;
      const delta = target - current;

      if (Math.abs(delta) < 0.05) {
        workflowRotationRef.current = target;
        setWorkflowRotation(target);
        workflowAnimationRef.current = null;
        return;
      }

      const next = current + delta * 0.14;
      workflowRotationRef.current = next;
      setWorkflowRotation(next);
      workflowAnimationRef.current = window.requestAnimationFrame(step);
    };

    workflowAnimationRef.current = window.requestAnimationFrame(step);
  }

  function setWorkflowRotationTarget(nextRotation: number) {
    workflowTargetRotationRef.current = nextRotation;
    animateWorkflowRotation();
  }

  function handleWorkflowPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 1040) return;
    workflowDragRef.current = {
      active: true,
      startX: event.clientX,
      lastX: event.clientX,
      baseRotation: workflowTargetRotationRef.current,
    };
    workflowVelocityRef.current = 0;
    setIsWorkflowDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleWorkflowPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!workflowDragRef.current.active) return;
    const totalDelta = event.clientX - workflowDragRef.current.startX;
    const frameDelta = event.clientX - workflowDragRef.current.lastX;
    workflowDragRef.current.lastX = event.clientX;
    workflowVelocityRef.current = frameDelta * 0.18;
    setWorkflowRotationTarget(workflowDragRef.current.baseRotation + totalDelta * 0.14);
  }

  function handleWorkflowPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!workflowDragRef.current.active) return;
    workflowDragRef.current.active = false;
    setIsWorkflowDragging(false);
    setWorkflowRotationTarget(workflowTargetRotationRef.current + workflowVelocityRef.current * 1.6);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resolveProjectCoverClass(project: ProjectSummary, index: number) {
    if (project.cover_style === "starlight") {
      return "cover-c";
    }
    return index % 2 === 0 ? "cover-a" : "cover-b";
  }

  function resolveProjectCoverUrl(project: ProjectSummary) {
    return project.cover_image_url?.trim() || fallbackProtagonistCoverUrl;
  }

  async function refreshProjects() {
    const nextProjects = await fetchProjects();
    setProjects(nextProjects);
  }

  async function handleRenameProject(project: ProjectSummary) {
    const nextName = window.prompt("请输入新的项目名称", project.name)?.trim();
    if (!nextName || nextName === project.name) {
      setProjectMenuId(null);
      return;
    }
    try {
      await renameProject(project.id, nextName);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目重命名失败");
    } finally {
      setProjectMenuId(null);
    }
  }

  async function handleUpdateProjectCover(project: ProjectSummary) {
    const nextCover = window.prompt(
      "请输入自定义封面图片地址；留空则使用主角人设封面",
      project.cover_image_url ?? ""
    );
    if (nextCover === null) {
      setProjectMenuId(null);
      return;
    }
    try {
      await updateProjectCover(project.id, nextCover.trim() || null);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "封面设置失败");
    } finally {
      setProjectMenuId(null);
    }
  }

  async function handleDeleteProject(project: ProjectSummary) {
    const confirmed = window.confirm(`确认删除项目“${project.name}”吗？`);
    if (!confirmed) {
      setProjectMenuId(null);
      return;
    }
    try {
      await deleteProject(project.id);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目删除失败");
    } finally {
      setProjectMenuId(null);
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) {
      setError("请输入项目名称");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const project = await createProject(newProjectName.trim());
      navigate(`/workspace/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败");
    } finally {
      setCreating(false);
    }
  }

  async function handleStartCreationJourney() {
    setCreating(true);
    setError("");
    try {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hour = String(now.getHours()).padStart(2, "0");
      const minute = String(now.getMinutes()).padStart(2, "0");
      const project = await createProject(`新建漫剧项目 ${month}${day}-${hour}${minute}`);
      navigate(firstStepPath(project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="app-shell home-page">
      <header className="topbar">
        <div className="page-container topbar-inner">
          <div className="brand-lockup">
            <span className="brand-mark">C</span>
            <span>coGMan AI 漫剧</span>
          </div>
          <nav className="nav-row">
            <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/">
              首页
            </NavLink>
            <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/create-center">
              创作中心
            </NavLink>
            <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/gallery">
              作品广场
            </NavLink>
            <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/models">
              模型与工具
            </NavLink>
            <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/docs">
              教程文档
            </NavLink>
            <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/community">
              社区
            </NavLink>
          </nav>
          <div className="topbar-actions">
            <TopbarSearch />
            <button className="primary-pill" type="button" onClick={handleCreateProject} disabled={creating}>
              {creating ? "创建中..." : "登录 / 注册"}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-section" id="hero">
          <div className="hero-blur hero-blur-left" />
          <div className="hero-blur hero-blur-right" />
          <div className="page-container hero-layout">
            <div className="hero-left">
              <div className="eyebrow">coGMan AI 漫剧创作平台</div>
              <h1>
                <span>AI 漫剧创作平台</span>
                <span>从灵感到爆款</span>
              </h1>
              <p>
                从展示页直接进入真实工作台，把故事架构、剧本创作、资产设定到发布复盘串成一条完整的创作链路。
              </p>
              <div className="hero-actions">
                <button className="hero-button" type="button" onClick={handleCreateProject} disabled={creating}>
                  {creating ? "创建中..." : "开始创作项目"}
                </button>
                <Link className="hero-button" to="/create-center">
                  浏览创作中心
                </Link>
                <Link className="hero-button" to="/models">
                  查看 AI 工具
                </Link>
              </div>
              <div className="hero-quick-create">
                <label className="hero-inline-field">
                  <span>快速创建项目</span>
                  <input
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder="输入项目名称"
                  />
                </label>
                <button
                  className="primary-pill hero-inline-submit"
                  type="button"
                  onClick={handleCreateProject}
                  disabled={creating}
                >
                  立即创建
                </button>
              </div>
              {error ? <div className="status-error">{error}</div> : null}
            </div>

            <div className="hero-visual">
              <div className="hero-preview-shell">
                <div className="hero-preview-page">
                  <div className="preview-sidebar-panel">
                    {[
                      ["创作", "create"],
                      ["脚本", "script"],
                      ["角色", "role"],
                      ["分镜", "storyboard"],
                      ["剪辑", "edit"],
                      ["音轨", "audio"],
                      ["配音", "voice"],
                      ["视频", "video"],
                    ].map(([item, icon], index) => (
                      <div className={`preview-nav-item ${index === 0 ? "active" : ""}`} key={item}>
                        <span className="preview-nav-icon">
                          <PreviewIcon name={icon as Parameters<typeof PreviewIcon>[0]["name"]} className="preview-icon-svg" />
                        </span>
                        <span>{item}</span>
                        {index === 0 ? <span className="preview-nav-status" /> : null}
                      </div>
                    ))}
                  </div>

                  <div className="preview-main-panel">
                    <div className="preview-toolbar">
                      <div className="preview-toolbar-left">
                        <span className="preview-back">
                          <PreviewIcon name="back" className="preview-icon-svg" />
                        </span>
                        <span>项目名称：光影之城</span>
                      </div>
                      <span className="preview-mode-pill">3D</span>
                    </div>
                    <div className="preview-stage">
                      <div className="preview-stage-screen" />
                      <div className="preview-stage-footer">
                        <div className="preview-bottom-bar">
                          <div className="preview-shot-pill">镜头 03</div>
                          <div className="preview-timeline">
                            <span style={{ width: "62%" }} />
                          </div>
                          <span className="preview-time">00:18 / 00:36</span>
                        </div>
                        <div className="preview-control-row">
                          <div className="preview-control-icons">
                            <button className="preview-transport-button" type="button" aria-label="快退">
                              <PreviewIcon name="rewind" className="preview-icon-svg preview-transport-svg" />
                            </button>
                            <button className="preview-transport-button is-active" type="button" aria-label="暂停">
                              <PreviewIcon name="pause" className="preview-icon-svg preview-transport-svg" />
                            </button>
                            <button className="preview-transport-button" type="button" aria-label="快进">
                              <PreviewIcon name="forward" className="preview-icon-svg preview-transport-svg" />
                            </button>
                          </div>
                          <div className="preview-control-tools">
                            <span className="preview-tool-icon" aria-hidden="true">
                              <PreviewIcon name="target" className="preview-icon-svg" />
                            </span>
                            <span className="preview-tool-icon" aria-hidden="true">
                              <PreviewIcon name="spark" className="preview-icon-svg" />
                            </span>
                            <span className="preview-tool-icon" aria-hidden="true">
                              <PreviewIcon name="shortcut" className="preview-icon-svg" />
                            </span>
                            <span className="preview-tool-icon" aria-hidden="true">
                              <PreviewIcon name="focus" className="preview-icon-svg" />
                            </span>
                            <span className="preview-tool-icon" aria-hidden="true">
                              <PreviewIcon name="more" className="preview-icon-svg" />
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="preview-floating-card">
                        <strong>AI 渲染中</strong>
                        <span>已完成 48%</span>
                        <div className="preview-floating-progress">
                          <span style={{ width: "48%" }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="preview-rail-panel">
                    <div className="preview-rail-top">
                      <span className="preview-rail-action">
                        <PreviewIcon name="magic" className="preview-icon-svg" />
                      </span>
                      <span className="preview-rail-action">
                        <PreviewIcon name="link" className="preview-icon-svg" />
                      </span>
                    </div>
                    <div className="preview-rail-head">
                      <span>角色列表</span>
                      <span className="preview-rail-head-icon">
                        <PreviewIcon name="add" className="preview-icon-svg" />
                      </span>
                    </div>
                    {[
                      ["艾琳", "当前主角", "role-thumb-1"],
                      ["凛", "辅助角色", "role-thumb-2"],
                      ["露西", "辅助角色", "role-thumb-3"],
                    ].map(([name, role, thumb], index) => (
                      <div className="preview-role-card" key={name}>
                        <div className={`preview-role-thumb ${thumb}`} />
                        <strong>{name}</strong>
                        <span>{role}</span>
                        {index === 0 ? <i className="preview-role-dot" /> : null}
                      </div>
                    ))}
                    <div className="preview-rail-footer">
                      <span className="preview-rail-action">
                        <PreviewIcon name="refresh" className="preview-icon-svg" />
                      </span>
                      <span className="preview-rail-action">
                        <PreviewIcon name="expand" className="preview-icon-svg" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="page-container hero-stats-wrap">
            <div className="stats-grid hero-stats-grid">
              <StatCard label="创作者" value="20,000+" />
              <StatCard label="作品总数" value="360,000+" />
              <StatCard label="用户满意度" value="98.7%" />
              <StatCard label="内容播放量" value="30,000,000+" />
            </div>
          </div>
        </section>

        <div className="page-container">
          <div className="announcement-bar">
            <span>coGMan AI 漫剧首页已接入真实工作台入口，当前重点支持步骤一、步骤二与数据看板展示。</span>
            <Link to="/docs">查看说明</Link>
          </div>
        </div>

        <section className="workflow-section" id="workflow">
          <div className="page-container">
            <div className="section-intro">
              <h2>从灵感到爆款的十一步工作流</h2>
              <p>当前网站中的实际实现已对齐为 11 个步骤，并以可拖拽的 3D 环形方式在首页中展示。</p>
              <Link className="primary-pill inline-pill" to="/create-center">
                查看完整流程
              </Link>
            </div>

            <div className="workflow-board">
              <div
                className={`workflow-ring-scene${isWorkflowDragging ? " is-dragging" : ""}`}
                onPointerDown={handleWorkflowPointerDown}
                onPointerMove={handleWorkflowPointerMove}
                onPointerUp={handleWorkflowPointerUp}
                onPointerCancel={handleWorkflowPointerUp}
              >
                <div
                  className="workflow-ring-track"
                  style={{
                    transform: `rotateY(${workflowRotation}deg)`,
                  }}
                >
                  {workflowShowcase.map((item, index) => {
                    const angle = index * workflowStepAngle;
                    const currentAngle = normalizeWorkflowAngle(angle + workflowRotation);
                    const frontness = Math.pow((Math.cos((Math.abs(currentAngle) * Math.PI) / 180) + 1) / 2, 1.6);
                    const cardOpacity = 0.12 + frontness * 0.88;
                    const cardZIndex = 100 + Math.round(frontness * 100);

                    return (
                      <article
                        className="workflow-ring-card"
                        key={item.no}
                        style={
                          {
                            "--angle": `${angle}deg`,
                            "--counter-angle": `${-(workflowRotation + angle)}deg`,
                            "--card-opacity": `${cardOpacity}`,
                            zIndex: cardZIndex,
                          } as React.CSSProperties
                        }
                      >
                        <div className="workflow-card workflow-ring-card-face">
                          <div className="workflow-card-topline" />
                          <div className="workflow-card-watermark" aria-hidden="true">
                            {renderWorkflowWatermark(item.no)}
                          </div>
                          <div className="workflow-step-badge">{item.no}</div>
                          <div className="workflow-copy">
                            <span className="workflow-step-label">STEP {item.no}</span>
                            <h3>{item.title}</h3>
                            <p>{item.summary}</p>
                          </div>
                          <div className="chip-row workflow-chip-row">
                            {item.tags.map((tag) => (
                              <span className="ghost-chip" key={tag}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="workspace-preview" id="workspace">
          <div className="page-container">
            <div className="section-title">
              <div>
                <h2>项目工作台</h2>
                <p>所有创作集中在同一条主链路里，当前已经接入真实项目管理、保存回显和工作流跳转。</p>
              </div>
              <span className="ghost-chip">项目管理已接入</span>
            </div>

            <div className="project-preview-grid">
              {projects.map((item, index) => {
                const coverClass = resolveProjectCoverClass(item, index);
                const coverUrl = resolveProjectCoverUrl(item);
                return (
                  <article
                    className="project-preview-card"
                    key={item.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(firstStepPath(item.id))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(firstStepPath(item.id));
                      }
                    }}
                  >
                    <div
                      className="project-card-head"
                      ref={projectMenuId === item.id ? projectMenuRef : null}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <button
                        className="project-menu-trigger"
                        type="button"
                        aria-label={`操作项目 ${item.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setProjectMenuId((current) => (current === item.id ? null : item.id));
                        }}
                      >
                        ...
                      </button>
                      {projectMenuId === item.id ? (
                        <div className="project-menu-popover">
                          <button type="button" onClick={() => void handleRenameProject(item)}>
                            重命名
                          </button>
                          <button type="button" onClick={() => void handleUpdateProjectCover(item)}>
                            设置封面
                          </button>
                          <button type="button" className="danger" onClick={() => void handleDeleteProject(item)}>
                            删除
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div
                      className={`preview-cover ${coverClass}${item.cover_image_url ? " is-custom-cover" : ""}`}
                      style={
                        {
                          "--project-cover-image": `url("${coverUrl}")`,
                        } as React.CSSProperties
                      }
                    />
                    <h3>{item.name}</h3>
                    <p>{item.status}</p>
                    <div className="project-progress-row">
                      <span>进度</span>
                      <div className="progress-bar">
                        <span style={{ width: `${item.progress}%` }} />
                      </div>
                      <span>{item.progress}%</span>
                    </div>
                  </article>
                );
              })}

              <article
                className="project-preview-card new-entry"
                role="button"
                tabIndex={0}
                aria-disabled={creating}
                onClick={() => {
                  if (!creating) {
                    void handleStartCreationJourney();
                  }
                }}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && !creating) {
                    event.preventDefault();
                    void handleStartCreationJourney();
                  }
                }}
              >
                <div className="new-entry-circle">+</div>
                <h3>创建新项目</h3>
                <p>{loading ? "正在加载项目..." : `当前已保存 ${projects.length} 个项目`}</p>
                <button
                  className="primary-pill inline-pill"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleStartCreationJourney();
                  }}
                  disabled={creating}
                >
                  {creating ? "创建中..." : "新建并进入创作"}
                </button>
              </article>
            </div>
          </div>
        </section>

        <section className="dashboard-section" id="dashboard">
          <div className="page-container">
            <div className="section-title">
              <div>
                <h2>数据看板</h2>
                <p>支持按时间范围切换看板内容，当前前端已接好接口位置，后端完成后可直接替换真实数据。</p>
              </div>
              <div className="dashboard-range-switch" aria-label="数据范围切换">
                <label className="dashboard-range-select">
                  <span>时间范围</span>
                  <select
                    value={dashboardRange}
                    onChange={(event) => setDashboardRange(event.target.value as DashboardRange)}
                  >
                    {dashboardRangeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="dashboard-board">
              <div className="dashboard-top-row">
                <div className="dashboard-metrics-grid">
                  {dashboardOverview.metrics.map((metric) => (
                    <article
                      className="metric-panel"
                      key={metric.label}
                      style={{ "--metric-length": getMetricValueLength(metric.value) } as React.CSSProperties}
                    >
                      <span className="metric-label">{metric.label}</span>
                      <strong
                        key={metric.value}
                        className="metric-value"
                        style={{ "--metric-font-size": getMetricValueFontSize(metric.value) } as React.CSSProperties}
                        aria-label={metric.value}
                      >
                        {renderRollingMetricValue(metric.value)}
                      </strong>
                      <em>{metric.growth}</em>
                    </article>
                  ))}
                </div>

                <article className="line-panel">
                  <div className="dashboard-card-head">
                    <div>
                      <span className="dashboard-panel-title">{dashboardOverview.trend_title}</span>
                      <strong>总播放量</strong>
                    </div>
                  </div>
                  <div className="line-chart-area">
                    <div className="line-chart-yaxis">
                      {dashboardOverview.trend_yaxis.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                    <div
                      className="line-chart-canvas"
                      onPointerMove={handleTrendPointerMove}
                      onPointerLeave={() => setActiveTrendIndex(null)}
                    >
                      {activeTrendPoint ? (
                        <div
                          className="line-chart-callout"
                          style={{ "--callout-x": `${(activeTrendPoint.x / dashboardChartWidth) * 100}%` } as React.CSSProperties}
                        >
                          <span>{activeTrendPoint.label}</span>
                          <strong>{activeTrendPoint.display_value}</strong>
                        </div>
                      ) : null}
                      <svg viewBox="0 0 600 240" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="dashboardLineStroke" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#f3e1ac" />
                            <stop offset="55%" stopColor="#e0bb67" />
                            <stop offset="100%" stopColor="#8b5d22" />
                          </linearGradient>
                          <linearGradient id="dashboardLineFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(233, 196, 106, 0.28)" />
                            <stop offset="100%" stopColor="rgba(233, 196, 106, 0)" />
                          </linearGradient>
                        </defs>
                        <path
                          key={`${dashboardRange}-trend-area`}
                          className="line-chart-area-path"
                          d={dashboardOverview.trend_area_path}
                          fill="url(#dashboardLineFill)"
                        />
                        <path
                          key={`${dashboardRange}-trend-line`}
                          className="line-chart-line-path"
                          d={dashboardOverview.trend_line_path}
                          fill="none"
                          stroke="url(#dashboardLineStroke)"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                        {activeTrendPoint ? (
                          <>
                            <line
                              className="line-chart-cursor"
                              x1={activeTrendPoint.x}
                              y1="18"
                              x2={activeTrendPoint.x}
                              y2="228"
                            />
                            <circle
                              className="line-chart-active-dot"
                              cx={activeTrendPoint.x}
                              cy={activeTrendPoint.y}
                              r="8"
                            />
                          </>
                        ) : null}
                      </svg>
                      <div className="line-chart-xaxis">
                        {dashboardOverview.trend_xaxis.map((label) => (
                          <span
                            key={label}
                            className={label === activeTrendPoint?.label ? "active" : ""}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>

                <article className="donut-panel">
                  <div className="dashboard-card-head">
                    <div>
                      <span className="dashboard-panel-title">流量来源</span>
                      <strong>内容分发结构</strong>
                    </div>
                  </div>
                  <div className="donut-panel-body">
                    <div
                      className="donut-chart"
                      onPointerLeave={() => setActiveTrafficIndex(null)}
                    >
                      <svg viewBox="0 0 200 200" aria-label="流量来源占比">
                        <circle className="donut-track" cx="100" cy="100" r={dashboardDonutRadius} />
                        {dashboardDonutSegments.map((segment, index) => (
                          <circle
                            className={`donut-segment${activeTrafficIndex === index ? " active" : ""}`}
                            key={segment.label}
                            cx="100"
                            cy="100"
                            r={dashboardDonutRadius}
                            stroke={segment.color}
                            strokeDasharray={`${segment.dashLength} ${dashboardDonutCircumference - segment.dashLength}`}
                            strokeDashoffset={segment.dashOffset}
                            onPointerEnter={() => setActiveTrafficIndex(index)}
                          />
                        ))}
                      </svg>
                    </div>
                    <div className="donut-legend">
                      {dashboardOverview.traffic_sources.map((item, index) => (
                        <span
                          className={activeTrafficIndex === index ? "active" : ""}
                          key={item.label}
                          onPointerEnter={() => setActiveTrafficIndex(index)}
                          onPointerLeave={() => setActiveTrafficIndex(null)}
                        >
                          <i style={{ "--legend-color": dashboardTrafficColors[index % dashboardTrafficColors.length] } as React.CSSProperties} />
                          <b>{item.label}</b>
                          <strong>{item.value}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              </div>

              <div className="dashboard-bottom-row">
                <article className="rank-panel">
                  <div className="dashboard-card-head">
                    <div>
                      <span className="dashboard-panel-title">热门作品 TOP5</span>
                      <strong>爆款内容表现</strong>
                    </div>
                  </div>
                  <div
                    ref={rankListRef}
                    className={`rank-list${isRankVisible ? " is-visible" : ""}`}
                  >
                    {dashboardOverview.top_works.map((item) => (
                      <div
                        className="rank-row"
                        key={item.title}
                        style={{ "--rank-width": `${item.width}%` } as React.CSSProperties}
                      >
                        <span className="rank-order">{item.order}</span>
                        <span className="rank-title">{item.title}</span>
                        <div className="rank-bar">
                          <span />
                        </div>
                        <strong className="rank-value">{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="table-panel">
                  <div className="dashboard-card-head">
                    <div>
                      <span className="dashboard-panel-title">平台分发效果</span>
                      <strong>渠道投放回收</strong>
                    </div>
                  </div>
                  <div
                    ref={distributionTableRef}
                    className={`distribution-table${isDistributionVisible ? " is-visible" : ""}`}
                  >
                    <div className="total-plays-table">
                      <div className="distribution-table-head total-plays-head">
                        <span>时间范围</span>
                        <span>总播放量</span>
                        <span>趋势</span>
                        <span>对比表现</span>
                      </div>
                      {dashboardTotalPlayRows.map((row) => (
                        <div className="distribution-table-row total-plays-row" key={row.label}>
                          <span className="distribution-platform">
                            {renderRollingTableValue(row.label)}
                          </span>
                          <span className="distribution-data-value" key={`${row.label}-${row.value}`}>
                            {renderRollingTableValue(row.value)}
                          </span>
                          <span className="total-plays-sparkline" aria-hidden="true">
                            <svg viewBox="0 0 112 38" preserveAspectRatio="none">
                              <path className="sparkline-fill" d={`${row.trendPath} L112 38 L0 38 Z`} />
                              <path className="sparkline-line" d={row.trendPath} />
                            </svg>
                          </span>
                          <span className="distribution-data-value total-plays-growth" key={`${row.label}-${row.growth}`}>
                            {renderRollingTableValue(row.growth)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="distribution-table-divider" />
                    <div className="distribution-table-head">
                      <span>平台</span>
                      <span>播放量</span>
                      <span>互动量</span>
                      <span>完播率</span>
                    </div>
                    {dashboardOverview.distribution_rows.map((row) => (
                      <div className="distribution-table-row" key={row.platform}>
                        <span className="distribution-platform">
                          {renderRollingTableValue(row.platform)}
                        </span>
                        <span className="distribution-data-value" key={`${row.platform}-${row.plays}`}>
                          {renderRollingTableValue(row.plays)}
                        </span>
                        <span className="distribution-data-value" key={`${row.platform}-${row.interactions}`}>
                          {renderRollingTableValue(row.interactions)}
                        </span>
                        <span className="distribution-data-value" key={`${row.platform}-${row.completion_rate}`}>
                          {renderRollingTableValue(row.completion_rate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="bottom-cta-section">
          <div className="page-container">
            <div className="bottom-cta-card">
              <div className="bottom-cta-copy">
                <h2>开启你的 AI 漫剧创作之旅</h2>
                <p>从故事架构、剧本、资产，到镜头、发布和复盘，把整套流程沉淀成一个真正可用的创作系统。</p>
                <button className="primary-pill bottom-cta-button" type="button" onClick={handleStartCreationJourney} disabled={creating}>
                  {creating ? "创建中..." : "立即开始创作"}
                </button>
              </div>
              <div className="bottom-cta-visual" aria-hidden="true">
                <img className="bottom-cta-visual-image" src="/images/footer-cta-visual.png" alt="" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-container site-footer-inner">
          <div className="site-footer-brand">
            <div className="brand-lockup compact footer-brand-lockup">
              <span className="brand-mark">C</span>
              <span>coGMan AI 漫剧</span>
            </div>
            <p>AI 漫剧创作平台，让灵感、脚本、镜头、发布和复盘聚合在同一套高效工作流中。</p>
            <div className="site-footer-socials">
              {["站", "影", "微", "频"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="site-footer-links">
            <div className="footer-link-group">
              <strong>产品</strong>
              <a href="#workspace">项目工作台</a>
              <a href="#workflow">工作流展示</a>
              <a href="#dashboard">数据看板</a>
              <a href="/models">API 接口</a>
            </div>
            <div className="footer-link-group">
              <strong>资源</strong>
              <a href="/docs">帮助文档</a>
              <a href="/docs">更新日志</a>
              <a href="/gallery">案例灵感</a>
              <a href="/docs">常见问题</a>
            </div>
            <div className="footer-link-group">
              <strong>社区</strong>
              <a href="/community">社区首页</a>
              <a href="/community">创作者论坛</a>
              <a href="/community">活动中心</a>
              <a href="/community">官方社群</a>
            </div>
            <div className="footer-link-group">
              <strong>关于我们</strong>
              <a href="/docs">品牌介绍</a>
              <a href="/docs">加入我们</a>
              <a href="/docs">联系我们</a>
              <a href="/docs">隐私政策</a>
            </div>
          </div>
        </div>
        <div className="page-container site-footer-bottom">
          <span>© 2026 coGMan AI 漫剧. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

function WorkspacePage() {
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("正在加载项目...");

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchProject(projectId);
        setProject(mergeProjectDefaults(data));
        setStatusMessage("项目加载完成");
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载项目失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  if (loading) {
    return <div className="page-loading">正在加载工作台...</div>;
  }

  if (error || !project) {
    return (
      <div className="page-loading">
        <div>{error || "项目不存在"}</div>
        <Link className="primary-pill inline-pill" to="/">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <CreativeWorkspaceContent
      project={project}
      statusMessage={statusMessage}
      setStatusMessage={setStatusMessage}
      onProjectSaved={(nextProject, message) => {
        setProject(mergeProjectDefaults(nextProject));
        setStatusMessage(message);
      }}
      headerEyebrow="项目工作台"
      headerTitle={project.name}
      headerDescription="当前已打通步骤一和步骤二，并预留了剩余工作流的展示入口与后续扩展位置。"
      headerMeta={
        <>
          <span className="ghost-chip">当前步骤：{project.current_step}</span>
          <span className="ghost-chip">最近更新：{new Date(project.updated_at).toLocaleString("zh-CN")}</span>
        </>
      }
    />
  );
}

function CreateCenterRedirect() {
  const [searchParams] = useSearchParams();
  return <Navigate replace to={firstStepPath(searchParams.get("projectId") ?? undefined)} />;
}

function CreateCenterPage() {
  const { stepId } = useParams<{ stepId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeStepId = resolveStepId(stepId);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(searchParams.get("projectId") ?? "");
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("正在加载创作中心...");
  const [creatingProject, setCreatingProject] = useState(false);

  async function handleCreateProjectFromCenter() {
    setCreatingProject(true);
    setError("");
    try {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hour = String(now.getHours()).padStart(2, "0");
      const minute = String(now.getMinutes()).padStart(2, "0");
      const nextProject = await createProject(`新建漫剧项目 ${month}${day}-${hour}${minute}`);
      await refreshProjects(nextProject.id);
      setSelectedProjectId(nextProject.id);
      setStatusMessage("新项目已创建，已进入步骤一。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败");
    } finally {
      setCreatingProject(false);
    }
  }

  async function refreshProjects(preferredProjectId?: string) {
    setProjectsLoading(true);
    setError("");
    try {
      const nextProjects = await fetchProjects();
      setProjects(nextProjects);
      if (!nextProjects.length) {
        setSelectedProjectId("");
        setProject(null);
        setStatusMessage("还没有项目，先创建一个项目开启十一步创作流程。");
        return;
      }

      const hasPreferredProject = preferredProjectId
        ? nextProjects.some((item) => item.id === preferredProjectId)
        : false;
      const queryProjectId = searchParams.get("projectId");
      const hasQueryProject = queryProjectId
        ? nextProjects.some((item) => item.id === queryProjectId)
        : false;
      setSelectedProjectId((current) => {
        if (hasPreferredProject && preferredProjectId) {
          return preferredProjectId;
        }
        if (hasQueryProject && queryProjectId) {
          return queryProjectId;
        }
        if (current && nextProjects.some((item) => item.id === current)) {
          return current;
        }
        return nextProjects[0]?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载创作中心失败");
    } finally {
      setProjectsLoading(false);
    }
  }

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    const queryProjectId = searchParams.get("projectId");
    if (!queryProjectId || queryProjectId === selectedProjectId) return;
    if (projects.some((item) => item.id === queryProjectId)) {
      setSelectedProjectId(queryProjectId);
    }
  }, [projects, searchParams, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const queryProjectId = searchParams.get("projectId");
    if (queryProjectId === selectedProjectId) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("projectId", selectedProjectId);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, selectedProjectId, setSearchParams]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProject(null);
      return;
    }

    let cancelled = false;
    setProjectLoading(true);
    setStatusMessage("正在加载项目内容...");

    void (async () => {
      try {
        const data = await fetchProject(selectedProjectId);
        if (cancelled) return;
        setProject(mergeProjectDefaults(data));
        setStatusMessage(`已载入项目：${data.name}`);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载项目失败");
      } finally {
        if (!cancelled) {
          setProjectLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const selectedProjectSummary = projects.find((item) => item.id === selectedProjectId) ?? projects[0] ?? null;

  return (
    <div className="app-shell home-page sub-page create-center-page">
      <SiteHeader
        action={
          <Link className="primary-pill" to="/">
            返回首页
          </Link>
        }
      />

      <main className="create-center-main">
        {error ? <div className="page-container"><div className="status-banner create-center-status-banner">{error}</div></div> : null}

        {projectsLoading || projectLoading ? (
          <div className="page-container create-center-loading">
            <LoadingSkeleton rows={5} />
          </div>
        ) : project ? (
          <CreativeWorkspaceContent
            project={project}
            activeStepId={activeStepId}
            statusMessage={statusMessage}
            setStatusMessage={setStatusMessage}
            onProjectSaved={(nextProject, message) => {
              const mergedProject = mergeProjectDefaults(nextProject);
              setProject(mergedProject);
              setStatusMessage(message);
              setProjects((current) =>
                current.map((item) =>
                  item.id === mergedProject.id
                    ? {
                        ...item,
                        name: mergedProject.name,
                        status: mergedProject.status,
                        progress: mergedProject.progress,
                        updated_at: mergedProject.updated_at,
                      }
                    : item
                )
              );
            }}
            shellClassName="workspace-shell create-center-shell"
            headerEyebrow="十一步创作流"
            headerTitle={project.name}
            headerDescription="十一步创作链路已接入项目数据与 AI 生成能力，可逐步生成、保存、校验和进入下游生产。"
            headerMeta={
              <>
                <div className="project-switch-dropdown">
                  <span className="project-switch-dropdown-label">切换项目</span>
                  <div className="project-switch-dropdown-options">
                    <button
                      className="project-switch-option create-new"
                      type="button"
                      onClick={() => void handleCreateProjectFromCenter()}
                      disabled={creatingProject}
                    >
                      {creatingProject ? "创建中..." : "创建新项目"}
                    </button>
                    {projects.length ? (
                      projects.map((item) => (
                        <button
                          key={item.id}
                          className={`project-switch-option${item.id === selectedProjectId ? " active" : ""}`}
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(item.id);
                            setStatusMessage(item.id === selectedProjectId ? `当前已选择项目：${item.name}` : `正在切换到项目：${item.name}`);
                          }}
                        >
                          {item.name}
                        </button>
                      ))
                    ) : (
                      <span className="project-switch-option empty">暂无项目</span>
                    )}
                  </div>
                </div>
                <span className="ghost-chip">当前进度：{project.progress}%</span>
                <span className="ghost-chip">最近更新：{new Date(project.updated_at).toLocaleString("zh-CN")}</span>
              </>
            }
            summaryLabel="创作项目"
            summaryCaption="十一步流程进度"
          />
        ) : (
          <section className="page-container create-center-empty-state">
            <div className="coming-soon-panel create-center-empty-panel">
              <span className="coming-soon-badge">START NOW</span>
              <h2>先创建一个项目，再开始十一步创作流程</h2>
              <p>创建完成后，这里会自动载入步骤一到步骤十一的工作区，步骤一和步骤二可以立即开始编辑和保存。</p>
              <button className="primary-pill inline-pill" type="button" onClick={() => void handleCreateProjectFromCenter()} disabled={creatingProject}>
                {creatingProject ? "创建中..." : "创建新项目"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function CreativeWorkspaceContent({
  project,
  activeStepId = project.current_step,
  statusMessage,
  setStatusMessage,
  onProjectSaved,
  shellClassName = "workspace-shell",
  headerEyebrow,
  headerTitle,
  headerDescription,
  headerMeta,
  summaryLabel = "当前项目",
  summaryCaption = "完成度",
}: {
  project: ProjectRecord;
  activeStepId?: string;
  statusMessage: string;
  setStatusMessage: (message: string) => void;
  onProjectSaved: (project: ProjectRecord, message: string) => void;
  shellClassName?: string;
  headerEyebrow: string;
  headerTitle: string;
  headerDescription: string;
  headerMeta?: React.ReactNode;
  summaryLabel?: string;
  summaryCaption?: string;
}) {
  const activeStep = workflowSteps.find((step) => step.id === activeStepId) ?? workflowSteps[0];
  const navigate = useNavigate();
  const [statusMessageTick, setStatusMessageTick] = useState(0);
  const announceStatusMessage = (message: string) => {
    setStatusMessage(message);
    setStatusMessageTick((current) => current + 1);
  };
  const handleProjectSaved = (nextProject: ProjectRecord, message: string) => {
    onProjectSaved(nextProject, message);
    setStatusMessageTick((current) => current + 1);
  };

  return (
    <div className={shellClassName}>
      <aside className="workspace-sidebar">
        <Link className="brand-lockup compact" to="/">
          <span className="brand-mark">C</span>
          <span>coGMan AI 漫剧</span>
        </Link>
        <div className="project-summary-card">
          <span>{summaryLabel}</span>
          <strong>{project.name}</strong>
          <em>{project.status}</em>
          <div className="progress-bar">
            <span style={{ width: `${project.progress}%` }} />
          </div>
          <small>
            {summaryCaption} {project.progress}%
          </small>
        </div>
        <nav className="step-nav">
          {workflowSteps.map((step) => (
            <Link
              key={step.id}
              to={createCenterPath(step.id, project.id)}
              className={`step-nav-item ${activeStep.id === step.id ? "active" : ""}`}
            >
              <StepStatusDot status={getStepCompletionStatus(project, step.id)} />
              <span>{step.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="workspace-main">
        <header className="workspace-header">
          <div>
            <div className="eyebrow">{headerEyebrow}</div>
            <h1>{headerTitle}</h1>
            <p>{headerDescription}</p>
          </div>
          {headerMeta ? <div className="header-meta">{headerMeta}</div> : null}
        </header>

        <div className="status-banner status-banner-feedback" key={statusMessageTick}>{statusMessage}</div>

        {activeStep.id === "story-structure" ? (
          <StepOneSection
            project={project}
            onSaved={(nextProject, message) => {
              handleProjectSaved(mergeProjectDefaults(nextProject), message);
            }}
            setStatusMessage={announceStatusMessage}
            onNavigateStep={(stepId) => navigate(createCenterPath(stepId, project.id))}
          />
        ) : null}

        {activeStep.id === "script-creation" ? (
          <StepTwoSection
            project={project}
            onSaved={(nextProject, message) => {
              handleProjectSaved(mergeProjectDefaults(nextProject), message);
            }}
            setStatusMessage={announceStatusMessage}
            onNavigateStep={(stepId) => navigate(createCenterPath(stepId, project.id))}
          />
        ) : null}

        {activeStep.id === "asset-setting" ? (
          <StepThreeSection
            project={project}
            onSaved={(nextProject, message) => handleProjectSaved(mergeProjectDefaults(nextProject), message)}
            setStatusMessage={announceStatusMessage}
          />
        ) : null}
        {activeStep.id === "storyboard-planning" ? (
          <StepFourSection
            project={project}
            onSaved={(nextProject, message) => handleProjectSaved(mergeProjectDefaults(nextProject), message)}
            setStatusMessage={announceStatusMessage}
          />
        ) : null}
        {activeStep.id === "prompt-generation" ? (
          <StepFiveSection
            project={project}
            onSaved={(nextProject, message) => handleProjectSaved(mergeProjectDefaults(nextProject), message)}
            setStatusMessage={announceStatusMessage}
          />
        ) : null}
        {activeStep.id === "image-generation" ? (
          <StepSixSection
            project={project}
            onSaved={(nextProject, message) => handleProjectSaved(mergeProjectDefaults(nextProject), message)}
            setStatusMessage={announceStatusMessage}
          />
        ) : null}
        {activeStep.id === "quality-rework" ? (
          <StepSevenSection
            project={project}
            onSaved={(nextProject, message) => handleProjectSaved(mergeProjectDefaults(nextProject), message)}
            setStatusMessage={announceStatusMessage}
          />
        ) : null}
        {activeStep.id === "video-generation" ? (
          <StepEightSection
            project={project}
            onSaved={(nextProject, message) => handleProjectSaved(mergeProjectDefaults(nextProject), message)}
            setStatusMessage={announceStatusMessage}
          />
        ) : null}
        {activeStep.id === "audio-subtitle" ? (
          <StepNineSection
            project={project}
            onSaved={(nextProject, message) => handleProjectSaved(mergeProjectDefaults(nextProject), message)}
            setStatusMessage={announceStatusMessage}
          />
        ) : null}
        {activeStep.id === "final-editing" ? (
          <StepTenSection
            project={project}
            onSaved={(nextProject, message) => handleProjectSaved(mergeProjectDefaults(nextProject), message)}
            setStatusMessage={announceStatusMessage}
          />
        ) : null}
        {activeStep.id === "publish-review" ? (
          <StepElevenSection
            project={project}
            onSaved={(nextProject, message) => handleProjectSaved(mergeProjectDefaults(nextProject), message)}
            setStatusMessage={announceStatusMessage}
          />
        ) : null}

        {activeStep.id !== "story-structure" &&
        activeStep.id !== "script-creation" &&
        activeStep.id !== "asset-setting" &&
        activeStep.id !== "storyboard-planning" &&
        activeStep.id !== "prompt-generation" &&
        activeStep.id !== "image-generation" &&
        activeStep.id !== "quality-rework" &&
        activeStep.id !== "video-generation" &&
        activeStep.id !== "audio-subtitle" &&
        activeStep.id !== "final-editing" &&
        activeStep.id !== "publish-review" ? (
          <article className="placeholder-card single-step-page" id={activeStep.id}>
            <div className="placeholder-badge">{activeStep.label}</div>
            <h3>{activeStep.label.replace(/^\d+\s*/, "")}</h3>
            <p>该步骤的导航入口、页面卡位和后续扩展区都已经预留完成，接下来可以继续按功能清单逐步补齐真实能力。</p>
          </article>
        ) : null}
      </div>
    </div>
  );
}

function TopbarSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    if (/角色|人物|主角|艾琳|凛|露西/i.test(query)) {
      navigate("/#role");
      return;
    }

    navigate(`/gallery?search=${encodeURIComponent(query)}`);
  }

  return (
    <form className="topbar-search" onSubmit={handleSearchSubmit} role="search">
      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="搜索作品、角色..."
        aria-label="搜索作品或角色"
      />
    </form>
  );
}

function SiteHeader({ action }: { action: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="page-container topbar-inner">
        <Link className="brand-lockup" to="/">
          <span className="brand-mark">C</span>
          <span>coGMan AI 漫剧</span>
        </Link>
        <nav className="nav-row">
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/">
            首页
          </NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/create-center">
            创作中心
          </NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/gallery">
            作品广场
          </NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/models">
            模型与工具
          </NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/docs">
            教程文档
          </NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/community">
            社区
          </NavLink>
        </nav>
        <div className="topbar-actions">
          <TopbarSearch />
          {action}
        </div>
      </div>
    </header>
  );
}

function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="app-shell home-page sub-page">
      <SiteHeader
        action={
          <Link className="primary-pill" to="/">
            返回首页
          </Link>
        }
      />

      <main className="coming-soon-main">
        <section className="coming-soon-panel page-container">
          <span className="coming-soon-badge">COMING SOON</span>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className="coming-soon-actions">
            <Link className="primary-pill" to="/">
              返回首页
            </Link>
            <Link className="hero-button" to="/gallery">
              查看相关页面
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function StepOneSection({
  project,
  onSaved,
  setStatusMessage,
  onNavigateStep,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
  onNavigateStep: (stepId: string) => void;
}) {
  const [form, setForm] = useState<StepOneData>(project.step_one);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [foundationGenerating, setFoundationGenerating] = useState<"world" | "mainline" | "relationships" | null>(null);
  const coreStoryIdeaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setForm(project.step_one);
    setIsDirty(false);
  }, [project.step_one]);

  const stats = useMemo(() => {
    const total = form.episodes.length;
    const contentDone = form.episodes.filter((item) => item.content.trim()).length;
    const hookDone = form.episodes.filter((item) => item.hook.trim()).length;
    return { total, contentDone, hookDone };
  }, [form.episodes]);
  const versionRecords = useMemo<VersionRecord[]>(
    () => [
      {
        id: "step-one-current",
        title: "当前故事架构草稿",
        description: form.core_story_idea.trim() ? "已形成核心故事输入，可继续生成季纲。" : "等待输入核心故事。",
        created_at: project.updated_at ? new Date(project.updated_at).toLocaleString("zh-CN") : "尚未保存",
      },
    ],
    [form.core_story_idea, project.updated_at]
  );

  function updateForm(nextForm: StepOneData) {
    setForm(nextForm);
    setIsDirty(true);
  }

  function updateEpisode(index: number, key: keyof EpisodeDraft, value: string) {
    setIsDirty(true);
    setForm((current) => ({
      ...current,
      episodes: current.episodes.map((episode, episodeIndex) =>
        episodeIndex === index ? { ...episode, [key]: value } : episode
      ),
    }));
  }

  function buildEpisodes(total: number, currentEpisodes: EpisodeDraft[]) {
    return Array.from({ length: total }, (_, index) => {
      const existing = currentEpisodes[index];
      if (existing) {
        return { ...existing, episode_number: index + 1 };
      }
      return {
        episode_number: index + 1,
        title: `第 ${index + 1} 集`,
        content: "",
        hook: "",
      };
    });
  }

  function handleEpisodePresetChange(value: string) {
    const total = value === "自定义集数" ? Math.max(1, form.custom_episode_count ?? 12) : Number.parseInt(value, 10) || 12;
    setIsDirty(true);
    setForm((current) => ({
      ...current,
      season_episode_count: value,
      episodes: buildEpisodes(total, current.episodes),
    }));
  }

  function handleCustomCountChange(value: number) {
    const total = Math.max(1, value || 1);
    setIsDirty(true);
    setForm((current) => ({
      ...current,
      custom_episode_count: total,
      episodes: buildEpisodes(total, current.episodes),
    }));
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatusMessage("正在导入故事思路文件...");
    try {
      assertImportableFile(file);
      const result = await importTextFile(file);
      setForm((current) => ({
        ...current,
        imported_story_name: result.filename,
        core_story_idea: result.content,
        import_parse_status: `已解析 ${result.content.length} 个字符`,
      }));
      setIsDirty(true);
      setStatusMessage(`已导入文件：${result.filename}，内容已写入「核心故事思路」，共 ${result.content.length} 个字符`);
      event.currentTarget.value = "";
      window.setTimeout(() => {
        coreStoryIdeaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        coreStoryIdeaRef.current?.focus({ preventScroll: true });
      }, 50);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "导入失败");
    }
  }

  async function handleGenerateOutline() {
    if (aiGenerating) return;
    setAiGenerating(true);
    setStatusMessage("AI 正在生成季纲草案...");
    try {
      const chunks = buildStepOneChunks(form.core_story_idea, form.episodes.length);
      const partials: string[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        setStatusMessage(`AI 正在生成第 ${index + 1}/${chunks.length} 段季纲...`);
        const result = await generateStepOneOutline(form.project_name || project.name, chunks[index], { project_id: project.id });
        partials.push(result.content);
      }
      setIsDirty(true);
      const mergedOutline = mergeChunkResults(partials);
      const parsedOutline = parseSeasonOutlineResult(mergedOutline);
      const parsedEpisodes = new Map(parsedOutline.episodes.map((episode) => [episode.episode_number, episode]));
      setForm((current) => ({
        ...current,
        season_outline: parsedOutline.season_outline || mergedOutline,
        episodes: current.episodes.map((episode) => {
          const parsedEpisode = parsedEpisodes.get(episode.episode_number);
          if (!parsedEpisode) return episode;
          return {
            ...episode,
            title: parsedEpisode.title || episode.title,
            content: parsedEpisode.content || episode.content,
            hook: parsedEpisode.hook || episode.hook,
          };
        }),
      }));
      setStatusMessage(
        parsedOutline.formatted
          ? "AI 已生成季纲草案，你可以继续逐集编辑。"
          : "AI 已生成季纲原文，但返回格式异常，已保留在整季纲中，请整理或重新生成。"
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 生成失败");
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatusMessage("正在保存步骤一数据...");
    try {
      const saved = await saveStepOne(project.id, {
        ...form,
        project_name: form.project_name || project.name,
        linked_project: true,
      });
      setIsDirty(false);
      onSaved(saved, "步骤一数据已保存并自动关联项目");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleGoNextStep() {
    if (!form.core_story_idea.trim()) {
      setStatusMessage("请先填写核心故事思路。");
      return;
    }
    setSaving(true);
    setStatusMessage("正在保存步骤一并进入步骤二...");
    try {
      const saved = await saveStepOne(project.id, {
        ...form,
        project_name: form.project_name || project.name,
        linked_project: true,
      });
      setIsDirty(false);
      onSaved(saved, "步骤一已保存，正在进入步骤二。");
      onNavigateStep("script-creation");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "进入步骤二失败");
    } finally {
      setSaving(false);
    }
  }

  function buildFoundationPrompt(target: string) {
    return [
      `生成目标：${target}`,
      `项目名称：${form.project_name || project.name}`,
      `类型：${form.genre || "未填写"}`,
      `目标受众：${form.target_audience || "未填写"}`,
      `目标平台：${form.target_platform || "未填写"}`,
      `核心故事标题：${form.core_story_title || "未填写"}`,
      "核心故事原文：",
      form.core_story_idea || "未填写",
      "当前已填写字段：",
      `世界背景：${form.world_background || "未填写"}`,
      `时代设定：${form.era_setting || "未填写"}`,
      `规则体系：${form.rule_system || "未填写"}`,
      `冲突环境：${form.conflict_environment || "未填写"}`,
      `主角目标：${form.protagonist_goal || "未填写"}`,
      `反派阻力：${form.antagonist_pressure || "未填写"}`,
      `核心矛盾：${form.core_conflict || "未填写"}`,
      `成长线：${form.character_growth || "未填写"}`,
      `人物关系：${form.relationship_notes || "未填写"}`,
      "要求：只围绕核心故事原文生成，不要套用与原故事无关的近未来、隐秘组织、超能力、公众秩序等模板元素。",
    ].join("\n");
  }

  async function generateWorldDraft() {
    if (foundationGenerating || aiGenerating) return;
    setFoundationGenerating("world");
    setStatusMessage("AI 正在生成世界观草稿...");
    try {
      const result = await generateStepOneTask(form.project_name || project.name, buildFoundationPrompt("世界观编辑"), "S01_WORLDVIEW", { project_id: project.id });
      const parsed = parseStepOneFoundationResult(result.content);
      if (!parsed.formatted) {
        setStatusMessage("AI 返回格式异常，未写入世界观字段，请重新生成。");
        return;
      }
      setIsDirty(true);
      setForm((current) => ({
        ...current,
        world_background: parsed.fields.world_background || current.world_background,
        era_setting: parsed.fields.era_setting || current.era_setting,
        rule_system: parsed.fields.rule_system || current.rule_system,
        conflict_environment: parsed.fields.conflict_environment || current.conflict_environment,
      }));
      setStatusMessage("AI 已生成世界观草稿，可继续编辑。");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "世界观生成失败");
    } finally {
      setFoundationGenerating(null);
    }
  }

  async function generateMainlineDraft() {
    if (foundationGenerating || aiGenerating) return;
    setFoundationGenerating("mainline");
    setStatusMessage("AI 正在生成主线目标草稿...");
    try {
      const result = await generateStepOneTask(form.project_name || project.name, buildFoundationPrompt("主线目标"), "S01_MAIN_CONFLICT", { project_id: project.id });
      const parsed = parseStepOneFoundationResult(result.content);
      if (!parsed.formatted) {
        setStatusMessage("AI 返回格式异常，未写入主线字段，请重新生成。");
        return;
      }
      setIsDirty(true);
      setForm((current) => ({
        ...current,
        protagonist_goal: parsed.fields.protagonist_goal || current.protagonist_goal,
        antagonist_pressure: parsed.fields.antagonist_pressure || current.antagonist_pressure,
        core_conflict: parsed.fields.core_conflict || current.core_conflict,
        character_growth: parsed.fields.character_growth || current.character_growth,
      }));
      setStatusMessage("AI 已生成主线目标草稿。");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "主线目标生成失败");
    } finally {
      setFoundationGenerating(null);
    }
  }

  async function generateRelationshipDraft() {
    if (foundationGenerating || aiGenerating) return;
    setFoundationGenerating("relationships");
    setStatusMessage("AI 正在生成人物关系草稿...");
    try {
      const result = await generateStepOneTask(form.project_name || project.name, buildFoundationPrompt("人物关系"), "S01_RELATIONSHIPS", { project_id: project.id });
      const parsed = parseStepOneFoundationResult(result.content);
      if (!parsed.formatted) {
        setStatusMessage("AI 返回格式异常，未写入人物关系字段，请重新生成。");
        return;
      }
      setIsDirty(true);
      setForm((current) => ({
        ...current,
        relationship_notes: parsed.fields.relationship_notes || current.relationship_notes,
        relationships: parsed.relationships.length ? parsed.relationships : current.relationships,
      }));
      setStatusMessage("AI 已生成人物关系草稿。");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "人物关系生成失败");
    } finally {
      setFoundationGenerating(null);
    }
  }

  async function generateContinuityReport() {
    if (foundationGenerating || aiGenerating) return;
    setFoundationGenerating("mainline");
    setStatusMessage("AI 正在生成连续性检查...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S01_CONTINUITY_CHECK",
        JSON.stringify({ season_outline: form.season_outline, episodes: form.episodes }, null, 2),
        { projectId: project.id }
      );
      const parsed = firstJsonObject(result.content);
      const issues = listValue(parsed.issues).map((item, index) => {
        const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          id: `issue-ai-${Date.now()}-${index}`,
          episode_number: Math.max(1, Math.round(numberValue(record.episode_number, index + 1))),
          severity: severityValue(record.severity),
          issue: textValue(record.issue, textValue(item, "AI 发现连续性风险")),
          suggestion: textValue(record.suggestion, "建议补充动机、因果或结尾钩子。"),
          status: "open" as const,
        };
      });
      updateForm({
        ...form,
        continuity_report: textValue(parsed.report) || textValue(parsed.summary) || result.content,
        continuity_issues: issues,
      });
      setStatusMessage("AI 连续性检查已生成。");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 连续性检查失败");
    } finally {
      setFoundationGenerating(null);
    }
  }

  return (
    <section className="editor-section" id="story-structure">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤一</span>
          <h2>故事架构</h2>
        </div>
        <div className="chip-row">
          <span className="ghost-chip">项目关联：{form.linked_project ? "已关联" : "未关联"}</span>
          <span className="ghost-chip">总集数：{stats.total}</span>
          <span className="ghost-chip">内容完成：{stats.contentDone}</span>
          <span className="ghost-chip">钩子完成：{stats.hookDone}</span>
        </div>
      </div>

      <div className="editor-grid">
        <div className="panel-card">
          <label className="field-label">
            <span>项目名称</span>
            <input
              value={form.project_name}
              onChange={(event) => updateForm({ ...form, project_name: event.target.value })}
              placeholder="输入项目名称"
            />
          </label>

          <label className="field-label">
            <span>核心故事标题</span>
            <input
              value={form.core_story_title}
              onChange={(event) => updateForm({ ...form, core_story_title: event.target.value })}
              placeholder="给核心故事起一个便于识别的标题"
            />
          </label>

          <label className="field-label">
            <span>核心故事思路</span>
            <textarea
              ref={coreStoryIdeaRef}
              value={form.core_story_idea}
              onChange={(event) => updateForm({ ...form, core_story_idea: event.target.value })}
              placeholder="输入核心故事思路，或导入 .txt / .md / .docx / .csv / .srt 文件"
              rows={7}
            />
          </label>

          <div className="field-row compact-row">
            <label className="field-label">
              <span>季纲集数</span>
              <select value={form.season_episode_count} onChange={(event) => handleEpisodePresetChange(event.target.value)}>
                <option value="12">12集</option>
                <option value="24">24集</option>
                <option value="36">36集</option>
                <option value="自定义集数">自定义集数</option>
              </select>
            </label>
            {form.season_episode_count === "自定义集数" ? (
              <label className="field-label">
                <span>自定义集数</span>
                <input
                  type="number"
                  min={1}
                  value={form.custom_episode_count ?? 12}
                  onChange={(event) => handleCustomCountChange(Number(event.target.value))}
                />
              </label>
            ) : null}
          </div>

          <div className="action-row">
            <AIGenerationButtonGroup
              onGenerate={() => void handleGenerateOutline()}
              isGenerating={aiGenerating}
              generatingLabel="季纲生成中"
              onCopyPrompt={() => {
                void copyTextToClipboard(form.core_story_idea || "请基于项目设定生成季纲。", "已复制步骤一生成提示词", setStatusMessage);
              }}
            />
            <ImportFileButton label="导入故事思路文件" filename={form.imported_story_name} onChange={handleImport} />
            <button
              className="ghost-button inline-button"
              type="button"
              onClick={() => {
                updateForm(defaultStepOneData(project.name));
                setStatusMessage("步骤一表单已清空，保存后生效。");
              }}
            >
              清空当前步骤
            </button>
            <button className="ghost-button inline-button strong" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存当前步骤"}
            </button>
            <NextStepButton
              disabled={!form.core_story_idea.trim() || saving}
              onClick={() => void handleGoNextStep()}
            />
          </div>

          <div className="hint-text">
            {isDirty ? "当前步骤有未保存修改。" : "当前步骤已与项目数据同步。"}
            {form.imported_story_name ? ` 已导入文件：${form.imported_story_name}，${form.import_parse_status}` : ""}
          </div>
        </div>

        <div className="panel-card overview-panel">
          <h3>季纲概览</h3>
          <div className="overview-list">
            {form.episodes.map((episode) => (
              <div className="overview-item" key={episode.episode_number}>
                <strong>第 {episode.episode_number} 集</strong>
                <span>{episode.content.trim() ? episode.content.slice(0, 30) : "待填写本集内容"}</span>
              </div>
            ))}
          </div>
          <VersionHistoryPanel versions={versionRecords} />
        </div>
      </div>

      <div className="story-foundation-grid">
        <div className="panel-card">
          <h3>世界观编辑</h3>
          <AIActionButton
            isGenerating={foundationGenerating === "world"}
            disabled={Boolean(foundationGenerating) || aiGenerating}
            loadingLabel="世界观生成中"
            onClick={() => void generateWorldDraft()}
          >
            生成世界观草稿
          </AIActionButton>
          <label className="field-label">
            <span>世界背景</span>
            <textarea rows={4} value={form.world_background} onChange={(event) => updateForm({ ...form, world_background: event.target.value })} placeholder="描述故事发生的世界、地域、社会结构。" />
          </label>
          <label className="field-label">
            <span>时代设定</span>
            <input value={form.era_setting} onChange={(event) => updateForm({ ...form, era_setting: event.target.value })} placeholder="例如：近未来、架空古代、现代都市" />
          </label>
          <label className="field-label">
            <span>规则体系</span>
            <textarea rows={3} value={form.rule_system} onChange={(event) => updateForm({ ...form, rule_system: event.target.value })} placeholder="能力、组织、资源、禁忌或世界运行规则。" />
          </label>
          <label className="field-label">
            <span>冲突环境</span>
            <textarea rows={3} value={form.conflict_environment} onChange={(event) => updateForm({ ...form, conflict_environment: event.target.value })} placeholder="外部压力、时代矛盾、社会冲突或生存困境。" />
          </label>
        </div>

        <div className="panel-card">
          <h3>主线目标</h3>
          <AIActionButton
            isGenerating={foundationGenerating === "mainline"}
            disabled={Boolean(foundationGenerating) || aiGenerating}
            loadingLabel="主线生成中"
            onClick={() => void generateMainlineDraft()}
          >
            生成主线目标
          </AIActionButton>
          <label className="field-label">
            <span>主角目标</span>
            <textarea rows={3} value={form.protagonist_goal} onChange={(event) => updateForm({ ...form, protagonist_goal: event.target.value })} placeholder="主角想得到什么、守护什么或改变什么。" />
          </label>
          <label className="field-label">
            <span>反派阻力</span>
            <textarea rows={3} value={form.antagonist_pressure} onChange={(event) => updateForm({ ...form, antagonist_pressure: event.target.value })} placeholder="反派或对立力量如何制造阻碍。" />
          </label>
          <label className="field-label">
            <span>核心矛盾</span>
            <textarea rows={3} value={form.core_conflict} onChange={(event) => updateForm({ ...form, core_conflict: event.target.value })} placeholder="贯穿全季的主要冲突。" />
          </label>
          <label className="field-label">
            <span>成长线</span>
            <textarea rows={3} value={form.character_growth} onChange={(event) => updateForm({ ...form, character_growth: event.target.value })} placeholder="主角从哪里出发，最终完成怎样的变化。" />
          </label>
        </div>

        <div className="panel-card">
          <h3>人物关系</h3>
          <AIActionButton
            isGenerating={foundationGenerating === "relationships"}
            disabled={Boolean(foundationGenerating) || aiGenerating}
            loadingLabel="关系生成中"
            onClick={() => void generateRelationshipDraft()}
          >
            生成人物关系
          </AIActionButton>
          <label className="field-label">
            <span>关系说明</span>
            <textarea rows={5} value={form.relationship_notes} onChange={(event) => updateForm({ ...form, relationship_notes: event.target.value })} placeholder="用自然语言描述主要人物、阵营和关系张力。" />
          </label>
          <button
            className="ghost-button inline-button"
            type="button"
            onClick={() => {
              updateForm({
                ...form,
                relationships: [
                  ...form.relationships,
                  {
                    id: `rel-${Date.now()}`,
                    character_a: "主角",
                    character_b: "对手",
                    relationship: "目标冲突",
                    conflict: "围绕同一资源产生竞争",
                  },
                ],
              });
              setStatusMessage("已添加关系样例，可继续编辑后保存。");
            }}
          >
            添加关系样例
          </button>
          <div className="overview-list relationship-list">
            {form.relationships.length ? (
              form.relationships.map((item) => (
                <div className="overview-item" key={item.id}>
                  <strong>{item.character_a} / {item.character_b}</strong>
                  <span>{item.relationship}：{item.conflict}</span>
                </div>
              ))
            ) : (
              <div className="hint-text">暂无结构化人物关系，可先填写关系说明。</div>
            )}
          </div>
        </div>
      </div>

      <div className="panel-card continuity-card">
        <div className="section-header compact-section-header">
          <div>
            <span className="section-header-eyebrow">Continuity</span>
            <h2>连续性检查</h2>
            <p>检查单集大纲是否存在缺口、重复和节奏断层。</p>
          </div>
          <button className="ghost-button inline-button" type="button" onClick={generateContinuityReport}>
            生成连续性报告
          </button>
        </div>
        <p className="continuity-report">{form.continuity_report || "暂无连续性报告，生成后会显示问题和建议。"}</p>
        <div className="overview-list">
          {form.continuity_issues.length ? (
            form.continuity_issues.map((issue) => (
              <div className="overview-item" key={issue.id}>
                <strong>第 {issue.episode_number} 集 · {issue.severity}</strong>
                <span>{issue.issue}，建议：{issue.suggestion}</span>
              </div>
            ))
          ) : (
            <div className="hint-text">暂无连续性问题。</div>
          )}
        </div>
      </div>

      <div className="episode-card-grid">
        {form.episodes.map((episode, index) => (
          <article className="episode-card" key={episode.episode_number}>
            <div className="episode-card-head">
              <strong>第 {episode.episode_number} 集</strong>
              <input
                value={episode.title}
                onChange={(event) => updateEpisode(index, "title", event.target.value)}
                placeholder="标题"
              />
            </div>
            <label className="field-label">
              <span>本集内容</span>
              <textarea
                rows={4}
                value={episode.content}
                onChange={(event) => updateEpisode(index, "content", event.target.value)}
                placeholder="输入本集内容"
              />
            </label>
            <label className="field-label">
              <span>钩子</span>
              <textarea
                rows={3}
                value={episode.hook}
                onChange={(event) => updateEpisode(index, "hook", event.target.value)}
                placeholder="输入本集钩子"
              />
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}

function StepTwoSection({
  project,
  onSaved,
  setStatusMessage,
  onNavigateStep,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
  onNavigateStep: (stepId: string) => void;
}) {
  const [form, setForm] = useState<StepTwoData>(project.step_two);
  const [saving, setSaving] = useState(false);
  const [generatingMode, setGeneratingMode] = useState<string | null>(null);
  const characterProfilesRef = useRef<HTMLTextAreaElement | null>(null);
  const terminologyRef = useRef<HTMLTextAreaElement | null>(null);
  const guidanceRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceMaterialRef = useRef<HTMLTextAreaElement | null>(null);
  const referenceRef = useRef<HTMLTextAreaElement | null>(null);
  const novelRef = useRef<HTMLTextAreaElement | null>(null);
  const scriptRef = useRef<HTMLTextAreaElement | null>(null);
  const reviewRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedEpisode =
    project.step_one.episodes.find((episode) => episode.episode_number === form.selected_episode_number) ??
    project.step_one.episodes[0] ??
    null;
  const scriptVersions = useMemo<VersionRecord[]>(
    () =>
      form.version_records.map((version) => ({
        id: version.id,
        title: version.title,
        description: version.snapshot.slice(0, 80) || "空版本快照",
        created_at: version.created_at,
      })),
    [form.version_records]
  );

  useEffect(() => {
    setForm(project.step_two);
  }, [project.step_two]);

  async function handleImport(kind: "source" | "novel", event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatusMessage("正在导入文件...");
    try {
      assertImportableFile(file);
      const result = await importTextFile(file);
      const targetLabel = kind === "source" ? "素材导入文本框" : "小说正文";
      if (kind === "source") {
        setForm((current) => ({
          ...current,
          imported_source_name: result.filename,
          source_material: result.content,
        }));
      } else {
        setForm((current) => ({
          ...current,
          imported_novel_name: result.filename,
          novel_text: result.content,
        }));
      }
      setStatusMessage(`已导入文件：${result.filename}，内容已写入「${targetLabel}」，共 ${result.content.length} 个字符`);
      event.currentTarget.value = "";
      window.setTimeout(() => {
        const target = kind === "source" ? sourceMaterialRef.current : novelRef.current;
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus({ preventScroll: true });
      }, 50);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "导入失败");
    }
  }

  function appendModificationRecord(record: string, modifiedBy: string) {
    setForm((current) => ({
      ...current,
      last_modified_by: modifiedBy,
      modification_records: [...current.modification_records, record],
    }));
  }

  function focusGeneratedOutput(mode: string) {
    const outputRefMap: Record<string, RefObject<HTMLTextAreaElement | null>> = {
      roles: characterProfilesRef,
      terms: terminologyRef,
      guidance: guidanceRef,
      reference: referenceRef,
      novel: novelRef,
      script: scriptRef,
      check: reviewRef,
    };
    window.setTimeout(() => {
      const target = outputRefMap[mode]?.current;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }, 50);
  }

  function addRhythmNode() {
    const nextNode: ScriptRhythmNode = {
      id: `rhythm-${Date.now()}`,
      label: `节奏节点 ${form.rhythm_nodes.length + 1}`,
      description: selectedEpisode ? `围绕第 ${selectedEpisode.episode_number} 集的钩子或反转补充节奏点。` : "补充爆点、反转或情绪节点。",
      emotion_intensity: 70,
    };
    setForm((current) => ({
      ...current,
      rhythm_nodes: [...current.rhythm_nodes, nextNode],
    }));
    setStatusMessage("已新增节奏节点。");
  }

  async function formatScriptText(kind: "dialogue" | "narration" | "action") {
    if (generatingMode) return;
    if (!form.script_text.trim()) {
      setStatusMessage("请先生成或填写剧本文本，再进行 AI 标注。");
      return;
    }
    const labelMap = {
      dialogue: "对白格式化",
      narration: "旁白标记",
      action: "动作标记",
    };
    const targetMap = {
      dialogue: "对白",
      narration: "旁白",
      action: "动作",
    };
    setGeneratingMode(`markup-${kind}`);
    setStatusMessage(`AI 正在进行${labelMap[kind]}...`);
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S02_SCRIPT_MARKUP",
        [
          `标注目标：${targetMap[kind]}`,
          "标注规则：",
          "1. 只给语义上属于目标类型的句段补充对应标签。",
          "2. 不要把整段文本全部替换成同一种标签。",
          "3. 保留已有正确标签，修正明显错误标签。",
          "4. 不改写剧情事实、人物称谓、台词含义和段落顺序。",
          "待标注剧本文本：",
          form.script_text,
        ].join("\n"),
        { projectId: project.id, targetType: "script" }
      );
      const parsed = firstJsonObject(result.content);
      const markedScript = textValue(parsed.marked_script || parsed.script_text || parsed.marked_text, result.content);
      if (!markedScript.trim()) {
        setStatusMessage("AI 已返回，但没有可写入的标注文本，请调整剧本后重试。");
        return;
      }
      setForm((current) => ({
        ...current,
        script_text: markedScript,
        last_modified_by: "AI",
      }));
      appendModificationRecord(`AI 完成${labelMap[kind]}`, "AI");
      focusGeneratedOutput("script");
      setStatusMessage(textValue(parsed.markup_notes) || `AI 已完成${labelMap[kind]}，结果已写入剧本文本。`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : `AI ${labelMap[kind]}失败`);
    } finally {
      setGeneratingMode(null);
    }
  }

  function snapshotScriptVersion() {
    setForm((current) => ({
      ...current,
      version_records: [
        ...current.version_records,
        {
          id: `script-version-${Date.now()}`,
          title: `${current.version_status} · ${new Date().toLocaleTimeString("zh-CN")}`,
          snapshot: current.script_text,
          created_at: new Date().toLocaleString("zh-CN"),
        },
      ],
    }));
    setStatusMessage("已保存当前剧本版本快照。");
  }

  function restoreScriptVersion(versionId: string) {
    const version = form.version_records.find((item) => item.id === versionId);
    if (!version) return;
    setForm((current) => ({
      ...current,
      script_text: version.snapshot,
      last_modified_by: "人工",
    }));
    setStatusMessage(`已恢复版本：${version.title}`);
  }

  function exportScriptText() {
    if (!form.script_text.trim()) {
      setStatusMessage("剧本文本为空，暂无可导出内容。");
      return;
    }
    void copyTextToClipboard(form.script_text, "剧本文本已复制到剪贴板。", setStatusMessage);
  }

  async function applyRewrite() {
    if (generatingMode) return;
    const target = form.rewrite_tool.selected_target;
    const originText = target === "novel" ? form.novel_text : form.script_text;
    const selectedText = form.rewrite_tool.selection_text || originText;
    if (!selectedText.trim()) {
      setStatusMessage("请先填写需要改写的文本。");
      return;
    }
    setGeneratingMode("rewrite");
    setStatusMessage("AI 正在改写文本...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S02_REWRITE",
        [
          `改写模式：${form.rewrite_tool.mode}`,
          `改写目标：${target}`,
          `改写要求：${form.rewrite_tool.rewrite_prompt || "增强节奏、保留剧情事实"}`,
          "待改写文本：",
          selectedText,
        ].join("\n"),
        { projectId: project.id, targetType: target }
      );
      const parsed = firstJsonObject(result.content);
      const rewritten = textValue(parsed.rewritten_text) || result.content;
      const nextText =
        form.rewrite_tool.mode === "partial" && originText.includes(selectedText)
          ? originText.replace(selectedText, rewritten)
          : `${originText}\n\n【AI 改写结果】\n${rewritten}`.trim();
      if (target === "novel") {
        setForm((current) => ({ ...current, novel_text: nextText, last_modified_by: "AI" }));
      } else {
        setForm((current) => ({ ...current, script_text: nextText, last_modified_by: "AI" }));
      }
      appendModificationRecord(`AI 完成${form.rewrite_tool.mode === "partial" ? "局部" : "批量"}改写`, "AI");
      setStatusMessage(textValue(parsed.change_notes) || "AI 改写结果已写入当前目标文本");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 改写失败");
    } finally {
      setGeneratingMode(null);
    }
  }

  async function applyGeneration(
    mode: string,
    setter: (content: string) => void,
    successRecord: string,
    emptyMessage: string
  ) {
    if (generatingMode) return;
    setGeneratingMode(mode);
    setStatusMessage(`${successRecord}处理中...`);
    try {
      const chunks = buildStepTwoChunks(form);
      if (!chunks.length) {
        setStatusMessage(emptyMessage);
        return;
      }
      const partials: string[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        setStatusMessage(`AI 正在处理第 ${index + 1}/${chunks.length} 段...`);
        const result = await generateProjectTextTask(
          project.name,
          stepTwoTaskIds[mode] ?? "S02_SCRIPT",
          `${chunk.label}\n${chunk.content}`,
          { projectId: project.id, targetType: mode }
        );
        partials.push(result.content);
      }
      const output = formatGeneratedStepTwoOutput(mode, mergeChunkResults(partials));
      if (!output.trim()) {
        setStatusMessage("AI 已返回，但没有可写入的有效内容，请调整输入后重试。");
        return;
      }
      setter(output);
      appendModificationRecord(successRecord, "AI");
      focusGeneratedOutput(mode);
      setStatusMessage(`${successRecord}，结果已写入右侧对应输出框。`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 生成失败");
    } finally {
      setGeneratingMode(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatusMessage("正在保存步骤二数据...");
    try {
      const nextData = {
        ...form,
        project_name: form.project_name || project.name,
        current_episode_context:
          selectedEpisode ? `第 ${selectedEpisode.episode_number} 集：${selectedEpisode.title}；${selectedEpisode.content}；钩子：${selectedEpisode.hook}` : "",
        last_modified_by: form.last_modified_by || "人工",
      };
      const saved = await saveStepTwo(project.id, nextData);
      onSaved(saved, "步骤二数据已保存，刷新后可回显");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const canGoStepThree = form.script_text.trim().length > 0;

  async function handleGoStepThree() {
    if (!canGoStepThree) {
      setStatusMessage("剧本文本为空，暂时不能进入步骤三");
      return;
    }
    setSaving(true);
    setStatusMessage("正在保存步骤二并进入步骤三...");
    try {
      const nextData = {
        ...form,
        project_name: form.project_name || project.name,
        current_episode_context:
          selectedEpisode ? `第 ${selectedEpisode.episode_number} 集：${selectedEpisode.title}；${selectedEpisode.content}；钩子：${selectedEpisode.hook}` : "",
        last_modified_by: form.last_modified_by || "人工",
      };
      const saved = await saveStepTwo(project.id, nextData);
      onSaved(saved, "步骤二已保存，正在进入步骤三。");
      onNavigateStep("asset-setting");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "进入步骤三失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor-section" id="script-creation">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤二</span>
          <h2>剧本创作</h2>
          <p>已接入素材导入、AI 生成、改写工具、剧本保存回显，以及进入步骤三前的前置校验。</p>
        </div>
        <div className="chip-row">
          <span className="ghost-chip">项目状态：{form.project_status}</span>
          <span className="ghost-chip">正文准备度：{form.body_readiness}%</span>
          <span className="ghost-chip">剧本状态：{form.script_status}</span>
          <span className="ghost-chip">最近修改方：{form.last_modified_by}</span>
        </div>
      </div>

      <div className="script-context-card panel-card">
        <div className="field-row compact-row">
          <label className="field-label">
            <span>当前集数</span>
            <select
              value={form.selected_episode_number}
              onChange={(event) => {
                const episodeNumber = Number(event.target.value);
                const episode = project.step_one.episodes.find((item) => item.episode_number === episodeNumber);
                setForm({
                  ...form,
                  selected_episode_number: episodeNumber,
                  current_episode_context: episode
                    ? `第 ${episode.episode_number} 集：${episode.title}；${episode.content}；钩子：${episode.hook}`
                    : "",
                });
              }}
            >
              {project.step_one.episodes.map((episode) => (
                <option value={episode.episode_number} key={episode.episode_number}>
                  第 {episode.episode_number} 集 {episode.title}
                </option>
              ))}
            </select>
          </label>
          <div className="episode-context-preview">
            <strong>{selectedEpisode ? selectedEpisode.title : "暂无单集大纲"}</strong>
            <span>{selectedEpisode ? selectedEpisode.content || "本集内容待填写" : "请先在步骤一补充单集大纲"}</span>
            <em>{selectedEpisode?.hook ? `钩子：${selectedEpisode.hook}` : "暂无钩子"}</em>
          </div>
        </div>
      </div>

      <div className="step-two-layout">
        <div className="panel-card">
          <h3>模块 A：创作工具区</h3>
          <label className="field-label">
            <span>项目名称</span>
            <input value={form.project_name} onChange={(event) => setForm({ ...form, project_name: event.target.value })} />
          </label>

          <label className="field-label">
            <span>素材导入文本框</span>
            <textarea
              ref={sourceMaterialRef}
              rows={5}
              value={form.source_material}
              onChange={(event) => setForm({ ...form, source_material: event.target.value })}
              placeholder="输入或导入素材"
            />
          </label>

          <div className="action-row">
            <ImportFileButton label="导入素材文件" filename={form.imported_source_name} onChange={(event) => handleImport("source", event)} />
            {form.imported_source_name ? (
              <span className="inline-feedback">已写入素材导入文本框：{form.source_material.length} 个字符</span>
            ) : null}
            <AIActionButton
              isGenerating={generatingMode === "roles"}
              disabled={Boolean(generatingMode)}
              loadingLabel="角色抽取中"
              onClick={() =>
                void applyGeneration(
                  "roles",
                  (content) => setForm((current) => ({ ...current, character_profiles: content })),
                  "AI 完成角色抽取",
                  "请先导入素材或正文内容"
                )
              }
            >
              角色抽取
            </AIActionButton>
            <AIActionButton
              isGenerating={generatingMode === "terms"}
              disabled={Boolean(generatingMode)}
              loadingLabel="术语生成中"
              onClick={() =>
                void applyGeneration(
                  "terms",
                  (content) => setForm((current) => ({ ...current, terminology_library: content })),
                  "AI 生成术语库",
                  "请先导入素材或正文内容"
                )
              }
            >
              术语库生成
            </AIActionButton>
            <AIActionButton
              isGenerating={generatingMode === "guidance"}
              disabled={Boolean(generatingMode)}
              loadingLabel="指导生成中"
              onClick={() =>
                void applyGeneration(
                  "guidance",
                  (content) => setForm((current) => ({ ...current, writing_guidance: content })),
                  "AI 生成写作指导",
                  "请先导入素材或正文内容"
                )
              }
            >
              写作指导生成
            </AIActionButton>
          </div>

          <label className="field-label">
            <span>参考文本</span>
            <textarea
              ref={referenceRef}
              rows={4}
              value={form.reference_text}
              onChange={(event) => setForm({ ...form, reference_text: event.target.value })}
              placeholder="参考文本输入 / 编辑"
            />
          </label>
          <div className="action-row">
            <AIActionButton
              isGenerating={generatingMode === "reference"}
              disabled={Boolean(generatingMode)}
              loadingLabel="参考生成中"
              onClick={() =>
                void applyGeneration(
                  "reference",
                  (content) => setForm((current) => ({ ...current, reference_text: content })),
                  "AI 生成参考文本",
                  "请先导入素材或正文内容"
                )
              }
            >
              AI 生成参考
            </AIActionButton>
          </div>

          <label className="field-label">
            <span>小说正文</span>
            <textarea
              ref={novelRef}
              rows={8}
              value={form.novel_text}
              onChange={(event) => setForm({ ...form, novel_text: event.target.value })}
              placeholder="小说正文输入 / 编辑"
            />
          </label>
          <div className="action-row">
            <ImportFileButton label="导入正文文件" filename={form.imported_novel_name} onChange={(event) => handleImport("novel", event)} />
            {form.imported_novel_name ? (
              <span className="inline-feedback">已写入小说正文：{form.novel_text.length} 个字符</span>
            ) : null}
            <AIActionButton
              isGenerating={generatingMode === "novel"}
              disabled={Boolean(generatingMode)}
              loadingLabel="正文生成中"
              onClick={() =>
                void applyGeneration(
                  "novel",
                  (content) => setForm((current) => ({ ...current, novel_text: content })),
                  "AI 生成正文",
                  "请先导入素材或正文内容"
                )
              }
            >
              AI 生成正文
            </AIActionButton>
          </div>

          <div className="rewrite-card">
            <div className="rewrite-head">
              <h4>改写工具</h4>
              <div className="chip-row">
                <button
                  className={`mode-switch ${form.rewrite_tool.mode === "partial" ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, rewrite_tool: { ...form.rewrite_tool, mode: "partial" } });
                    setStatusMessage("改写模式已切换为局部改写。");
                  }}
                >
                  局部改写
                </button>
                <button
                  className={`mode-switch ${form.rewrite_tool.mode === "batch" ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, rewrite_tool: { ...form.rewrite_tool, mode: "batch" } });
                    setStatusMessage("改写模式已切换为批量改写。");
                  }}
                >
                  批量改写
                </button>
              </div>
            </div>
            <label className="field-label">
              <span>自动读取当前选中文本</span>
              <textarea
                rows={3}
                value={form.rewrite_tool.selection_text}
                onChange={(event) =>
                  setForm({
                    ...form,
                    rewrite_tool: { ...form.rewrite_tool, selection_text: event.target.value },
                  })
                }
                placeholder="粘贴当前选中的正文或剧本文本"
              />
            </label>
            <div className="field-row compact-row">
              <label className="field-label">
                <span>批量改写目标</span>
                <select
                  value={form.rewrite_tool.selected_target}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      rewrite_tool: {
                        ...form.rewrite_tool,
                        selected_target: event.target.value as "novel" | "script",
                      },
                    })
                  }
                >
                  <option value="novel">小说正文</option>
                  <option value="script">剧本文本</option>
                </select>
              </label>
              <label className="field-label">
                <span>改写要求</span>
                <input
                  value={form.rewrite_tool.rewrite_prompt}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      rewrite_tool: { ...form.rewrite_tool, rewrite_prompt: event.target.value },
                    })
                  }
                  placeholder="例如：增强节奏感、压缩对白"
                />
              </label>
            </div>
            <button
              className="ghost-button inline-button strong"
              type="button"
              onClick={() => void applyRewrite()}
              disabled={Boolean(generatingMode)}
            >
              {generatingMode === "rewrite" ? "AI 改写中..." : "应用改写"}
            </button>
          </div>
        </div>

        <div className="panel-card">
          <h3>模块 B：剧本生产区</h3>
          <div className="field-row compact-row">
            <label className="field-label">
              <span>版本状态</span>
              <select value={form.version_status} onChange={(event) => setForm({ ...form, version_status: event.target.value })}>
                <option value="v1 草稿">v1 草稿</option>
                <option value="v2 优化">v2 优化</option>
                <option value="待定稿">待定稿</option>
              </select>
            </label>
            <label className="field-label">
              <span>最近修改方</span>
              <select value={form.last_modified_by} onChange={(event) => setForm({ ...form, last_modified_by: event.target.value })}>
                <option value="人工">人工</option>
                <option value="AI">AI</option>
              </select>
            </label>
          </div>

          <label className="field-label">
            <span>角色画像</span>
            <textarea
              ref={characterProfilesRef}
              rows={4}
              value={form.character_profiles}
              onChange={(event) => setForm({ ...form, character_profiles: event.target.value })}
              placeholder="角色画像编辑 / 回显"
            />
          </label>
          <label className="field-label">
            <span>术语库</span>
            <textarea
              ref={terminologyRef}
              rows={4}
              value={form.terminology_library}
              onChange={(event) => setForm({ ...form, terminology_library: event.target.value })}
              placeholder="术语库编辑 / 回显"
            />
          </label>
          <label className="field-label">
            <span>写作指导</span>
            <textarea
              ref={guidanceRef}
              rows={4}
              value={form.writing_guidance}
              onChange={(event) => setForm({ ...form, writing_guidance: event.target.value })}
              placeholder="写作指导编辑 / 回显"
            />
          </label>

          <div className="action-row">
            <AIActionButton
              className="primary-pill inline-pill"
              isGenerating={generatingMode === "script"}
              disabled={Boolean(generatingMode)}
              loadingLabel="剧本生成中"
              onClick={() =>
                void applyGeneration(
                  "script",
                  (content) => setForm((current) => ({ ...current, script_text: content })),
                  "AI 生成剧本",
                  "请先准备素材、正文或参考文本"
                )
              }
            >
              生成剧本
            </AIActionButton>
            <AIActionButton
              isGenerating={generatingMode === "markup-dialogue"}
              disabled={Boolean(generatingMode)}
              loadingLabel="对白标注中"
              onClick={() => void formatScriptText("dialogue")}
            >
              对白格式化
            </AIActionButton>
            <AIActionButton
              isGenerating={generatingMode === "markup-narration"}
              disabled={Boolean(generatingMode)}
              loadingLabel="旁白标注中"
              onClick={() => void formatScriptText("narration")}
            >
              旁白标记
            </AIActionButton>
            <AIActionButton
              isGenerating={generatingMode === "markup-action"}
              disabled={Boolean(generatingMode)}
              loadingLabel="动作标注中"
              onClick={() => void formatScriptText("action")}
            >
              动作标记
            </AIActionButton>
            <AIActionButton
              isGenerating={generatingMode === "check"}
              disabled={Boolean(generatingMode)}
              loadingLabel="检查生成中"
              onClick={() =>
                void applyGeneration(
                  "check",
                  (content) => setForm((current) => ({ ...current, review_notes: content })),
                  "AI 完成一致性检查",
                  "请先生成剧本后再检查"
                )
              }
            >
              一致性检查
            </AIActionButton>
          </div>

          <label className="field-label">
            <span>剧本文本</span>
            <textarea
              ref={scriptRef}
              rows={10}
              value={form.script_text}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  script_text: event.target.value,
                  last_modified_by: "人工",
                }));
              }}
              placeholder="剧本文本编辑"
            />
          </label>
          <div className="script-rhythm-panel">
            <div className="rewrite-head">
              <h4>节奏节点</h4>
              <button className="ghost-button inline-button" type="button" onClick={addRhythmNode}>
                新增节点
              </button>
            </div>
            <div className="overview-list">
              {form.rhythm_nodes.length ? (
                form.rhythm_nodes.map((node) => (
                  <div className="overview-item" key={node.id}>
                    <strong>{node.label} · 情绪 {node.emotion_intensity}</strong>
                    <span>{node.description}</span>
                  </div>
                ))
              ) : (
                <div className="hint-text">暂无节奏节点，可新增爆点、反转、钩子或情绪强度。</div>
              )}
            </div>
          </div>
          <label className="field-label">
            <span>整集审核意见</span>
            <textarea
              ref={reviewRef}
              rows={5}
              value={form.review_notes}
              onChange={(event) => setForm({ ...form, review_notes: event.target.value })}
              placeholder="审核意见编辑"
            />
          </label>

          <div className="action-row">
            <button
              className="ghost-button inline-button"
              type="button"
              onClick={() => {
                setForm(defaultStepTwoData(project.name));
                setStatusMessage("步骤二表单已清空。");
              }}
            >
              清空本步骤
            </button>
            <button className="ghost-button inline-button strong" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存本步骤"}
            </button>
            <button
              className="ghost-button inline-button"
              type="button"
              onClick={exportScriptText}
            >
              导出剧本
            </button>
            <button className="ghost-button inline-button" type="button" onClick={snapshotScriptVersion}>
              保存版本
            </button>
            <button
              className={`ghost-button inline-button ${canGoStepThree ? "strong" : "disabled"}`}
              type="button"
              onClick={() => void handleGoStepThree()}
              disabled={saving}
            >
              进入步骤三
            </button>
          </div>

          <VersionHistoryPanel
            versions={scriptVersions}
            onRestore={(version) => restoreScriptVersion(version.id)}
          />

          <div className="modification-log">
            <h4>修改记录</h4>
            {form.modification_records.length ? (
              <ul>
                {form.modification_records.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>暂无修改记录</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepThreeSection({
  project,
  onSaved,
  setStatusMessage,
}: {
  project: ProjectRecord;
  onSaved?: (project: ProjectRecord, message: string) => void;
  setStatusMessage?: (message: string) => void;
}) {
  const [assetLibrary, setAssetLibrary] = useState<StepThreeData>(project.step_three);
  const [saving, setSaving] = useState(false);
  const [aiAction, setAiAction] = useState<string | null>(null);
  const [assetPage, setAssetPage] = useState<"characters" | "scenes" | "props">("characters");
  const [assetFeedback, setAssetFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    setAssetLibrary(project.step_three);
  }, [project.step_three]);

  function setCardFeedback(cardId: string, message: string) {
    setAssetFeedback((current) => ({ ...current, [cardId]: message }));
  }

  async function extractAssetCandidates() {
    if (aiAction) return;
    const now = Date.now();
    const source = [
      "角色画像：",
      project.step_two.character_profiles || "暂无",
      "术语库：",
      project.step_two.terminology_library || "暂无",
      "写作指导：",
      project.step_two.writing_guidance || "暂无",
      "剧本/正文/素材：",
      project.step_two.script_text || project.step_two.novel_text || project.step_two.source_material || "暂无",
      "故事结构补充：",
      project.step_one.season_outline || project.step_one.core_story_idea || "暂无",
    ].join("\n");
    setAiAction("extract-assets");
    setStatusMessage?.("AI 正在从角色、术语和剧本中提取资产卡片...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S03_ASSET_EXTRACT",
        buildCharacterCardPrompt(project.name, source),
        { projectId: project.id, targetType: "assets" }
      );
      const parsed = firstJsonObject(result.content);
      const typedRecords = (value: unknown, category: "character" | "scene" | "prop") =>
        listValue(value).flatMap((item): Record<string, unknown>[] =>
          item && typeof item === "object" ? [{ ...(item as Record<string, unknown>), category }] : []
        );
      const records = [
        ...listValue(parsed.candidates || parsed.assets || parsed.items),
        ...typedRecords(parsed.characters, "character"),
        ...typedRecords(parsed.scenes, "scene"),
        ...typedRecords(parsed.props, "prop"),
      ].filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");

      const characters: AssetCharacter[] = [];
      const scenes: AssetScene[] = [];
      const props: AssetProp[] = [];

      records.forEach((record, index) => {
        const categoryText = textValue(record.category || record.asset_type || record.type).toLowerCase();
        const description = textValue(record.description || record.source_evidence || record.summary || record.visual_design);
        const isCharacter = categoryText.includes("character") || categoryText.includes("role") || categoryText.includes("角色") || categoryText.includes("人物");
        const isScene = categoryText.includes("scene") || categoryText.includes("location") || categoryText.includes("场景") || categoryText.includes("地点");
        const isProp = categoryText.includes("prop") || categoryText.includes("item") || categoryText.includes("道具") || categoryText.includes("物件");

        if (isCharacter) {
          const normalized = normalizeCharacterRecord(record, `char-ai-${now}-${index}`, textValue(record.name || record.character_name, `角色 ${characters.length + 1}`));
          if (!normalized.issues.length) characters.push(normalized.card);
        } else if (isScene) {
          scenes.push({
            id: `scene-ai-${now}-${index}`,
            name: textValue(record.name || record.scene_name || record.location, `场景 ${scenes.length + 1}`),
            location: textValue(record.location || record.spatial_layout || record.name),
            atmosphere: textValue(record.atmosphere || record.lighting || description),
            episodes: textValue(record.episodes || record.first_seen, String(project.step_two.selected_episode_number || 1)),
          });
        } else if (isProp) {
          props.push({
            id: `prop-ai-${now}-${index}`,
            name: textValue(record.name || record.prop_name, `道具 ${props.length + 1}`),
            type: textValue(record.prop_type || record.item_type || record.category, "剧情道具"),
            story_function: textValue(record.story_function || description),
          });
        }
      });

      const total = characters.length + scenes.length + props.length;
      if (!total) {
        setStatusMessage?.("AI 已返回，但字段不达标，未写入资产卡。请重新生成或先补充上游素材。");
        return;
      }
      setAssetLibrary((current) => ({
        ...current,
        candidates: [],
        characters: [...current.characters, ...characters],
        scenes: [...current.scenes, ...scenes],
        props: [...current.props, ...props],
      }));
      if (characters.length) setAssetPage("characters");
      else if (scenes.length) setAssetPage("scenes");
      else setAssetPage("props");
      setStatusMessage?.(`AI 已生成 ${total} 张合格资产卡：角色 ${characters.length}，场景 ${scenes.length}，道具 ${props.length}。不合格字段已拦截。`);
    } catch (err) {
      setStatusMessage?.(err instanceof Error ? err.message : "AI 资产提取失败");
    } finally {
      setAiAction(null);
    }
  }

  function addCharacter() {
    const id = `char-${Date.now()}`;
    setAssetLibrary((current) => ({
      ...current,
      characters: [
        ...current.characters,
        {
          id,
          name: `角色 ${current.characters.length + 1}`,
          role: "待设定",
          age: "",
          personality: "",
          appearance: "",
          motivation: "",
          outfit: "",
          image_url: "",
          image_prompt: "",
        },
      ],
    }));
    setAssetPage("characters");
    setCardFeedback(id, "新角色卡已创建，可以输入少量描述后点 AI 补全。");
    setStatusMessage?.("已新增角色卡，保存资产后生效。");
  }

  function removeCharacter(characterId: string) {
    const target = assetLibrary.characters.find((item) => item.id === characterId);
    const confirmed = window.confirm(`确认删除角色“${target?.name || "未命名角色"}”吗？删除后会影响后续分镜和提示词引用。`);
    if (!confirmed) return;
    setAssetLibrary((current) => ({
      ...current,
      characters: current.characters.filter((item) => item.id !== characterId),
    }));
    setStatusMessage?.("角色已删除，保存资产后生效");
  }

  function updateCharacter(characterId: string, patch: Partial<AssetCharacter>) {
    setAssetLibrary((current) => ({
      ...current,
      characters: current.characters.map((item) => (item.id === characterId ? { ...item, ...patch } : item)),
    }));
  }

  function addScene() {
    const id = `scene-${Date.now()}`;
    setAssetLibrary((current) => ({
      ...current,
      scenes: [
        ...current.scenes,
        {
          id,
          name: `场景 ${current.scenes.length + 1}`,
          location: "",
          atmosphere: "",
          episodes: String(project.step_two.selected_episode_number || 1),
          image_url: "",
          image_prompt: "",
        },
      ],
    }));
    setAssetPage("scenes");
    setCardFeedback(id, "新场景卡已创建，可以输入地点或氛围后点 AI 补全。");
    setStatusMessage?.("已新增场景卡，保存资产后生效。");
  }

  function updateScene(sceneId: string, patch: Partial<AssetScene>) {
    setAssetLibrary((current) => ({
      ...current,
      scenes: current.scenes.map((item) => (item.id === sceneId ? { ...item, ...patch } : item)),
    }));
  }

  function removeScene(sceneId: string) {
    const target = assetLibrary.scenes.find((item) => item.id === sceneId);
    const confirmed = window.confirm(`确认删除场景“${target?.name || "未命名场景"}”吗？删除后会影响后续分镜和提示词引用。`);
    if (!confirmed) return;
    setAssetLibrary((current) => ({
      ...current,
      scenes: current.scenes.filter((item) => item.id !== sceneId),
    }));
    setStatusMessage?.("场景已删除，保存资产后生效。");
  }

  function addProp() {
    const id = `prop-${Date.now()}`;
    setAssetLibrary((current) => ({
      ...current,
      props: [
        ...current.props,
        {
          id,
          name: `道具 ${current.props.length + 1}`,
          type: "剧情道具",
          story_function: "",
          image_url: "",
          image_prompt: "",
        },
      ],
    }));
    setAssetPage("props");
    setCardFeedback(id, "新道具卡已创建，可以输入道具名或作用后点 AI 补全。");
    setStatusMessage?.("已新增道具卡，保存资产后生效。");
  }

  function updateProp(propId: string, patch: Partial<AssetProp>) {
    setAssetLibrary((current) => ({
      ...current,
      props: current.props.map((item) => (item.id === propId ? { ...item, ...patch } : item)),
    }));
  }

  function removeProp(propId: string) {
    const target = assetLibrary.props.find((item) => item.id === propId);
    const confirmed = window.confirm(`确认删除道具“${target?.name || "未命名道具"}”吗？删除后会影响后续分镜和提示词引用。`);
    if (!confirmed) return;
    setAssetLibrary((current) => ({
      ...current,
      props: current.props.filter((item) => item.id !== propId),
    }));
    setStatusMessage?.("道具已删除，保存资产后生效。");
  }

  function getAssetSourceText() {
    return [
      "故事结构：",
      project.step_one.season_outline || project.step_one.core_story_idea,
      "角色画像：",
      project.step_two.character_profiles,
      "术语库：",
      project.step_two.terminology_library,
      "写作指导：",
      project.step_two.writing_guidance,
      "角色关系：",
      project.step_one.relationship_notes,
      "剧本/正文/素材：",
      limitTextForAi(project.step_two.script_text || project.step_two.novel_text || project.step_two.source_material, 20000),
      "现有资产库：",
      JSON.stringify(summarizeAssetLibraryForAi(assetLibrary), null, 2),
    ].join("\n");
  }

  async function generateAssetCards(kind: "character" | "scene" | "prop") {
    if (aiAction) return;
    const taskMap = {
      character: "S03_CHARACTER_CARDS",
      scene: "S03_SCENE_CARDS",
      prop: "S03_PROP_CARDS",
    };
    const labelMap = {
      character: "角色卡",
      scene: "场景卡",
      prop: "道具卡",
    };
    setAiAction(`generate-${kind}`);
    setStatusMessage?.(`AI 正在生成${labelMap[kind]}...`);
    try {
      const sourceText = getAssetSourceText();
      const result = await generateProjectTextTask(
        project.name,
        taskMap[kind],
        kind === "character" ? buildCharacterCardPrompt(project.name, sourceText) : sourceText,
        { projectId: project.id, targetType: kind }
      );
      const parsed = firstJsonObject(result.content);
      const records = listValue(
        kind === "character"
          ? parsed.characters || parsed.roles || parsed.character_cards || parsed.character_cards_demo || parsed.items
          : kind === "scene"
            ? parsed.scenes || parsed.scene_cards || parsed.scene_cards_demo || parsed.items
            : parsed.props || parsed.prop_cards || parsed.prop_cards_demo || parsed.items
      );
      if (!records.length) {
        setStatusMessage?.(`AI 已返回，但没有可写入的${labelMap[kind]}。`);
        return;
      }
      setAssetLibrary((current) => {
        if (kind === "character") {
          const characters = records.flatMap((item, index): AssetCharacter[] => {
            if (!item || typeof item !== "object") return [];
            const record = item as Record<string, unknown>;
            const normalized = normalizeCharacterRecord(record, `char-ai-${Date.now()}-${index}`, `角色 ${current.characters.length + index + 1}`);
            return normalized.issues.length ? [] : [normalized.card];
          });
          if (!characters.length) return current;
          return { ...current, characters: [...current.characters, ...characters] };
        }
        if (kind === "scene") {
          const scenes = records.flatMap((item, index): AssetScene[] => {
            if (!item || typeof item !== "object") return [];
            const record = item as Record<string, unknown>;
            return [{
              id: `scene-ai-${Date.now()}-${index}`,
              name: textValue(record.name || record.scene_name, `场景 ${current.scenes.length + index + 1}`),
              location: textValue(record.location || record.spatial_layout),
              atmosphere: textValue(record.atmosphere || record.lighting || record.description),
              episodes: textValue(record.episodes || record.first_seen, String(project.step_two.selected_episode_number || 1)),
            }];
          });
          return { ...current, scenes: [...current.scenes, ...scenes] };
        }
        const props = records.flatMap((item, index): AssetProp[] => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          return [{
            id: `prop-ai-${Date.now()}-${index}`,
            name: textValue(record.name || record.prop_name, `道具 ${current.props.length + index + 1}`),
            type: textValue(record.type || record.category, "剧情道具"),
            story_function: textValue(record.story_function || record.description || record.visual_design),
          }];
        });
        return { ...current, props: [...current.props, ...props] };
      });
      setStatusMessage?.(`AI 已生成并写入合格${labelMap[kind]}；字段缺失、串位或重复的结果已被拦截。`);
    } catch (err) {
      setStatusMessage?.(err instanceof Error ? err.message : `AI ${labelMap[kind]}生成失败`);
    } finally {
      setAiAction(null);
    }
  }

  async function completeAssetCard(kind: "character" | "scene" | "prop", id: string) {
    if (aiAction) return;
    const taskMap = {
      character: "S03_CHARACTER_CARDS",
      scene: "S03_SCENE_CARDS",
      prop: "S03_PROP_CARDS",
    };
    const labelMap = {
      character: "角色卡",
      scene: "场景卡",
      prop: "道具卡",
    };
    const currentAsset =
      kind === "character"
        ? assetLibrary.characters.find((item) => item.id === id)
        : kind === "scene"
          ? assetLibrary.scenes.find((item) => item.id === id)
          : assetLibrary.props.find((item) => item.id === id);
    if (!currentAsset) return;
    setAiAction(`complete-${kind}:${id}`);
    setCardFeedback(id, "AI 正在补全这张卡片...");
    setStatusMessage?.(`AI 正在补全${labelMap[kind]}...`);
    try {
      const result = await generateProjectTextTask(
        project.name,
        taskMap[kind],
        kind === "character"
          ? buildCharacterCardPrompt(project.name, getAssetSourceText(), currentAsset as AssetCharacter)
          : [
              "请只补全这个用户手动新建或编辑过的单个资产卡，不要批量生成新资产。",
              "已有资产卡：",
              JSON.stringify(summarizeAssetCardForAi(kind, currentAsset), null, 2),
              "上游来源：",
              getAssetSourceText(),
            ].join("\n"),
        { projectId: project.id, targetType: kind, targetId: id }
      );
      const parsed = firstJsonObject(result.content);
      const records = listValue(
        kind === "character"
          ? parsed.characters || parsed.roles || parsed.character_cards || parsed.character_cards_demo || parsed.items
          : kind === "scene"
            ? parsed.scenes || parsed.scene_cards || parsed.scene_cards_demo || parsed.items
            : parsed.props || parsed.prop_cards || parsed.prop_cards_demo || parsed.items
      );
      const record = (records[0] && typeof records[0] === "object" ? records[0] : parsed) as Record<string, unknown>;
      if (kind === "character") {
        const character = currentAsset as AssetCharacter;
        const candidate = {
          name: textValue(record.name || record.character_name, character.name),
          role: textValue(record.role || record.position, character.role),
          age: textValue(record.age, character.age),
          personality: textValue(record.personality, character.personality),
          appearance: textValue(record.appearance || record.visual_design || record.visual_cues, character.appearance),
          motivation: textValue(record.motivation || record.story_function, character.motivation),
          outfit: textValue(record.outfit || record.costume, character.outfit),
        };
        const nextCard: AssetCharacter = { ...character, ...candidate };
        const issues = validateCharacterCard(nextCard);
        if (issues.length) {
          setCardFeedback(id, `AI 返回仍不达标，未覆盖字段：${issues.slice(0, 4).join("；")}`);
          setStatusMessage?.(`AI 补全结果不达标，已拦截：${issues.slice(0, 4).join("；")}`);
          return;
        }
        updateCharacter(id, candidate);
      } else if (kind === "scene") {
        const scene = currentAsset as AssetScene;
        updateScene(id, {
          name: textValue(record.name || record.scene_name, scene.name),
          location: textValue(record.location || record.spatial_layout, scene.location),
          atmosphere: textValue(record.atmosphere || record.lighting || record.description, scene.atmosphere),
          episodes: textValue(record.episodes || record.first_seen, scene.episodes),
        });
      } else {
        const prop = currentAsset as AssetProp;
        updateProp(id, {
          name: textValue(record.name || record.prop_name, prop.name),
          type: textValue(record.type || record.category, prop.type),
          story_function: textValue(record.story_function || record.description || record.visual_design, prop.story_function),
        });
      }
      setCardFeedback(id, `AI 已补全${labelMap[kind]}，请检查字段后保存。`);
      setStatusMessage?.(`AI 已补全${labelMap[kind]}，请检查后保存资产。`);
    } catch (err) {
      setCardFeedback(id, err instanceof Error ? err.message : `AI ${labelMap[kind]}补全失败`);
      setStatusMessage?.(err instanceof Error ? err.message : `AI ${labelMap[kind]}补全失败`);
    } finally {
      setAiAction(null);
    }
  }

  async function generateAssetImage(kind: "character" | "scene" | "prop", id: string) {
    if (aiAction) return;
    const currentAsset =
      kind === "character"
        ? assetLibrary.characters.find((item) => item.id === id)
        : kind === "scene"
          ? assetLibrary.scenes.find((item) => item.id === id)
          : assetLibrary.props.find((item) => item.id === id);
    if (!currentAsset) return;
    const name = "name" in currentAsset ? currentAsset.name : "未命名资产";
    setAiAction(`image-${kind}:${id}`);
    setCardFeedback(id, `正在生成${kind === "scene" ? "场景图" : "三视图"}...`);
    setStatusMessage?.(`正在为「${name || "未命名资产"}」生成资产图...`);
    try {
      const prompt =
        kind === "character"
          ? [
              "生成角色设定三视图，正面、侧面、背面并排，干净浅色背景，统一服装和发型，适合后续漫画短剧资产一致性使用。",
              `角色名：${(currentAsset as AssetCharacter).name}`,
              `定位：${(currentAsset as AssetCharacter).role}`,
              `年龄：${(currentAsset as AssetCharacter).age}`,
              `性格：${(currentAsset as AssetCharacter).personality}`,
              `外貌：${(currentAsset as AssetCharacter).appearance}`,
              `服装：${(currentAsset as AssetCharacter).outfit}`,
              `动机：${(currentAsset as AssetCharacter).motivation}`,
              `风格约束：${assetLibrary.style_board}`,
              `一致性规则：${assetLibrary.consistency_rules}`,
            ].join("\n")
          : kind === "prop"
            ? [
                "生成道具设定三视图，正面、侧面、背面并排，干净浅色背景，细节清晰，适合后续漫画短剧资产一致性使用。",
                `道具名：${(currentAsset as AssetProp).name}`,
                `类型：${(currentAsset as AssetProp).type}`,
                `剧情作用：${(currentAsset as AssetProp).story_function}`,
                `风格约束：${assetLibrary.style_board}`,
                `一致性规则：${assetLibrary.consistency_rules}`,
              ].join("\n")
            : [
                "生成完整场景概念图，横版构图，空间结构清晰，包含主要视觉锚点、光影氛围和可复用背景资产，适合漫画短剧分镜使用。",
                `场景名：${(currentAsset as AssetScene).name}`,
                `地点：${(currentAsset as AssetScene).location}`,
                `氛围：${(currentAsset as AssetScene).atmosphere}`,
                `出现集数：${(currentAsset as AssetScene).episodes}`,
                `风格约束：${assetLibrary.style_board}`,
                `一致性规则：${assetLibrary.consistency_rules}`,
              ].join("\n");
      const result = await generateImageCandidate({
        prompt,
        shot_id: `${kind}-${id}`,
        shot_label: name || (kind === "character" ? "角色资产" : kind === "scene" ? "场景资产" : "道具资产"),
      });
      if (kind === "character") {
        updateCharacter(id, { image_url: result.url, image_prompt: result.prompt });
      } else if (kind === "scene") {
        updateScene(id, { image_url: result.url, image_prompt: result.prompt });
      } else {
        updateProp(id, { image_url: result.url, image_prompt: result.prompt });
      }
      setCardFeedback(id, `${kind === "scene" ? "场景图" : "三视图"}已生成，请检查后保存资产。`);
      setStatusMessage?.(`已生成「${name || "资产"}」图片，请检查后保存资产。`);
    } catch (err) {
      setCardFeedback(id, err instanceof Error ? err.message : "资产图片生成失败");
      setStatusMessage?.(err instanceof Error ? err.message : "资产图片生成失败");
    } finally {
      setAiAction(null);
    }
  }

  async function generateStyleSupport(kind: "style" | "rules") {
    if (aiAction) return;
    const taskId = kind === "style" ? "S03_STYLE_BOARD" : "S03_CONSISTENCY_RULES";
    const label = kind === "style" ? "风格板" : "一致性规则";
    setAiAction(`generate-${kind}`);
    setStatusMessage?.(`AI 正在生成${label}...`);
    try {
      const result = await generateProjectTextTask(
        project.name,
        taskId,
        getAssetSourceText(),
        { projectId: project.id, targetType: kind }
      );
      const parsed = firstJsonObject(result.content);
      const content =
        kind === "style"
          ? [
              textValue(parsed.art_style),
              textValue(parsed.color_palette),
              textValue(parsed.lighting_rules),
              textValue(parsed.camera_texture),
              textValue(parsed.prompt_style_block),
            ].filter(Boolean).join("\n")
          : textValue(parsed.consistency_rules || parsed.rules || parsed.prompt_text, result.content);
      if (!content.trim()) {
        setStatusMessage?.(`AI 已返回，但没有可写入的${label}内容。`);
        return;
      }
      setAssetLibrary((current) => ({
        ...current,
        ...(kind === "style" ? { style_board: content } : { consistency_rules: content }),
      }));
      setStatusMessage?.(`AI 已生成${label}，请检查后保存资产。`);
    } catch (err) {
      setStatusMessage?.(err instanceof Error ? err.message : `AI ${label}生成失败`);
    } finally {
      setAiAction(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveStepThree(project.id, assetLibrary);
      onSaved?.(saved, "步骤三资产设定已保存");
      setStatusMessage?.("步骤三资产设定已保存");
    } finally {
      setSaving(false);
    }
  }

  const summaryCards = [
    { label: "角色", value: assetLibrary.characters.length, hint: "角色卡、外貌、动机" },
    { label: "场景", value: assetLibrary.scenes.length, hint: "地点、氛围、出现集数" },
    { label: "道具", value: assetLibrary.props.length, hint: "剧情作用、归属关系" },
  ];
  const activeAssetCount =
    assetPage === "characters"
      ? assetLibrary.characters.length
      : assetPage === "scenes"
        ? assetLibrary.scenes.length
        : assetLibrary.props.length;

  return (
    <section className="editor-section" id="asset-setting">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤三</span>
          <h2>资产设定</h2>
          <p>资产候选从步骤一故事结构、角色关系，以及步骤二剧本、正文或素材中提取；也可以手动新建并用 AI 补全角色、场景、道具和一致性规则。</p>
        </div>
        <div className="chip-row">
          <span className="ghost-chip">角色 {assetLibrary.characters.length}</span>
          <span className="ghost-chip">场景 {assetLibrary.scenes.length}</span>
          <span className="ghost-chip">道具 {assetLibrary.props.length}</span>
        </div>
      </div>

      <div className="asset-workbench">
        <div className="workbench-rail">
          <div className="panel-card asset-rail-card">
            <h3>资产分类</h3>
            <p className="asset-empty-copy">提取来源：步骤一「季纲/核心故事/人物关系」和步骤二「剧本文本/小说正文/素材」。</p>
            {summaryCards.map((card) => (
              <div className="asset-category-row" key={card.label}>
                <strong>{card.label}</strong>
                <span>{card.value} 项</span>
                <em>{card.hint}</em>
              </div>
            ))}
            <div className="action-row">
              <AIActionButton
                isGenerating={aiAction === "extract-assets"}
                disabled={Boolean(aiAction)}
                loadingLabel="资产提取中"
                onClick={() => void extractAssetCandidates()}
              >
                从角色/术语/剧本提取
              </AIActionButton>
              <button className="ghost-button inline-button strong" type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "保存中..." : "保存资产"}
              </button>
            </div>
          </div>
        </div>
        <div className="workbench-stage">
          <div className="panel-card">
            <div className="rewrite-head">
              <h3>资产卡片</h3>
              <div className="chip-row">
                <button className="ghost-button inline-button" type="button" onClick={addCharacter}>新增角色</button>
                <button className="ghost-button inline-button" type="button" onClick={addScene}>新增场景</button>
                <button className="ghost-button inline-button" type="button" onClick={addProp}>新增道具</button>
              </div>
            </div>
            <div className="asset-page-tabs" role="tablist" aria-label="资产类型页面">
              <button className={`mode-switch ${assetPage === "characters" ? "active" : ""}`} type="button" onClick={() => setAssetPage("characters")}>
                角色页 · {assetLibrary.characters.length}
              </button>
              <button className={`mode-switch ${assetPage === "scenes" ? "active" : ""}`} type="button" onClick={() => setAssetPage("scenes")}>
                场景页 · {assetLibrary.scenes.length}
              </button>
              <button className={`mode-switch ${assetPage === "props" ? "active" : ""}`} type="button" onClick={() => setAssetPage("props")}>
                道具页 · {assetLibrary.props.length}
              </button>
            </div>
            <p className="asset-empty-copy">
              当前页面共有 {activeAssetCount} 张卡片。每张卡片都可以独立编辑、AI 补全、生成图片和删除。
            </p>
          </div>
        </div>
      </div>

      <div className="panel-card asset-page-panel">
        {assetPage === "characters" ? (
          <div className="overview-list relationship-list asset-card-grid">
              <div className="rewrite-head">
                <h4>角色卡</h4>
                <AIActionButton
                  isGenerating={aiAction === "generate-character"}
                  disabled={Boolean(aiAction)}
                  loadingLabel="角色提取中"
                  onClick={() => void generateAssetCards("character")}
                >
                  从上游提取角色
                </AIActionButton>
              </div>
              {assetLibrary.characters.map((item) => (
                <div className="overview-item asset-edit-card" key={item.id}>
                  {item.image_url ? <img className="asset-card-image" src={item.image_url} alt={item.name || "角色三视图"} /> : null}
                  <div className="field-row">
                    <label className="field-label">
                      <span>角色名</span>
                      <input value={item.name} onChange={(event) => updateCharacter(item.id, { name: event.target.value })} />
                    </label>
                    <label className="field-label">
                      <span>定位</span>
                      <input value={item.role} onChange={(event) => updateCharacter(item.id, { role: event.target.value })} />
                    </label>
                    <label className="field-label">
                      <span>年龄</span>
                      <input value={item.age} onChange={(event) => updateCharacter(item.id, { age: event.target.value })} />
                    </label>
                  </div>
                  <label className="field-label">
                    <span>性格</span>
                    <textarea rows={2} value={item.personality} onChange={(event) => updateCharacter(item.id, { personality: event.target.value })} />
                  </label>
                  <label className="field-label">
                    <span>外貌</span>
                    <textarea rows={2} value={item.appearance} onChange={(event) => updateCharacter(item.id, { appearance: event.target.value })} />
                  </label>
                  <label className="field-label">
                    <span>动机</span>
                    <textarea rows={2} value={item.motivation} onChange={(event) => updateCharacter(item.id, { motivation: event.target.value })} />
                  </label>
                  <label className="field-label">
                    <span>服装</span>
                    <textarea rows={2} value={item.outfit} onChange={(event) => updateCharacter(item.id, { outfit: event.target.value })} />
                  </label>
                  <div className="action-row">
                    <AIActionButton
                      className="ghost-mini-button"
                      isGenerating={aiAction === `complete-character:${item.id}`}
                      disabled={Boolean(aiAction)}
                      loadingLabel="补全中"
                      onClick={() => void completeAssetCard("character", item.id)}
                    >
                      AI 补全
                    </AIActionButton>
                    <AIActionButton
                      className="ghost-mini-button"
                      isGenerating={aiAction === `image-character:${item.id}`}
                      disabled={Boolean(aiAction)}
                      loadingLabel="三视图中"
                      onClick={() => void generateAssetImage("character", item.id)}
                    >
                      生成三视图
                    </AIActionButton>
                    <button className="ghost-mini-button" type="button" onClick={() => removeCharacter(item.id)}>
                      删除角色
                    </button>
                  </div>
                  {assetFeedback[item.id] ? <span className="asset-card-feedback">{assetFeedback[item.id]}</span> : null}
                </div>
              ))}
          </div>
        ) : null}
        {assetPage === "scenes" ? (
          <div className="overview-list relationship-list asset-card-grid">
              <div className="rewrite-head">
                <h4>场景卡</h4>
                <AIActionButton
                  isGenerating={aiAction === "generate-scene"}
                  disabled={Boolean(aiAction)}
                  loadingLabel="场景提取中"
                  onClick={() => void generateAssetCards("scene")}
                >
                  从上游提取场景
                </AIActionButton>
              </div>
              {assetLibrary.scenes.map((item) => (
                <div className="overview-item asset-edit-card" key={item.id}>
                  {item.image_url ? <img className="asset-card-image" src={item.image_url} alt={item.name || "场景图"} /> : null}
                  <div className="field-row">
                    <label className="field-label">
                      <span>场景名</span>
                      <input value={item.name} onChange={(event) => updateScene(item.id, { name: event.target.value })} />
                    </label>
                    <label className="field-label">
                      <span>地点</span>
                      <input value={item.location} onChange={(event) => updateScene(item.id, { location: event.target.value })} />
                    </label>
                    <label className="field-label">
                      <span>出现集数</span>
                      <input value={item.episodes} onChange={(event) => updateScene(item.id, { episodes: event.target.value })} />
                    </label>
                  </div>
                  <label className="field-label">
                    <span>氛围</span>
                    <textarea rows={3} value={item.atmosphere} onChange={(event) => updateScene(item.id, { atmosphere: event.target.value })} />
                  </label>
                  <div className="action-row">
                    <AIActionButton
                      className="ghost-mini-button"
                      isGenerating={aiAction === `complete-scene:${item.id}`}
                      disabled={Boolean(aiAction)}
                      loadingLabel="补全中"
                      onClick={() => void completeAssetCard("scene", item.id)}
                    >
                      AI 补全
                    </AIActionButton>
                    <AIActionButton
                      className="ghost-mini-button"
                      isGenerating={aiAction === `image-scene:${item.id}`}
                      disabled={Boolean(aiAction)}
                      loadingLabel="场景图中"
                      onClick={() => void generateAssetImage("scene", item.id)}
                    >
                      生成场景图
                    </AIActionButton>
                    <button className="ghost-mini-button" type="button" onClick={() => removeScene(item.id)}>
                      删除场景
                    </button>
                  </div>
                  {assetFeedback[item.id] ? <span className="asset-card-feedback">{assetFeedback[item.id]}</span> : null}
                </div>
              ))}
          </div>
        ) : null}
        {assetPage === "props" ? (
          <div className="overview-list relationship-list asset-card-grid">
              <div className="rewrite-head">
                <h4>道具卡</h4>
                <AIActionButton
                  isGenerating={aiAction === "generate-prop"}
                  disabled={Boolean(aiAction)}
                  loadingLabel="道具提取中"
                  onClick={() => void generateAssetCards("prop")}
                >
                  从上游提取道具
                </AIActionButton>
              </div>
              {assetLibrary.props.map((item) => (
                <div className="overview-item asset-edit-card" key={item.id}>
                  {item.image_url ? <img className="asset-card-image" src={item.image_url} alt={item.name || "道具三视图"} /> : null}
                  <div className="field-row">
                    <label className="field-label">
                      <span>道具名</span>
                      <input value={item.name} onChange={(event) => updateProp(item.id, { name: event.target.value })} />
                    </label>
                    <label className="field-label">
                      <span>类型</span>
                      <input value={item.type} onChange={(event) => updateProp(item.id, { type: event.target.value })} />
                    </label>
                  </div>
                  <label className="field-label">
                    <span>剧情作用</span>
                    <textarea rows={3} value={item.story_function} onChange={(event) => updateProp(item.id, { story_function: event.target.value })} />
                  </label>
                  <div className="action-row">
                    <AIActionButton
                      className="ghost-mini-button"
                      isGenerating={aiAction === `complete-prop:${item.id}`}
                      disabled={Boolean(aiAction)}
                      loadingLabel="补全中"
                      onClick={() => void completeAssetCard("prop", item.id)}
                    >
                      AI 补全
                    </AIActionButton>
                    <AIActionButton
                      className="ghost-mini-button"
                      isGenerating={aiAction === `image-prop:${item.id}`}
                      disabled={Boolean(aiAction)}
                      loadingLabel="三视图中"
                      onClick={() => void generateAssetImage("prop", item.id)}
                    >
                      生成三视图
                    </AIActionButton>
                    <button className="ghost-mini-button" type="button" onClick={() => removeProp(item.id)}>
                      删除道具
                    </button>
                  </div>
                  {assetFeedback[item.id] ? <span className="asset-card-feedback">{assetFeedback[item.id]}</span> : null}
                </div>
              ))}
          </div>
        ) : null}
      </div>

      <div className="panel-card asset-style-panel">
            <div className="rewrite-head">
              <h3>风格与一致性</h3>
              <div className="chip-row">
                <AIActionButton
                  isGenerating={aiAction === "generate-style"}
                  disabled={Boolean(aiAction)}
                  loadingLabel="风格生成中"
                  onClick={() => void generateStyleSupport("style")}
                >
                  AI 风格板
                </AIActionButton>
                <AIActionButton
                  isGenerating={aiAction === "generate-rules"}
                  disabled={Boolean(aiAction)}
                  loadingLabel="规则生成中"
                  onClick={() => void generateStyleSupport("rules")}
                >
                  AI 一致性
                </AIActionButton>
              </div>
            </div>
            <label className="field-label">
              <span>风格板</span>
              <textarea value={assetLibrary.style_board} onChange={(event) => setAssetLibrary({ ...assetLibrary, style_board: event.target.value })} placeholder="记录画风、色彩、光影、镜头质感。" />
            </label>
            <label className="field-label">
              <span>一致性规则</span>
              <textarea value={assetLibrary.consistency_rules} onChange={(event) => setAssetLibrary({ ...assetLibrary, consistency_rules: event.target.value })} placeholder="记录角色、服装、场景等锁定规则。" />
            </label>
            <label className="field-label">
              <span>提示词模板</span>
              <textarea value={assetLibrary.prompt_templates} onChange={(event) => setAssetLibrary({ ...assetLibrary, prompt_templates: event.target.value })} placeholder="角色、场景、道具提示词模板。" />
            </label>
      </div>
    </section>
  );
}

function StepFourSection({
  project,
  onSaved,
  setStatusMessage,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepFourData>(project.step_four);
  const [saving, setSaving] = useState(false);
  const [storyboardGenerating, setStoryboardGenerating] = useState(false);

  useEffect(() => setForm(project.step_four), [project.step_four]);

  const storyboardInspection = useMemo(() => inspectProductStoryboard(form.shots), [form.shots]);

  function shotRecordText(record: Record<string, unknown>, keys: string[], fallback = "") {
    for (const key of keys) {
      const value = textValue(record[key]);
      if (value) return value;
    }
    return fallback;
  }

  async function generateShots() {
    if (storyboardGenerating) return;
    const episode = project.step_one.episodes.find((item) => item.episode_number === form.selected_episode_number) ?? project.step_one.episodes[0];
    setStoryboardGenerating(true);
    setStatusMessage("AI 正在拆分镜头...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S04_STORYBOARD_SPLIT",
        [
          `目标集数：第 ${episode?.episode_number ?? form.selected_episode_number} 集`,
          `单集大纲：${episode?.content || "未填写"}`,
          `结尾钩子：${episode?.hook || "未填写"}`,
          "分镜要求：每个镜头都必须是产品级生产表，包含剧情目的、故事节拍、画面描述、动作、走位调度、景别、机位、构图、镜头焦段或运动、声音/对白、转场/连续性、资产绑定、生成硬约束和风险点。",
          directorGrammarGuide,
          "请只基于当前目标集、该集剧本摘录和资产摘要拆分镜头，不要重新处理整份原始文档。",
        ].join("\n"),
        { projectId: project.id, targetType: "episode", targetId: String(episode?.episode_number ?? form.selected_episode_number) }
      );
      const parsed = firstJsonObject(result.content);
      const shots = listValue(parsed.shots)
        .flatMap((item, index): ShotItem[] => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          return [enrichShotProductionFields({
            id: textValue(record.shot_id) || `shot-ai-${Date.now()}-${index}`,
            episode_number: numberValue(record.episode_number, episode?.episode_number ?? form.selected_episode_number),
            shot_number: numberValue(record.shot_number, index + 1),
            scene: textValue(record.scene, "待定场景"),
            characters: splitTextLines(record.characters),
            props: splitTextLines(record.props),
            purpose: textValue(record.purpose, "推进剧情"),
            story_beat: shotRecordText(record, ["story_beat", "beat", "emotion_beat", "dramatic_beat"], "待确认：故事节拍"),
            visual_description: shotRecordText(record, ["visual_description", "visual", "description", "image_description", "frame_description"], "待确认：画面主体"),
            action: shotRecordText(record, ["action", "character_action", "event_action", "movement_action"], "待确认：动作"),
            blocking: shotRecordText(record, ["blocking", "staging", "positioning", "character_blocking"], "待确认：调度"),
            duration_seconds: Math.max(1, Math.round(numberValue(record.duration_seconds, 6))),
            shot_size: textValue(record.shot_size, "中景"),
            camera_angle: textValue(record.camera_angle, "平视"),
            composition: textValue(record.composition, "主体清晰，构图稳定。"),
            lens: shotRecordText(record, ["lens", "focal_length", "view_lens"], "待确认：镜头焦段"),
            movement: textValue(record.movement, "定镜"),
            camera_motion: shotRecordText(record, ["camera_motion", "camera_movement", "motion_detail"], textValue(record.movement, "定镜")),
            lighting: shotRecordText(record, ["lighting", "light", "lighting_design"], "待确认：光线"),
            color_mood: shotRecordText(record, ["color_mood", "color", "tone", "mood"], "待确认：色彩情绪"),
            dialogue: textValue(record.dialogue),
            sound_design: shotRecordText(record, ["sound_design", "sound", "audio", "sfx", "music"], "待确认：声音设计"),
            rhythm: textValue(record.rhythm, "信息推进"),
            transition: shotRecordText(record, ["transition", "cut", "in_out"], "硬切或待确认"),
            continuity_notes: shotRecordText(record, ["continuity_notes", "continuity", "continuity_note"], "待确认：连续性"),
            asset_requirements: shotRecordText(record, ["asset_requirements", "asset_binding", "assets", "source_asset_ids"], "待确认：资产绑定"),
            generation_notes: shotRecordText(record, ["generation_notes", "generation_constraints", "prompt_constraints", "production_notes"], "待确认：生成硬约束"),
            vfx_notes: shotRecordText(record, ["vfx_notes", "vfx", "post_notes"], "无特殊后期"),
            risk_flags: shotRecordText(record, ["risk_flags", "risk_notes", "risks"], "待确认：生成风险"),
            status: "ready" as const,
          })];
        });
      if (!shots.length) {
        setStatusMessage("AI 返回格式异常，未生成镜头。");
        return;
      }
      setForm({
        ...form,
        shots,
        task_preview: buildStoryboardPreview(shots),
        total_duration_seconds: shots.reduce((sum, item) => sum + item.duration_seconds, 0),
      });
      const inspection = inspectProductStoryboard(shots);
      setStatusMessage(inspection.missingCount ? `AI 已完成 ${shots.length} 个镜头拆分，仍有 ${inspection.missingCount} 个产品级字段需要补齐。` : `AI 已完成 ${shots.length} 个产品级镜头拆分。`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 拆镜失败");
    } finally {
      setStoryboardGenerating(false);
    }
  }

  function addShot() {
    setForm((current) => ({
      ...current,
      shots: [
        ...current.shots,
        {
          id: `shot-${Date.now()}`,
          episode_number: current.selected_episode_number,
          shot_number: current.shots.length + 1,
          scene: "新镜头场景",
          characters: ["主角"],
          props: [],
          purpose: "补充镜头",
          story_beat: "待确认：故事节拍",
          visual_description: "待确认：画面主体与可见信息",
          action: "待确认：角色动作",
          blocking: "待确认：走位与站位",
          duration_seconds: 6,
          shot_size: "中景",
          camera_angle: "平视",
          composition: "待补充构图站位",
          lens: "待确认：镜头焦段",
          movement: "定镜",
          camera_motion: "定镜",
          lighting: "待确认：光线",
          color_mood: "待确认：色彩情绪",
          dialogue: "",
          sound_design: "待确认：声音设计",
          rhythm: "草稿",
          transition: "硬切或待确认",
          continuity_notes: "待确认：前后镜头连续性",
          asset_requirements: "待确认：角色/场景/道具绑定",
          generation_notes: "待确认：图片/视频生成硬约束",
          vfx_notes: "无特殊后期",
          risk_flags: "待确认：生成风险",
          status: "draft",
        },
      ],
    }));
    setStatusMessage("已新增镜头，保存分镜后生效。");
  }

  function removeShot(shotId: string) {
    const target = form.shots.find((item) => item.id === shotId);
    const confirmed = window.confirm(`确认删除镜头 #${target?.shot_number ?? "?"} 吗？删除后会重新整理镜头编号。`);
    if (!confirmed) return;
    setForm((current) => {
      const shots = current.shots
        .filter((item) => item.id !== shotId)
        .map((item, index) => ({ ...item, shot_number: index + 1 }));
      return {
        ...current,
        shots,
        total_duration_seconds: shots.reduce((sum, item) => sum + item.duration_seconds, 0),
      };
    });
    setStatusMessage("镜头已删除，保存分镜后生效");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const enrichedShots = form.shots.map(enrichShotProductionFields);
      const inspection = inspectProductStoryboard(enrichedShots);
      const nextForm = {
        ...form,
        shots: enrichedShots,
        task_preview: form.task_preview || inspection.summary,
        total_duration_seconds: enrichedShots.reduce((sum, item) => sum + item.duration_seconds, 0),
      };
      const saved = await saveStepFour(project.id, nextForm);
      onSaved(saved, inspection.missingCount ? `步骤四已保存，仍有 ${inspection.missingCount} 个产品级字段待补齐` : "步骤四产品级分镜已保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor-section" id="storyboard-planning">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤四</span>
          <h2>分镜规划</h2>
          <p>选择集数后可从故事、剧本和资产库 AI 拆镜，形成镜头表和后续任务队列。</p>
        </div>
        <div className="chip-row">
          <span className="ghost-chip">镜头 {form.shots.length}</span>
          <span className="ghost-chip">总时长 {form.total_duration_seconds}s</span>
        </div>
      </div>
      <div className="action-row">
        <select value={form.selected_episode_number} onChange={(event) => setForm({ ...form, selected_episode_number: Number(event.target.value) })}>
          {project.step_one.episodes.map((episode) => (
            <option key={episode.episode_number} value={episode.episode_number}>第 {episode.episode_number} 集</option>
          ))}
        </select>
        <AIActionButton className="primary-pill inline-pill" isGenerating={storyboardGenerating} disabled={storyboardGenerating} loadingLabel="AI 拆镜中" onClick={() => void generateShots()}>自动拆镜</AIActionButton>
        <button className="ghost-button inline-button" type="button" onClick={addShot}>新增镜头</button>
        <button className="ghost-button inline-button strong" type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中..." : "保存分镜"}</button>
      </div>
      <div className="hint-text">{storyboardInspection.summary}</div>
      <div className="shot-table-grid">
        {form.shots.map((shot) => (
          <article className="panel-card shot-card" key={shot.id}>
            <strong>#{shot.shot_number} {shot.scene}</strong>
            <span>{shot.shot_size} / {shot.camera_angle} / {shot.movement} / {shot.duration_seconds}s</span>
            <p>{shot.purpose}</p>
            <p>{shot.story_beat || "故事节拍待补充"} · {shot.visual_description || "画面描述待补充"}</p>
            <small>动作：{shot.action || "待补充"} · 调度：{shot.blocking || "待补充"}</small>
            <small>摄影：{shot.composition || "待补充构图"} · {shot.lens || "焦段待补充"} · {shot.camera_motion || shot.movement || "运镜待补充"}</small>
            <small>声音：{shot.dialogue || shot.sound_design || "待补充"} · 转场：{shot.transition || "待补充"}</small>
            <small>资产绑定：{shot.asset_requirements || "待补充"} · 生成约束：{shot.generation_notes || "待补充"}</small>
            <small>角色：{shot.characters.join("、") || "待选"} · 道具：{shot.props.join("、") || "无"}</small>
            {validateProductShot(shot).length ? <small>待补齐：{validateProductShot(shot).join("、")}</small> : <small>产品级字段完整</small>}
            <button className="ghost-mini-button" type="button" onClick={() => removeShot(shot.id)}>
              删除镜头
            </button>
          </article>
        ))}
      </div>
      <div className="hint-text">{form.task_preview || "生成分镜后将显示后续图片/视频/配音任务队列。"}</div>
    </section>
  );
}

function StepFiveSection({
  project,
  onSaved,
  setStatusMessage,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepFiveData>(project.step_five);
  const [saving, setSaving] = useState(false);
  const [promptGenerationAction, setPromptGenerationAction] = useState<string | null>(null);
  useEffect(() => setForm(project.step_five), [project.step_five]);

  const visiblePrompts = form.prompts.filter((item) => !form.filter_text || item.shot_label.includes(form.filter_text));

  async function generatePrompts(scope: "single" | "batch", mode: "t2i" | "i2v") {
    if (promptGenerationAction) return;
    const actionKey = `${scope}-${mode}`;
    setPromptGenerationAction(actionKey);
    const shots = project.step_four.shots.length ? project.step_four.shots : [];
    const targets = scope === "single" ? shots.slice(0, 1) : shots;
    if (!targets.length) {
      setStatusMessage("请先在步骤四生成镜头。");
      setPromptGenerationAction(null);
      return;
    }
    setStatusMessage(mode === "t2i" ? "AI 正在生成图片提示词..." : "AI 正在生成视频提示词...");
    try {
      const promptConcurrency = scope === "batch" ? 2 : 1;
      const prompts = await runLimitedConcurrency(targets, promptConcurrency, async (shot, index) => {
        const taskId = mode === "t2i" ? "S05_T2I_PROMPT" : "S05_I2V_PROMPT";
        const basePrompt = [
            `目标镜头 ID：${shot.id}`,
            `目标镜头标签：第${shot.episode_number}集 #${shot.shot_number}`,
            "语言约束：用于图片/视频模型的提示词字段必须统一使用英文，包括正向提示词、负面词、参数和锁定词；不得中英混写。中文角色名、场景名、道具名请转写为稳定英文名或拼音，并在同一项目内保持一致。UI说明类字段可继续中文。",
            "视线与道具朝向约束：如果镜头中角色正在阅读、查看、拍摄或检查笔记、报告、照片、手机、档案等信息载体，画面必须遵循角色视线逻辑。信息载体应朝向角色，镜头可使用角色肩后、侧后、主观视角或斜侧可读构图；不得让页面/屏幕像展示牌一样正面朝观众、同时角色却在旁边观看。请在正向英文提示词中加入 over-the-shoulder view / POV from the character / page angled toward the character / screen facing the character 等约束，并在负面词中排除 front-facing document to viewer / display board composition / prop presented to audience / contradictory eyeline。",
            directorGrammarGuide,
            "请只使用后端提供的当前镜头、邻近镜头、匹配资产和风格规则，不要重新读取或复述完整项目文档。",
            `负面词模板：${form.negative_template}`,
            `参数模板：${form.parameter_template}`,
        ].join("\n");
        let result = await generateProjectTextTask(
          project.name,
          taskId,
          basePrompt,
          { projectId: project.id, targetType: "shot", targetId: shot.id }
        );
        let parsed = parseStrictJsonOutput(result.content);
        if (modelPromptFieldsContainCjk(parsed, mode)) {
          result = await generateProjectTextTask(
            project.name,
            taskId,
            [
              basePrompt,
              "上一版输出不合格：模型提示词字段检测到中文或中文标点。请重新输出合法 JSON，并将所有用于图片/视频模型的提示词字段改为纯英文，不要夹杂中文。",
              "上一版输出：",
              result.content,
            ].join("\n"),
            { projectId: project.id, targetType: "shot", targetId: shot.id }
          );
          parsed = parseStrictJsonOutput(result.content);
        }
        const positivePrompt = textValue(parsed.positive_prompt) || textValue(parsed.full_prompt);
        const motionPrompt = textValue(parsed.full_prompt) || textValue(parsed.motion_prompt);
        setStatusMessage(`提示词生成进度：${index + 1}/${targets.length}`);
        return {
          id: `prompt-${shot.id}-${mode}-${Date.now()}-${index}`,
          shot_id: shot.id,
          shot_label: `第${shot.episode_number}集 #${shot.shot_number}`,
          selected: true,
          t2i_prompt: mode === "t2i" ? positivePrompt || result.content : "",
          i2v_prompt: mode === "i2v" ? motionPrompt || result.content : "",
          negative_prompt: textValue(parsed.negative_prompt, form.negative_template),
          parameters: textValue(parsed.parameters, form.parameter_template),
          locked_terms: textValue(parsed.locked_terms, project.step_three.consistency_rules),
          version: "v1",
        };
      });
      setForm((current) => ({ ...current, prompts: [...current.prompts, ...prompts] }));
      setStatusMessage(`AI 已生成 ${prompts.length} 条${mode.toUpperCase()}提示词。`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 提示词生成失败");
    } finally {
      setPromptGenerationAction(null);
    }
  }

  function batchReplace() {
    if (!form.batch_replace_from) {
      setStatusMessage("请先填写要查找替换的词。");
      return;
    }
    const replaceCount = form.prompts.reduce(
      (sum, item) =>
        sum +
        item.t2i_prompt.split(form.batch_replace_from).length - 1 +
        item.i2v_prompt.split(form.batch_replace_from).length - 1,
      0
    );
    setForm((current) => ({
      ...current,
      prompts: current.prompts.map((item) => ({
        ...item,
        t2i_prompt: item.t2i_prompt.split(current.batch_replace_from).join(current.batch_replace_to),
        i2v_prompt: item.i2v_prompt.split(current.batch_replace_from).join(current.batch_replace_to),
      })),
    }));
    setStatusMessage(replaceCount ? `已完成 ${replaceCount} 处提示词替换。` : "没有匹配到可替换内容。");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveStepFive(project.id, form);
      onSaved(saved, "步骤五提词库已保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor-section" id="prompt-generation">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤五</span>
          <h2>提词生成</h2>
          <p>基于镜头表和资产库生成 T2I/I2V 提示词、负面词、参数与锁定词。</p>
        </div>
        <div className="chip-row"><span className="ghost-chip">提示词 {form.prompts.length}</span></div>
      </div>
      <div className="action-row">
        <input value={form.filter_text} onChange={(event) => setForm({ ...form, filter_text: event.target.value })} placeholder="筛选镜头/场景/角色" />
        <AIActionButton className="primary-pill inline-pill" isGenerating={promptGenerationAction === "batch-t2i"} disabled={Boolean(promptGenerationAction)} loadingLabel="T2I生成中" onClick={() => generatePrompts("batch", "t2i")}>批量 T2I</AIActionButton>
        <AIActionButton isGenerating={promptGenerationAction === "single-t2i"} disabled={Boolean(promptGenerationAction)} loadingLabel="单镜T2I中" onClick={() => generatePrompts("single", "t2i")}>单镜 T2I</AIActionButton>
        <AIActionButton isGenerating={promptGenerationAction === "batch-i2v"} disabled={Boolean(promptGenerationAction)} loadingLabel="I2V生成中" onClick={() => generatePrompts("batch", "i2v")}>批量 I2V</AIActionButton>
        <button className="ghost-button inline-button strong" type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中..." : "保存提词"}</button>
      </div>
      <div className="field-row compact-row">
        <label className="field-label"><span>负面词模板</span><textarea value={form.negative_template} onChange={(event) => setForm({ ...form, negative_template: event.target.value })} /></label>
        <label className="field-label"><span>参数模板</span><textarea value={form.parameter_template} onChange={(event) => setForm({ ...form, parameter_template: event.target.value })} /></label>
      </div>
      <div className="field-row compact-row">
        <label className="field-label"><span>批量替换查找</span><input value={form.batch_replace_from} onChange={(event) => setForm({ ...form, batch_replace_from: event.target.value })} /></label>
        <label className="field-label"><span>替换为</span><input value={form.batch_replace_to} onChange={(event) => setForm({ ...form, batch_replace_to: event.target.value })} /></label>
        <button className="ghost-button inline-button" type="button" onClick={batchReplace}>执行替换</button>
      </div>
      <div className="prompt-list-grid">
        {visiblePrompts.map((prompt) => (
          <article className="panel-card prompt-card" key={prompt.id}>
            <strong>{prompt.shot_label} · {prompt.version}</strong>
            <p>{prompt.t2i_prompt || prompt.i2v_prompt || "待生成提示词"}</p>
            <small>负面词：{prompt.negative_prompt}</small>
            <button className="ghost-mini-button" type="button" onClick={() => void copyTextToClipboard(prompt.t2i_prompt || prompt.i2v_prompt, "提示词已复制", setStatusMessage)}>复制</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function StepSixSection({
  project,
  onSaved,
  setStatusMessage,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepSixData>(project.step_six);
  const [saving, setSaving] = useState(false);
  const [imageGenerationAction, setImageGenerationAction] = useState<string | null>(null);
  const [repaintFeedback, setRepaintFeedback] = useState<Record<string, { tone: "progress" | "success" | "error"; message: string }>>({});
  useEffect(() => {
    setForm(project.step_six);
    setRepaintFeedback({});
  }, [project.step_six]);
  const selectedCount = form.candidates.filter((item) => item.status === "selected" || item.status === "first-frame" || item.status === "keyframe").length;

  function updateRepaintFeedback(imageId: string, tone: "progress" | "success" | "error", message: string) {
    setRepaintFeedback((current) => ({ ...current, [imageId]: { tone, message } }));
  }

  async function generateImages(scope: "single" | "batch") {
    if (imageGenerationAction) return;
    const prompts = project.step_five.prompts.length ? project.step_five.prompts : [];
    const targets = scope === "single" ? prompts.slice(0, 1) : prompts;
    if (!targets.length) {
      setStatusMessage("请先在步骤五生成 T2I 提示词。");
      return;
    }
    setImageGenerationAction(scope);
    const concurrency = scope === "batch" ? 3 : 1;
    setStatusMessage(`正在调用 gpt-image-2 生成 ${targets.length} 张图片，并发 ${concurrency} 路...`);
    try {
      const candidates = await runLimitedConcurrency(targets, concurrency, async (prompt, index) => {
        const promptText = prompt.t2i_prompt || prompt.i2v_prompt;
        if (!promptText.trim()) {
          return null;
        }
        const result = await generateImageCandidate({
          prompt: promptText,
          shot_id: prompt.shot_id,
          shot_label: prompt.shot_label,
        });
        setStatusMessage(`图片生成进度：${index + 1}/${targets.length}`);
        return {
          id: `img-${prompt.id}-${Date.now()}-${index}`,
          shot_id: prompt.shot_id,
          shot_label: prompt.shot_label,
          url: result.url,
          prompt: result.prompt,
          status: index === 0 ? "first-frame" as const : "candidate" as const,
          metadata: `${result.provider} / ${result.model}；${result.metadata || prompt.parameters}`,
          repaint_instruction: "",
          repaint_prompt: "",
        };
      });
      if (!candidates.length) {
        setStatusMessage("没有可用于生图的提示词。");
        return;
      }
      setForm((current) => ({ ...current, candidates: [...current.candidates, ...candidates] }));
      setStatusMessage(`已生成 ${candidates.length} 张图片候选。`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "图片生成失败");
    } finally {
      setImageGenerationAction(null);
    }
  }

  async function regenerateShot(shotId: string) {
    if (imageGenerationAction) return;
    const prompt = project.step_five.prompts.find((item) => item.shot_id === shotId);
    if (!prompt) {
      setStatusMessage("没有找到该镜头的提示词");
      return;
    }
    const promptText = form.repaint_prompt || prompt.t2i_prompt || prompt.i2v_prompt;
    setImageGenerationAction(`regenerate:${shotId}`);
    setStatusMessage("正在重新生成候选图...");
    try {
      const result = await generateImageCandidate({
        prompt: promptText,
        shot_id: shotId,
        shot_label: prompt.shot_label,
      });
      const candidate: ImageCandidate = {
        id: `img-reg-${shotId}-${Date.now()}`,
        shot_id: shotId,
        shot_label: prompt.shot_label,
        url: result.url,
        prompt: result.prompt,
        status: "candidate",
        metadata: `${result.provider} / ${result.model}；重新生成版本`,
        repaint_instruction: form.repaint_prompt,
        repaint_prompt: form.repaint_prompt,
      };
      setForm((current) => ({ ...current, candidates: [...current.candidates, candidate] }));
      setStatusMessage("已追加重新生成候选图，未覆盖已入选素材");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "重新生成图片失败");
    } finally {
      setImageGenerationAction(null);
    }
  }

  async function applyRepaint(imageId: string) {
    if (imageGenerationAction) return;
    const image = form.candidates.find((item) => item.id === imageId);
    if (!image) return;
    const userInstruction = (image.repaint_instruction || form.repaint_prompt || form.repaint_mask_note).trim();
    if (!userInstruction) {
      setStatusMessage("请先在该候选图下填写修改意见，再执行 AI 改词并重绘。");
      updateRepaintFeedback(imageId, "error", "请先在这张图下填写修改意见，再点击 AI 改词并重绘。");
      return;
    }
    setImageGenerationAction(`repaint-prompt:${imageId}`);
    setStatusMessage("AI 正在按修改意见修订完整生图提示词...");
    updateRepaintFeedback(imageId, "progress", "AI 正在按你的修改意见重写完整生图提示词...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S06_REPAINT_PROMPT",
        [
          `目标图片 ID：${image.id}`,
          `目标镜头 ID：${image.shot_id}`,
          `用户修改意见：${userInstruction}`,
          form.repaint_mask_note ? `结构/局部问题补充：${form.repaint_mask_note}` : "",
          "请只使用后端根据 target_id 提供的当前图片、当前镜头、当前提示词、同镜头候选图和风格规则，生成完整英文 T2I 重绘提示词。",
          "不要复述完整项目文档，不要输出解释，只返回任务契约要求的 JSON。",
        ].filter(Boolean).join("\n"),
        { projectId: project.id, targetType: "image", targetId: image.id }
      );
      const parsed = parseStrictJsonOutput(result.content);
      const revisedPrompt = textValue(parsed.repaint_prompt || parsed.prompt || parsed.positive_prompt, result.content);
      const negativePrompt = textValue(parsed.negative_prompt);
      const fullPrompt = [revisedPrompt, negativePrompt ? `Negative prompt: ${negativePrompt}` : ""].filter(Boolean).join("\n");
      setForm((current) => ({
        ...current,
        candidates: current.candidates.map((item) =>
          item.id === imageId
            ? {
                ...item,
                metadata: `${item.metadata}；AI已按修改意见修订重绘提示词`,
                repaint_instruction: userInstruction,
                repaint_prompt: fullPrompt,
              }
            : item
        ),
      }));
      updateRepaintFeedback(imageId, "progress", "AI 已生成修订提示词，正在提交 gpt-image-2 重绘新候选图。");

      setImageGenerationAction(`repaint-image:${imageId}`);
      setStatusMessage("gpt-image-2 正在根据修订提示词重绘新候选图...");
      const imageResult = await generateImageCandidate({
        prompt: fullPrompt,
        shot_id: image.shot_id,
        shot_label: image.shot_label,
      });
      const candidate: ImageCandidate = {
        id: `img-repaint-${image.id}-${Date.now()}`,
        shot_id: image.shot_id,
        shot_label: image.shot_label,
        url: imageResult.url,
        prompt: fullPrompt,
        status: "candidate",
        metadata: `${imageResult.provider} / ${imageResult.model}；按用户修改意见重绘；来源 ${image.id}`,
        repaint_instruction: userInstruction,
        repaint_prompt: fullPrompt,
      };
      setForm((current) => ({ ...current, candidates: [...current.candidates, candidate] }));
      setStatusMessage("已完成 AI 改词并重绘，新候选图已追加，原图未覆盖。");
      updateRepaintFeedback(imageId, "success", `重绘完成：新候选图已追加，来源 ${image.id}，原图未覆盖。`);
      updateRepaintFeedback(candidate.id, "success", "这是按 AI 修订提示词生成的新候选图。");
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 改词并重绘失败";
      setStatusMessage(message);
      updateRepaintFeedback(imageId, "error", `失败：${message}`);
    } finally {
      setImageGenerationAction(null);
    }
  }

  function updateCandidateRepaintInstruction(imageId: string, value: string) {
    setForm((current) => ({
      ...current,
      candidates: current.candidates.map((item) => (item.id === imageId ? { ...item, repaint_instruction: value } : item)),
    }));
  }

  function validateSelectedPackage() {
    const shotIds = new Set(project.step_five.prompts.map((item) => item.shot_id));
    const selectedShotIds = new Set(
      form.candidates
        .filter((item) => item.status === "selected" || item.status === "first-frame" || item.status === "keyframe")
        .map((item) => item.shot_id)
    );
    const missing = Array.from(shotIds).filter((id) => !selectedShotIds.has(id));
    const report = missing.length ? `仍有 ${missing.length} 个镜头未选择入选图：${missing.join("、")}` : "所有镜头都已有入选图，可进入质检返工。";
    setForm((current) => ({ ...current, validation_report: report, selected_package_note: `入选素材 ${selectedCount} 张` }));
    setStatusMessage(report);
  }

  function markImageStatus(image: ImageCandidate, status: ImageCandidate["status"], label: string) {
    setForm((current) => ({
      ...current,
      candidates: current.candidates.map((item) => item.id === image.id ? { ...item, status } : item),
    }));
    setStatusMessage(`${image.shot_label} 已标记为${label}，保存候选图后生效。`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveStepSix(project.id, form);
      onSaved(saved, "步骤六画面候选已保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor-section" id="image-generation">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤六</span>
          <h2>画面生成</h2>
          <p>根据 T2I 提示词调用图片模型生成候选图，支持筛选、预览、设为首帧/关键帧、废弃与复制提示词。</p>
        </div>
        <div className="chip-row"><span className="ghost-chip">候选图 {form.candidates.length}</span><span className="ghost-chip">入选 {selectedCount}</span></div>
      </div>
      <div className="action-row">
        <select value={form.generation_filter} onChange={(event) => setForm({ ...form, generation_filter: event.target.value })}>
          <option value="待生成">待生成</option>
          <option value="候选">候选</option>
          <option value="关键帧">关键帧</option>
        </select>
        <AIActionButton className="primary-pill inline-pill" isGenerating={imageGenerationAction === "batch"} disabled={Boolean(imageGenerationAction)} loadingLabel="图片批量生成中" onClick={() => void generateImages("batch")}>批量生成图片</AIActionButton>
        <AIActionButton isGenerating={imageGenerationAction === "single"} disabled={Boolean(imageGenerationAction)} loadingLabel="单镜生成中" onClick={() => void generateImages("single")}>单镜生成</AIActionButton>
        <button className="ghost-button inline-button" type="button" onClick={validateSelectedPackage}>进入质检校验</button>
        <button className="ghost-button inline-button strong" type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中..." : "保存候选图"}</button>
      </div>
      <div className="field-row compact-row">
        <label className="field-label"><span>重绘范围/结构问题</span><input value={form.repaint_mask_note} onChange={(event) => setForm({ ...form, repaint_mask_note: event.target.value })} placeholder="例如：画面结构割裂，笔记页面朝向观众而不是角色" /></label>
        <label className="field-label"><span>默认修改意见</span><input value={form.repaint_prompt} onChange={(event) => setForm({ ...form, repaint_prompt: event.target.value })} placeholder="例如：改为角色肩后视角，笔记朝向角色，观众只能斜侧看到页面" /></label>
      </div>
      {form.validation_report ? <div className="hint-text">{form.validation_report}</div> : null}
      <div className="image-candidate-grid">
        {form.candidates.map((image) => (
          <article className="panel-card image-candidate-card" key={image.id}>
            <img src={image.url} alt={image.shot_label} />
            <strong>{image.shot_label} · {image.status}</strong>
            <p>{image.metadata}</p>
            {repaintFeedback[image.id] ? (
              <div className={`repaint-feedback ${repaintFeedback[image.id].tone}`}>
                {repaintFeedback[image.id].message}
              </div>
            ) : null}
            {image.repaint_prompt ? <small>重绘提示词：{image.repaint_prompt}</small> : null}
            <label className="field-label repaint-field">
              <span>这张图的修改意见</span>
              <textarea
                rows={3}
                value={image.repaint_instruction}
                onChange={(event) => updateCandidateRepaintInstruction(image.id, event.target.value)}
                placeholder="例如：角色在看笔记时，笔记不能正面展示给观众；改成肩后/主观视角，页面朝向角色，保持角色、服装、档案馆和冷色电影感。"
              />
            </label>
            <div className="action-row">
              <button className="ghost-mini-button" type="button" onClick={() => markImageStatus(image, "first-frame", "首帧")}>首帧</button>
              <button className="ghost-mini-button" type="button" onClick={() => markImageStatus(image, "keyframe", "关键帧")}>关键帧</button>
              <button className="ghost-mini-button" type="button" onClick={() => markImageStatus(image, "selected", "入选")}>入选</button>
              <button className="ghost-mini-button" type="button" onClick={() => markImageStatus(image, "discarded", "废弃")}>废弃</button>
              <AIActionButton
                className="ghost-mini-button"
                isGenerating={imageGenerationAction === `regenerate:${image.shot_id}`}
                disabled={Boolean(imageGenerationAction)}
                loadingLabel="生成中"
                onClick={() => void regenerateShot(image.shot_id)}
              >
                重生成
              </AIActionButton>
              <AIActionButton
                className="ghost-mini-button"
                isGenerating={imageGenerationAction === `repaint-prompt:${image.id}` || imageGenerationAction === `repaint-image:${image.id}`}
                disabled={Boolean(imageGenerationAction)}
                loadingLabel={imageGenerationAction === `repaint-prompt:${image.id}` ? "AI改词中" : "重绘生成中"}
                onClick={() => void applyRepaint(image.id)}
              >
                AI改词并重绘
              </AIActionButton>
              <button className="ghost-mini-button" type="button" onClick={() => void copyTextToClipboard(image.prompt, "图片提示词已复制", setStatusMessage)}>复制词</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StepSevenSection({
  project,
  onSaved,
  setStatusMessage,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepSevenData>(project.step_seven);
  const [saving, setSaving] = useState(false);
  const [qualityAction, setQualityAction] = useState<string | null>(null);
  useEffect(() => setForm(project.step_seven), [project.step_seven]);
  const selectedImages = project.step_six.candidates.filter((item) => item.status === "selected" || item.status === "first-frame" || item.status === "keyframe");

  async function runQualityCheck(scope: "single" | "batch") {
    if (qualityAction) return;
    const targets = scope === "single" ? selectedImages.slice(0, 1) : selectedImages;
    if (!targets.length) {
      setStatusMessage("请先在步骤六选择待质检图片。");
      return;
    }
    setQualityAction(scope);
    setStatusMessage("AI 正在生成质检报告...");
    try {
      const reports: QualityReportItem[] = [];
      for (let index = 0; index < targets.length; index += 1) {
        const image = targets[index];
        const result = await generateProjectTextTask(
          project.name,
          "S07_IMAGE_QC",
          [
            "图片候选：",
            JSON.stringify(image, null, 2),
            "对应镜头：",
            JSON.stringify(project.step_four.shots.find((shot) => shot.id === image.shot_id) ?? {}, null, 2),
            "资产规则：",
            JSON.stringify(project.step_three, null, 2),
          ].join("\n"),
          { projectId: project.id, targetType: "image", targetId: image.id }
        );
        const parsed = firstJsonObject(result.content);
        const issues = listValue(parsed.issues);
        if (!issues.length) {
          reports.push({
            id: `qc-${image.id}-${Date.now()}-${index}`,
            asset_id: image.id,
            shot_label: image.shot_label,
            severity: "low",
            category: "分镜符合性",
            issue: textValue(parsed.overall_status, "AI 未发现明显阻断问题"),
            suggestion: textValue(parsed.pass_for_video) === "false" ? "建议人工复核后再进入视频生成。" : "可人工确认后进入视频生成。",
            repair_prompt: `${image.prompt}，保持角色与场景一致，修复可见瑕疵`,
            status: "pending",
            recheck_result: "",
          });
        } else {
          issues.forEach((issue, issueIndex) => {
            const record = issue && typeof issue === "object" ? (issue as Record<string, unknown>) : {};
            const categoryText = textValue(record.category, "分镜符合性");
            const category = ["角色一致性", "场景道具", "分镜符合性", "生成错误"].includes(categoryText)
              ? categoryText as QualityReportItem["category"]
              : "分镜符合性";
            reports.push({
              id: `qc-${image.id}-${Date.now()}-${index}-${issueIndex}`,
              asset_id: image.id,
              shot_label: image.shot_label,
              severity: severityValue(record.severity),
              category,
              issue: textValue(record.issue, textValue(issue, "AI 发现潜在问题")),
              suggestion: textValue(record.suggestion, "请按问题区域重新生成或局部重绘。"),
              repair_prompt: textValue(record.repair_prompt, `${image.prompt}，修复${category}问题，保持角色与场景一致`),
              status: "pending",
              recheck_result: "",
            });
          });
        }
      }
      setForm((current) => ({ ...current, reports: [...current.reports, ...reports], selected_asset_id: targets[0]?.id ?? current.selected_asset_id }));
      setStatusMessage(`AI 已生成 ${reports.length} 条质检报告`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 质检失败");
    } finally {
      setQualityAction(null);
    }
  }

  function createReworkTask(report: QualityReportItem) {
    setForm((current) => ({
      ...current,
      reports: current.reports.map((item) => item.id === report.id ? { ...item, status: "rework" } : item),
      rework_tasks: [
        ...current.rework_tasks,
        {
          id: `rw-${report.id}`,
          source_issue_id: report.id,
          asset_id: report.asset_id,
          title: `${report.shot_label} 返工：${report.category}`,
          prompt: report.repair_prompt,
          status: "todo",
        },
      ],
    }));
    setStatusMessage("已创建返工任务");
  }

  function markPassed(reportId?: string) {
    const confirmed = reportId ? true : window.confirm("确认批量标记全部素材通过质检吗？");
    if (!confirmed) return;
    setForm((current) => ({
      ...current,
      reports: current.reports.map((item) => (!reportId || item.id === reportId ? { ...item, status: "passed", recheck_result: "人工复检通过" } : item)),
    }));
    setStatusMessage(reportId ? "该素材已标记通过" : "全部质检项已批量标记通过");
  }

  function exportReport() {
    const text = form.reports.map((item) => `${item.shot_label}｜${item.category}｜${item.severity}｜${item.issue}｜建议：${item.suggestion}`).join("\n");
    setForm((current) => ({ ...current, export_text: text || "暂无质检问题", validation_report: form.reports.some((item) => item.status !== "passed") ? "仍有未通过素材，视频生成将默认拦截。" : "质检已全部通过，可进入视频生成。" }));
    void copyTextToClipboard(text || "暂无质检问题", "质检报告已复制", setStatusMessage);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveStepSeven(project.id, form);
      onSaved(saved, "步骤七质检返工已保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor-section" id="quality-rework">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤七</span>
          <h2>质检返工</h2>
          <p>检查入选图的角色一致性、场景道具、分镜符合性和生成错误，并生成返工建议。</p>
        </div>
        <div className="chip-row"><span className="ghost-chip">待检素材 {selectedImages.length}</span><span className="ghost-chip">问题 {form.reports.length}</span></div>
      </div>
      <div className="action-row">
        <AIActionButton className="primary-pill inline-pill" isGenerating={qualityAction === "batch"} disabled={Boolean(qualityAction)} loadingLabel="AI 质检中" onClick={() => void runQualityCheck("batch")}>批量AI质检</AIActionButton>
        <AIActionButton isGenerating={qualityAction === "single"} disabled={Boolean(qualityAction)} loadingLabel="AI 质检中" onClick={() => void runQualityCheck("single")}>单素材质检</AIActionButton>
        <button className="ghost-button inline-button" type="button" onClick={() => markPassed()}>批量标记通过</button>
        <button className="ghost-button inline-button" type="button" onClick={exportReport}>导出报告</button>
        <button className="ghost-button inline-button strong" type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中..." : "保存质检"}</button>
      </div>
      <div className="field-row compact-row">
        <label className="field-label"><span>人工检查项</span><textarea value={form.checklist_note} onChange={(event) => setForm({ ...form, checklist_note: event.target.value })} /></label>
        <label className="field-label"><span>进入视频生成校验</span><textarea value={form.validation_report} onChange={(event) => setForm({ ...form, validation_report: event.target.value })} placeholder="未通过素材会在视频生成前提示。" /></label>
      </div>
      <div className="production-grid">
        {form.reports.map((report) => (
          <article className="panel-card production-card" key={report.id}>
            <strong>{report.shot_label} · {report.category}</strong>
            <span>{report.severity} / {report.status}</span>
            <p>{report.issue}</p>
            <small>{report.suggestion}</small>
            <div className="action-row">
              <button className="ghost-mini-button" type="button" onClick={() => createReworkTask(report)}>生成返工</button>
              <button className="ghost-mini-button" type="button" onClick={() => markPassed(report.id)}>标记通过</button>
              <button className="ghost-mini-button" type="button" onClick={() => void copyTextToClipboard(report.repair_prompt, "返工 prompt 已复制", setStatusMessage)}>复制建议</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StepEightSection({
  project,
  onSaved,
  setStatusMessage,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepEightData>(project.step_eight);
  const [saving, setSaving] = useState(false);
  const [videoGenerationAction, setVideoGenerationAction] = useState<string | null>(null);
  useEffect(() => setForm(project.step_eight), [project.step_eight]);
  const passedReports = project.step_seven.reports.filter((item) => item.status === "passed");
  const usableImages = project.step_six.candidates.filter((item) => item.status === "selected" || item.status === "first-frame" || item.status === "keyframe");
  const visibleClips = form.clips.filter((item) => !form.filter_text || item.shot_label.includes(form.filter_text) || item.status.includes(form.filter_text));

  async function generateVideos(scope: "single" | "batch") {
    if (videoGenerationAction) return;
    const sourceImages = usableImages.filter((image) => !project.step_seven.reports.some((report) => report.asset_id === image.id && report.status !== "passed"));
    const targets = scope === "single" ? sourceImages.slice(0, 1) : sourceImages;
    if (!targets.length) {
      setStatusMessage("请先在步骤六生成并选择通过质检的关键帧。");
      return;
    }
    setVideoGenerationAction(scope);
    setStatusMessage(`正在提交 ${targets.length} 个 MiniMax 视频生成任务...`);
    try {
      const clips: VideoClipItem[] = [];
      for (let index = 0; index < targets.length; index += 1) {
        const image = targets[index];
        const shot = project.step_four.shots.find((candidate) => candidate.id === image.shot_id);
        const duration = shot?.duration_seconds ?? 6;
        const promptRecord = project.step_five.prompts.find((prompt) => prompt.shot_id === image.shot_id);
        const taskResult = await generateProjectTextTask(
          project.name,
          "S08_VIDEO_TASK",
          [
            directorGrammarGuide,
            "视频生成导演约束：继承分镜和 I2V 提示词里的导演意图，明确镜头运动为什么发生、如何承接角色视线、如何揭示信息、如何推进情绪；输出给视频模型的 prompt 和 negative_prompt 必须使用英文。",
            JSON.stringify({
              shot,
              image,
              i2v_prompt: promptRecord?.i2v_prompt,
              negative_prompt: promptRecord?.negative_prompt,
              motion_settings: form.motion_settings,
              reference_bindings: form.reference_bindings,
              qc_reports: project.step_seven.reports.filter((report) => report.asset_id === image.id),
            }, null, 2),
          ].join("\n"),
          { projectId: project.id, targetType: "image", targetId: image.id }
        );
        const taskPayload = firstJsonObject(taskResult.content);
        const motionPrompt = textValue(taskPayload.prompt, `${form.motion_settings}；${promptRecord?.i2v_prompt || image.prompt}`);
        const negativePrompt = textValue(taskPayload.negative_prompt);
        const result = await generateVideoCandidate({
          prompt: [motionPrompt, negativePrompt ? `负面限制：${negativePrompt}` : ""].filter(Boolean).join("\n"),
          shot_id: image.shot_id,
          shot_label: image.shot_label,
          source_image_url: image.url.startsWith("http") ? image.url : null,
          duration_seconds: Math.max(1, Math.round(numberValue(taskPayload.duration_seconds, duration))),
        });
        clips.push({
          id: `clip-${image.id}-${Date.now()}-${index}`,
          shot_id: image.shot_id,
          shot_label: image.shot_label,
          source_image_id: image.id,
          url: "",
          duration_seconds: Math.max(1, Math.round(numberValue(taskPayload.duration_seconds, duration))),
          motion_prompt: motionPrompt,
          reference_note: form.reference_bindings || `首帧绑定：${image.id}`,
          status: "candidate",
          fail_reason: "",
          regeneration_strategy: "缩短时长、保持首帧、降低动作幅度",
          version: `v${form.clips.length + index + 1}`,
          metadata: `${result.provider} / ${result.model}；${result.metadata}；任务状态：${result.status}`,
        });
      }
      setForm((current) => ({ ...current, clips: [...current.clips, ...clips], selected_clip_id: clips[0]?.id ?? current.selected_clip_id }));
      setStatusMessage(`已提交 ${clips.length} 个 MiniMax 视频生成任务。`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "视频生成任务提交失败");
    } finally {
      setVideoGenerationAction(null);
    }
  }

  function updateClip(clipId: string, patch: Partial<VideoClipItem>) {
    setForm((current) => ({ ...current, clips: current.clips.map((item) => item.id === clipId ? { ...item, ...patch } : item) }));
  }

  function markClipStatus(clip: VideoClipItem, patch: Partial<VideoClipItem>, label: string) {
    updateClip(clip.id, patch);
    setStatusMessage(`${clip.shot_label} 已${label}，保存视频后生效。`);
  }

  async function regenerateClip(clip: VideoClipItem) {
    if (videoGenerationAction) return;
    const sourceImage = usableImages.find((image) => image.id === clip.source_image_id);
    setVideoGenerationAction(`regenerate:${clip.id}`);
    setStatusMessage("AI 正在重新提交视频生成任务...");
    try {
      const result = await generateVideoCandidate({
        prompt: `${clip.motion_prompt}\n重生成策略：${clip.regeneration_strategy || "保持首帧一致，修复失败原因。"}\n失败原因：${clip.fail_reason || "未填写"}`,
        shot_id: clip.shot_id,
        shot_label: clip.shot_label,
        source_image_url: sourceImage?.url?.startsWith("http") ? sourceImage.url : null,
        duration_seconds: clip.duration_seconds,
      });
      const next: VideoClipItem = {
        ...clip,
        id: `clip-reg-${clip.id}-${Date.now()}`,
        status: "candidate",
        fail_reason: "",
        version: `${clip.version}-R`,
        url: "",
        metadata: `${result.provider} / ${result.model}；${result.metadata}；任务状态：${result.status}；重生成策略：${clip.regeneration_strategy}`,
      };
      setForm((current) => ({ ...current, clips: [...current.clips, next] }));
      setStatusMessage("已重新提交 MiniMax 视频生成任务，并保留旧版本。");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "视频重生成提交失败");
    } finally {
      setVideoGenerationAction(null);
    }
  }

  async function refreshClipTask(clip: VideoClipItem) {
    if (videoGenerationAction) return;
    const match = clip.metadata.match(/task_id=([^；\s]+)/);
    const taskId = match?.[1];
    if (!taskId) {
      setStatusMessage("该视频记录没有 MiniMax task_id。");
      return;
    }
    setVideoGenerationAction(`refresh:${clip.id}`);
    setStatusMessage("正在查询 MiniMax 视频任务状态...");
    try {
      const result = await fetchVideoTaskStatus(taskId);
      const task = result.task;
      const status = String(task.status ?? task.Status ?? "unknown");
      const file = task.file as Record<string, unknown> | undefined;
      const downloadUrl =
        typeof file?.download_url === "string"
          ? file.download_url
          : typeof file?.url === "string"
            ? file.url
            : typeof task.video_url === "string"
              ? task.video_url
              : "";
      updateClip(clip.id, {
        url: downloadUrl || clip.url,
        metadata: `${clip.metadata}；查询状态：${status}${downloadUrl ? "；已回填视频下载地址" : ""}`,
      });
      setStatusMessage(downloadUrl ? "视频任务已完成，已回填下载地址。" : `视频任务状态：${status}`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "视频任务查询失败");
    } finally {
      setVideoGenerationAction(null);
    }
  }

  function checkIntegrity() {
    const shotIds = new Set(project.step_four.shots.map((shot) => shot.id));
    const finalShotIds = new Set(form.clips.filter((clip) => clip.status === "final").map((clip) => clip.shot_id));
    const missing = Array.from(shotIds).filter((id) => !finalShotIds.has(id));
    const report = missing.length ? `缺少 ${missing.length} 个镜头的最终片段：${missing.join("、")}` : "每个镜头都已有最终视频片段，可进入音频字幕。";
    setForm((current) => ({ ...current, integrity_report: report, validation_report: report }));
    setStatusMessage(report);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveStepEight(project.id, form);
      onSaved(saved, "步骤八视频生成已保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor-section" id="video-generation">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤八</span>
          <h2>视频生成</h2>
          <p>绑定通过质检的关键帧，生成候选视频、记录失败原因、重生成策略并选择最终片段。</p>
        </div>
        <div className="chip-row"><span className="ghost-chip">候选视频 {form.clips.length}</span><span className="ghost-chip">最终 {form.clips.filter((item) => item.status === "final").length}</span></div>
      </div>
      <div className="action-row">
        <input value={form.filter_text} onChange={(event) => setForm({ ...form, filter_text: event.target.value })} placeholder="筛选镜头/状态" />
        <AIActionButton className="primary-pill inline-pill" isGenerating={videoGenerationAction === "batch"} disabled={Boolean(videoGenerationAction)} loadingLabel="视频批量提交中" onClick={() => void generateVideos("batch")}>批量生成视频</AIActionButton>
        <AIActionButton isGenerating={videoGenerationAction === "single"} disabled={Boolean(videoGenerationAction)} loadingLabel="单镜提交中" onClick={() => void generateVideos("single")}>单镜视频</AIActionButton>
        <button className="ghost-button inline-button" type="button" onClick={checkIntegrity}>完整性检查</button>
        <button className="ghost-button inline-button strong" type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中..." : "保存视频"}</button>
      </div>
      <div className="field-row compact-row">
        <label className="field-label"><span>动作运镜参数</span><textarea value={form.motion_settings} onChange={(event) => setForm({ ...form, motion_settings: event.target.value })} /></label>
        <label className="field-label"><span>参考素材绑定</span><textarea value={form.reference_bindings} onChange={(event) => setForm({ ...form, reference_bindings: event.target.value })} /></label>
      </div>
      {form.validation_report ? <div className="hint-text">{form.validation_report}</div> : null}
      <div className="production-grid">
        {visibleClips.map((clip) => (
          <article className="panel-card production-card" key={clip.id}>
            <strong>{clip.shot_label} · {clip.version}</strong>
            <span>{clip.duration_seconds}s / {clip.status}</span>
            <p>{clip.motion_prompt}</p>
            <small>{clip.metadata}</small>
            <input value={clip.fail_reason} onChange={(event) => updateClip(clip.id, { fail_reason: event.target.value })} placeholder="失败原因：人物变形/动作错/镜头不符" />
            <div className="action-row">
              <button className="ghost-mini-button" type="button" onClick={() => markClipStatus(clip, { status: "final" }, "设为最终视频片段")}>设为最终</button>
              <button className="ghost-mini-button" type="button" onClick={() => markClipStatus(clip, { status: "failed", fail_reason: clip.fail_reason || "人工标记失败" }, "标记失败")}>标记失败</button>
              <AIActionButton
                className="ghost-mini-button"
                isGenerating={videoGenerationAction === `refresh:${clip.id}`}
                disabled={Boolean(videoGenerationAction)}
                loadingLabel="查询中"
                onClick={() => void refreshClipTask(clip)}
              >
                查询状态
              </AIActionButton>
              <AIActionButton
                className="ghost-mini-button"
                isGenerating={videoGenerationAction === `regenerate:${clip.id}`}
                disabled={Boolean(videoGenerationAction)}
                loadingLabel="提交中"
                onClick={() => void regenerateClip(clip)}
              >
                重生成
              </AIActionButton>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StepNineSection({
  project,
  onSaved,
  setStatusMessage,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepNineData>(project.step_nine);
  const [saving, setSaving] = useState(false);
  const [audioAction, setAudioAction] = useState<string | null>(null);
  useEffect(() => setForm(project.step_nine), [project.step_nine]);

  async function extractDialogue() {
    if (audioAction) return;
    setAudioAction("dialogue");
    setStatusMessage("AI 正在提取台词...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S09_DIALOGUE_EXTRACT",
        [
          "剧本：",
          project.step_two.script_text || project.step_two.novel_text,
          "分镜：",
          JSON.stringify(project.step_four.shots, null, 2),
        ].join("\n"),
        { projectId: project.id, targetType: "dialogue" }
      );
      const parsed = parseStrictJsonOutput(result.content);
      const lines = listValue(parsed.dialogue_lines)
        .flatMap((item, index): DialogueLine[] => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          const shotId = textValue(record.shot_id) || project.step_four.shots[index]?.id || "";
          const shot = project.step_four.shots.find((candidate) => candidate.id === shotId);
          return [{
            id: `line-ai-${Date.now()}-${index}`,
            shot_id: shotId,
            shot_label: shot ? `第${shot.episode_number}集 #${shot.shot_number}` : textValue(record.shot_label, `台词 ${index + 1}`),
            speaker: textValue(record.speaker, "旁白"),
            text: textValue(record.text, "待补充台词"),
            emotion: textValue(record.emotion, "自然"),
            pause_seconds: numberValue(record.pause_seconds, 0.4),
            audio_status: "pending" as const,
          }];
        });
      if (!lines.length) {
        setStatusMessage("AI 返回格式异常，未提取到台词。");
        return;
      }
      setForm((current) => ({ ...current, dialogue_lines: lines }));
      setStatusMessage(`AI 已提取 ${lines.length} 条台词/旁白`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 台词提取失败");
    } finally {
      setAudioAction(null);
    }
  }

  async function generateAudio(includeNarration = false) {
    if (audioAction) return;
    setAudioAction(includeNarration ? "narration" : "voice");
    setStatusMessage(includeNarration ? "AI 正在生成旁白/配音规划..." : "AI 正在生成配音规划...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S09_VOICE_PROFILE",
        JSON.stringify({ includeNarration, dialogue_lines: form.dialogue_lines, characters: project.step_three.characters }, null, 2),
        { projectId: project.id, targetType: includeNarration ? "narration" : "voice" }
      );
      const parsed = firstJsonObject(result.content);
      const profiles = listValue(parsed.voice_profiles)
        .map((item, index) => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          return {
            id: `voice-ai-${Date.now()}-${index}`,
            character: textValue(record.character, `角色${index + 1}`),
            tone: textValue(record.tone, "自然"),
            speed: textValue(record.speed, "中速"),
            emotion_strength: textValue(record.emotion_strength, "中"),
          };
        })
        .filter((item): item is VoiceProfile => Boolean(item));
      setForm((current) => ({
        ...current,
        voice_profiles: profiles.length ? profiles : current.voice_profiles,
        dialogue_lines: current.dialogue_lines.map((line) => includeNarration || line.speaker !== "旁白" ? { ...line, audio_status: "generated" } : line),
        lip_sync_tasks: current.dialogue_lines.map((line) => `AI 口型同步任务：${line.shot_label} / ${line.speaker}`),
      }));
      setStatusMessage(includeNarration ? "AI 旁白与对白规划已生成" : "AI 角色配音规划已生成");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 配音规划失败");
    } finally {
      setAudioAction(null);
    }
  }

  async function generateSubtitles() {
    if (audioAction) return;
    setAudioAction("subtitle");
    setStatusMessage("AI 正在生成字幕时间轴...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S09_SUBTITLE_TIMELINE",
        JSON.stringify({ dialogue_lines: form.dialogue_lines, clips: project.step_eight.clips, subtitle_style: form.subtitle_style }, null, 2),
        { projectId: project.id, targetType: "subtitle" }
      );
      const parsed = firstJsonObject(result.content);
      const cues = listValue(parsed.subtitle_cues)
        .map((item, index) => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          return {
            id: `sub-ai-${Date.now()}-${index}`,
            shot_id: textValue(record.shot_id, form.dialogue_lines[index]?.shot_id ?? ""),
            start_seconds: numberValue(record.start_seconds, index * 2),
            end_seconds: numberValue(record.end_seconds, index * 2 + 1.8),
            text: textValue(record.text, form.dialogue_lines[index]?.text ?? ""),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      setForm((current) => ({ ...current, subtitle_cues: cues }));
      setStatusMessage(`AI 已生成 ${cues.length} 条字幕。`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 字幕生成失败");
    } finally {
      setAudioAction(null);
    }
  }

  async function addSoundEffect() {
    if (audioAction) return;
    setAudioAction("sound");
    setStatusMessage("AI 正在生成音效任务建议...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S09_SOUND_EFFECTS",
        JSON.stringify({ shots: project.step_four.shots, dialogue_lines: form.dialogue_lines, clips: project.step_eight.clips }, null, 2),
        { projectId: project.id, targetType: "sound" }
      );
      const parsed = firstJsonObject(result.content);
      const soundEffects = listValue(parsed.sound_effects)
        .flatMap((item, index) => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          const type = textValue(record.type, "环境音");
          return [{
            id: `sfx-ai-${Date.now()}-${index}`,
            shot_label: textValue(record.shot_label, form.dialogue_lines[index]?.shot_label || "全片"),
            type: (["环境音", "动作音效", "转场音效"].includes(type) ? type : "环境音") as "环境音" | "动作音效" | "转场音效",
            description: textValue(record.description, "AI 生成音效任务建议"),
            volume: Math.max(0, Math.min(100, Math.round(numberValue(record.volume, 55)))),
          }];
        });
      if (!soundEffects.length) {
        setStatusMessage("AI 返回格式异常，未生成音效建议。");
        return;
      }
      setForm((current) => ({
        ...current,
        sound_effects: [...current.sound_effects, ...soundEffects],
        mix_settings: textValue(parsed.mix_notes, current.mix_settings),
      }));
      setStatusMessage(`AI 已生成 ${soundEffects.length} 条音效任务建议，后续仍需制作或导入真实音频素材。`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 音效任务建议生成失败");
    } finally {
      setAudioAction(null);
    }
  }

  function checkAudioSubtitle() {
    const missingAudio = form.dialogue_lines.filter((line) => line.audio_status !== "generated").length;
    const missingSubtitles = Math.max(0, form.dialogue_lines.length - form.subtitle_cues.length);
    const report = missingAudio || missingSubtitles ? `缺失配音 ${missingAudio} 条，缺失字幕 ${missingSubtitles} 条，可继续但有风险。` : "配音与字幕完整，可进入剪辑成片。";
    setForm((current) => ({ ...current, validation_report: report }));
    setStatusMessage(report);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveStepNine(project.id, form);
      onSaved(saved, "步骤九音频字幕已保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor-section" id="audio-subtitle">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤九</span>
          <h2>音频字幕</h2>
          <p>从剧本和分镜提取台词，生成配音、旁白、字幕、音效、BGM、混音和口型同步任务。</p>
        </div>
        <div className="chip-row"><span className="ghost-chip">台词 {form.dialogue_lines.length}</span><span className="ghost-chip">字幕 {form.subtitle_cues.length}</span></div>
      </div>
      <div className="action-row">
        <AIActionButton className="primary-pill inline-pill" isGenerating={audioAction === "dialogue"} disabled={Boolean(audioAction)} loadingLabel="AI 提取中" onClick={() => void extractDialogue()}>提取台词</AIActionButton>
        <AIActionButton isGenerating={audioAction === "voice"} disabled={Boolean(audioAction)} loadingLabel="AI 规划中" onClick={() => void generateAudio(false)}>生成配音</AIActionButton>
        <AIActionButton isGenerating={audioAction === "narration"} disabled={Boolean(audioAction)} loadingLabel="AI 规划中" onClick={() => void generateAudio(true)}>生成旁白</AIActionButton>
        <AIActionButton isGenerating={audioAction === "subtitle"} disabled={Boolean(audioAction)} loadingLabel="AI 字幕中" onClick={() => void generateSubtitles()}>生成字幕</AIActionButton>
        <AIActionButton isGenerating={audioAction === "sound"} disabled={Boolean(audioAction)} loadingLabel="AI 音效建议中" onClick={() => void addSoundEffect()}>生成音效建议</AIActionButton>
        <button className="ghost-button inline-button" type="button" onClick={checkAudioSubtitle}>完整性检查</button>
        <button className="ghost-button inline-button strong" type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中..." : "保存音频字幕"}</button>
      </div>
      <div className="field-row compact-row">
        <label className="field-label"><span>字幕样式</span><textarea value={form.subtitle_style} onChange={(event) => setForm({ ...form, subtitle_style: event.target.value })} /></label>
        <label className="field-label"><span>BGM 设置</span><textarea value={form.bgm_settings} onChange={(event) => setForm({ ...form, bgm_settings: event.target.value })} /></label>
        <label className="field-label"><span>混音参数</span><textarea value={form.mix_settings} onChange={(event) => setForm({ ...form, mix_settings: event.target.value })} /></label>
      </div>
      {form.validation_report ? <div className="hint-text">{form.validation_report}</div> : null}
      <div className="production-grid">
        {form.dialogue_lines.map((line) => (
          <article className="panel-card production-card" key={line.id}>
            <strong>{line.shot_label} · {line.speaker}</strong>
            <span>{line.emotion} / {line.audio_status}</span>
            <p>{line.text}</p>
            <small>暂停 {line.pause_seconds}s；音频状态：{line.audio_status === "generated" ? "AI 配音规划已生成" : "待生成"}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function StepTenSection({
  project,
  onSaved,
  setStatusMessage,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepTenData>(project.step_ten);
  const [saving, setSaving] = useState(false);
  const [editingAction, setEditingAction] = useState<string | null>(null);
  useEffect(() => setForm(project.step_ten), [project.step_ten]);

  async function autoArrange() {
    if (editingAction) return;
    setEditingAction("timeline");
    setStatusMessage("AI 正在编排时间线...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S10_TIMELINE",
        JSON.stringify({ videos: project.step_eight.clips, audio_subtitle: project.step_nine, transition_settings: form.transition_settings }, null, 2),
        { projectId: project.id, targetType: "timeline" }
      );
      const parsed = firstJsonObject(result.content);
      const timelineClips = listValue(parsed.timeline_clips)
        .map((item, index) => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          const track = textValue(record.track, "video");
          return {
            id: textValue(record.id) || `tl-ai-${Date.now()}-${index}`,
            track: (["video", "audio", "subtitle", "effect"].includes(track) ? track : "video") as TimelineClip["track"],
            name: textValue(record.name, `片段 ${index + 1}`),
            source_id: textValue(record.source_id),
            start_seconds: numberValue(record.start_seconds, index * 3),
            end_seconds: numberValue(record.end_seconds, index * 3 + 3),
            transition: textValue(record.transition, "硬切"),
            notes: textValue(record.notes),
          };
        })
        .filter((item): item is TimelineClip => Boolean(item));
      const exportVersions: ExportVersion[] = ["正片版", "竖版", "横版", "预告版"].map((format) => ({ id: `export-${format}`, format: format as ExportVersion["format"], status: "draft", settings: `${format} / 1080p / H.264` }));
      setForm((current) => ({
        ...current,
        timeline_clips: timelineClips,
        export_versions: exportVersions,
        rhythm_marks: splitTextLines(parsed.rhythm_marks),
        package_checklist: textValue(parsed.package_checklist, `AI 已编排 ${timelineClips.length} 个时间线片段`),
        validation_report: splitTextLines(parsed.blocking_issues).join("\n"),
      }));
      setStatusMessage(`AI 已编排 ${timelineClips.length} 个时间线片段。`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 自动编排失败");
    } finally {
      setEditingAction(null);
    }
  }

  async function checkAlignment() {
    if (editingAction) return;
    setEditingAction("qc");
    setStatusMessage("AI 正在检查音画字幕...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S10_EDIT_QC",
        JSON.stringify({ timeline_clips: form.timeline_clips, subtitles: project.step_nine.subtitle_cues, videos: project.step_eight.clips }, null, 2),
        { projectId: project.id, targetType: "timeline" }
      );
      const parsed = firstJsonObject(result.content);
      const report = textValue(parsed.edit_qc_report, result.content);
      const issues = splitTextLines(parsed.issues).join("\n");
      setForm((current) => ({ ...current, edit_qc_report: report, validation_report: issues || report }));
      setStatusMessage("AI 音画字幕检查已完成。");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 音画字幕检查失败");
    } finally {
      setEditingAction(null);
    }
  }

  function createExportTask() {
    setForm((current) => ({ ...current, export_versions: current.export_versions.map((item) => ({ ...item, status: item.status === "draft" ? "queued" : item.status })) }));
    setStatusMessage("导出任务已创建，可追踪横版/竖版/预告版/正片版");
  }

  async function addCoverCandidate() {
    if (editingAction) return;
    const source = project.step_six.candidates.find((item) => item.status === "selected" || item.status === "keyframe" || item.status === "first-frame");
    setEditingAction("cover");
    setStatusMessage("AI 正在生成封面候选...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S10_COVER_TITLE",
        JSON.stringify({ source_image: source, story: project.step_one, script: project.step_two.script_text }, null, 2),
        { projectId: project.id, targetType: "cover", targetId: source?.id }
      );
      const parsed = firstJsonObject(result.content);
      const rawCover = listValue(parsed.cover_candidates)[0];
      const cover = rawCover && typeof rawCover === "object" ? rawCover as Record<string, unknown> : parsed;
      setForm((current) => ({
        ...current,
        cover_candidates: [
          ...current.cover_candidates,
          {
            id: `cover-ai-${Date.now()}`,
            image_url: source?.url || "/images/hero-role-rin.png",
            title: textValue(cover.title, project.name),
            subtitle: textValue(cover.subtitle, textValue(cover.description, "高能反转，即刻开场")),
            tags: splitTextLines(cover.tags).join(",") || "高能,反转,短剧",
            selected: current.cover_candidates.length === 0,
          },
        ],
      }));
      setStatusMessage("AI 封面候选已生成。");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 封面候选生成失败");
    } finally {
      setEditingAction(null);
    }
  }

  function validatePublishPackage() {
    const hasExport = form.export_versions.some((item) => item.status === "queued" || item.status === "exported");
    const hasCover = form.cover_candidates.some((item) => item.selected);
    const report = hasExport && hasCover ? "发布素材包完整，可进入发布复盘。" : `缺少${hasExport ? "" : "导出版本"}${!hasExport && !hasCover ? "、" : ""}${hasCover ? "" : "默认封面"}。`;
    setForm((current) => ({ ...current, validation_report: report, package_checklist: `${current.package_checklist}\n${report}`.trim() }));
    setStatusMessage(report);
  }

  function selectDefaultCover(cover: CoverCandidate) {
    setForm((current) => ({ ...current, cover_candidates: current.cover_candidates.map((item) => ({ ...item, selected: item.id === cover.id })) }));
    setStatusMessage(`已设为默认封面：${cover.title}`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveStepTen(project.id, form);
      onSaved(saved, "步骤十剪辑成片已保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor-section" id="final-editing">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤十</span>
          <h2>剪辑成片</h2>
          <p>把视频、音频、字幕、转场、节奏点、导出版本和封面候选整合成发布素材包。</p>
        </div>
        <div className="chip-row"><span className="ghost-chip">时间线 {form.timeline_clips.length}</span><span className="ghost-chip">导出 {form.export_versions.length}</span></div>
      </div>
      <div className="action-row">
        <AIActionButton className="primary-pill inline-pill" isGenerating={editingAction === "timeline"} disabled={Boolean(editingAction)} loadingLabel="AI 编排中" onClick={() => void autoArrange()}>自动编排</AIActionButton>
        <AIActionButton isGenerating={editingAction === "qc"} disabled={Boolean(editingAction)} loadingLabel="AI 检查中" onClick={() => void checkAlignment()}>音画字幕检查</AIActionButton>
        <button className="ghost-button inline-button" type="button" onClick={createExportTask}>创建导出任务</button>
        <AIActionButton isGenerating={editingAction === "cover"} disabled={Boolean(editingAction)} loadingLabel="AI 封面中" onClick={() => void addCoverCandidate()}>新增封面候选</AIActionButton>
        <button className="ghost-button inline-button" type="button" onClick={validatePublishPackage}>进入发布校验</button>
        <button className="ghost-button inline-button strong" type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中..." : "保存剪辑"}</button>
      </div>
      <div className="field-row compact-row">
        <label className="field-label"><span>转场设置</span><textarea value={form.transition_settings} onChange={(event) => setForm({ ...form, transition_settings: event.target.value })} /></label>
        <label className="field-label"><span>剪辑质检</span><textarea value={form.edit_qc_report} onChange={(event) => setForm({ ...form, edit_qc_report: event.target.value })} placeholder="字幕遮挡、声音错位、黑帧、跳帧、穿帮" /></label>
      </div>
      {form.validation_report ? <div className="hint-text">{form.validation_report}</div> : null}
      <div className="production-grid">
        {form.timeline_clips.map((clip) => (
          <article className="panel-card production-card" key={clip.id}>
            <strong>{clip.track} · {clip.name}</strong>
            <span>{clip.start_seconds}s - {clip.end_seconds}s / {clip.transition}</span>
            <p>{clip.notes}</p>
          </article>
        ))}
        {form.cover_candidates.map((cover) => (
          <article className="panel-card production-card" key={cover.id}>
            <img src={cover.image_url} alt={cover.title} />
            <strong>{cover.title}</strong>
            <span>{cover.subtitle}</span>
            <button className="ghost-mini-button" type="button" onClick={() => selectDefaultCover(cover)}>设为默认封面</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function StepElevenSection({
  project,
  onSaved,
  setStatusMessage,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepElevenData>(project.step_eleven);
  const [saving, setSaving] = useState(false);
  const [publishAction, setPublishAction] = useState<string | null>(null);
  useEffect(() => setForm(project.step_eleven), [project.step_eleven]);

  async function generatePublishCopy() {
    if (publishAction) return;
    const cover = project.step_ten.cover_candidates.find((item) => item.selected);
    setPublishAction("copy");
    setStatusMessage("AI 正在生成发布文案...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S11_PUBLISH_COPY",
        JSON.stringify({ cover, story: project.step_one, script: project.step_two.script_text, package: project.step_ten }, null, 2),
        { projectId: project.id, targetType: "publish_copy" }
      );
      const parsed = firstJsonObject(result.content);
      const copy = textValue(parsed.publish_copy) ||
        [
          `标题：${textValue(parsed.title, cover?.title || project.name)}`,
          `简介：${textValue(parsed.description)}`,
          `标签：${splitTextLines(parsed.tags).join(",")}`,
          `话题：${splitTextLines(parsed.topics).join(" ")}`,
          `置顶评论：${textValue(parsed.comment_pin)}`,
        ].filter((line) => line.replace(/^[^：]+：/, "").trim()).join("\n");
      setForm((current) => ({ ...current, publish_copy: copy || result.content }));
      setStatusMessage("AI 发布文案已生成");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 发布文案生成失败");
    } finally {
      setPublishAction(null);
    }
  }

  function addPlatformRecord() {
    setForm((current) => ({
      ...current,
      publish_records: [...current.publish_records, { id: `pub-${Date.now()}`, platform: "抖音", publish_time: new Date().toLocaleString(), version: "竖版", title: project.name, cover: "默认封面" }],
      metrics: [...current.metrics, { id: `metric-${Date.now()}`, platform: "抖音", plays: 12000, completion_rate: 62, likes: 820, comments: 96, favorites: 310, shares: 124, followers: 88 }],
    }));
    setStatusMessage("已新增发布记录与数据占位，请按真实平台数据手动修改。");
  }

  function summarizeMetrics(metrics = form.metrics) {
    const plays = metrics.reduce((sum, item) => sum + item.plays, 0);
    const interactions = metrics.reduce((sum, item) => sum + item.likes + item.comments + item.favorites + item.shares, 0);
    const avgCompletion = metrics.length ? metrics.reduce((sum, item) => sum + item.completion_rate, 0) / metrics.length : 0;
    return { plays, interactions, avgCompletion, followers: metrics.reduce((sum, item) => sum + item.followers, 0) };
  }

  function pausePlatformDataImport() {
    setStatusMessage("平台数据导入/导出暂未启用，请先手动录入真实数据；AI 不生成数据占位。");
  }

  async function generateReviewReport() {
    if (publishAction) return;
    const summary = summarizeMetrics();
    setPublishAction("review");
    setStatusMessage("AI 正在生成复盘报告...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S11_REVIEW_REPORT",
        JSON.stringify({ metrics: form.metrics, summary, publish_copy: form.publish_copy, package: project.step_ten }, null, 2),
        { projectId: project.id, targetType: "review" }
      );
      const parsed = firstJsonObject(result.content);
      const tasks = listValue(parsed.optimization_tasks)
        .flatMap((item, index): OptimizationTask[] => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          const priority = textValue(record.priority, "中");
          return [{
            id: `opt-ai-${Date.now()}-${index}`,
            target_step: textValue(record.target_step, "script-creation") as OptimizationTask["target_step"],
            issue: textValue(record.issue, "待优化问题"),
            suggestion: textValue(record.suggestion, "请人工复核优化方向。"),
            priority: (["低", "中", "高"].includes(priority) ? priority : "中") as OptimizationTask["priority"],
            status: "todo" as const,
          }];
        });
      setForm((current) => ({
        ...current,
        review_report: textValue(parsed.review_report, result.content),
        retention_analysis: textValue(parsed.retention_analysis) || textValue(parsed.good_elements),
        comment_summary: textValue(parsed.comment_summary) || textValue(parsed.needs_improvement),
        optimization_tasks: [...current.optimization_tasks, ...tasks],
        next_episode_suggestions: textValue(parsed.next_episode_suggestions, current.next_episode_suggestions),
      }));
      setStatusMessage("AI 复盘报告已生成");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 复盘报告生成失败");
    } finally {
      setPublishAction(null);
    }
  }

  async function generateNextEpisode() {
    if (publishAction) return;
    setPublishAction("next");
    setStatusMessage("AI 正在生成下一集建议...");
    try {
      const result = await generateProjectTextTask(
        project.name,
        "S11_NEXT_EPISODE",
        JSON.stringify({ current_story: project.step_one, review_report: form.review_report, metrics: form.metrics, target: "next_episode_suggestions" }, null, 2),
        { projectId: project.id, targetType: "next_episode" }
      );
      const parsed = firstJsonObject(result.content);
      setForm((current) => ({ ...current, next_episode_suggestions: textValue(parsed.next_episode_suggestions, result.content) }));
      setStatusMessage("AI 下一集建议已生成");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 下一集建议生成失败");
    } finally {
      setPublishAction(null);
    }
  }

  function exportReview() {
    const text = [form.publish_copy, form.review_report, form.next_episode_suggestions].filter(Boolean).join("\n\n");
    void copyTextToClipboard(text || "暂无复盘内容", "发布复盘报告已复制", setStatusMessage);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveStepEleven(project.id, form);
      onSaved(saved, "步骤十一发布复盘已保存");
    } finally {
      setSaving(false);
    }
  }

  const metricSummary = summarizeMetrics();

  return (
    <section className="editor-section" id="publish-review">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤十一</span>
          <h2>发布复盘</h2>
          <p>生成发布文案，记录平台适配和发布数据，形成复盘报告、优化任务和下一集建议。</p>
        </div>
        <div className="chip-row"><span className="ghost-chip">播放 {metricSummary.plays}</span><span className="ghost-chip">完播 {metricSummary.avgCompletion.toFixed(1)}%</span></div>
      </div>
      <div className="action-row">
        <AIActionButton className="primary-pill inline-pill" isGenerating={publishAction === "copy"} disabled={Boolean(publishAction)} loadingLabel="AI 文案中" onClick={() => void generatePublishCopy()}>生成发布文案</AIActionButton>
        <button className="ghost-button inline-button" type="button" onClick={addPlatformRecord}>新增发布记录</button>
        <button className="ghost-button inline-button" type="button" onClick={pausePlatformDataImport}>平台数据暂不导入</button>
        <AIActionButton isGenerating={publishAction === "review"} disabled={Boolean(publishAction)} loadingLabel="AI 复盘中" onClick={() => void generateReviewReport()}>生成复盘报告</AIActionButton>
        <AIActionButton isGenerating={publishAction === "next"} disabled={Boolean(publishAction)} loadingLabel="AI 建议中" onClick={() => void generateNextEpisode()}>下一集建议</AIActionButton>
        <button className="ghost-button inline-button" type="button" onClick={exportReview}>导出复盘</button>
        <button className="ghost-button inline-button strong" type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中..." : "保存复盘"}</button>
      </div>
      <div className="field-row compact-row">
        <label className="field-label"><span>发布文案</span><textarea value={form.publish_copy} onChange={(event) => setForm({ ...form, publish_copy: event.target.value })} /></label>
        <label className="field-label"><span>平台适配</span><textarea value={form.platform_adaptations} onChange={(event) => setForm({ ...form, platform_adaptations: event.target.value })} /></label>
        <label className="field-label"><span>项目状态</span><select value={form.project_completion_status} onChange={(event) => setForm({ ...form, project_completion_status: event.target.value as StepElevenData["project_completion_status"] })}><option value="进行中">进行中</option><option value="已完结">已完结</option><option value="进入下一轮">进入下一轮</option></select></label>
      </div>
      <div className="production-grid">
        <article className="panel-card production-card"><strong>平台数据汇总</strong><span>互动 {metricSummary.interactions} / 转粉 {metricSummary.followers}</span><p>{form.data_import_note || "等待手动录入或导入平台数据。"}</p></article>
        <article className="panel-card production-card"><strong>留存分析</strong><p>{form.retention_analysis || "待生成留存分析。"}</p></article>
        <article className="panel-card production-card"><strong>评论反馈</strong><p>{form.comment_summary || "待整理高赞评论、负面反馈和角色偏好。"}</p></article>
        <article className="panel-card production-card"><strong>复盘报告</strong><p>{form.review_report || "待生成亮点、问题和优化方向。"}</p></article>
        {form.optimization_tasks.map((task) => (
          <article className="panel-card production-card" key={task.id}>
            <strong>{task.priority}优先级 · 回流 {task.target_step}</strong>
            <span>{task.status}</span>
            <p>{task.issue}</p>
            <small>{task.suggestion}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function renderWorkflowWatermark(stepNo: string) {
  switch (stepNo) {
    case "01":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <circle cx="134" cy="92" r="54" />
          <circle cx="134" cy="92" r="28" />
          <path d="M84 92 H186" />
          <path d="M134 42 V142" />
          <path d="M98 56 L170 128" />
        </svg>
      );
    case "02":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <path d="M84 48 H164 L182 68 V156 H84 Z" />
          <path d="M164 48 V68 H182" />
          <path d="M102 92 H162" />
          <path d="M102 114 H154" />
          <path d="M102 136 H146" />
        </svg>
      );
    case "03":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <rect x="78" y="58" width="98" height="66" rx="16" />
          <path d="M92 76 H162" />
          <path d="M92 92 H150" />
          <path d="M92 108 H142" />
          <path d="M100 142 H154" />
        </svg>
      );
    case "04":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <circle cx="132" cy="86" r="26" />
          <path d="M88 146 C96 118, 118 108, 132 108 C146 108, 168 118, 176 146" />
          <path d="M82 52 C100 38, 124 32, 150 36" />
        </svg>
      );
    case "05":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <path d="M84 90 H170" />
          <path d="M84 114 H154" />
          <path d="M84 138 H138" />
          <path d="M154 78 L182 102 L154 126" />
        </svg>
      );
    case "06":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <path d="M124 58 V126" />
          <rect x="104" y="52" width="40" height="80" rx="20" />
          <path d="M88 96 C88 120, 100 140, 124 144 C148 140, 160 120, 160 96" />
          <path d="M124 144 V170" />
        </svg>
      );
    case "07":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <path d="M82 124 H182" />
          <circle cx="98" cy="124" r="10" />
          <circle cx="132" cy="124" r="10" />
          <circle cx="166" cy="124" r="10" />
          <path d="M82 92 H150" />
        </svg>
      );
    case "08":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <rect x="90" y="56" width="30" height="30" rx="8" />
          <rect x="132" y="56" width="30" height="30" rx="8" />
          <rect x="90" y="98" width="30" height="30" rx="8" />
          <rect x="132" y="98" width="30" height="30" rx="8" />
          <path d="M126 142 H176" />
        </svg>
      );
    case "09":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <path d="M124 58 V126" />
          <rect x="104" y="52" width="40" height="80" rx="20" />
          <path d="M88 96 C88 120, 100 140, 124 144 C148 140, 160 120, 160 96" />
          <path d="M124 144 V170" />
        </svg>
      );
    case "10":
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <path d="M82 124 H182" />
          <circle cx="98" cy="124" r="10" />
          <circle cx="132" cy="124" r="10" />
          <circle cx="166" cy="124" r="10" />
          <path d="M82 92 H150" />
        </svg>
      );
    case "11":
    default:
      return (
        <svg viewBox="0 0 220 220" role="presentation">
          <path d="M86 150 L114 120 L138 132 L176 88" />
          <path d="M166 88 H176 V98" />
          <path d="M84 164 H182" />
          <path d="M84 164 V72" />
        </svg>
      );
  }
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}
