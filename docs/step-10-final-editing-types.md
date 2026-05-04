# S10-DOC-001 步骤 10「剪辑成片」前端数据类型草案

本文档基于《项目步骤功能说明.md》和《主要功能页面开发明细表.md》，整理 coMGan-ai 步骤 10「剪辑成片」的前端数据类型草案。本文档只做类型设计说明，不修改生产代码。

## 1. 设计目标

步骤 10 负责把步骤 08 的最终视频片段、步骤 09 的配音/旁白/字幕/音效/BGM 整合为可发布成片。前端类型需要覆盖剪辑时间线、视频轨、音频轨、字幕轨、转场、调色、封面候选、标题候选、导出版本和剪辑质检结果，并能把完成导出的成片、封面和标题交给步骤 11「发布复盘」。

## 2. 顶层数据结构建议

```ts
type StepTenFinalEditingData = {
  project_meta: EditingProjectMeta;
  upstream_context: EditingUpstreamContext;
  timeline: EditingTimeline;
  video_tracks: VideoTrack[];
  audio_tracks: AudioTrack[];
  subtitle_tracks: SubtitleTrack[];
  transitions: TimelineTransition[];
  color_grading: ColorGradingConfig[];
  cover_candidates: CoverCandidate[];
  title_candidates: TitleCandidate[];
  export_versions: ExportVersion[];
  quality_reports: EditingQualityReport[];
  versions: EditingVersionRecord[];
};
```

## 3. 字段草案

### 3.1 `EditingProjectMeta`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `project_id` | `string` | 当前项目 ID。 | 是 | `""` |
| `project_name` | `string` | 当前项目名称。 | 是 | `""` |
| `editing_status` | `EditingStepStatus` | 剪辑成片整体状态。 | 是 | `"not_started"` |
| `completion_percent` | `number` | 当前步骤完成度，范围 0-100。 | 是 | `0` |
| `active_timeline_id` | `string \| null` | 当前正在编辑的时间线 ID。 | 否 | `null` |
| `last_modified_by` | `"human" \| "ai" \| "system" \| string` | 最近修改来源。 | 是 | `"system"` |
| `updated_at` | `string \| null` | 最近保存时间。 | 否 | `null` |
| `updated_by` | `string \| null` | 最近保存人或来源。 | 否 | `null` |

```ts
type EditingStepStatus =
  | "not_started"
  | "assembling"
  | "editing"
  | "checking"
  | "exporting"
  | "ready_for_publish"
  | "blocked";
```

### 3.2 `EditingUpstreamContext`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `video_generation_ref` | `UpstreamStepRef` | 指向步骤 08 视频生成版本。 | 是 | 空引用对象 |
| `audio_subtitle_ref` | `UpstreamStepRef` | 指向步骤 09 音频字幕版本。 | 是 | 空引用对象 |
| `storyboard_ref` | `UpstreamStepRef` | 指向步骤 04 分镜规划版本，用于校验镜头顺序和时长。 | 否 | 空引用对象 |
| `sync_status` | `"not_synced" \| "synced" \| "outdated"` | 上游数据同步状态。 | 是 | `"not_synced"` |
| `outdated_reason` | `string \| null` | 上游数据过期原因。 | 否 | `null` |

```ts
type UpstreamStepRef = {
  step_id: "storyboard-planning" | "image-generation" | "video-generation" | "audio-subtitle";
  version_id: string | null;
  updated_at: string | null;
};
```

### 3.3 `EditingTimeline`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `timeline_id` | `string` | 时间线 ID。 | 是 | 前端生成临时 ID |
| `name` | `string` | 时间线名称，例如正片版、竖版、预告版。 | 是 | `"正片版"` |
| `timeline_type` | `"main" \| "vertical" \| "horizontal" \| "trailer" \| "platform_variant"` | 时间线类型。 | 是 | `"main"` |
| `duration_ms` | `number` | 时间线总时长，单位毫秒。 | 是 | `0` |
| `fps` | `number` | 帧率。 | 是 | `30` |
| `canvas` | `TimelineCanvas` | 画布比例、分辨率和安全区。 | 是 | 默认 16:9 画布 |
| `track_order` | `string[]` | 轨道显示和渲染顺序。 | 是 | `[]` |
| `markers` | `TimelineMarker[]` | 节奏点、钩子、反转、卡点等时间标记。 | 否 | `[]` |
| `status` | `"draft" \| "checked" \| "export_ready" \| "archived"` | 时间线状态。 | 是 | `"draft"` |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `updated_at` | `string \| null` | 更新时间。 | 否 | `null` |

```ts
type TimelineCanvas = {
  aspect_ratio: "16:9" | "9:16" | "1:1" | "4:5" | string;
  width: number;
  height: number;
  safe_area: { top: number; right: number; bottom: number; left: number };
};

type TimelineMarker = {
  marker_id: string;
  time_ms: number;
  marker_type: "hook" | "beat" | "climax" | "transition" | "ending" | "note";
  label: string;
  color: string;
  note: string;
};
```

### 3.4 `VideoTrack`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `track_id` | `string` | 视频轨 ID。 | 是 | 前端生成临时 ID |
| `timeline_id` | `string` | 所属时间线 ID。 | 是 | `""` |
| `name` | `string` | 轨道名称。 | 是 | `"视频轨 1"` |
| `track_type` | `"main_video" \| "overlay" \| "b_roll" \| "adjustment"` | 视频轨类型。 | 是 | `"main_video"` |
| `clips` | `VideoTimelineClip[]` | 轨道中的视频片段。 | 是 | `[]` |
| `locked` | `boolean` | 是否锁定轨道。 | 是 | `false` |
| `visible` | `boolean` | 是否显示并参与渲染。 | 是 | `true` |
| `z_index` | `number` | 轨道层级。 | 是 | `0` |

```ts
type VideoTimelineClip = {
  clip_id: string;
  source_video_clip_id: string;
  shot_id: string;
  episode_id: string | null;
  source_url: string;
  start_ms: number;
  end_ms: number;
  source_in_ms: number;
  source_out_ms: number;
  playback_rate: number;
  crop: ClipCropConfig | null;
  transform: ClipTransformConfig;
  linked_audio_clip_ids: string[];
};

type ClipCropConfig = { x: number; y: number; width: number; height: number };
type ClipTransformConfig = { x: number; y: number; scale: number; rotation: number; opacity: number };
```

### 3.5 `AudioTrack`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `track_id` | `string` | 音频轨 ID。 | 是 | 前端生成临时 ID |
| `timeline_id` | `string` | 所属时间线 ID。 | 是 | `""` |
| `name` | `string` | 轨道名称。 | 是 | `"对白轨"` |
| `track_type` | `"dialogue" \| "narration" \| "music" \| "sfx" \| "ambient"` | 音频轨类型。 | 是 | `"dialogue"` |
| `clips` | `AudioTimelineClip[]` | 轨道中的音频片段。 | 是 | `[]` |
| `muted` | `boolean` | 是否静音。 | 是 | `false` |
| `locked` | `boolean` | 是否锁定轨道。 | 是 | `false` |
| `volume` | `number` | 轨道总音量，范围 0-1。 | 是 | `1` |

```ts
type AudioTimelineClip = {
  clip_id: string;
  source_audio_id: string;
  source_url: string;
  dialogue_id: string | null;
  start_ms: number;
  end_ms: number;
  source_in_ms: number;
  source_out_ms: number;
  volume: number;
  fade_in_ms: number;
  fade_out_ms: number;
  linked_video_clip_id: string | null;
};
```

### 3.6 `SubtitleTrack`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `track_id` | `string` | 字幕轨 ID。 | 是 | 前端生成临时 ID |
| `timeline_id` | `string` | 所属时间线 ID。 | 是 | `""` |
| `name` | `string` | 字幕轨名称。 | 是 | `"主字幕"` |
| `subtitle_type` | `"dialogue" \| "narration" \| "caption" \| "burned_in"` | 字幕类型。 | 是 | `"dialogue"` |
| `items` | `SubtitleTimelineItem[]` | 字幕条目。 | 是 | `[]` |
| `style` | `SubtitleStyleConfig` | 字幕样式。 | 是 | 默认样式 |
| `visible` | `boolean` | 是否显示并参与导出。 | 是 | `true` |
| `locked` | `boolean` | 是否锁定轨道。 | 是 | `false` |

```ts
type SubtitleTimelineItem = {
  item_id: string;
  source_subtitle_id: string | null;
  text: string;
  start_ms: number;
  end_ms: number;
  speaker_id: string | null;
  shot_id: string | null;
  position_override: SubtitlePosition | null;
};

type SubtitleStyleConfig = {
  font_family: string;
  font_size: number;
  color: string;
  stroke_color: string;
  stroke_width: number;
  background_color: string | null;
  position: SubtitlePosition;
};

type SubtitlePosition = {
  x_percent: number;
  y_percent: number;
  align: "left" | "center" | "right";
};
```

### 3.7 `TimelineTransition`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `transition_id` | `string` | 转场 ID。 | 是 | 前端生成临时 ID |
| `timeline_id` | `string` | 所属时间线 ID。 | 是 | `""` |
| `from_clip_id` | `string` | 前一个片段 ID。 | 是 | `""` |
| `to_clip_id` | `string` | 后一个片段 ID。 | 是 | `""` |
| `transition_type` | `"cut" \| "fade" \| "dissolve" \| "wipe" \| "flash" \| "match_cut"` | 转场类型。 | 是 | `"cut"` |
| `start_ms` | `number` | 转场开始时间。 | 是 | `0` |
| `duration_ms` | `number` | 转场时长。 | 是 | `0` |
| `easing` | `"linear" \| "ease_in" \| "ease_out" \| "ease_in_out"` | 缓动方式。 | 否 | `"linear"` |
| `params` | `Record<string, string \| number \| boolean \| null>` | 转场参数。 | 否 | `{}` |

### 3.8 `ColorGradingConfig`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `grade_id` | `string` | 调色配置 ID。 | 是 | 前端生成临时 ID |
| `target_type` | `"timeline" \| "track" \| "clip"` | 调色作用范围。 | 是 | `"timeline"` |
| `target_id` | `string` | 作用对象 ID。 | 是 | `""` |
| `preset_name` | `string \| null` | 调色预设名称。 | 否 | `null` |
| `exposure` | `number` | 曝光调整。 | 是 | `0` |
| `contrast` | `number` | 对比度调整。 | 是 | `0` |
| `saturation` | `number` | 饱和度调整。 | 是 | `0` |
| `temperature` | `number` | 色温调整。 | 是 | `0` |
| `tint` | `number` | 色调偏移。 | 是 | `0` |
| `lut_url` | `string \| null` | LUT 文件引用。 | 否 | `null` |
| `enabled` | `boolean` | 是否启用。 | 是 | `true` |

### 3.9 `CoverCandidate`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `cover_id` | `string` | 封面候选 ID。 | 是 | 前端生成临时 ID |
| `source_type` | `"keyframe" \| "video_frame" \| "generated" \| "uploaded"` | 封面来源。 | 是 | `"video_frame"` |
| `source_asset_id` | `string \| null` | 来源素材 ID。 | 否 | `null` |
| `image_url` | `string` | 封面图片地址。 | 是 | `""` |
| `platform_targets` | `PlatformTarget[]` | 适配平台。 | 是 | `[]` |
| `title_overlay` | `string` | 封面叠字。 | 否 | `""` |
| `score` | `number \| null` | 点击潜力或质量评分。 | 否 | `null` |
| `is_selected` | `boolean` | 是否被选为默认封面。 | 是 | `false` |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |

```ts
type PlatformTarget = "douyin" | "kuaishou" | "bilibili" | "xiaohongshu" | "youtube" | "generic";
```

### 3.10 `TitleCandidate`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `title_id` | `string` | 标题候选 ID。 | 是 | 前端生成临时 ID |
| `text` | `string` | 标题文本。 | 是 | `""` |
| `hook_type` | `"conflict" \| "reversal" \| "emotion" \| "mystery" \| "benefit" \| "other"` | 标题主卖点类型。 | 是 | `"conflict"` |
| `platform_targets` | `PlatformTarget[]` | 适配平台。 | 是 | `[]` |
| `related_cover_id` | `string \| null` | 推荐搭配封面 ID。 | 否 | `null` |
| `score` | `number \| null` | 标题评分。 | 否 | `null` |
| `is_selected` | `boolean` | 是否被选为默认标题。 | 是 | `false` |
| `created_by` | `"human" \| "ai" \| "system" \| string` | 创建来源。 | 是 | `"ai"` |

### 3.11 `ExportVersion`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `export_id` | `string` | 导出版本 ID。 | 是 | 前端生成临时 ID |
| `timeline_id` | `string` | 来源时间线 ID。 | 是 | `""` |
| `version_name` | `string` | 版本名称。 | 是 | `"正片导出 v1"` |
| `export_type` | `"full_episode" \| "trailer" \| "vertical" \| "horizontal" \| "platform_package"` | 导出类型。 | 是 | `"full_episode"` |
| `platform_target` | `PlatformTarget` | 目标平台。 | 是 | `"generic"` |
| `settings` | `ExportSettings` | 导出参数。 | 是 | 默认导出参数 |
| `status` | `"queued" \| "exporting" \| "completed" \| "failed" \| "cancelled"` | 导出状态。 | 是 | `"queued"` |
| `progress_percent` | `number` | 导出进度。 | 是 | `0` |
| `file_url` | `string \| null` | 导出文件地址。 | 否 | `null` |
| `file_size_bytes` | `number \| null` | 文件大小。 | 否 | `null` |
| `failure_reason` | `string \| null` | 导出失败原因。 | 否 | `null` |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `completed_at` | `string \| null` | 完成时间。 | 否 | `null` |

```ts
type ExportSettings = {
  width: number;
  height: number;
  fps: number;
  bitrate_kbps: number;
  format: "mp4" | "mov" | "webm";
  codec: "h264" | "h265" | "vp9" | string;
  include_subtitles: boolean;
  normalize_audio: boolean;
};
```

### 3.12 `EditingQualityReport`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `report_id` | `string` | 剪辑质检报告 ID。 | 是 | 前端生成临时 ID |
| `timeline_id` | `string` | 被检查时间线 ID。 | 是 | `""` |
| `status` | `"not_checked" \| "checking" \| "passed" \| "issues_found"` | 检查状态。 | 是 | `"not_checked"` |
| `issues` | `EditingQualityIssue[]` | 字幕遮挡、声音错位、黑帧、跳帧、穿帮、节奏断点等问题。 | 是 | `[]` |
| `checked_at` | `string \| null` | 检查时间。 | 否 | `null` |
| `checked_by` | `"human" \| "ai" \| "system" \| string \| null` | 检查来源。 | 否 | `null` |

```ts
type EditingQualityIssue = {
  issue_id: string;
  issue_type:
    | "subtitle_overlap"
    | "audio_desync"
    | "black_frame"
    | "dropped_frame"
    | "continuity_error"
    | "pace_break"
    | "export_risk";
  severity: "info" | "minor" | "major" | "blocking";
  time_ms: number | null;
  clip_id: string | null;
  description: string;
  resolved: boolean;
};
```

### 3.13 `EditingVersionRecord`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `version_id` | `string` | 版本 ID。 | 是 | 前端生成临时 ID |
| `version_no` | `number` | 版本序号。 | 是 | `1` |
| `source` | `"auto_assembly" \| "manual_edit" \| "quality_check" \| "export" \| "restore"` | 版本来源。 | 是 | `"manual_edit"` |
| `summary` | `string` | 版本摘要。 | 是 | `""` |
| `snapshot` | `EditingSnapshot` | 可恢复快照。 | 是 | 空快照 |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `created_by` | `"human" \| "ai" \| "system" \| string` | 创建来源。 | 是 | `"human"` |

```ts
type EditingSnapshot = {
  timeline: EditingTimeline;
  video_tracks: VideoTrack[];
  audio_tracks: AudioTrack[];
  subtitle_tracks: SubtitleTrack[];
  transitions: TimelineTransition[];
  color_grading: ColorGradingConfig[];
  cover_candidates: CoverCandidate[];
  title_candidates: TitleCandidate[];
  export_versions: ExportVersion[];
};
```

## 4. 上游读取与下游消费

步骤 10 应从步骤 08 读取最终视频片段，并按 `shot_id`、`episode_id` 和分镜顺序生成 `VideoTimelineClip`。若某个镜头缺少最终片段，时间线应产生阻断级剪辑问题，不能进入导出就绪状态。

步骤 10 应从步骤 09 读取配音、旁白、字幕、音效和 BGM：配音进入 `"dialogue"` 轨，旁白进入 `"narration"` 轨，音效和 BGM 进入 `"sfx"`、`"music"` 或 `"ambient"` 轨，字幕进入 `SubtitleTrack.items` 并保留时间码、角色和镜头引用。

步骤 11「发布复盘」默认消费步骤 10 中 `status = "completed"` 的 `ExportVersion`、`is_selected = true` 的 `CoverCandidate` 和 `TitleCandidate`。如果没有完成导出版本，步骤 11 不应允许创建正式发布记录。

## 5. 后续落地到 TypeScript 的建议

- 时间统一使用毫秒 `number`，展示时再格式化为时间码。
- 轨道、片段、转场、调色、导出版本拆成独立类型，避免单一巨型对象。
- 所有视频、音频、图片只保存 ID、URL 和必要快照，不复制二进制文件。
- 轨道片段建议使用不可变更新方式，便于撤销、重做和版本对比。
- 导出任务状态建议与全局任务队列共享枚举。
- 剪辑质检可封装为纯函数，例如 `deriveEditingQualityReport(timeline, tracks)`。
- `PlatformTarget` 建议与步骤 11 复用，保证发布侧能直接读取平台版本。

## 6. 本任务不落地的内容

- 不修改 `apps/web/src/types.ts`。
- 不修改步骤 10 页面实现。
- 不新增 API 或后端模型。
- 不更新任务状态表、审核日志或协作调度文档。
- 不处理步骤 08、步骤 09、步骤 11 的页面实现。
