# 步骤 06「画面生成」前端数据类型草案

本文档基于 [项目步骤功能说明.md](/C:/Users/86158/Desktop/codex/coGMan-ai（终）/项目步骤功能说明.md) 与 [主要功能页面开发明细表.md](/C:/Users/86158/Desktop/codex/coGMan-ai（终）/主要功能页面开发明细表.md) 编写，仅用于步骤 06 前端类型设计，不直接修改 `apps/web/src/types.ts`。

## 1. 设计目标

步骤 06「画面生成」的核心产物是可追溯、可筛选、可入选、可返工的图片素材库。它需要读取步骤 05 的 T2I 提示词和步骤 04 的镜头数据，批量或单镜头生成首帧、关键帧、分镜图，并把最终入选素材交给步骤 08「视频生成」继续使用。

本草案覆盖：

1. 待生成任务列表。
2. 单镜头图片生成与批量图片生成。
3. 候选图、入选关键帧、废弃图。
4. 图片元数据、筛选器、放大预览。
5. 生成失败、重新生成、人工选择、废弃恢复的状态保存。
6. 上游读取关系与下游消费方式。

---

## 2. 建议的根类型

```ts
export type ImageGenerationStepData = {
  schema_version: "step06.v1";
  source_context: ImageGenerationSourceContext;
  task_queue: ImageGenerationTask[];
  batch_generation: ImageBatchGenerationState;
  image_assets: ImageAssetDraft[];
  selected_keyframes: SelectedKeyframeAsset[];
  discarded_assets: DiscardedImageAsset[];
  filters: ImageGenerationFilters;
  preview: ImagePreviewState;
  step_meta: ImageGenerationStepMeta;
};
```

说明：
- `source_context` 保存步骤 04 分镜和步骤 05 提示词的读取摘要。
- `task_queue` 是按镜头组织的图片生成任务列表。
- `batch_generation` 保存批量生成的选择范围、运行状态和进度。
- `image_assets` 保存候选图、修复图、入选图等图片资产。
- `selected_keyframes` 保存最终交给质检和视频生成的入选关键帧。
- `discarded_assets` 保存废弃图片及恢复信息。
- `filters` 保存页面筛选、排序、分组条件。
- `preview` 保存放大预览、对比预览等 UI 状态。
- `step_meta` 保存版本、保存时间、生成统计等元信息。

---

## 3. 上游来源上下文

### 3.1 `ImageGenerationSourceContext`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_number` | `number` | 当前画面生成所属集数 | 是 | `1` |
| `shot_source` | `ImageGenerationShotSource` | 从步骤 04 读取的镜头表摘要 | 是 | 见下方 |
| `prompt_source` | `ImageGenerationPromptSource` | 从步骤 05 读取的 T2I 提示词摘要 | 是 | 见下方 |
| `asset_source` | `ImageGenerationAssetSource` | 从步骤 03 间接读取的资产引用摘要 | 否 | 见下方 |
| `source_warnings` | `ImageGenerationSourceWarning[]` | 上游缺失、过期或不一致提示 | 否 | `[]` |

### 3.2 `ImageGenerationShotSource`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `shot_list_id` | `string` | 步骤 04 镜头表 ID 或版本 ID | 否 | `""` |
| `shot_version_status` | `string` | 镜头表版本状态 | 否 | `"v1 草稿"` |
| `available_shots` | `ImageGenerationShotRef[]` | 可生成图片的镜头引用列表 | 是 | `[]` |
| `last_synced_at` | `string \| null` | 最近同步步骤 04 的时间 | 否 | `null` |

### 3.3 `ImageGenerationShotRef`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `shot_id` | `string` | 镜头唯一 ID，是图片资产的核心外键 | 是 | `""` |
| `shot_number` | `number` | 当前集内镜头序号 | 是 | `1` |
| `shot_title` | `string` | 镜头标题或短标签 | 否 | `""` |
| `episode_number` | `number` | 所属集数 | 是 | `1` |
| `scene_ref_id` | `string \| null` | 步骤 03 场景 ID | 否 | `null` |
| `character_ref_ids` | `string[]` | 出镜角色 ID | 否 | `[]` |
| `prop_ref_ids` | `string[]` | 出现道具 ID | 否 | `[]` |
| `visual_summary` | `string` | 景别、角度、构图、动作的摘要 | 否 | `""` |
| `duration_sec` | `number` | 镜头时长，供视频步骤参考 | 否 | `3` |
| `needs_keyframe` | `boolean` | 是否需要关键帧 | 否 | `true` |
| `needs_storyboard_image` | `boolean` | 是否需要分镜图 | 否 | `true` |

### 3.4 `ImageGenerationPromptSource`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `prompt_library_id` | `string` | 步骤 05 提示词库 ID 或版本 ID | 否 | `""` |
| `prompt_version_status` | `string` | 提示词版本状态 | 否 | `"v1 草稿"` |
| `t2i_prompt_refs` | `ImageGenerationPromptRef[]` | 可用于图片生成的 T2I 提示词引用 | 是 | `[]` |
| `default_negative_prompt` | `string` | 默认负面提示词 | 否 | `""` |
| `default_params` | `ImageGenerationParams` | 默认生成参数 | 否 | 见参数表 |
| `last_synced_at` | `string \| null` | 最近同步步骤 05 的时间 | 否 | `null` |

### 3.5 `ImageGenerationPromptRef`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `prompt_id` | `string` | T2I 提示词 ID | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID | 是 | `""` |
| `prompt_text` | `string` | 正向图片提示词快照 | 是 | `""` |
| `negative_prompt` | `string` | 负面提示词快照 | 否 | `""` |
| `locked_terms` | `string[]` | 锁定关键词 | 否 | `[]` |
| `params` | `ImageGenerationParams` | 该提示词对应的生成参数 | 否 | 见参数表 |
| `prompt_status` | `"draft" \| "ready" \| "needs_review" \| "outdated"` | 提示词状态 | 否 | `"draft"` |

### 3.6 `ImageGenerationAssetSource`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `asset_library_id` | `string` | 步骤 03 资产库 ID 或版本 ID | 否 | `""` |
| `character_refs` | `ImageGenerationAssetRef[]` | 角色引用，用于筛选和元数据展示 | 否 | `[]` |
| `scene_refs` | `ImageGenerationAssetRef[]` | 场景引用，用于筛选和元数据展示 | 否 | `[]` |
| `prop_refs` | `ImageGenerationAssetRef[]` | 道具引用，用于筛选和元数据展示 | 否 | `[]` |
| `style_board_ref` | `ImageGenerationAssetRef \| null` | 风格板引用 | 否 | `null` |
| `consistency_rule_ref_ids` | `string[]` | 角色或画风一致性规则 ID | 否 | `[]` |

### 3.7 `ImageGenerationAssetRef`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `ref_id` | `string` | 上游资产 ID | 是 | `""` |
| `ref_type` | `"character" \| "scene" \| "prop" \| "style_board" \| "consistency_rule"` | 资产类型 | 是 | `"character"` |
| `display_name` | `string` | 页面显示名 | 是 | `""` |
| `thumbnail_url` | `string \| null` | 参考图缩略图 | 否 | `null` |
| `summary` | `string` | 资产摘要 | 否 | `""` |

### 3.8 `ImageGenerationSourceWarning`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `warning_id` | `string` | 提示唯一 ID | 是 | `""` |
| `warning_type` | `"missing_shot" \| "missing_prompt" \| "prompt_outdated" \| "asset_missing" \| "version_mismatch" \| "other"` | 提示类型 | 是 | `"other"` |
| `shot_id` | `string \| null` | 关联镜头 ID | 否 | `null` |
| `message` | `string` | 提示文案 | 是 | `""` |
| `blocking` | `boolean` | 是否阻塞生成 | 否 | `false` |

---

## 4. 生成参数

### 4.1 `ImageGenerationParams`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `model` | `string` | 图片生成模型名称或模型 ID | 否 | `""` |
| `aspect_ratio` | `"1:1" \| "4:3" \| "3:4" \| "16:9" \| "9:16" \| "custom"` | 画面比例 | 否 | `"9:16"` |
| `width` | `number` | 输出宽度 | 否 | `1080` |
| `height` | `number` | 输出高度 | 否 | `1920` |
| `candidate_count` | `number` | 单次生成候选数量 | 否 | `4` |
| `seed` | `number \| null` | 随机种子 | 否 | `null` |
| `steps` | `number \| null` | 采样步数或模型步数 | 否 | `null` |
| `guidance_scale` | `number \| null` | 提示词引导强度 | 否 | `null` |
| `reference_image_ids` | `string[]` | 使用的参考图 ID | 否 | `[]` |
| `reference_weight` | `number \| null` | 参考图权重 | 否 | `null` |
| `style_strength` | `number \| null` | 风格强度 | 否 | `null` |
| `extra_settings` | `Record<string, string \| number \| boolean \| null>` | 模型特有扩展参数 | 否 | `{}` |

### 4.2 说明

- `candidate_count` 会影响任务预期产出数量。
- `seed` 为 `null` 表示让模型自动随机；重新生成时可选择沿用旧种子或换种子。
- `extra_settings` 用于兼容不同图片模型，不建议在第一版 UI 暴露过多模型特有字段。

---

## 5. 待生成任务列表

### 5.1 `ImageGenerationTask`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `task_id` | `string` | 图片生成任务唯一 ID | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID | 是 | `""` |
| `shot_number` | `number` | 当前集内镜头序号 | 是 | `1` |
| `episode_number` | `number` | 所属集数 | 是 | `1` |
| `prompt_id` | `string \| null` | 关联 T2I 提示词 ID | 否 | `null` |
| `task_type` | `ImageGenerationTaskType` | 生成任务类型 | 是 | `"keyframe"` |
| `generation_mode` | `"single" \| "batch" \| "regenerate" \| "inpaint"` | 生成模式 | 是 | `"single"` |
| `status` | `ImageGenerationTaskStatus` | 任务状态 | 是 | `"pending"` |
| `params` | `ImageGenerationParams` | 本任务生成参数快照 | 否 | 见参数表 |
| `expected_count` | `number` | 预期生成图片数量 | 否 | `4` |
| `created_asset_ids` | `string[]` | 本任务已生成的图片 ID | 否 | `[]` |
| `selected_asset_id` | `string \| null` | 本任务当前入选图片 ID | 否 | `null` |
| `failure` | `ImageGenerationFailure \| null` | 最近一次失败信息 | 否 | `null` |
| `retry_policy` | `ImageGenerationRetryPolicy` | 失败重试策略 | 否 | 见下方 |
| `created_at` | `string \| null` | 任务创建时间 | 否 | `null` |
| `updated_at` | `string \| null` | 最近更新时间 | 否 | `null` |

### 5.2 `ImageGenerationTaskType`

| 取值 | 用途 | 默认建议 |
| --- | --- | --- |
| `"first_frame"` | 生成首帧 | 否 |
| `"keyframe"` | 生成关键帧 | 是 |
| `"storyboard_image"` | 生成分镜图 | 否 |
| `"reference_image"` | 生成补充参考图 | 否 |
| `"repair"` | 生成修复图 | 否 |

### 5.3 `ImageGenerationTaskStatus`

| 取值 | 用途 | 默认建议 |
| --- | --- | --- |
| `"pending"` | 待生成 | 是 |
| `"ready"` | 上游数据完整，已可生成 | 否 |
| `"queued"` | 已加入后端队列 | 否 |
| `"running"` | 生成中 | 否 |
| `"succeeded"` | 生成成功 | 否 |
| `"failed"` | 生成失败 | 否 |
| `"partial"` | 部分成功 | 否 |
| `"cancelled"` | 已取消 | 否 |
| `"blocked"` | 被上游缺失或配置错误阻塞 | 否 |

### 5.4 `ImageGenerationFailure`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `failure_id` | `string` | 失败记录 ID | 是 | `""` |
| `failure_type` | `"provider_error" \| "timeout" \| "invalid_prompt" \| "invalid_params" \| "asset_missing" \| "user_cancelled" \| "unknown"` | 失败类型 | 是 | `"unknown"` |
| `message` | `string` | 面向用户的失败说明 | 是 | `""` |
| `raw_error` | `string` | 原始错误摘要，避免保存敏感完整日志 | 否 | `""` |
| `failed_at` | `string \| null` | 失败时间 | 否 | `null` |
| `recoverable` | `boolean` | 是否可重试 | 否 | `true` |

### 5.5 `ImageGenerationRetryPolicy`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `retry_count` | `number` | 已重试次数 | 否 | `0` |
| `max_retries` | `number` | 最大重试次数 | 否 | `3` |
| `retry_with_new_seed` | `boolean` | 重试时是否换随机种子 | 否 | `true` |
| `retry_with_adjusted_prompt` | `boolean` | 重试时是否使用修订提示词 | 否 | `false` |
| `last_retry_at` | `string \| null` | 最近重试时间 | 否 | `null` |

---

## 6. 单镜头图片生成

### 6.1 `SingleShotImageGenerationDraft`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `shot_id` | `string` | 当前单镜头 ID | 是 | `""` |
| `prompt_id` | `string \| null` | 使用的 T2I 提示词 ID | 否 | `null` |
| `task_type` | `ImageGenerationTaskType` | 本次生成类型 | 是 | `"keyframe"` |
| `prompt_text_override` | `string` | 临时修改后的正向提示词 | 否 | `""` |
| `negative_prompt_override` | `string` | 临时修改后的负面提示词 | 否 | `""` |
| `params_override` | `Partial<ImageGenerationParams>` | 临时参数覆盖 | 否 | `{}` |
| `save_override_as_version` | `boolean` | 是否把临时修改保存为新提示词版本 | 否 | `false` |
| `append_to_existing_candidates` | `boolean` | 是否追加到现有候选图 | 否 | `true` |

### 6.2 说明

- 单镜生成适合对某个镜头进行局部探索，不应覆盖既有候选图和已入选图。
- 若 `save_override_as_version` 为 `false`，覆盖提示词只作为任务快照保存到图片元数据里。

---

## 7. 批量图片生成

### 7.1 `ImageBatchGenerationState`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `batch_id` | `string \| null` | 当前批量任务 ID | 否 | `null` |
| `selected_shot_ids` | `string[]` | 当前批量选择的镜头 ID | 否 | `[]` |
| `task_type` | `ImageGenerationTaskType` | 批量生成类型 | 否 | `"keyframe"` |
| `status` | `"idle" \| "preparing" \| "queued" \| "running" \| "completed" \| "failed" \| "cancelled"` | 批量状态 | 否 | `"idle"` |
| `total_tasks` | `number` | 批量任务总数 | 否 | `0` |
| `completed_tasks` | `number` | 已完成任务数 | 否 | `0` |
| `failed_tasks` | `number` | 失败任务数 | 否 | `0` |
| `progress_percent` | `number` | 进度百分比 | 否 | `0` |
| `started_at` | `string \| null` | 批量开始时间 | 否 | `null` |
| `finished_at` | `string \| null` | 批量结束时间 | 否 | `null` |
| `batch_failure_message` | `string` | 批量失败摘要 | 否 | `""` |

### 7.2 说明

- `selected_shot_ids` 只保存选择范围，真正的任务状态仍落在 `task_queue` 中。
- 批量生成失败时，不应清空已经成功生成的候选图。

---

## 8. 图片资产

### 8.1 `ImageAssetDraft`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `asset_id` | `string` | 图片资产唯一 ID | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID | 是 | `""` |
| `episode_number` | `number` | 所属集数 | 是 | `1` |
| `prompt_id` | `string \| null` | 来源 T2I 提示词 ID | 否 | `null` |
| `task_id` | `string \| null` | 来源生成任务 ID | 否 | `null` |
| `image_url` | `string` | 图片访问 URL 或本地素材路径 | 是 | `""` |
| `thumbnail_url` | `string \| null` | 缩略图 URL | 否 | `null` |
| `asset_type` | `ImageAssetType` | 图片类型 | 是 | `"candidate"` |
| `status` | `ImageAssetStatus` | 图片状态 | 是 | `"candidate"` |
| `selection` | `ImageAssetSelectionState` | 人工选择状态 | 否 | 见下方 |
| `metadata` | `ImageAssetMetadata` | 图片元数据 | 是 | 见元数据表 |
| `lineage` | `ImageAssetLineage` | 生成来源和版本链路 | 否 | 见下方 |
| `quality_flags` | `ImageAssetQualityFlag[]` | 人工或自动标记的问题 | 否 | `[]` |
| `created_at` | `string \| null` | 创建时间 | 否 | `null` |
| `updated_at` | `string \| null` | 最近更新时间 | 否 | `null` |

### 8.2 `ImageAssetType`

| 取值 | 用途 | 默认建议 |
| --- | --- | --- |
| `"candidate"` | 普通候选图 | 是 |
| `"first_frame"` | 首帧 | 否 |
| `"keyframe"` | 关键帧 | 否 |
| `"storyboard_image"` | 分镜图 | 否 |
| `"repair"` | 修复图 | 否 |
| `"reference"` | 参考图 | 否 |

### 8.3 `ImageAssetStatus`

| 取值 | 用途 | 默认建议 |
| --- | --- | --- |
| `"candidate"` | 待选择候选图 | 是 |
| `"selected"` | 已入选 | 否 |
| `"rejected"` | 未入选但保留 | 否 |
| `"needs_repair"` | 待修复 | 否 |
| `"discarded"` | 已废弃 | 否 |
| `"restored"` | 从废弃恢复 | 否 |

### 8.4 `ImageAssetSelectionState`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `is_selected` | `boolean` | 是否为当前镜头入选图 | 否 | `false` |
| `selected_as` | `"first_frame" \| "keyframe" \| "storyboard_image" \| null` | 入选用途 | 否 | `null` |
| `selected_by` | `"manual" \| "auto_rank" \| "quality_gate" \| null` | 入选方式 | 否 | `null` |
| `selected_at` | `string \| null` | 入选时间 | 否 | `null` |
| `selection_note` | `string` | 入选备注 | 否 | `""` |

### 8.5 `ImageAssetLineage`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `parent_asset_id` | `string \| null` | 修复图或重绘图的父图 ID | 否 | `null` |
| `source_task_id` | `string \| null` | 来源任务 ID | 否 | `null` |
| `source_prompt_snapshot` | `string` | 生成时使用的正向提示词快照 | 否 | `""` |
| `source_negative_prompt_snapshot` | `string` | 生成时使用的负面提示词快照 | 否 | `""` |
| `source_params_snapshot` | `ImageGenerationParams` | 生成时使用的参数快照 | 否 | 见参数表 |
| `revision_number` | `number` | 同一镜头下的图片版本序号 | 否 | `1` |
| `operation` | `"initial_generate" \| "regenerate" \| "inpaint" \| "face_swap" \| "background_replace" \| "manual_upload"` | 生成或编辑操作 | 否 | `"initial_generate"` |

### 8.6 `ImageAssetQualityFlag`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `flag_id` | `string` | 问题标记 ID | 是 | `""` |
| `flag_type` | `"wrong_character" \| "wrong_costume" \| "bad_hands" \| "deformation" \| "background_error" \| "style_drift" \| "composition_mismatch" \| "other"` | 问题类型 | 是 | `"other"` |
| `severity` | `"low" \| "medium" \| "high"` | 严重程度 | 否 | `"medium"` |
| `description` | `string` | 问题描述 | 是 | `""` |
| `created_by` | `"manual" \| "ai_check"` | 标记来源 | 否 | `"manual"` |
| `created_at` | `string \| null` | 标记时间 | 否 | `null` |

---

## 9. 图片元数据

### 9.1 `ImageAssetMetadata`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `file_name` | `string` | 文件名 | 否 | `""` |
| `mime_type` | `string` | 图片 MIME 类型 | 否 | `"image/png"` |
| `file_size_bytes` | `number \| null` | 文件大小 | 否 | `null` |
| `width` | `number` | 图片宽度 | 否 | `0` |
| `height` | `number` | 图片高度 | 否 | `0` |
| `aspect_ratio` | `string` | 实际画面比例 | 否 | `"9:16"` |
| `model` | `string` | 生成模型 | 否 | `""` |
| `seed` | `number \| null` | 实际使用种子 | 否 | `null` |
| `character_ref_ids` | `string[]` | 图片关联角色 | 否 | `[]` |
| `scene_ref_id` | `string \| null` | 图片关联场景 | 否 | `null` |
| `prop_ref_ids` | `string[]` | 图片关联道具 | 否 | `[]` |
| `style_board_ref_id` | `string \| null` | 图片关联风格板 | 否 | `null` |
| `generated_at` | `string \| null` | 图片生成时间 | 否 | `null` |
| `provider_asset_id` | `string \| null` | 图片服务商返回的资产 ID | 否 | `null` |
| `checksum` | `string \| null` | 文件校验值，用于去重和追踪 | 否 | `null` |

### 9.2 说明

- `metadata` 同时服务筛选、详情查看、质检和后续视频生成。
- `provider_asset_id` 只保存必要引用，不建议保存完整服务商响应，避免混入敏感数据或无用日志。

---

## 10. 入选关键帧

### 10.1 `SelectedKeyframeAsset`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `selection_id` | `string` | 入选记录 ID | 是 | `""` |
| `asset_id` | `string` | 入选图片 ID | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID | 是 | `""` |
| `episode_number` | `number` | 所属集数 | 是 | `1` |
| `selected_type` | `"first_frame" \| "keyframe" \| "storyboard_image"` | 入选类型 | 是 | `"keyframe"` |
| `is_primary` | `boolean` | 是否为镜头默认素材 | 否 | `true` |
| `quality_gate_status` | `"not_sent" \| "pending" \| "passed" \| "failed" \| "needs_rework"` | 质检门禁状态 | 否 | `"not_sent"` |
| `video_ready` | `boolean` | 是否可被步骤 08 默认选用 | 否 | `false` |
| `selected_at` | `string \| null` | 入选时间 | 否 | `null` |
| `selected_by_user_id` | `string \| null` | 人工选择者 ID | 否 | `null` |
| `selection_reason` | `string` | 入选原因 | 否 | `""` |

### 10.2 说明

- 每个镜头建议至少有一个 `is_primary = true` 的入选关键帧。
- `video_ready` 不应只由步骤 06 决定，应在步骤 07 质检通过后再置为 `true`。

---

## 11. 废弃图与恢复

### 11.1 `DiscardedImageAsset`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `discard_id` | `string` | 废弃记录 ID | 是 | `""` |
| `asset_id` | `string` | 被废弃图片 ID | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID | 是 | `""` |
| `discard_reason` | `ImageDiscardReason` | 废弃原因 | 是 | `"other"` |
| `discard_note` | `string` | 废弃说明 | 否 | `""` |
| `discarded_at` | `string \| null` | 废弃时间 | 否 | `null` |
| `discarded_by_user_id` | `string \| null` | 操作者 ID | 否 | `null` |
| `can_restore` | `boolean` | 是否允许恢复 | 否 | `true` |
| `restored_at` | `string \| null` | 恢复时间 | 否 | `null` |
| `restore_note` | `string` | 恢复说明 | 否 | `""` |

### 11.2 `ImageDiscardReason`

| 取值 | 用途 | 默认建议 |
| --- | --- | --- |
| `"bad_quality"` | 画质差 | 否 |
| `"wrong_character"` | 角色错误 | 否 |
| `"wrong_scene"` | 场景错误 | 否 |
| `"style_drift"` | 风格漂移 | 否 |
| `"generation_error"` | 明显生成错误 | 否 |
| `"duplicate"` | 重复图 | 否 |
| `"manual_reject"` | 人工不采用 | 否 |
| `"other"` | 其他原因 | 是 |

### 11.3 状态保存说明

- 废弃时应同时更新 `image_assets[].status = "discarded"`，并追加 `discarded_assets` 记录。
- 恢复时应保留废弃历史，把 `restored_at` 写入记录，并把图片状态改为 `"restored"` 或 `"candidate"`。
- 废弃图不应从数组中物理删除，除非后端执行真正的素材清理任务。

---

## 12. 筛选器与排序

### 12.1 `ImageGenerationFilters`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_numbers` | `number[]` | 按集数筛选 | 否 | `[]` |
| `shot_ids` | `string[]` | 按镜头筛选 | 否 | `[]` |
| `character_ref_ids` | `string[]` | 按角色筛选 | 否 | `[]` |
| `scene_ref_ids` | `string[]` | 按场景筛选 | 否 | `[]` |
| `prop_ref_ids` | `string[]` | 按道具筛选 | 否 | `[]` |
| `asset_types` | `ImageAssetType[]` | 按图片类型筛选 | 否 | `[]` |
| `statuses` | `ImageAssetStatus[]` | 按图片状态筛选 | 否 | `[]` |
| `quality_flag_types` | `string[]` | 按问题类型筛选 | 否 | `[]` |
| `only_selected` | `boolean` | 是否只看入选图 | 否 | `false` |
| `include_discarded` | `boolean` | 是否显示废弃图 | 否 | `false` |
| `search_keyword` | `string` | 搜索镜头标题、文件名、备注 | 否 | `""` |
| `sort_by` | `"shot_number" \| "created_at" \| "updated_at" \| "status" \| "asset_type"` | 排序字段 | 否 | `"shot_number"` |
| `sort_direction` | `"asc" \| "desc"` | 排序方向 | 否 | `"asc"` |
| `group_by` | `"shot" \| "scene" \| "character" \| "status" \| "none"` | 分组方式 | 否 | `"shot"` |

### 12.2 说明

- 筛选器只影响当前素材视图，不应改变真实素材数据。
- `include_discarded` 默认为 `false`，避免废弃图干扰用户选择。

---

## 13. 放大预览

### 13.1 `ImagePreviewState`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `is_open` | `boolean` | 放大预览是否打开 | 否 | `false` |
| `active_asset_id` | `string \| null` | 当前预览图片 ID | 否 | `null` |
| `compare_asset_ids` | `string[]` | 对比预览图片 ID 列表 | 否 | `[]` |
| `zoom` | `number` | 当前缩放比例 | 否 | `1` |
| `pan_x` | `number` | 横向平移 | 否 | `0` |
| `pan_y` | `number` | 纵向平移 | 否 | `0` |
| `show_metadata_panel` | `boolean` | 是否显示元数据侧栏 | 否 | `true` |
| `show_prompt_panel` | `boolean` | 是否显示提示词侧栏 | 否 | `false` |
| `highlight_quality_flags` | `boolean` | 是否突出问题标记 | 否 | `true` |

### 13.2 说明

- 放大预览属于前端 UI 状态，可以保存到步骤数据中，也可以只保存在页面状态中。
- 若需要刷新后保持预览状态，可保存 `active_asset_id` 和 `compare_asset_ids`。

---

## 14. 生成失败、重新生成、人工选择、废弃恢复的状态保存

### 14.1 生成失败

生成失败时建议写入：

| 写入位置 | 写入内容 |
| --- | --- |
| `task_queue[].status` | 设置为 `"failed"` 或 `"partial"` |
| `task_queue[].failure` | 保存失败类型、提示文案、失败时间、是否可恢复 |
| `task_queue[].retry_policy.retry_count` | 保持当前重试次数 |
| `source_warnings` | 若失败来自上游缺失，追加阻塞提示 |

### 14.2 重新生成

重新生成时建议：

| 写入位置 | 写入内容 |
| --- | --- |
| `task_queue[]` | 新建 `generation_mode = "regenerate"` 的任务 |
| `image_assets[]` | 新候选图追加保存，不覆盖旧候选图 |
| `image_assets[].lineage.parent_asset_id` | 若针对旧图重跑，记录父图 ID |
| `task_queue[].retry_policy` | 记录是否换种子、是否修订提示词 |

### 14.3 人工选择

人工选择最佳图时建议：

| 写入位置 | 写入内容 |
| --- | --- |
| `image_assets[].selection` | 标记 `is_selected`、`selected_as`、`selected_at` |
| `selected_keyframes[]` | 新增或更新该镜头入选记录 |
| `task_queue[].selected_asset_id` | 绑定当前任务入选图 |
| 同镜头其他入选图 | 若只允许一个主图，把旧 `is_primary` 置为 `false` |

### 14.4 废弃恢复

废弃恢复时建议：

| 写入位置 | 写入内容 |
| --- | --- |
| `discarded_assets[]` | 写入 `restored_at` 和 `restore_note` |
| `image_assets[].status` | 从 `"discarded"` 改为 `"restored"` 或 `"candidate"` |
| `image_assets[].updated_at` | 更新恢复时间 |
| `quality_flags` | 保留原问题标记，不因恢复而自动清空 |

---

## 15. 步骤 06 如何读取步骤 05 的 T2I 提示词和步骤 04 的镜头数据

### 15.1 读取步骤 05 T2I 提示词

| 步骤 05 数据 | 映射到步骤 06 | 用途 |
| --- | --- | --- |
| `t2i_prompts[].prompt_id` | `prompt_source.t2i_prompt_refs[].prompt_id` | 绑定生成任务和图片来源 |
| `t2i_prompts[].shot_id` | `prompt_source.t2i_prompt_refs[].shot_id` | 一镜一提示词匹配 |
| 正向提示词 | `prompt_text` 或 `source_prompt_snapshot` | 调用图片生成模型 |
| 负面提示词 | `negative_prompt` 或 `source_negative_prompt_snapshot` | 限制错误脸、错服装、变形等问题 |
| 参数模板 | `params` 或 `source_params_snapshot` | 设置比例、分辨率、候选数量、种子、参考权重 |
| 锁定关键词 | `locked_terms` | 重新生成时避免丢失一致性要求 |

建议步骤 06 读取提示词时保存快照。即使步骤 05 后续修改提示词，已生成图片仍能追溯到当时使用的提示词版本。

### 15.2 读取步骤 04 镜头数据

| 步骤 04 数据 | 映射到步骤 06 | 用途 |
| --- | --- | --- |
| `shot_id` | `available_shots[].shot_id`、`task_queue[].shot_id`、`image_assets[].shot_id` | 图片资产和镜头绑定 |
| `shot_number` | `shot_number` | UI 排序和批量任务展示 |
| `episode_number` | `episode_number` | 按集数筛选 |
| `asset_refs.character_ref_ids` | `character_ref_ids` | 角色筛选和质检追踪 |
| `asset_refs.scene_ref_id` | `scene_ref_id` | 场景筛选和质检追踪 |
| `asset_refs.prop_ref_ids` | `prop_ref_ids` | 道具筛选和质检追踪 |
| `visual_design` | `visual_summary` | 展示镜头画面要求，辅助人工选图 |
| `production_flags.needs_keyframe` | `needs_keyframe` | 判断是否生成关键帧 |
| `production_flags.needs_storyboard_image` | `needs_storyboard_image` | 判断是否生成分镜图 |

建议步骤 06 不直接修改步骤 04 镜头数据，只保存镜头引用与必要摘要。若步骤 04 发生版本变更，步骤 06 应通过 `version_mismatch` 或 `prompt_outdated` 提醒用户确认是否重建任务。

---

## 16. 步骤 08 如何消费图片素材

步骤 08 应读取：

| 步骤 06 字段 | 视频生成用途 |
| --- | --- |
| `selected_keyframes[]` | 获取每个镜头默认关键帧 |
| `image_assets[].image_url` | 作为 I2V 首帧、关键帧或首尾帧输入 |
| `image_assets[].shot_id` | 与步骤 08 视频任务一一绑定 |
| `image_assets[].metadata.width/height/aspect_ratio` | 校验视频生成比例 |
| `image_assets[].lineage.source_prompt_snapshot` | 追溯视频素材来源 |

步骤 08 不应默认消费 `status = "discarded"` 或未入选的素材，除非用户手动覆盖。

---

## 17. 步骤元信息

### 17.1 `ImageGenerationStepMeta`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `last_generated_at` | `string \| null` | 最近生成时间 | 否 | `null` |
| `last_saved_at` | `string \| null` | 最近保存时间 | 否 | `null` |
| `last_modified_by` | `string` | 最近修改者 | 否 | `"人工"` |
| `version_status` | `string` | 当前版本状态 | 否 | `"v1 草稿"` |
| `generation_count` | `number` | 累计生成图片数量 | 否 | `0` |
| `selected_count` | `number` | 当前入选图片数量 | 否 | `0` |
| `discarded_count` | `number` | 当前废弃图片数量 | 否 | `0` |
| `pending_task_count` | `number` | 待生成任务数量 | 否 | `0` |
| `failed_task_count` | `number` | 失败任务数量 | 否 | `0` |
| `modification_records` | `string[]` | 修改记录摘要 | 否 | `[]` |

---

## 18. 后续落地到 TypeScript 的建议

1. 建议新增独立的 `ImageGenerationStepData`，不要把图片任务和素材直接塞进现有步骤字段里。
2. `ImageGenerationTask`、`ImageAssetDraft`、`SelectedKeyframeAsset` 应拆成独立类型，后续步骤 07 和 08 只通过 `asset_id`、`shot_id`、`prompt_id` 引用。
3. 任务状态、图片状态、图片类型、废弃原因建议使用联合字符串类型，便于 UI 标签、筛选器和接口校验复用。
4. 图片生成参数建议先使用通用字段加 `extra_settings`，避免被单一模型参数绑死。
5. 已生成图片必须保存提示词和参数快照，不能只保存 `prompt_id`，否则提示词更新后无法追溯历史图片。
6. 重新生成、局部重绘、换脸、换背景等操作建议通过 `lineage` 建版本链，不覆盖原图。
7. 筛选器和放大预览可以先作为前端状态实现；若希望刷新后恢复视图，再保存进步骤数据。
8. 与后端接口对接时，建议统一使用“创建任务、轮询任务、写入素材、选择素材、废弃恢复”五类动作，减少页面直接操作后端生成细节。
9. 不建议步骤 06 直接判断视频可用性最终结论，`video_ready` 应由步骤 07 质检通过后确认。

---

## 19. 结论

步骤 06「画面生成」应作为图片素材生产和筛选中台。类型设计的重点不是只保存图片 URL，而是让每张图都能追溯到镜头、提示词、参数、生成任务和人工选择记录，同时保留失败重试、废弃恢复和质检门禁状态。这样步骤 07 可以稳定做质量检查，步骤 08 可以只消费真正通过门禁的关键帧素材。
