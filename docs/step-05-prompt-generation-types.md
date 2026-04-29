# S05-DOC-001 步骤 05「提词生成」前端数据类型草案

本文档基于《项目步骤功能说明.md》和《主要功能页面开发明细表.md》，整理 coMGan-ai 步骤 05「提词生成」的完整前端数据类型草案。本文档只作为后续 TypeScript 落地前的设计说明，不直接修改 `apps/web/src/types.ts`。

## 1. 设计目标

步骤 05 的核心产物是镜头级 T2I 图片提示词、I2V 视频提示词、负面提示词、模型参数、锁定关键词和版本记录。前端类型需要覆盖以下能力：

- 从步骤 03「资产设定」读取角色卡、场景卡、道具卡、风格板、参考图、统一性规则和提示词模板。
- 从步骤 04「分镜规划」读取镜头列表、角色引用、场景引用、道具引用、动作、运镜、台词和时长。
- 支持按集数、场景、角色、状态筛选镜头，并批量选择。
- 支持单镜头生成、批量生成和重新生成 T2I/I2V 提示词。
- 支持负面提示词、模型参数、锁定关键词、批量替换和版本保存。
- 避免 AI 重新生成直接覆盖人工修改内容，所有生成结果先进入草稿或预览区。
- 让步骤 06「画面生成」消费 T2I 数据，让步骤 08「视频生成」消费 I2V 数据。

## 2. 顶层数据结构建议

建议后续新增 `StepFivePromptGenerationData` 或 `PromptLibraryData`：

```ts
type StepFivePromptGenerationData = {
  project_meta: PromptProjectMeta;
  upstream_context: PromptUpstreamContext;
  shot_filter: PromptShotFilterState;
  selected_shot_ids: string[];
  t2i_prompts: T2IPromptRecord[];
  i2v_prompts: I2VPromptRecord[];
  negative_prompts: NegativePromptProfile[];
  params: PromptGenerationParamProfile[];
  locked_terms: LockedPromptTerm[];
  batch_replace: PromptBatchReplaceState;
  generation_jobs: PromptGenerationJob[];
  versions: PromptVersionRecord[];
  modification_records: PromptModificationRecord[];
};
```

## 3. 字段草案

### 3.1 `PromptProjectMeta`

用于承接项目与步骤状态。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `project_id` | `string` | 当前项目 ID。 | 是 | `""` |
| `project_name` | `string` | 当前项目名称。 | 是 | `""` |
| `prompt_status` | `PromptLibraryStatus` | 提词库整体状态。 | 是 | `"empty"` |
| `completion_percent` | `number` | 提词生成完成度，范围 0-100。 | 是 | `0` |
| `last_modified_by` | `"human" \| "ai" \| "system" \| string` | 最近修改来源。 | 是 | `"system"` |
| `updated_at` | `string \| null` | 最近保存时间，ISO 字符串。 | 否 | `null` |
| `updated_by` | `string \| null` | 最近保存人或来源。 | 否 | `null` |

```ts
type PromptLibraryStatus = "empty" | "drafting" | "generating" | "generated" | "reviewing" | "locked";
```

### 3.2 `PromptUpstreamContext`

记录步骤 05 如何读取步骤 03 和步骤 04。该结构保存引用、摘要和同步状态，不复制完整上游数据。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `asset_library_ref` | `UpstreamStepRef` | 指向步骤 03 资产设定版本。 | 是 | 空引用对象 |
| `shot_list_ref` | `UpstreamStepRef` | 指向步骤 04 分镜规划版本。 | 是 | 空引用对象 |
| `asset_snapshot_summary` | `AssetPromptSourceSummary` | 资产库摘要。 | 否 | 空摘要对象 |
| `shot_snapshot_summary` | `ShotPromptSourceSummary` | 分镜列表摘要。 | 否 | 空摘要对象 |
| `sync_status` | `"not_synced" \| "synced" \| "outdated"` | 上游数据同步状态。 | 是 | `"not_synced"` |
| `outdated_reason` | `string \| null` | 上游变更导致过期的原因。 | 否 | `null` |

```ts
type UpstreamStepRef = {
  step_id: "asset-setting" | "storyboard-planning";
  version_id: string | null;
  updated_at: string | null;
};

type AssetPromptSourceSummary = {
  character_count: number;
  scene_count: number;
  prop_count: number;
  has_style_board: boolean;
  consistency_rule_count: number;
  template_count: number;
};

type ShotPromptSourceSummary = {
  shot_count: number;
  episode_count: number;
  total_duration_sec: number | null;
};
```

### 3.3 `PromptShotFilterState`

覆盖「镜头筛选」模块，支持按集数、场景、角色、提示词状态筛选镜头。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_numbers` | `number[]` | 筛选集数。 | 否 | `[]` |
| `scene_ids` | `string[]` | 筛选场景 ID，来自步骤 03 场景卡。 | 否 | `[]` |
| `character_ids` | `string[]` | 筛选角色 ID，来自步骤 03 角色卡。 | 否 | `[]` |
| `prop_ids` | `string[]` | 筛选道具 ID。 | 否 | `[]` |
| `prompt_statuses` | `PromptItemStatus[]` | 按提示词状态筛选。 | 否 | `[]` |
| `keyword` | `string` | 文本关键词搜索。 | 否 | `""` |
| `selected_only` | `boolean` | 是否只显示已选镜头。 | 是 | `false` |
| `sort_by` | `"shot_order" \| "episode" \| "status" \| "updated_at"` | 排序字段。 | 是 | `"shot_order"` |

```ts
type PromptItemStatus = "empty" | "draft" | "generated" | "edited" | "locked" | "needs_regen";
```

### 3.4 `T2IPromptRecord`

覆盖「T2I 提示词」模块，供步骤 06 画面生成消费。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `prompt_id` | `string` | T2I 提示词 ID。 | 是 | 前端生成临时 ID |
| `shot_id` | `string` | 关联步骤 04 镜头 ID。 | 是 | `""` |
| `episode_id` | `string \| null` | 关联集 ID。 | 否 | `null` |
| `positive_prompt` | `string` | 图片正向提示词正文。 | 是 | `""` |
| `negative_prompt_id` | `string \| null` | 关联负面提示词配置。 | 否 | `null` |
| `param_profile_id` | `string \| null` | 关联模型参数配置。 | 否 | `null` |
| `source_asset_ids` | `PromptSourceAssetRefs` | 关联角色、场景、道具、风格来源。 | 是 | 空引用对象 |
| `locked_term_ids` | `string[]` | 应注入且不能丢失的锁定词 ID。 | 否 | `[]` |
| `status` | `PromptItemStatus` | 当前提示词状态。 | 是 | `"empty"` |
| `manual_edited` | `boolean` | 是否有人工编辑。 | 是 | `false` |
| `protected_from_regen` | `boolean` | 是否禁止重新生成覆盖。 | 是 | `false` |
| `last_generated_at` | `string \| null` | 最近 AI 生成时间。 | 否 | `null` |
| `updated_at` | `string \| null` | 最近修改时间。 | 否 | `null` |

```ts
type PromptSourceAssetRefs = {
  character_ids: string[];
  scene_id: string | null;
  prop_ids: string[];
  style_board_id: string | null;
  template_ids: string[];
  consistency_rule_ids: string[];
};
```

### 3.5 `I2VPromptRecord`

覆盖「I2V 提示词」模块，供步骤 08 视频生成消费。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `prompt_id` | `string` | I2V 提示词 ID。 | 是 | 前端生成临时 ID |
| `shot_id` | `string` | 关联步骤 04 镜头 ID。 | 是 | `""` |
| `episode_id` | `string \| null` | 关联集 ID。 | 否 | `null` |
| `motion_prompt` | `string` | 动作与动态描述。 | 是 | `""` |
| `camera_prompt` | `string` | 运镜、景别和镜头节奏描述。 | 是 | `""` |
| `full_prompt` | `string` | 合并后的完整视频提示词。 | 是 | `""` |
| `negative_prompt_id` | `string \| null` | 关联负面提示词配置。 | 否 | `null` |
| `param_profile_id` | `string \| null` | 关联视频模型参数。 | 否 | `null` |
| `source_asset_ids` | `PromptSourceAssetRefs` | 关联资产来源。 | 是 | 空引用对象 |
| `shot_duration_sec` | `number \| null` | 来自步骤 04 的镜头时长。 | 否 | `null` |
| `locked_term_ids` | `string[]` | 锁定关键词。 | 否 | `[]` |
| `status` | `PromptItemStatus` | 当前提示词状态。 | 是 | `"empty"` |
| `manual_edited` | `boolean` | 是否有人工编辑。 | 是 | `false` |
| `protected_from_regen` | `boolean` | 是否禁止重新生成覆盖。 | 是 | `false` |
| `last_generated_at` | `string \| null` | 最近 AI 生成时间。 | 否 | `null` |
| `updated_at` | `string \| null` | 最近修改时间。 | 否 | `null` |

### 3.6 `NegativePromptProfile`

覆盖「负面提示词」模块，可全局、角色、场景、镜头级复用。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `negative_prompt_id` | `string` | 负面提示词配置 ID。 | 是 | 前端生成临时 ID |
| `scope` | `"global" \| "character" \| "scene" \| "shot" \| "video"` | 作用域。 | 是 | `"global"` |
| `owner_id` | `string \| null` | 作用对象 ID，例如角色 ID、场景 ID 或镜头 ID。 | 否 | `null` |
| `terms` | `string[]` | 负面词列表。 | 是 | `[]` |
| `prompt_text` | `string` | 拼接后的负面提示词文本。 | 是 | `""` |
| `source_rule_ids` | `string[]` | 来源步骤 03 一致性规则 ID。 | 否 | `[]` |
| `enabled` | `boolean` | 是否启用。 | 是 | `true` |
| `updated_at` | `string \| null` | 最近更新时间。 | 否 | `null` |

### 3.7 `PromptGenerationParamProfile`

覆盖「模型参数」模块，支持图片、视频模型分别配置。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `param_profile_id` | `string` | 参数配置 ID。 | 是 | 前端生成临时 ID |
| `target` | `"t2i" \| "i2v"` | 参数适用类型。 | 是 | `"t2i"` |
| `model_name` | `string` | 模型名称。 | 是 | `""` |
| `aspect_ratio` | `"16:9" \| "9:16" \| "1:1" \| "4:5" \| string` | 画面比例。 | 是 | `"9:16"` |
| `resolution` | `string` | 分辨率描述。 | 否 | `""` |
| `batch_count` | `number` | 单次生成数量。 | 是 | `1` |
| `seed` | `number \| null` | 随机种子。 | 否 | `null` |
| `reference_weight` | `number \| null` | 参考图权重。 | 否 | `null` |
| `duration_sec` | `number \| null` | 视频时长，仅 I2V 常用。 | 否 | `null` |
| `extra` | `Record<string, string \| number \| boolean \| null>` | 模型特定扩展参数。 | 否 | `{}` |

### 3.8 `LockedPromptTerm`

覆盖「锁定关键词」模块，保证重新生成时角色一致性、服装、发型、风格关键词不丢。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `term_id` | `string` | 锁定词 ID。 | 是 | 前端生成临时 ID |
| `scope` | `"global" \| "character" \| "scene" \| "prop" \| "style" \| "shot"` | 作用域。 | 是 | `"global"` |
| `owner_id` | `string \| null` | 关联资产或镜头 ID。 | 否 | `null` |
| `term` | `string` | 锁定关键词。 | 是 | `""` |
| `reason` | `string` | 锁定原因。 | 否 | `""` |
| `source_rule_id` | `string \| null` | 来源一致性规则 ID。 | 否 | `null` |
| `enabled` | `boolean` | 是否启用。 | 是 | `true` |

### 3.9 `PromptBatchReplaceState`

覆盖「批量替换」模块，用于替换风格词、角色描述、场景词或负面词。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `rules` | `PromptBatchReplaceRule[]` | 批量替换规则。 | 是 | `[]` |
| `preview_items` | `PromptBatchReplacePreviewItem[]` | 替换预览结果。 | 否 | `[]` |
| `scope` | `"selected_shots" \| "current_filter" \| "all"` | 替换范围。 | 是 | `"selected_shots"` |
| `target_prompt_types` | `("t2i" \| "i2v" \| "negative")[]` | 替换目标类型。 | 是 | `["t2i"]` |
| `status` | `"idle" \| "previewing" \| "preview_ready" \| "applied" \| "failed"` | 当前批量替换状态。 | 是 | `"idle"` |
| `last_error` | `string \| null` | 最近失败原因。 | 否 | `null` |
| `rollback_version_id` | `string \| null` | 应用前自动保存的回滚版本 ID。 | 否 | `null` |

```ts
type PromptBatchReplaceRule = {
  rule_id: string;
  find_text: string;
  replace_text: string;
  match_case: boolean;
  enabled: boolean;
};

type PromptBatchReplacePreviewItem = {
  item_id: string;
  prompt_id: string;
  prompt_type: "t2i" | "i2v" | "negative";
  before_text: string;
  after_text: string;
  accepted: boolean;
};
```

### 3.10 `PromptGenerationJob`

记录单镜头生成、批量生成、重新生成的过程状态。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `job_id` | `string` | 生成任务 ID。 | 是 | 前端生成临时 ID |
| `mode` | `"single" \| "batch" \| "regenerate"` | 生成模式。 | 是 | `"single"` |
| `target_prompt_types` | `("t2i" \| "i2v")[]` | 生成目标。 | 是 | `["t2i"]` |
| `shot_ids` | `string[]` | 影响的镜头 ID 列表。 | 是 | `[]` |
| `status` | `"queued" \| "running" \| "preview_ready" \| "applied" \| "failed" \| "cancelled"` | 任务状态。 | 是 | `"queued"` |
| `preview_prompt_ids` | `string[]` | 生成后尚未应用的预览提示词 ID。 | 否 | `[]` |
| `source_version_id` | `string \| null` | 生成前自动保存的版本 ID。 | 否 | `null` |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `finished_at` | `string \| null` | 完成时间。 | 否 | `null` |
| `error_message` | `string \| null` | 失败原因。 | 否 | `null` |

### 3.11 `PromptVersionRecord`

覆盖「版本记录」模块，用于保存生成、编辑、批量替换、重新生成前后的快照。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `version_id` | `string` | 版本 ID。 | 是 | 前端生成临时 ID |
| `version_no` | `number` | 版本序号。 | 是 | `1` |
| `scope` | `"library" \| "shot" \| "batch"` | 版本范围。 | 是 | `"library"` |
| `shot_ids` | `string[]` | 版本涉及的镜头。 | 否 | `[]` |
| `source` | `"manual_save" \| "single_generation" \| "batch_generation" \| "regeneration" \| "batch_replace" \| "import"` | 版本来源。 | 是 | `"manual_save"` |
| `summary` | `string` | 版本摘要。 | 是 | `""` |
| `snapshot` | `PromptLibrarySnapshot` | 可恢复快照。 | 是 | 空快照 |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `created_by` | `"human" \| "ai" \| "system" \| string` | 创建来源。 | 是 | `"human"` |
| `restorable` | `boolean` | 是否允许恢复。 | 是 | `true` |

```ts
type PromptLibrarySnapshot = {
  t2i_prompts: T2IPromptRecord[];
  i2v_prompts: I2VPromptRecord[];
  negative_prompts: NegativePromptProfile[];
  params: PromptGenerationParamProfile[];
  locked_terms: LockedPromptTerm[];
};
```

### 3.12 `PromptModificationRecord`

用于展示修改记录和追踪谁在何时改了哪些提示词。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `record_id` | `string` | 修改记录 ID。 | 是 | 前端生成临时 ID |
| `action` | `string` | 修改动作，例如单镜生成、人工编辑、批量替换。 | 是 | `""` |
| `actor` | `"human" \| "ai" \| "system" \| string` | 修改来源。 | 是 | `"human"` |
| `created_at` | `string` | 修改时间。 | 是 | 当前时间 ISO 字符串 |
| `related_prompt_ids` | `string[]` | 关联提示词 ID。 | 否 | `[]` |
| `related_version_id` | `string \| null` | 关联版本 ID。 | 否 | `null` |
| `detail` | `string` | 详细说明。 | 否 | `""` |

## 4. 步骤 05 如何读取步骤 03 与步骤 04

### 4.1 读取步骤 03「资产设定」

步骤 05 应读取资产库的以下数据：

- `characters`：角色姓名、身份、外貌、服装、发型、标志物、表情范围，注入角色一致性提示词。
- `scenes`：空间结构、光线、氛围、常用镜头角度，注入场景提示词。
- `props`：外观、功能、剧情作用，注入道具提示词。
- `style_board`：画风、色彩、光影、镜头质感、材质、画面比例，作为全局风格模板。
- `references`：参考图 ID、归属对象和主参考图标记，用于参数中的参考权重和来源追踪。
- `consistency_rules`：正向词、负面词、锁定词，生成 `NegativePromptProfile` 和 `LockedPromptTerm`。
- `prompt_templates`：角色、场景、道具、风格模板，用于生成 T2I/I2V 初稿。

建议通过 `PromptUpstreamContext.asset_library_ref.version_id` 记录本次提示词基于哪一版资产库生成。资产库更新后，将 `sync_status` 标为 `"outdated"`，提示用户选择是否批量重新生成。

### 4.2 读取步骤 04「分镜规划」

步骤 05 应读取分镜规划的以下数据：

- 镜头 ID、集数、顺序和时长：映射到提示词的 `shot_id`、`episode_id`、`shot_duration_sec`。
- 角色引用：映射到 `source_asset_ids.character_ids`。
- 场景引用：映射到 `source_asset_ids.scene_id`。
- 道具引用：映射到 `source_asset_ids.prop_ids`。
- 景别、角度、构图、角色站位、动作、表情：生成 T2I 正向提示词和 I2V 动作提示词。
- 运镜、节奏、情绪强度：生成 I2V 的 `camera_prompt` 与 `motion_prompt`。
- 台词、旁白、字幕引用：辅助镜头语境，但不应直接塞入画面提示词的无关部分。

建议通过 `PromptUpstreamContext.shot_list_ref.version_id` 记录本次提示词基于哪一版镜头表生成。镜头新增、删除或重排后，相关提示词标为 `"needs_regen"`。

## 5. 步骤 06 与步骤 08 如何消费提示词数据

### 5.1 步骤 06「画面生成」消费方式

步骤 06 应读取：

- `t2i_prompts[].positive_prompt`：图片生成正向提示词。
- `negative_prompt_id` 对应的 `NegativePromptProfile.prompt_text`：图片负面提示词。
- `param_profile_id` 对应的 T2I 参数：比例、分辨率、模型、数量、种子、参考图权重。
- `source_asset_ids` 与 `locked_term_ids`：用于素材详情追踪和质检定位。

步骤 06 生成的 `ImageAsset` 应保存 `prompt_id`，保证候选图可追溯到具体 T2I 提示词版本。

### 5.2 步骤 08「视频生成」消费方式

步骤 08 应读取：

- `i2v_prompts[].full_prompt` 或 `motion_prompt + camera_prompt`：视频生成提示词。
- `negative_prompt_id` 对应的视频负面提示词。
- `param_profile_id` 对应的 I2V 参数：模型、时长、比例、参考权重等。
- `shot_duration_sec`：与步骤 04 的镜头时长对齐。
- `source_asset_ids` 与 `locked_term_ids`：用于失败重生成和一致性检查。

步骤 08 生成的 `VideoClip` 应保存 `prompt_id`，并在失败重试时生成新的提示词版本或记录复用旧版本。

## 6. 生成与版本保护策略

### 6.1 单镜头生成

- 生成前创建 `PromptVersionRecord`，`source = "single_generation"`，保存目标镜头当前提示词快照。
- AI 结果先写入 `PromptGenerationJob.preview_prompt_ids`，状态为 `"preview_ready"`。
- 用户点击应用后才覆盖正式 `T2IPromptRecord` 或 `I2VPromptRecord`。
- 若目标提示词 `manual_edited = true` 或 `protected_from_regen = true`，默认只生成预览，不自动覆盖。

### 6.2 批量生成

- 批量生成前创建范围为 `"batch"` 的版本快照。
- 对每个镜头生成独立的 T2I/I2V 草稿结果，保存在预览区。
- 批量应用时跳过 `protected_from_regen = true` 的提示词，除非用户二次确认。
- 批量失败时保留已生成预览，不修改正式提示词。

### 6.3 重新生成

- 重新生成必须记录 `source_version_id`，方便回滚到重生成前。
- 对人工编辑过的提示词，默认保留旧版本，并将新结果标记为候选。
- 重新生成时强制注入 `locked_terms`，避免角色脸型、服装、发型、风格关键词丢失。
- 重新生成完成后追加 `PromptModificationRecord`，记录影响镜头、目标类型和是否应用。

## 7. 后续落地到 TypeScript 的建议

- 优先新增步骤 05 专用类型，不直接修改现有步骤数据结构。
- 将 `T2IPromptRecord`、`I2VPromptRecord`、`NegativePromptProfile`、`PromptGenerationParamProfile` 设计为可被步骤 06/08 复用的导出类型。
- `PromptUpstreamContext` 第一版可只记录上游版本引用和摘要，不做复杂依赖图。
- `manual_edited` 与 `protected_from_regen` 是防覆盖关键字段，页面实现时应在重新生成按钮旁给出二次确认。
- 批量替换应先走 `preview_items`，应用前自动创建 `rollback_version_id`。
- 参数配置建议分 T2I/I2V 两套，但共用 `PromptGenerationParamProfile`，通过 `target` 区分。
- 后续 API 落地时按 `projectId + stepId` 保存完整提示词库，并让图片/视频任务只引用 `prompt_id` 与版本号。

## 8. 本任务不落地的内容

- 不修改 `apps/web/src/types.ts`。
- 不修改步骤 05 页面实现。
- 不新增 API 或后端模型。
- 不更新任务状态表、审核日志或协作调度文档。
- 不处理步骤 06、步骤 08 的页面实现。
