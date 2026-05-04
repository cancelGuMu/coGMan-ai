# S08-DOC-001：步骤 08「视频生成」前端数据类型草案

## 任务边界

本文档基于《项目步骤功能说明.md》和《主要功能页面开发明细表.md》，整理步骤 08「视频生成」的前端数据类型草案。

本任务只写独立文档，不修改 `apps/web/src/types.ts`，不做页面实现。

## 步骤目标

步骤 08「视频生成」负责把入选关键帧转化为动态镜头，生成可剪辑的视频片段。页面需要支持：

- 读取步骤 04 的镜头表、景别、运镜、时长和剧情目的。
- 读取步骤 05 的 I2V 提示词、负面词和视频生成参数。
- 读取步骤 06 的入选关键帧。
- 创建视频生成任务。
- 配置动作、表情、环境动态、镜头运动、首帧/首尾帧/姿态参考。
- 管理多个视频候选版本。
- 记录失败原因、重试策略、废弃恢复和版本历史。
- 保存最终镜头视频片段，供步骤 09「音频字幕」和步骤 10「剪辑成片」消费。

## 上游依赖

| 来源步骤 | 依赖数据 | 用途 |
| --- | --- | --- |
| 04 分镜规划 | 镜头编号、集数、场景、角色、景别、构图、动作、运镜、台词、时长 | 创建视频任务、校验视频片段是否符合分镜 |
| 05 提词生成 | I2V 提示词、负面提示词、模型参数、锁定关键词、提示词版本 | 作为视频生成任务输入 |
| 06 画面生成 | 首帧、关键帧、分镜图、候选图、入选图 | 作为图生视频的首帧、尾帧或参考素材 |

## 下游消费者

| 下游步骤 | 消费数据 | 用途 |
| --- | --- | --- |
| 09 音频字幕 | 最终视频片段、镜头时长、角色动作、台词关联、口型同步参考 | 配音、字幕时间轴、口型同步、音效对齐 |
| 10 剪辑成片 | 最终视频片段、镜头顺序、片段时长、版本信息、素材元数据 | 时间线编排、剪辑导出、版本管理 |

## 建议主类型：`StepEightVideoGenerationData`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `selectedEpisodeNumber` | `number | null` | 当前正在处理的集数 | 否 | `null` |
| `activeShotId` | `string | null` | 当前选中的镜头 ID | 否 | `null` |
| `taskFilters` | `VideoTaskFilters` | 任务筛选条件 | 否 | 默认对象 |
| `generationTasks` | `VideoGenerationTask[]` | 视频生成任务列表 | 否 | `[]` |
| `motionSettings` | `ShotMotionSetting[]` | 每个镜头的动作和运镜设置 | 否 | `[]` |
| `referenceBindings` | `VideoReferenceBinding[]` | 首帧、尾帧、动作参考、姿态参考绑定 | 否 | `[]` |
| `videoCandidates` | `VideoCandidate[]` | 每个镜头生成的视频候选 | 否 | `[]` |
| `selectedClips` | `SelectedVideoClip[]` | 每个镜头最终选中的视频片段 | 否 | `[]` |
| `retryRecords` | `VideoRetryRecord[]` | 失败重试记录 | 否 | `[]` |
| `discardedCandidates` | `DiscardedVideoCandidate[]` | 被废弃但可恢复的视频候选 | 否 | `[]` |
| `shotVideoLinks` | `ShotVideoAssetLink[]` | 镜头、视频资产、关键帧、提示词版本绑定关系 | 否 | `[]` |
| `generationParameters` | `VideoGenerationParameters` | 默认视频生成参数 | 否 | 默认对象 |
| `versionRecords` | `VideoGenerationVersionRecord[]` | 保存、生成、重试、选择版本记录 | 否 | `[]` |
| `gateSnapshot` | `VideoGenerationGateSnapshot` | 进入视频生成时的上游门禁快照 | 否 | 默认对象 |
| `saveMeta` | `StepSaveMetaDraft` | 保存状态、最近修改方、版本号 | 否 | 默认对象 |

## `VideoTaskFilters`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episodeNumber` | `number | null` | 按集数筛选任务 | 否 | `null` |
| `sceneId` | `string | null` | 按场景筛选任务 | 否 | `null` |
| `characterId` | `string | null` | 按角色筛选任务 | 否 | `null` |
| `taskStatus` | `VideoGenerationTaskStatus | "all"` | 按任务状态筛选 | 否 | `"all"` |
| `candidateStatus` | `VideoCandidateStatus | "all"` | 按候选视频状态筛选 | 否 | `"all"` |
| `gateStatus` | `QualityGateStatus | "all"` | 按质检门禁筛选 | 否 | `"all"` |
| `keyword` | `string` | 按镜头编号、标题、提示词关键词搜索 | 否 | `""` |

## `VideoGenerationTask`

用于记录一个视频生成任务。任务可以是一镜一任务，也可以是批量任务中的子任务。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `taskId` | `string` | 前端或后端生成的任务 ID | 是 | 新建 UUID |
| `projectId` | `string` | 所属项目 ID | 是 | 当前项目 ID |
| `episodeNumber` | `number | null` | 所属集数 | 否 | `null` |
| `shotId` | `string` | 关联镜头 ID | 是 | `""` |
| `taskType` | `"video" | "video_retry" | "video_preview"` | 任务类型 | 是 | `"video"` |
| `status` | `VideoGenerationTaskStatus` | 任务状态 | 是 | `"queued"` |
| `promptId` | `string | null` | 关联 I2V 提示词 ID | 否 | `null` |
| `promptVersionId` | `string | null` | 关联提示词版本 | 否 | `null` |
| `sourceKeyframeIds` | `string[]` | 首帧、尾帧、关键帧素材 ID | 否 | `[]` |
| `referenceAssetIds` | `string[]` | 动作、姿态、运镜等参考素材 ID | 否 | `[]` |
| `parameters` | `VideoGenerationParameters` | 本任务使用的生成参数 | 否 | 默认对象 |
| `createdAt` | `string` | 创建时间 ISO 字符串 | 是 | 当前时间 |
| `updatedAt` | `string` | 更新时间 ISO 字符串 | 是 | 当前时间 |
| `startedAt` | `string | null` | 开始执行时间 | 否 | `null` |
| `finishedAt` | `string | null` | 完成、失败或取消时间 | 否 | `null` |
| `createdBy` | `"人工" | "AI" | "系统"` | 创建来源 | 否 | `"人工"` |
| `candidateIds` | `string[]` | 任务产出的视频候选 ID | 否 | `[]` |
| `error` | `VideoGenerationError | null` | 失败错误信息 | 否 | `null` |
| `progress` | `number` | 任务进度 0-100 | 否 | `0` |

### `VideoGenerationTaskStatus`

建议联合类型：

```ts
type VideoGenerationTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
```

状态用途：

| 状态 | 用途 | 是否终态 |
| --- | --- | --- |
| `queued` | 已创建，等待生成 | 否 |
| `running` | 正在生成 | 否 |
| `succeeded` | 生成成功，已有候选视频 | 是 |
| `failed` | 生成失败，需要记录错误和重试入口 | 是 |
| `cancelled` | 用户取消或系统取消 | 是 |

## `ShotMotionSetting`

用于保存每个镜头的动作、表情、环境动态和运镜设置。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `shotId` | `string` | 关联镜头 ID | 是 | `""` |
| `characterActions` | `CharacterActionSetting[]` | 角色动作设置 | 否 | `[]` |
| `expressionChanges` | `ExpressionChangeSetting[]` | 表情变化 | 否 | `[]` |
| `environmentDynamics` | `string[]` | 环境动态，如雨、烟、光影、人群 | 否 | `[]` |
| `cameraMotion` | `CameraMotionType` | 运镜方式 | 否 | `"static"` |
| `cameraMotionDescription` | `string` | 运镜补充描述 | 否 | `""` |
| `motionIntensity` | `"low" | "medium" | "high"` | 动作强度 | 否 | `"medium"` |
| `durationSeconds` | `number` | 目标视频时长 | 否 | `5` |
| `pacingNote` | `string` | 镜头节奏说明 | 否 | `""` |
| `locked` | `boolean` | 是否锁定，不被批量生成覆盖 | 否 | `false` |

### `CharacterActionSetting`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `characterId` | `string` | 角色 ID | 是 | `""` |
| `characterName` | `string` | 角色展示名 | 否 | `""` |
| `actionDescription` | `string` | 动作描述 | 否 | `""` |
| `startPose` | `string` | 起始姿态 | 否 | `""` |
| `endPose` | `string` | 结束姿态 | 否 | `""` |
| `interactionTargetId` | `string | null` | 互动目标角色或道具 | 否 | `null` |

### `ExpressionChangeSetting`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `characterId` | `string` | 角色 ID | 是 | `""` |
| `fromExpression` | `string` | 起始表情 | 否 | `""` |
| `toExpression` | `string` | 结束表情 | 否 | `""` |
| `emotionIntensity` | `number` | 情绪强度 0-100 | 否 | `50` |

### `CameraMotionType`

建议联合类型：

```ts
type CameraMotionType =
  | "static"
  | "push_in"
  | "pull_out"
  | "pan_left"
  | "pan_right"
  | "tilt_up"
  | "tilt_down"
  | "tracking"
  | "handheld"
  | "orbit"
  | "zoom";
```

## `VideoReferenceBinding`

用于记录视频生成需要的首帧、尾帧、动作参考、姿态参考和运镜参考。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `bindingId` | `string` | 绑定记录 ID | 是 | 新建 UUID |
| `shotId` | `string` | 关联镜头 ID | 是 | `""` |
| `referenceType` | `VideoReferenceType` | 参考类型 | 是 | `"first_frame"` |
| `assetId` | `string` | 参考素材 ID | 是 | `""` |
| `sourceStepId` | `"image-generation" | "video-generation"` | 素材来源步骤 | 是 | `"image-generation"` |
| `qualityStatus` | `QualityAssetStatus` | 素材质检状态 | 否 | `"approved"` |
| `weight` | `number` | 参考权重 0-1 | 否 | `1` |
| `note` | `string` | 备注 | 否 | `""` |

### `VideoReferenceType`

```ts
type VideoReferenceType =
  | "first_frame"
  | "last_frame"
  | "keyframe"
  | "action_reference"
  | "pose_reference"
  | "camera_reference";
```

## `VideoCandidate`

用于记录某个镜头生成出来的一个视频候选版本。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `candidateId` | `string` | 候选视频 ID | 是 | 新建 UUID |
| `taskId` | `string` | 来源生成任务 ID | 是 | `""` |
| `shotId` | `string` | 关联镜头 ID | 是 | `""` |
| `assetId` | `string` | 视频素材资产 ID | 是 | `""` |
| `status` | `VideoCandidateStatus` | 候选状态 | 是 | `"pending_review"` |
| `previewUrl` | `string` | 预览地址 | 否 | `""` |
| `thumbnailAssetId` | `string | null` | 缩略图素材 ID | 否 | `null` |
| `durationSeconds` | `number` | 实际视频时长 | 否 | `0` |
| `width` | `number | null` | 视频宽度 | 否 | `null` |
| `height` | `number | null` | 视频高度 | 否 | `null` |
| `fps` | `number | null` | 帧率 | 否 | `null` |
| `qualityScore` | `number | null` | 自动评分或人工评分 | 否 | `null` |
| `reviewNotes` | `string` | 人工预览备注 | 否 | `""` |
| `failureReasonIds` | `string[]` | 失败原因 ID 列表 | 否 | `[]` |
| `createdAt` | `string` | 创建时间 | 是 | 当前时间 |

### `VideoCandidateStatus`

```ts
type VideoCandidateStatus =
  | "pending_review"
  | "selected"
  | "discarded"
  | "failed"
  | "archived";
```

状态说明：

- `pending_review`：已生成，等待用户预览和选择。
- `selected`：已设为该镜头最终片段。
- `discarded`：用户废弃，但可以恢复。
- `failed`：生成结果不可用或任务失败。
- `archived`：历史版本归档，不参与当前选择。

## `SelectedVideoClip`

用于保存每个镜头最终采用的视频片段。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `clipId` | `string` | 最终片段记录 ID | 是 | 新建 UUID |
| `shotId` | `string` | 关联镜头 ID | 是 | `""` |
| `candidateId` | `string` | 来源候选 ID | 是 | `""` |
| `assetId` | `string` | 视频资产 ID | 是 | `""` |
| `episodeNumber` | `number | null` | 所属集数 | 否 | `null` |
| `shotOrder` | `number` | 镜头顺序 | 否 | `0` |
| `durationSeconds` | `number` | 片段时长 | 否 | `0` |
| `lockedForEditing` | `boolean` | 是否锁定给剪辑使用 | 否 | `false` |
| `selectedAt` | `string` | 设为最终片段的时间 | 是 | 当前时间 |
| `selectedBy` | `"人工" | "AI" | "系统"` | 选择来源 | 否 | `"人工"` |
| `handoffStatus` | `"draft" | "ready_for_audio" | "ready_for_editing"` | 下游交付状态 | 否 | `"draft"` |

## `VideoRetryRecord`

用于保存失败、重新生成和策略调整记录。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `retryId` | `string` | 重试记录 ID | 是 | 新建 UUID |
| `sourceTaskId` | `string` | 原失败任务 ID | 是 | `""` |
| `newTaskId` | `string | null` | 新生成任务 ID | 否 | `null` |
| `shotId` | `string` | 关联镜头 ID | 是 | `""` |
| `reason` | `VideoFailureReason` | 重试原因 | 是 | 默认对象 |
| `strategy` | `VideoRetryStrategy` | 重试策略 | 是 | 默认对象 |
| `createdAt` | `string` | 创建时间 | 是 | 当前时间 |
| `createdBy` | `"人工" | "AI" | "系统"` | 创建来源 | 否 | `"人工"` |
| `note` | `string` | 补充说明 | 否 | `""` |

### `VideoFailureReason`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `reasonId` | `string` | 失败原因 ID | 是 | 新建 UUID |
| `category` | `VideoFailureCategory` | 失败分类 | 是 | `"other"` |
| `severity` | `"low" | "medium" | "high"` | 严重程度 | 否 | `"medium"` |
| `description` | `string` | 失败说明 | 否 | `""` |
| `timeRange` | `{ start: number; end: number } | null` | 问题发生时间范围，秒 | 否 | `null` |

### `VideoFailureCategory`

```ts
type VideoFailureCategory =
  | "character_deformation"
  | "identity_drift"
  | "wrong_action"
  | "wrong_camera_motion"
  | "scene_inconsistency"
  | "flicker"
  | "low_resolution"
  | "duration_mismatch"
  | "prompt_mismatch"
  | "other";
```

### `VideoRetryStrategy`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `strategyId` | `string` | 策略 ID | 是 | 新建 UUID |
| `strategyType` | `VideoRetryStrategyType` | 策略类型 | 是 | `"adjust_prompt"` |
| `replaceKeyframeAssetId` | `string | null` | 替换关键帧素材 ID | 否 | `null` |
| `adjustedPrompt` | `string` | 调整后的 I2V 提示词 | 否 | `""` |
| `adjustedNegativePrompt` | `string` | 调整后的负面词 | 否 | `""` |
| `adjustedDurationSeconds` | `number | null` | 调整后时长 | 否 | `null` |
| `adjustedParameters` | `Partial<VideoGenerationParameters>` | 调整后参数 | 否 | `{}` |

### `VideoRetryStrategyType`

```ts
type VideoRetryStrategyType =
  | "adjust_prompt"
  | "shorten_duration"
  | "replace_keyframe"
  | "change_seed"
  | "reduce_motion"
  | "change_model"
  | "manual_note";
```

## `DiscardedVideoCandidate`

用于保存废弃和恢复状态。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `candidateId` | `string` | 被废弃候选 ID | 是 | `""` |
| `shotId` | `string` | 关联镜头 ID | 是 | `""` |
| `discardedAt` | `string` | 废弃时间 | 是 | 当前时间 |
| `discardedBy` | `"人工" | "AI" | "系统"` | 废弃来源 | 否 | `"人工"` |
| `reason` | `string` | 废弃原因 | 否 | `""` |
| `canRestore` | `boolean` | 是否允许恢复 | 否 | `true` |
| `restoredAt` | `string | null` | 恢复时间 | 否 | `null` |

## `ShotVideoAssetLink`

用于把镜头、视频、关键帧、提示词和版本记录绑定起来，保证可追溯。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `linkId` | `string` | 绑定记录 ID | 是 | 新建 UUID |
| `shotId` | `string` | 镜头 ID | 是 | `""` |
| `videoAssetId` | `string` | 视频资产 ID | 是 | `""` |
| `candidateId` | `string` | 候选视频 ID | 是 | `""` |
| `sourceKeyframeIds` | `string[]` | 来源关键帧素材 ID | 否 | `[]` |
| `i2vPromptId` | `string | null` | I2V 提示词 ID | 否 | `null` |
| `promptVersionId` | `string | null` | 提示词版本 ID | 否 | `null` |
| `taskId` | `string | null` | 来源生成任务 ID | 否 | `null` |
| `versionId` | `string | null` | 视频生成版本 ID | 否 | `null` |
| `createdAt` | `string` | 创建时间 | 是 | 当前时间 |

## `VideoGenerationParameters`

用于保存默认参数或单任务覆盖参数。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `modelProvider` | `string` | 模型供应方 | 否 | `""` |
| `modelName` | `string` | 模型名称 | 否 | `""` |
| `aspectRatio` | `"9:16" | "16:9" | "1:1" | "4:3" | "3:4"` | 画面比例 | 否 | `"9:16"` |
| `resolution` | `string` | 分辨率，如 `1080x1920` | 否 | `""` |
| `durationSeconds` | `number` | 目标时长 | 否 | `5` |
| `fps` | `number` | 帧率 | 否 | `24` |
| `seed` | `number | null` | 随机种子 | 否 | `null` |
| `candidateCount` | `number` | 候选生成数量 | 否 | `1` |
| `motionStrength` | `number` | 动作强度 0-1 | 否 | `0.5` |
| `referenceWeight` | `number` | 参考图权重 0-1 | 否 | `0.8` |
| `negativePrompt` | `string` | 默认负面提示词 | 否 | `""` |
| `safeMode` | `boolean` | 是否启用安全模式或内容限制 | 否 | `true` |
| `extra` | `Record<string, string | number | boolean>` | 模型特定扩展参数 | 否 | `{}` |

## `VideoGenerationGateSnapshot`

用于保存步骤 08 读取上游依赖时的素材快照，避免后续上游改动导致当前视频任务无法解释。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `selectedAssetIds` | `string[]` | 入选关键帧素材 ID | 否 | `[]` |
| `sourceStepSixVersionId` | `string | null` | 读取步骤 06 的版本 ID | 否 | `null` |
| `capturedAt` | `string | null` | 快照时间 | 否 | `null` |
| `note` | `string` | 素材备注 | 否 | `""` |

### `QualityGateStatus`

```ts
type QualityGateStatus =
  | "not_checked"
  | "blocked"
  | "partially_approved"
  | "approved";
```

### `QualityAssetStatus`

```ts
type QualityAssetStatus =
  | "approved"
  | "needs_rework"
  | "rejected"
  | "unknown";
```

## `VideoGenerationVersionRecord`

用于记录每次保存、生成、重试、选择、废弃和恢复。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `versionId` | `string` | 版本 ID | 是 | 新建 UUID |
| `eventType` | `VideoGenerationVersionEvent` | 事件类型 | 是 | `"manual_save"` |
| `shotId` | `string | null` | 关联镜头 ID | 否 | `null` |
| `taskId` | `string | null` | 关联任务 ID | 否 | `null` |
| `candidateId` | `string | null` | 关联候选 ID | 否 | `null` |
| `summary` | `string` | 版本摘要 | 否 | `""` |
| `createdAt` | `string` | 创建时间 | 是 | 当前时间 |
| `createdBy` | `"人工" | "AI" | "系统"` | 创建来源 | 否 | `"人工"` |

### `VideoGenerationVersionEvent`

```ts
type VideoGenerationVersionEvent =
  | "manual_save"
  | "task_created"
  | "task_succeeded"
  | "task_failed"
  | "candidate_selected"
  | "candidate_discarded"
  | "candidate_restored"
  | "retry_created"
  | "parameters_changed";
```

## `VideoGenerationError`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `code` | `string` | 错误码 | 是 | `""` |
| `message` | `string` | 错误说明 | 是 | `""` |
| `retryable` | `boolean` | 是否可重试 | 否 | `true` |
| `providerError` | `Record<string, unknown> | null` | 模型供应商原始错误摘要 | 否 | `null` |

## `StepSaveMetaDraft`

可与其他步骤共用的保存元信息草案。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `versionStatus` | `string` | 当前版本状态 | 否 | `"v1 草稿"` |
| `lastModifiedBy` | `"人工" | "AI" | "系统"` | 最近修改方 | 否 | `"人工"` |
| `updatedAt` | `string | null` | 最近更新时间 | 否 | `null` |
| `isDirty` | `boolean` | 前端是否有未保存改动 | 否 | `false` |
| `saveStatus` | `"idle" | "saving" | "saved" | "error"` | 保存状态 | 否 | `"idle"` |
| `errorMessage` | `string` | 保存错误信息 | 否 | `""` |

## 如何读取步骤 06 与步骤 07

### 读取步骤 06 入选图片素材

步骤 08 需要读取步骤 06 中已入选的首帧、关键帧和分镜图：

- `selected_keyframes` 或前端对应的 `selectedKeyframes`
- `asset_links` 或前端对应的 `assetLinks`
- 每张图的 `shotId`、`assetId`、`assetType`、`promptId`、`metadata`

使用规则：

1. 只把已入选图片作为默认可选视频参考。
2. 保留图片与镜头的绑定关系。
3. 若同一镜头有多张关键帧，可让用户选择首帧、尾帧或关键帧用途。
4. 步骤 08 不直接修改步骤 06 的图片入选状态。

### 读取步骤 07 门禁状态

步骤 08 应优先读取步骤 07 的：

- `gateStatus`
- `approvedAssets`
- `rejectedAssets`
- `qualityChecks`
- `reworkReasons`

使用规则：

1. `gateStatus = "approved"` 时，默认允许全部通过素材进入视频生成。
2. `gateStatus = "partially_approved"` 时，只允许 `approvedAssets` 中的素材进入视频生成。
3. `gateStatus = "blocked"` 时，视频生成入口应禁用或展示门禁提示。
4. `gateStatus = "not_checked"` 时，可以展示风险提示，不建议默认创建正式视频任务。
5. 被步骤 07 标记为 `rejected` 的素材不能默认进入视频候选任务。

## 如何读取步骤 05 与步骤 04

### 读取步骤 05 I2V 提示词

步骤 08 需要读取：

- `video_prompts` 或前端对应的 `videoPrompts`
- `negative_prompts` 或前端对应的 `negativePrompts`
- `model_parameters` 或前端对应的 `modelParameters`
- `locked_keywords`
- 提示词版本记录

使用规则：

1. 每个视频任务必须能追溯到 `i2vPromptId` 和 `promptVersionId`。
2. 重新生成时可以复制原提示词并生成新版本，不覆盖旧版本。
3. 锁定关键词默认不可被批量调整策略删除。
4. 负面提示词可合并全局负面词和镜头负面词。

### 读取步骤 04 镜头信息

步骤 08 需要读取：

- `shotId`
- `episodeNumber`
- `shotOrder`
- `sceneId`
- `characterIds`
- `shotPurpose`
- `cameraMotion`
- `durationSeconds`
- `dialogueText`
- `composition`
- `actionDescription`

使用规则：

1. 视频任务列表按镜头顺序展示。
2. 每个镜头的视频时长默认来自步骤 04。
3. 运镜默认来自步骤 04，可在步骤 08 调整并保存为视频生成参数。
4. 镜头台词给步骤 09 使用，步骤 08 只保留关联，不负责改写台词。

## 步骤 09 与步骤 10 如何消费

### 步骤 09 音频字幕消费

步骤 09 应读取 `selectedClips` 和 `shotVideoLinks`：

- 根据 `shotId` 匹配剧本台词。
- 根据 `durationSeconds` 生成字幕时间轴。
- 根据 `assetId` 获取视频预览，用于口型同步。
- 根据 `episodeNumber` 和 `shotOrder` 组织配音顺序。

建议步骤 08 提供 `handoffStatus = "ready_for_audio"`，表示片段可以进入音频字幕阶段。

### 步骤 10 剪辑成片消费

步骤 10 应读取：

- `selectedClips`
- `shotVideoLinks`
- `versionRecords`
- 视频资产元数据，如尺寸、时长、fps

使用方式：

1. 按 `episodeNumber + shotOrder` 自动生成剪辑时间线。
2. 使用 `durationSeconds` 对齐音频、字幕和转场。
3. 使用 `versionId` 追踪成片来源。
4. 对已锁定的 `lockedForEditing` 片段，剪辑阶段默认不替换。

## 生成失败、重生成、多候选、废弃恢复、版本记录

### 生成失败

生成失败时保存：

- `VideoGenerationTask.status = "failed"`
- `VideoGenerationTask.error`
- `VideoRetryRecord.reason`
- `VideoGenerationVersionRecord.eventType = "task_failed"`

失败信息不写入最终 `selectedClips`。

### 重新生成

重新生成时建议：

1. 保留旧任务和旧候选。
2. 新建 `VideoGenerationTask`。
3. 新建 `VideoRetryRecord`，记录来源任务、失败原因和重试策略。
4. 新候选加入 `videoCandidates`。
5. 不自动覆盖已选最终片段，除非用户明确选择。

### 多候选选择

同一镜头可有多个 `VideoCandidate`，但建议同一时间只有一个 `selected`：

- 用户设为最终时，当前候选状态改为 `selected`。
- 同镜头其他候选保持 `pending_review`、`discarded` 或 `archived`。
- `selectedClips` 中更新该镜头最终片段。

### 废弃恢复

废弃候选时：

- `VideoCandidate.status = "discarded"`
- 新增 `DiscardedVideoCandidate`
- 新增版本记录 `candidate_discarded`

恢复候选时：

- `VideoCandidate.status` 恢复为 `pending_review`
- `DiscardedVideoCandidate.restoredAt` 写入时间
- 新增版本记录 `candidate_restored`

### 版本记录

以下操作都应写入 `versionRecords`：

- 创建视频任务
- 任务成功
- 任务失败
- 修改生成参数
- 选择候选
- 废弃候选
- 恢复候选
- 创建重试任务
- 手动保存

## 后续落地到 TypeScript 的建议

1. 把共用类型抽到通用区域，例如 `StepSaveMetaDraft`、`AssetReference`、`GenerationTaskStatus`。
2. 步骤 08 独有类型可集中放在 `types.ts` 的视频生成区块，命名统一使用 `Video...` 前缀。
3. 枚举型字段优先使用字符串联合类型，便于前端渲染状态文案。
4. 列表字段全部使用数组默认值，避免页面渲染时判断 `undefined`。
5. 嵌套对象使用默认对象工厂或前端初始化函数。
6. `shotId`、`assetId`、`taskId`、`candidateId` 必须作为核心关联键，不依赖展示名称。
7. 后续实现时建议先接入只读上游数据，再实现任务创建和候选选择，最后实现重试与版本记录。
8. 不建议在步骤 08 类型中直接嵌入完整图片、视频二进制内容，只保存资产引用。

## 最小可用默认值示例

```ts
const defaultStepEightVideoGenerationData: StepEightVideoGenerationData = {
  selectedEpisodeNumber: null,
  activeShotId: null,
  taskFilters: {
    episodeNumber: null,
    sceneId: null,
    characterId: null,
    taskStatus: "all",
    candidateStatus: "all",
    gateStatus: "all",
    keyword: "",
  },
  generationTasks: [],
  motionSettings: [],
  referenceBindings: [],
  videoCandidates: [],
  selectedClips: [],
  retryRecords: [],
  discardedCandidates: [],
  shotVideoLinks: [],
  generationParameters: {
    modelProvider: "",
    modelName: "",
    aspectRatio: "9:16",
    resolution: "",
    durationSeconds: 5,
    fps: 24,
    seed: null,
    candidateCount: 1,
    motionStrength: 0.5,
    referenceWeight: 0.8,
    negativePrompt: "",
    safeMode: true,
    extra: {},
  },
  versionRecords: [],
  gateSnapshot: {
    selectedAssetIds: [],
    sourceStepSixVersionId: null,
    capturedAt: null,
    note: "",
  },
  saveMeta: {
    versionStatus: "v1 草稿",
    lastModifiedBy: "人工",
    updatedAt: null,
    isDirty: false,
    saveStatus: "idle",
    errorMessage: "",
  },
};
```

## 验收对应

- 视频生成任务、运动设置、候选、选中片段、重试原因、镜头与视频资产绑定、生成参数：见各类型字段表。
- 每个字段的字段名、类型、用途、是否必填、默认值建议：见各字段表。
- 步骤 08 读取步骤 06 和步骤 07：见“如何读取步骤 06 与步骤 07”。
- 步骤 08 读取步骤 05 和步骤 04：见“如何读取步骤 05 与步骤 04”。
- 步骤 09 和步骤 10 如何消费视频片段：见“步骤 09 与步骤 10 如何消费”。
- 生成失败、重新生成、多候选选择、废弃恢复、版本记录：见对应章节。
- 后续落地到 TypeScript 的建议：见“后续落地到 TypeScript 的建议”。
