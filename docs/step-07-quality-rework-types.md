# S07-DOC-001 步骤 07「质检返工」前端数据类型草案

本文档基于《项目步骤功能说明.md》和《主要功能页面开发明细表.md》，整理 coMGan-ai 步骤 07「质检返工」的完整前端数据类型草案。本文档只作为后续 TypeScript 落地前的设计说明，不直接修改 `apps/web/src/types.ts`。

## 1. 设计目标

步骤 07 的核心产物是图片素材质检结果、问题清单、返工建议、返工请求、通过素材包和视频生成门禁状态。前端类型需要覆盖以下能力：

- 从步骤 06「画面生成」读取候选图、入选图、图片元数据、提示词来源和生成参数。
- 对入选图执行自动质检和人工审核，覆盖角色一致性、场景道具、分镜符合性和生成错误。
- 标记通过、待修、驳回、废弃等素材状态。
- 为问题素材生成返工建议，并回流给步骤 05「提词生成」和步骤 06「画面生成」。
- 只允许通过质检的图片素材进入步骤 08「视频生成」。
- 保留自动质检与人工审核的共存机制，支持复检和审核覆盖。

## 2. 顶层数据结构建议

建议后续新增 `StepSevenQualityReworkData` 或 `QualityReworkData`：

```ts
type StepSevenQualityReworkData = {
  project_meta: QualityProjectMeta;
  upstream_context: QualityUpstreamContext;
  material_scope: QualityMaterialScope;
  tasks: QualityInspectionTask[];
  check_items: QualityCheckItem[];
  issues: QualityIssue[];
  suggestions: ReworkSuggestion[];
  rework_requests: ReworkRequest[];
  approved_assets: ApprovedQualityAsset[];
  rejected_assets: RejectedQualityAsset[];
  gate: QualityGateState;
  review_records: QualityReviewRecord[];
  versions: QualityVersionRecord[];
};
```

## 3. 字段草案

### 3.1 `QualityProjectMeta`

用于承接项目与步骤状态。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `project_id` | `string` | 当前项目 ID。 | 是 | `""` |
| `project_name` | `string` | 当前项目名称。 | 是 | `""` |
| `quality_status` | `QualityStepStatus` | 质检返工整体状态。 | 是 | `"not_started"` |
| `completion_percent` | `number` | 当前质检完成度，范围 0-100。 | 是 | `0` |
| `last_modified_by` | `"human" \| "ai" \| "system" \| string` | 最近修改来源。 | 是 | `"system"` |
| `updated_at` | `string \| null` | 最近保存时间，ISO 字符串。 | 否 | `null` |
| `updated_by` | `string \| null` | 最近保存人或来源。 | 否 | `null` |

```ts
type QualityStepStatus = "not_started" | "checking" | "issues_found" | "reworking" | "passed" | "blocked";
```

### 3.2 `QualityUpstreamContext`

记录步骤 07 如何读取步骤 06 图片素材，以及必要的步骤 05/04 来源引用。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `image_generation_ref` | `UpstreamStepRef` | 指向步骤 06 画面生成版本。 | 是 | 空引用对象 |
| `prompt_generation_ref` | `UpstreamStepRef` | 指向步骤 05 提词生成版本，用于返工回流。 | 否 | 空引用对象 |
| `storyboard_ref` | `UpstreamStepRef` | 指向步骤 04 分镜规划版本，用于分镜符合性检查。 | 否 | 空引用对象 |
| `asset_library_ref` | `UpstreamStepRef` | 指向步骤 03 资产设定版本，用于一致性检查。 | 否 | 空引用对象 |
| `sync_status` | `"not_synced" \| "synced" \| "outdated"` | 上游数据同步状态。 | 是 | `"not_synced"` |
| `outdated_reason` | `string \| null` | 上游数据过期原因。 | 否 | `null` |

```ts
type UpstreamStepRef = {
  step_id: "asset-setting" | "storyboard-planning" | "prompt-generation" | "image-generation";
  version_id: string | null;
  updated_at: string | null;
};
```

### 3.3 `QualityMaterialScope`

定义当前质检范围，覆盖候选图、入选图和图片元数据。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `included_asset_ids` | `string[]` | 纳入本轮质检的图片素材 ID。 | 是 | `[]` |
| `selected_asset_ids` | `string[]` | 当前 UI 中选中的素材 ID。 | 是 | `[]` |
| `candidate_asset_count` | `number` | 候选图数量。 | 是 | `0` |
| `selected_asset_count` | `number` | 入选图数量。 | 是 | `0` |
| `asset_filters` | `QualityAssetFilterState` | 质检素材筛选条件。 | 是 | 空筛选对象 |

```ts
type QualityAssetFilterState = {
  episode_numbers: number[];
  shot_ids: string[];
  character_ids: string[];
  scene_ids: string[];
  asset_statuses: QualityAssetStatus[];
  issue_severities: QualityIssueSeverity[];
  selected_only: boolean;
};
```

### 3.4 `QualityImageAssetRef`

步骤 07 不直接复制步骤 06 图片文件，只保存必要的引用和快照。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `asset_id` | `string` | 图片素材 ID，来自步骤 06。 | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID。 | 是 | `""` |
| `episode_id` | `string \| null` | 关联集 ID。 | 否 | `null` |
| `image_url` | `string` | 图片预览地址或资源引用。 | 是 | `""` |
| `asset_type` | `"candidate" \| "selected" \| "reworked"` | 候选图、入选图或返工图。 | 是 | `"candidate"` |
| `prompt_id` | `string \| null` | 来源 T2I 提示词 ID。 | 否 | `null` |
| `generation_param_id` | `string \| null` | 来源模型参数 ID。 | 否 | `null` |
| `metadata` | `ImageQualityMetadata` | 图片元数据快照。 | 是 | 空元数据对象 |

```ts
type ImageQualityMetadata = {
  width: number | null;
  height: number | null;
  seed: number | null;
  model_name: string | null;
  generated_at: string | null;
  source_character_ids: string[];
  source_scene_id: string | null;
  source_prop_ids: string[];
};
```

### 3.5 `QualityInspectionTask`

覆盖「质检任务」模块，支持单素材、批量素材、复检任务。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `task_id` | `string` | 质检任务 ID。 | 是 | 前端生成临时 ID |
| `task_type` | `"single_asset" \| "batch_assets" \| "recheck"` | 任务类型。 | 是 | `"single_asset"` |
| `asset_ids` | `string[]` | 本任务覆盖的素材 ID。 | 是 | `[]` |
| `check_item_ids` | `string[]` | 本任务执行的质检项 ID。 | 是 | `[]` |
| `status` | `"queued" \| "running" \| "completed" \| "failed" \| "cancelled"` | 任务状态。 | 是 | `"queued"` |
| `progress_percent` | `number` | 任务进度，范围 0-100。 | 是 | `0` |
| `created_by` | `"human" \| "ai" \| "system" \| string` | 创建来源。 | 是 | `"human"` |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `finished_at` | `string \| null` | 完成时间。 | 否 | `null` |
| `error_message` | `string \| null` | 失败原因。 | 否 | `null` |

### 3.6 `QualityCheckItem`

覆盖「质检项」模块，定义角色一致性、场景道具、分镜符合性、生成错误等检查项。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `check_item_id` | `string` | 质检项 ID。 | 是 | 前端生成临时 ID |
| `category` | `QualityIssueCategory` | 检查分类。 | 是 | `"generation_error"` |
| `label` | `string` | 展示名称。 | 是 | `""` |
| `description` | `string` | 检查说明。 | 否 | `""` |
| `method` | `"auto" \| "manual" \| "hybrid"` | 自动、人工或混合检查。 | 是 | `"hybrid"` |
| `required_for_gate` | `boolean` | 是否影响视频生成门禁。 | 是 | `true` |
| `enabled` | `boolean` | 是否启用。 | 是 | `true` |

```ts
type QualityIssueCategory =
  | "character_consistency"
  | "scene_prop_consistency"
  | "storyboard_match"
  | "generation_error"
  | "style_consistency"
  | "technical_quality"
  | "other";
```

### 3.7 `QualityIssue`

覆盖「问题分类」「严重程度」模块，记录自动质检与人工审核发现的问题。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `issue_id` | `string` | 问题 ID。 | 是 | 前端生成临时 ID |
| `asset_id` | `string` | 问题所属图片素材。 | 是 | `""` |
| `shot_id` | `string \| null` | 问题所属镜头。 | 否 | `null` |
| `category` | `QualityIssueCategory` | 问题分类。 | 是 | `"generation_error"` |
| `severity` | `QualityIssueSeverity` | 严重程度。 | 是 | `"minor"` |
| `title` | `string` | 问题标题。 | 是 | `""` |
| `description` | `string` | 问题描述。 | 是 | `""` |
| `evidence` | `QualityIssueEvidence[]` | 证据或定位信息。 | 否 | `[]` |
| `detected_by` | `"auto" \| "human"` | 发现来源。 | 是 | `"human"` |
| `review_status` | `"open" \| "confirmed" \| "dismissed" \| "resolved"` | 问题审核状态。 | 是 | `"open"` |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |

```ts
type QualityIssueSeverity = "info" | "minor" | "major" | "blocking";

type QualityIssueEvidence = {
  evidence_id: string;
  kind: "bbox" | "mask" | "note" | "reference";
  label: string;
  value: string;
};
```

### 3.8 `ReworkSuggestion`

覆盖「返工建议」模块，为问题素材生成修复建议。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `suggestion_id` | `string` | 返工建议 ID。 | 是 | 前端生成临时 ID |
| `issue_ids` | `string[]` | 对应问题 ID。 | 是 | `[]` |
| `asset_id` | `string` | 对应素材 ID。 | 是 | `""` |
| `target_step` | `"prompt-generation" \| "image-generation"` | 建议回流目标步骤。 | 是 | `"image-generation"` |
| `strategy` | `ReworkStrategy` | 返工策略。 | 是 | `"rerun_prompt"` |
| `suggested_prompt_patch` | `string` | 建议回写到步骤 05 的提示词修改。 | 否 | `""` |
| `suggested_generation_params` | `Record<string, string \| number \| boolean \| null>` | 建议回写到步骤 06 的生成参数。 | 否 | `{}` |
| `summary` | `string` | 建议摘要。 | 是 | `""` |
| `accepted` | `boolean` | 用户是否接受建议。 | 是 | `false` |

```ts
type ReworkStrategy =
  | "rerun_prompt"
  | "local_inpaint"
  | "replace_reference"
  | "adjust_prompt"
  | "reduce_complexity"
  | "manual_fix";
```

### 3.9 `ReworkRequest`

覆盖「返工请求」模块，将问题回流给步骤 05 或步骤 06。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `request_id` | `string` | 返工请求 ID。 | 是 | 前端生成临时 ID |
| `source_asset_id` | `string` | 原问题素材 ID。 | 是 | `""` |
| `source_issue_ids` | `string[]` | 触发返工的问题 ID。 | 是 | `[]` |
| `target_step` | `"prompt-generation" \| "image-generation"` | 回流目标步骤。 | 是 | `"image-generation"` |
| `strategy` | `ReworkStrategy` | 返工策略。 | 是 | `"rerun_prompt"` |
| `status` | `"draft" \| "sent" \| "in_progress" \| "completed" \| "failed" \| "cancelled"` | 请求状态。 | 是 | `"draft"` |
| `prompt_patch` | `string` | 给步骤 05 的提示词补丁。 | 否 | `""` |
| `generation_param_patch` | `Record<string, string \| number \| boolean \| null>` | 给步骤 06 的参数补丁。 | 否 | `{}` |
| `result_asset_id` | `string \| null` | 返工后生成的新素材 ID。 | 否 | `null` |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `completed_at` | `string \| null` | 完成时间。 | 否 | `null` |

### 3.10 `ApprovedQualityAsset`

覆盖「通过素材」模块，作为步骤 08 的唯一默认输入来源。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `asset_id` | `string` | 通过质检的图片素材 ID。 | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID。 | 是 | `""` |
| `approval_status` | `"approved" \| "approved_with_notes"` | 通过状态。 | 是 | `"approved"` |
| `approved_by` | `"auto" \| "human" \| string` | 通过来源。 | 是 | `"human"` |
| `approved_at` | `string` | 通过时间。 | 是 | 当前时间 ISO 字符串 |
| `remaining_notes` | `string` | 允许带入下游的轻微问题说明。 | 否 | `""` |
| `video_ready` | `boolean` | 是否可进入步骤 08。 | 是 | `true` |

### 3.11 `RejectedQualityAsset`

覆盖「驳回素材」模块，记录待修、废弃或阻断进入视频生成的素材。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `asset_id` | `string` | 被驳回的图片素材 ID。 | 是 | `""` |
| `shot_id` | `string \| null` | 关联镜头 ID。 | 否 | `null` |
| `status` | `"needs_rework" \| "rejected" \| "discarded"` | 素材处理状态。 | 是 | `"needs_rework"` |
| `reason_issue_ids` | `string[]` | 导致驳回的问题 ID。 | 是 | `[]` |
| `rejected_by` | `"auto" \| "human" \| string` | 驳回来源。 | 是 | `"human"` |
| `rejected_at` | `string` | 驳回时间。 | 是 | 当前时间 ISO 字符串 |
| `can_rework` | `boolean` | 是否允许返工。 | 是 | `true` |

```ts
type QualityAssetStatus = "unchecked" | "checking" | "passed" | "needs_rework" | "rejected" | "discarded";
```

### 3.12 `QualityGateState`

覆盖「门禁状态」模块，控制步骤 08 只能消费通过质检的图片素材。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `gate_status` | `"blocked" \| "partial" \| "passed"` | 视频生成门禁状态。 | 是 | `"blocked"` |
| `required_asset_count` | `number` | 应通过质检的素材数量。 | 是 | `0` |
| `approved_asset_count` | `number` | 已通过素材数量。 | 是 | `0` |
| `blocking_issue_count` | `number` | 阻断级问题数量。 | 是 | `0` |
| `missing_shot_ids` | `string[]` | 尚无通过素材的镜头 ID。 | 是 | `[]` |
| `approved_asset_ids_for_video` | `string[]` | 步骤 08 可读取的素材 ID 白名单。 | 是 | `[]` |
| `updated_at` | `string \| null` | 门禁状态更新时间。 | 否 | `null` |

### 3.13 `QualityReviewRecord`

用于记录自动质检与人工审核共存时的判定过程。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `review_id` | `string` | 审核记录 ID。 | 是 | 前端生成临时 ID |
| `asset_id` | `string` | 被审核素材 ID。 | 是 | `""` |
| `reviewer_type` | `"auto" \| "human"` | 审核来源类型。 | 是 | `"human"` |
| `reviewer_name` | `string` | 审核者名称或系统名。 | 否 | `""` |
| `decision` | `"pass" \| "needs_rework" \| "reject" \| "dismiss_issue"` | 审核决定。 | 是 | `"needs_rework"` |
| `notes` | `string` | 审核说明。 | 否 | `""` |
| `overrides_review_id` | `string \| null` | 若人工覆盖自动判定，记录被覆盖的审核 ID。 | 否 | `null` |
| `created_at` | `string` | 审核时间。 | 是 | 当前时间 ISO 字符串 |

### 3.14 `QualityVersionRecord`

记录质检报告、门禁状态和人工判定的版本快照。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `version_id` | `string` | 版本 ID。 | 是 | 前端生成临时 ID |
| `version_no` | `number` | 版本序号。 | 是 | `1` |
| `source` | `"auto_check" \| "manual_review" \| "recheck" \| "gate_update" \| "rework_return"` | 版本来源。 | 是 | `"manual_review"` |
| `summary` | `string` | 版本摘要。 | 是 | `""` |
| `snapshot` | `QualitySnapshot` | 可恢复快照。 | 是 | 空快照 |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `created_by` | `"human" \| "ai" \| "system" \| string` | 创建来源。 | 是 | `"human"` |

```ts
type QualitySnapshot = {
  tasks: QualityInspectionTask[];
  issues: QualityIssue[];
  suggestions: ReworkSuggestion[];
  rework_requests: ReworkRequest[];
  approved_assets: ApprovedQualityAsset[];
  rejected_assets: RejectedQualityAsset[];
  gate: QualityGateState;
};
```

## 4. 步骤 07 如何读取步骤 06 图片数据

步骤 07 应从步骤 06 读取以下数据，并转换为 `QualityImageAssetRef`：

- 候选图：`asset_type = "candidate"`，可纳入检查但默认不进入视频门禁。
- 入选图：`asset_type = "selected"`，默认纳入门禁检查范围。
- 图片元数据：保留 `prompt_id`、模型名、种子、尺寸、角色/场景/道具来源，便于追溯问题来源。
- 图片状态：若步骤 06 已标记废弃，则步骤 07 默认不纳入 `included_asset_ids`。
- 镜头归属：通过 `shot_id` 和 `episode_id` 与步骤 04 对齐，确保每个镜头至少有一张可用通过素材。

步骤 07 不应复制图片二进制或本地文件，只保存可追踪 ID、URL、元数据快照和质检结果。

## 5. 返工请求如何回流给步骤 05 与步骤 06

### 5.1 回流给步骤 05「提词生成」

当问题源自提示词不足、角色一致性词缺失、负面词不够或镜头复杂度过高时，`ReworkRequest.target_step` 应为 `"prompt-generation"`：

- `prompt_patch` 写入建议追加、删除或替换的提示词片段。
- `source_issue_ids` 记录对应问题，便于步骤 05 展示返工来源。
- 步骤 05 接收后应创建新的提示词版本，不直接覆盖人工编辑内容。
- 新提示词生成后，步骤 06 可基于新 `prompt_id` 重新生成图片。

### 5.2 回流给步骤 06「画面生成」

当问题可通过局部重绘、重跑种子、替换参考图、调整参数解决时，`ReworkRequest.target_step` 应为 `"image-generation"`：

- `generation_param_patch` 写入建议调整的模型参数、参考权重或生成数量。
- `strategy = "local_inpaint"` 时，步骤 06 可生成修复图并回填 `result_asset_id`。
- 返工完成后，步骤 07 通过 `task_type = "recheck"` 发起复检。

## 6. 步骤 08 如何只消费通过质检的图片素材

步骤 08「视频生成」只能默认读取 `QualityGateState.approved_asset_ids_for_video` 中的素材：

- `gate_status = "blocked"` 时，步骤 08 禁止批量生成视频，只展示缺失镜头和阻断问题。
- `gate_status = "partial"` 时，步骤 08 仅允许对通过质检的镜头生成视频。
- `gate_status = "passed"` 时，步骤 08 可读取完整通过素材包。
- 对 `RejectedQualityAsset` 或 `status = "needs_rework"` 的素材，步骤 08 不应默认选中。
- 若用户强制使用未通过素材，必须产生人工审核记录和风险提示，不应静默绕过门禁。

## 7. 人工审核与自动质检共存机制

- 自动质检负责初筛，生成 `QualityIssue.detected_by = "auto"` 和自动审核记录。
- 人工审核可以确认、驳回或忽略自动问题，并通过 `overrides_review_id` 记录覆盖关系。
- 人工审核可以新增自动质检没有发现的问题，`detected_by = "human"`。
- 门禁计算默认以人工审核后的最终状态为准；没有人工审核时，使用自动质检结果。
- 阻断级问题 `severity = "blocking"` 未解决时，门禁必须保持 `"blocked"`。
- 自动复检不应删除人工记录，只能新增版本和新的问题状态。

## 8. 后续落地到 TypeScript 的建议

- 优先新增步骤 07 专用类型，不直接修改现有 `ProjectRecord` 顶层结构。
- `QualityImageAssetRef` 应与后续步骤 06 的 `ImageAsset` 类型保持 ID 对齐，避免复制二进制或大字段。
- `QualityIssueCategory`、`QualityIssueSeverity` 建议导出复用，后续质检报告、返工任务和统计面板都会用到。
- 门禁计算建议独立成纯函数，例如 `deriveQualityGateState(assets, issues, reviews)`。
- 返工请求应作为跨步骤协作对象，步骤 05/06 接收后创建自己的版本记录。
- 人工审核覆盖自动质检时必须保留原自动记录，方便追溯。
- 后续 API 落地时按 `projectId + stepId` 保存完整质检状态，并为 `approved_asset_ids_for_video` 提供稳定读取接口。

## 9. 本任务不落地的内容

- 不修改 `apps/web/src/types.ts`。
- 不修改步骤 07 页面实现。
- 不新增 API 或后端模型。
- 不更新任务状态表、审核日志或协作调度文档。
- 不处理步骤 05、步骤 06、步骤 08 的页面实现。
