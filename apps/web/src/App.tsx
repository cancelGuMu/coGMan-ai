import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
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
  generateStepOneOutline,
  generateStepTwoContent,
  importTextFile,
  renameProject,
  saveStepOne,
  saveStepTwo,
  updateProjectCover,
} from "./api";
import { defaultStepOneData, defaultStepTwoData, mergeProjectDefaults, workflowSteps } from "./data";
import { assertImportableFile, buildStepOneChunks, buildStepTwoChunks, mergeChunkResults } from "./payload";
import type {
  DashboardOverview,
  DashboardRange,
  EpisodeDraft,
  ProjectRecord,
  ProjectSummary,
  StepCompletionStatus,
  StepOneData,
  StepTwoData,
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
            headerDescription="步骤一与步骤二已经正式融入创作中心，步骤三到步骤十一的页面骨架、导航入口与占位区块也已同步搭好。"
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
                          onClick={() => setSelectedProjectId(item.id)}
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

        <div className="status-banner">{statusMessage}</div>

        {activeStep.id === "story-structure" ? (
          <StepOneSection
            project={project}
            onSaved={(nextProject, message) => {
              onProjectSaved(mergeProjectDefaults(nextProject), message);
            }}
            setStatusMessage={setStatusMessage}
          />
        ) : null}

        {activeStep.id === "script-creation" ? (
          <StepTwoSection
            project={project}
            onSaved={(nextProject, message) => {
              onProjectSaved(mergeProjectDefaults(nextProject), message);
            }}
            setStatusMessage={setStatusMessage}
          />
        ) : null}

        {activeStep.id !== "story-structure" && activeStep.id !== "script-creation" ? (
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
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepOneData>(project.step_one);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

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
      setStatusMessage(`已导入文件：${result.filename}`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "导入失败");
    }
  }

  async function handleGenerateOutline() {
    setStatusMessage("AI 正在生成季纲草案...");
    try {
      const chunks = buildStepOneChunks(form.core_story_idea);
      const partials: string[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        setStatusMessage(`AI 正在生成第 ${index + 1}/${chunks.length} 段季纲...`);
        const result = await generateStepOneOutline(form.project_name || project.name, chunks[index]);
        partials.push(result.content);
      }
      const lines = mergeChunkResults(partials)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line)
        .slice(0, form.episodes.length);

      setIsDirty(true);
      const mergedOutline = mergeChunkResults(partials);
      setForm((current) => ({
        ...current,
        season_outline: mergedOutline,
        episodes: current.episodes.map((episode, index) => ({
          ...episode,
          content: lines[index] ?? episode.content,
          hook: episode.hook || `第 ${episode.episode_number} 集结尾留出关键钩子`,
        })),
      }));
      setStatusMessage("AI 已生成季纲草案，你可以继续逐集编辑。");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 生成失败");
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

  return (
    <section className="editor-section" id="story-structure">
      <div className="section-headline">
        <div>
          <span className="eyebrow">步骤一</span>
          <h2>故事架构</h2>
          <p>支持从未关联项目状态开始填写，保存后自动创建项目并完成关联，同时回显故事骨架与季纲内容。</p>
        </div>
        <div className="chip-row">
          <span className="ghost-chip">项目关联：{form.linked_project ? "已关联" : "未关联"}</span>
          <span className="ghost-chip">总集数：{stats.total}</span>
          <span className="ghost-chip">内容完成：{stats.contentDone}</span>
          <span className="ghost-chip">钩子完成：{stats.hookDone}</span>
        </div>
      </div>

      <div className="story-foundation-grid">
        <div className="panel-card">
          <h3>项目基础信息</h3>
          <div className="field-row compact-row">
            <label className="field-label">
              <span>题材类型</span>
              <input value={form.genre} onChange={(event) => updateForm({ ...form, genre: event.target.value })} placeholder="例如：都市异能、古风武侠" />
            </label>
            <label className="field-label">
              <span>目标受众</span>
              <input value={form.target_audience} onChange={(event) => updateForm({ ...form, target_audience: event.target.value })} placeholder="例如：18-30 岁短剧用户" />
            </label>
            <label className="field-label">
              <span>目标平台</span>
              <input value={form.target_platform} onChange={(event) => updateForm({ ...form, target_platform: event.target.value })} placeholder="例如：抖音 / 快手 / B站" />
            </label>
          </div>
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
              value={form.core_story_idea}
              onChange={(event) => updateForm({ ...form, core_story_idea: event.target.value })}
              placeholder="输入核心故事思路，或导入 .txt / .md / .docx 文件"
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
              onCopyPrompt={() => {
                void navigator.clipboard?.writeText(form.core_story_idea || "请基于项目设定生成季纲。");
                setStatusMessage("已复制步骤一生成提示词");
              }}
            />
            <ImportFileButton label="导入故事思路文件" filename={form.imported_story_name} onChange={handleImport} />
            <button className="ghost-button inline-button" type="button" onClick={() => updateForm(defaultStepOneData(project.name))}>
              清空当前步骤
            </button>
            <button className="ghost-button inline-button strong" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存当前步骤"}
            </button>
            <NextStepButton
              disabled={!form.core_story_idea.trim()}
              onClick={() => setStatusMessage(form.core_story_idea.trim() ? "步骤一基础信息已具备，可以保存后进入剧本创作。" : "请先填写核心故事思路。")}
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
          <label className="field-label">
            <span>关系说明</span>
            <textarea rows={5} value={form.relationship_notes} onChange={(event) => updateForm({ ...form, relationship_notes: event.target.value })} placeholder="用自然语言描述主要人物、阵营和关系张力。" />
          </label>
          <button
            className="ghost-button inline-button"
            type="button"
            onClick={() =>
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
              })
            }
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
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord, message: string) => void;
  setStatusMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<StepTwoData>(project.step_two);
  const [saving, setSaving] = useState(false);

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
      setStatusMessage(`已导入文件：${result.filename}`);
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

  async function applyGeneration(
    mode: string,
    setter: (content: string) => void,
    successRecord: string,
    emptyMessage: string
  ) {
    setStatusMessage("AI 正在生成内容...");
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
        const result = await generateStepTwoContent(project.name, `${chunk.label}\n${chunk.content}`, mode);
        partials.push(result.content);
      }
      setter(mergeChunkResults(partials));
      appendModificationRecord(successRecord, "AI");
      setStatusMessage("AI 生成完成");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "AI 生成失败");
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatusMessage("正在保存步骤二数据...");
    try {
      const nextData = {
        ...form,
        project_name: form.project_name || project.name,
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
              rows={5}
              value={form.source_material}
              onChange={(event) => setForm({ ...form, source_material: event.target.value })}
              placeholder="输入或导入素材"
            />
          </label>

          <div className="action-row">
            <label className="ghost-button inline-button">
              导入素材文件
              <input type="file" accept=".txt,.md,.json,.docx" onChange={(event) => handleImport("source", event)} hidden />
            </label>
            <button
              className="ghost-button inline-button"
              type="button"
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
            </button>
            <button
              className="ghost-button inline-button"
              type="button"
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
            </button>
            <button
              className="ghost-button inline-button"
              type="button"
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
            </button>
          </div>

          <label className="field-label">
            <span>参考文本</span>
            <textarea
              rows={4}
              value={form.reference_text}
              onChange={(event) => setForm({ ...form, reference_text: event.target.value })}
              placeholder="参考文本输入 / 编辑"
            />
          </label>
          <div className="action-row">
            <button
              className="ghost-button inline-button"
              type="button"
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
            </button>
          </div>

          <label className="field-label">
            <span>小说正文</span>
            <textarea
              rows={8}
              value={form.novel_text}
              onChange={(event) => setForm({ ...form, novel_text: event.target.value })}
              placeholder="小说正文输入 / 编辑"
            />
          </label>
          <div className="action-row">
            <label className="ghost-button inline-button">
              导入正文文件
              <input type="file" accept=".txt,.md,.docx" onChange={(event) => handleImport("novel", event)} hidden />
            </label>
            <button
              className="ghost-button inline-button"
              type="button"
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
            </button>
          </div>

          <div className="rewrite-card">
            <div className="rewrite-head">
              <h4>改写工具弹窗（内嵌占位）</h4>
              <div className="chip-row">
                <button
                  className={`mode-switch ${form.rewrite_tool.mode === "partial" ? "active" : ""}`}
                  type="button"
                  onClick={() => setForm({ ...form, rewrite_tool: { ...form.rewrite_tool, mode: "partial" } })}
                >
                  局部改写
                </button>
                <button
                  className={`mode-switch ${form.rewrite_tool.mode === "batch" ? "active" : ""}`}
                  type="button"
                  onClick={() => setForm({ ...form, rewrite_tool: { ...form.rewrite_tool, mode: "batch" } })}
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
              onClick={() => {
                const target = form.rewrite_tool.selected_target;
                const originText = target === "novel" ? form.novel_text : form.script_text;
                const nextText = `${originText}\n\n【改写结果】\n${
                  form.rewrite_tool.selection_text || "已按当前要求完成改写。"
                }`.trim();

                if (target === "novel") {
                  setForm((current) => ({ ...current, novel_text: nextText, last_modified_by: "AI" }));
                } else {
                  setForm((current) => ({ ...current, script_text: nextText, last_modified_by: "AI" }));
                }

                appendModificationRecord(
                  `AI 完成${form.rewrite_tool.mode === "partial" ? "局部" : "批量"}改写`,
                  "AI"
                );
                setStatusMessage("改写工具结果已写入当前目标文本");
              }}
            >
              应用改写
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
              rows={4}
              value={form.character_profiles}
              onChange={(event) => setForm({ ...form, character_profiles: event.target.value })}
              placeholder="角色画像编辑 / 回显"
            />
          </label>
          <label className="field-label">
            <span>术语库</span>
            <textarea
              rows={4}
              value={form.terminology_library}
              onChange={(event) => setForm({ ...form, terminology_library: event.target.value })}
              placeholder="术语库编辑 / 回显"
            />
          </label>
          <label className="field-label">
            <span>写作指导</span>
            <textarea
              rows={4}
              value={form.writing_guidance}
              onChange={(event) => setForm({ ...form, writing_guidance: event.target.value })}
              placeholder="写作指导编辑 / 回显"
            />
          </label>

          <div className="action-row">
            <button
              className="primary-pill inline-pill"
              type="button"
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
            </button>
            <button
              className="ghost-button inline-button"
              type="button"
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
            </button>
          </div>

          <label className="field-label">
            <span>剧本文本</span>
            <textarea
              rows={10}
              value={form.script_text}
              onChange={(event) => {
                setForm({ ...form, script_text: event.target.value, last_modified_by: "人工" });
                setForm((current) => ({
                  ...current,
                  script_text: event.target.value,
                  last_modified_by: "人工",
                }));
              }}
              placeholder="剧本文本编辑"
            />
          </label>
          <label className="field-label">
            <span>整集审核意见</span>
            <textarea
              rows={5}
              value={form.review_notes}
              onChange={(event) => setForm({ ...form, review_notes: event.target.value })}
              placeholder="审核意见编辑"
            />
          </label>

          <div className="action-row">
            <button className="ghost-button inline-button" type="button" onClick={() => setForm(defaultStepTwoData(project.name))}>
              清空本步骤
            </button>
            <button className="ghost-button inline-button strong" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存本步骤"}
            </button>
            <button
              className="ghost-button inline-button"
              type="button"
              onClick={() => setStatusMessage("导出剧本接口已预留，后续可接入真实文件导出流程")}
            >
              导出剧本
            </button>
            <button
              className={`ghost-button inline-button ${canGoStepThree ? "strong" : "disabled"}`}
              type="button"
              onClick={() =>
                setStatusMessage(canGoStepThree ? "当前已满足进入步骤三的条件" : "剧本文本为空，暂时不能进入步骤三")
              }
            >
              进入步骤三
            </button>
          </div>

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
