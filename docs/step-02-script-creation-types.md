# S02-DOC-001 步骤 02「剧本创作」前端数据类型草案

本文档基于《项目步骤功能说明.md》和《主要功能页面开发明细表.md》，整理 coMGan-ai 步骤 02「剧本创作」的前端数据类型草案。本文档只作为后续 TypeScript 落地前的设计说明，不直接修改 `apps/web/src/types.ts`。

## 1. 设计目标

步骤 02 的核心产物是一份可审核、可改写、可拆分镜、可进入配音字幕环节的单集正式剧本。前端类型需要覆盖以下能力：

- 从步骤 01 读取单集大纲、角色关系、世界观和本集钩子。
- 支持选择当前创作集数，并保留当前集上下文。
- 支持导入小说正文、参考文本、术语库和写作指导。
- 保存剧本文本、对白、旁白、动作、情绪和节奏标记。
- 支持局部改写、批量改写、格式化标记和一致性审核。
- 保存审核意见、修改记录、版本历史和可回滚快照。
- 保持与现有 `StepTwoData` 的平滑迁移，不破坏旧项目数据。

## 2. 顶层数据结构建议

建议后续将当前扁平的 `StepTwoData` 逐步迁移为以下结构：

```ts
type StepTwoScriptCreationData = {
  project_meta: StepTwoProjectMeta;
  episode_selection: ScriptEpisodeSelection;
  current_episode_context: ScriptEpisodeContext;
  material_imports: ScriptMaterialLibrary;
  script_draft: ScriptDraftDocument;
  formatting_marks: ScriptFormattingMark[];
  rewrite_workspace: ScriptRewriteWorkspace;
  batch_rewrite: ScriptBatchRewriteState;
  review: ScriptReviewState;
  versions: ScriptVersionRecord[];
  modification_records: ScriptModificationRecord[];
};
```

## 3. 字段草案

### 3.1 `StepTwoProjectMeta`

用于承接当前项目与步骤状态信息，替代现有散落在 `StepTwoData` 顶层的项目状态字段。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `project_name` | `string` | 当前项目名称，用于顶部展示和保存载荷冗余。 | 是 | `""` |
| `project_status` | `string` | 当前项目状态，例如草稿、生成中、待审核。 | 是 | `"草稿"` |
| `body_readiness` | `number` | 素材准备度或正文准备度，范围建议 0-100。 | 是 | `0` |
| `script_status` | `ScriptStatus` | 剧本阶段状态。 | 是 | `"draft"` |
| `version_status` | `VersionStatus` | 当前版本状态，例如草稿、已保存、待审核。 | 是 | `"draft"` |
| `last_modified_by` | `"human" \| "ai" \| "system" \| string` | 最近修改来源。 | 是 | `"system"` |
| `updated_at` | `string \| null` | 当前步骤最近更新时间，ISO 字符串。 | 否 | `null` |
| `updated_by` | `string \| null` | 最近修改人或修改来源。 | 否 | `null` |

建议枚举：

```ts
type ScriptStatus = "empty" | "draft" | "generated" | "reviewing" | "approved";
type VersionStatus = "draft" | "saved" | "pending_review" | "locked";
```

### 3.2 `ScriptEpisodeSelection`

覆盖「集数选择」模块，确保切换集数时可以保留未保存提示与上下文。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `selected_episode_id` | `string \| null` | 当前选中的集 ID，优先使用步骤 01 单集大纲 ID。 | 是 | `null` |
| `selected_episode_number` | `number \| null` | 当前选中的集数序号。 | 是 | `null` |
| `available_episodes` | `EpisodeOption[]` | 可选集数列表，来自步骤 01 单集大纲。 | 是 | `[]` |
| `has_unsaved_changes` | `boolean` | 切换集数前是否存在未保存改动。 | 是 | `false` |
| `last_confirmed_episode_id` | `string \| null` | 最近完成保存或确认切换的集 ID。 | 否 | `null` |

```ts
type EpisodeOption = {
  episode_id: string;
  episode_number: number;
  title: string;
  hook: string;
  outline_summary: string;
  status: "not_started" | "drafting" | "generated" | "reviewing" | "approved";
};
```

### 3.3 `ScriptEpisodeContext`

覆盖「当前集上下文」模块，作为 AI 生成剧本与一致性检查的主要输入。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_id` | `string \| null` | 当前集 ID。 | 是 | `null` |
| `episode_title` | `string` | 当前集标题。 | 是 | `""` |
| `episode_outline` | `string` | 当前集大纲正文。 | 是 | `""` |
| `episode_hook` | `string` | 本集钩子或结尾悬念。 | 否 | `""` |
| `core_event` | `string` | 本集核心事件。 | 否 | `""` |
| `turning_point` | `string` | 本集反转点。 | 否 | `""` |
| `character_relationships` | `string` | 与本集相关的人物关系摘要。 | 否 | `""` |
| `worldview_summary` | `string` | 世界观或设定摘要。 | 否 | `""` |
| `continuity_notes` | `string[]` | 从步骤 01 连续性检查继承的注意事项。 | 否 | `[]` |

### 3.4 `ScriptMaterialLibrary`

覆盖「素材导入」模块，替代当前 `source_material`、`reference_text`、`novel_text`、`character_profiles`、`terminology_library`、`writing_guidance` 等分散字段。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `source_material` | `ScriptImportedMaterial` | 通用素材或故事资料。 | 是 | 空素材对象 |
| `novel_body` | `ScriptImportedMaterial` | 小说正文或待改编文本。 | 是 | 空素材对象 |
| `reference_text` | `ScriptImportedMaterial` | 参考文本、竞品文本或风格样例。 | 是 | 空素材对象 |
| `terminology_library` | `ScriptImportedMaterial` | 术语库、专名、设定词表。 | 是 | 空素材对象 |
| `writing_guidance` | `ScriptImportedMaterial` | 写作指导、口吻要求、平台约束。 | 是 | 空素材对象 |
| `character_profiles` | `ScriptImportedMaterial` | 人设资料或角色画像摘要。 | 否 | 空素材对象 |
| `import_errors` | `ImportErrorRecord[]` | 导入失败、解析失败或类型校验错误。 | 否 | `[]` |

```ts
type ScriptMaterialKind =
  | "source_material"
  | "novel_body"
  | "reference_text"
  | "terminology_library"
  | "writing_guidance"
  | "character_profiles";

type ScriptImportedMaterial = {
  kind: ScriptMaterialKind;
  content: string;
  imported_file_name: string | null;
  file_type: ".txt" | ".md" | ".json" | ".docx" | "manual" | string;
  imported_at: string | null;
  parse_status: "empty" | "parsed" | "failed";
  editable: boolean;
};

type ImportErrorRecord = {
  id: string;
  material_kind: ScriptMaterialKind;
  message: string;
  created_at: string;
};
```

### 3.5 `ScriptDraftDocument`

覆盖「剧本文本」模块，后续可作为分镜规划和音频字幕的主要上游数据。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `script_id` | `string` | 当前剧本文档 ID。 | 是 | 前端生成临时 ID |
| `episode_id` | `string \| null` | 关联当前集。 | 是 | `null` |
| `plain_text` | `string` | 可编辑的完整剧本文本。 | 是 | `""` |
| `structured_blocks` | `ScriptBlock[]` | 结构化剧本块，用于区分对白、旁白、动作等。 | 是 | `[]` |
| `word_count` | `number` | 字数统计。 | 是 | `0` |
| `estimated_duration_sec` | `number \| null` | 预估视频或配音时长。 | 否 | `null` |
| `generation_source` | `"manual" \| "ai" \| "imported" \| "mixed"` | 当前剧本主要来源。 | 是 | `"manual"` |
| `is_locked` | `boolean` | 是否锁定为正式剧本，防止误覆盖。 | 是 | `false` |

```ts
type ScriptBlockType = "dialogue" | "narration" | "action" | "emotion" | "transition" | "note";

type ScriptBlock = {
  block_id: string;
  type: ScriptBlockType;
  speaker: string | null;
  content: string;
  emotion: string | null;
  start_offset: number | null;
  end_offset: number | null;
  order: number;
};
```

### 3.6 `ScriptFormattingMark`

覆盖「对白与旁白」「节奏标记」「格式化标记」模块，用于让文本标注可追踪、可定位。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `mark_id` | `string` | 标记 ID。 | 是 | 前端生成临时 ID |
| `mark_type` | `ScriptMarkType` | 标记类型。 | 是 | `"dialogue"` |
| `label` | `string` | 标记展示名称。 | 是 | `""` |
| `target_block_id` | `string \| null` | 关联结构化文本块。 | 否 | `null` |
| `start_offset` | `number \| null` | 在 `plain_text` 中的起始偏移。 | 否 | `null` |
| `end_offset` | `number \| null` | 在 `plain_text` 中的结束偏移。 | 否 | `null` |
| `payload` | `Record<string, string \| number \| boolean \| null>` | 额外信息，例如情绪强度、停顿时长。 | 否 | `{}` |
| `created_by` | `"human" \| "ai" \| "system"` | 标记来源。 | 是 | `"human"` |

```ts
type ScriptMarkType =
  | "dialogue"
  | "narration"
  | "action"
  | "pause"
  | "beat"
  | "hook"
  | "reversal"
  | "emotion"
  | "key_line";
```

### 3.7 `ScriptRewriteWorkspace`

覆盖「局部改写」模块，替代当前 `rewrite_tool.mode`、`selection_text`、`rewrite_prompt` 的基础形态。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `mode` | `"partial"` | 标识局部改写模式。 | 是 | `"partial"` |
| `target` | `"novel_body" \| "script_text" \| "selected_block"` | 局部改写目标。 | 是 | `"script_text"` |
| `selection_text` | `string` | 用户选中的原文。 | 是 | `""` |
| `selection_range` | `TextRange \| null` | 选区位置。 | 否 | `null` |
| `rewrite_instruction` | `string` | 改写要求。 | 是 | `""` |
| `preview_text` | `string` | AI 返回但尚未应用的预览结果。 | 否 | `""` |
| `status` | `RewriteStatus` | 当前改写状态。 | 是 | `"idle"` |
| `last_error` | `string \| null` | 最近一次改写失败原因。 | 否 | `null` |

```ts
type TextRange = {
  start_offset: number;
  end_offset: number;
};

type RewriteStatus = "idle" | "generating" | "preview_ready" | "applied" | "failed";
```

### 3.8 `ScriptBatchRewriteState`

覆盖「批量改写」模块，支持按目标和规则批量生成、预览、撤销。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `enabled` | `boolean` | 是否启用批量改写面板。 | 是 | `false` |
| `targets` | `BatchRewriteTarget[]` | 批量改写目标集合。 | 是 | `[]` |
| `rules` | `BatchRewriteRule[]` | 批量改写规则。 | 是 | `[]` |
| `preview_items` | `BatchRewritePreviewItem[]` | 待应用预览结果。 | 否 | `[]` |
| `can_undo` | `boolean` | 是否可撤销最近一次批量应用。 | 是 | `false` |
| `last_applied_version_id` | `string \| null` | 最近一次批量应用前生成的版本 ID。 | 否 | `null` |

```ts
type BatchRewriteTarget = "dialogue" | "narration" | "action" | "rhythm" | "style" | "all_script";

type BatchRewriteRule = {
  rule_id: string;
  target: BatchRewriteTarget;
  instruction: string;
  scope: "current_episode" | "selected_blocks" | "current_selection";
  enabled: boolean;
};

type BatchRewritePreviewItem = {
  item_id: string;
  target_block_id: string | null;
  before_text: string;
  after_text: string;
  accepted: boolean;
};
```

### 3.9 `ScriptReviewState`

覆盖「审核意见」「一致性检查」模块，用于保存检查结果、修复建议和审核记录。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `review_notes` | `string` | 整集审核意见纯文本，兼容现有字段。 | 是 | `""` |
| `consistency_issues` | `ScriptConsistencyIssue[]` | 一致性检查问题列表。 | 是 | `[]` |
| `review_status` | `"not_checked" \| "checking" \| "issues_found" \| "passed"` | 审核状态。 | 是 | `"not_checked"` |
| `last_checked_at` | `string \| null` | 最近检查时间。 | 否 | `null` |
| `approved_by` | `string \| null` | 审核通过人。 | 否 | `null` |
| `approved_at` | `string \| null` | 审核通过时间。 | 否 | `null` |

```ts
type ScriptConsistencyIssue = {
  issue_id: string;
  category: "motivation" | "addressing" | "setting" | "timeline" | "continuity" | "rhythm" | "other";
  severity: "info" | "warning" | "blocking";
  message: string;
  suggestion: string;
  target_block_id: string | null;
  start_offset: number | null;
  end_offset: number | null;
  resolved: boolean;
};
```

### 3.10 `ScriptVersionRecord`

覆盖「版本记录」模块，保留 AI 生成、人工修改、审核修改和批量改写前后的快照。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `version_id` | `string` | 版本 ID。 | 是 | 前端生成临时 ID |
| `episode_id` | `string \| null` | 关联集数。 | 是 | `null` |
| `version_no` | `number` | 当前集内版本序号。 | 是 | `1` |
| `source` | `"ai_generation" \| "manual_save" \| "import" \| "partial_rewrite" \| "batch_rewrite" \| "review_fix"` | 版本来源。 | 是 | `"manual_save"` |
| `summary` | `string` | 版本摘要。 | 是 | `""` |
| `snapshot` | `ScriptVersionSnapshot` | 可恢复快照。 | 是 | 空快照 |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `created_by` | `"human" \| "ai" \| "system" \| string` | 创建来源。 | 是 | `"human"` |
| `restorable` | `boolean` | 是否允许恢复。 | 是 | `true` |

```ts
type ScriptVersionSnapshot = {
  plain_text: string;
  structured_blocks: ScriptBlock[];
  formatting_marks: ScriptFormattingMark[];
  review_notes: string;
};
```

### 3.11 `ScriptModificationRecord`

替代当前 `modification_records: string[]`，便于展示修改时间、来源和动作类型。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `record_id` | `string` | 修改记录 ID。 | 是 | 前端生成临时 ID |
| `action` | `string` | 修改动作，例如导入素材、AI 生成剧本、人工保存。 | 是 | `""` |
| `actor` | `"human" \| "ai" \| "system" \| string` | 修改来源。 | 是 | `"human"` |
| `created_at` | `string` | 修改时间。 | 是 | 当前时间 ISO 字符串 |
| `related_version_id` | `string \| null` | 关联版本 ID。 | 否 | `null` |
| `detail` | `string` | 更详细的说明。 | 否 | `""` |

## 4. 从当前 `StepTwoData` 平滑迁移

当前 `StepTwoData` 已经具备基本编辑、导入、生成、改写和审核字段，建议采用「读旧写新、兼容回填」策略迁移：

| 当前字段 | 新结构映射 | 迁移说明 |
| --- | --- | --- |
| `project_name` | `project_meta.project_name` | 直接拷贝。 |
| `project_status` | `project_meta.project_status` | 直接拷贝。 |
| `body_readiness` | `project_meta.body_readiness` | 直接拷贝；若缺失则为 `0`。 |
| `script_status` | `project_meta.script_status` | 建议将中文状态或旧字符串归一到 `ScriptStatus`。 |
| `last_modified_by` | `project_meta.last_modified_by` | 直接拷贝；后续建议统一为枚举加展示文案。 |
| `version_status` | `project_meta.version_status` | 直接拷贝并逐步归一。 |
| `source_material` | `material_imports.source_material.content` | `imported_source_name` 同步到 `imported_file_name`。 |
| `imported_source_name` | `material_imports.source_material.imported_file_name` | 为空时使用 `null`。 |
| `reference_text` | `material_imports.reference_text.content` | 没有文件名时 `file_type` 为 `"manual"`。 |
| `novel_text` | `material_imports.novel_body.content` | `imported_novel_name` 同步到 `imported_file_name`。 |
| `imported_novel_name` | `material_imports.novel_body.imported_file_name` | 为空时使用 `null`。 |
| `character_profiles` | `material_imports.character_profiles.content` | 作为当前阶段人设摘要暂存。 |
| `terminology_library` | `material_imports.terminology_library.content` | 直接拷贝。 |
| `writing_guidance` | `material_imports.writing_guidance.content` | 直接拷贝。 |
| `script_text` | `script_draft.plain_text` | 同时可通过解析器生成初始 `structured_blocks`。 |
| `review_notes` | `review.review_notes` | 直接拷贝。 |
| `rewrite_tool.mode` | `rewrite_workspace.mode` 或 `batch_rewrite.enabled` | `partial` 进入局部改写；`batch` 进入批量改写。 |
| `rewrite_tool.selected_target` | `rewrite_workspace.target` / `batch_rewrite.targets` | `novel` 映射为 `novel_body`，`script` 映射为 `script_text`。 |
| `rewrite_tool.selection_text` | `rewrite_workspace.selection_text` | 直接拷贝。 |
| `rewrite_tool.rewrite_prompt` | `rewrite_workspace.rewrite_instruction` 或 `BatchRewriteRule.instruction` | 依据当前模式迁移。 |
| `modification_records` | `modification_records` | 旧字符串数组可转成 `ScriptModificationRecord`，`action` 存原字符串。 |

迁移流程建议：

1. 读取项目时检测 `step_two` 是否仍是旧版扁平结构。
2. 若缺少 `script_draft` 等新字段，则运行 `migrateStepTwoData(oldStepTwoData)` 生成新结构。
3. 保存时短期内可同时写入旧字段和新结构，保证旧页面仍可读取。
4. 当步骤 02 页面完全切到新结构后，再移除旧字段的写入逻辑。
5. 所有数组字段默认空数组，所有可空 ID 默认 `null`，避免旧项目打开时报错。

## 5. 后续落地到 TypeScript 的建议

- 优先在 `types.ts` 中新增类型，不要立刻删除当前 `StepTwoData` 字段。
- 新增 `StepTwoScriptCreationData` 后，可让 `ProjectRecord.step_two` 暂时支持联合类型或在 API 层统一迁移后再替换。
- 建议单独实现 `migrateStepTwoData`、`createDefaultStepTwoScriptCreationData` 两个纯函数，避免页面组件里散落默认值。
- `structured_blocks` 初期可以由 `plain_text` 弱解析生成，不要求第一版就做到精确 AST。
- 局部改写和批量改写应先保留 `preview_text` / `preview_items`，用户确认后再写入 `script_draft`，避免 AI 结果直接覆盖正式剧本。
- 版本记录应在保存、生成、批量改写、审核修复四类动作后创建快照，后续供恢复版本使用。
- 下游步骤优先读取 `script_draft.plain_text` 和 `formatting_marks`；当 `structured_blocks` 完善后，再逐步切到结构化数据。

## 6. 本任务不落地的内容

- 不修改 `apps/web/src/types.ts`。
- 不修改步骤 02 页面实现。
- 不新增 API 或后端模型。
- 不更新任务状态表或审核日志。
- 不处理步骤 03 及后续页面实现。
