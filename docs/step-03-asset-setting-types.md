# S03-DOC-001 步骤 03「资产设定」前端数据类型草案

本文档基于《项目步骤功能说明.md》和《主要功能页面开发明细表.md》，整理 coMGan-ai 步骤 03「资产设定」的完整前端数据类型草案。本文档只作为后续 TypeScript 落地前的设计说明，不直接修改 `apps/web/src/types.ts`。

## 1. 设计目标

步骤 03 的核心产物是项目级可复用资产库，供分镜规划、提词生成、画面生成、视频生成和配音字幕复用。前端类型需要覆盖以下能力：

- 从步骤 01 读取人物关系、世界观、单集大纲和连续性提示。
- 从步骤 02 读取正式剧本文本、结构化对白/旁白/动作和节奏标记。
- 支持从剧本中提取角色、场景、道具、服装和关键词候选。
- 管理角色卡、场景卡、道具卡、风格板、参考图、统一性规则和提示词模板。
- 让步骤 04 可引用角色、场景、道具资产生成镜头表。
- 让步骤 05 可读取资产描述、风格板、统一性规则和模板生成 T2I/I2V 提示词。
- 保留人工编辑、AI 生成、版本记录和后续扩展空间。

## 2. 顶层数据结构建议

建议后续为步骤 03 新增独立的 `StepThreeAssetSettingData` 或 `AssetLibraryData`：

```ts
type StepThreeAssetSettingData = {
  project_meta: AssetProjectMeta;
  upstream_context: AssetUpstreamContext;
  extraction: AssetExtractionState;
  characters: CharacterAssetCard[];
  scenes: SceneAssetCard[];
  props: PropAssetCard[];
  style_board: StyleBoard;
  references: ReferenceImageAsset[];
  consistency_rules: AssetConsistencyRule[];
  prompt_templates: AssetPromptTemplate[];
  versions: AssetVersionRecord[];
  modification_records: AssetModificationRecord[];
};
```

## 3. 字段草案

### 3.1 `AssetProjectMeta`

用于承接项目与步骤状态，方便保存、回显和顶部状态展示。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `project_id` | `string` | 当前项目 ID。 | 是 | `""` |
| `project_name` | `string` | 当前项目名称。 | 是 | `""` |
| `asset_status` | `AssetLibraryStatus` | 资产库整体状态。 | 是 | `"empty"` |
| `completion_percent` | `number` | 资产设定完成度，范围 0-100。 | 是 | `0` |
| `last_modified_by` | `"human" \| "ai" \| "system" \| string` | 最近修改来源。 | 是 | `"system"` |
| `updated_at` | `string \| null` | 最近保存时间，ISO 字符串。 | 否 | `null` |
| `updated_by` | `string \| null` | 最近保存人或来源。 | 否 | `null` |

```ts
type AssetLibraryStatus = "empty" | "extracting" | "drafting" | "generated" | "reviewing" | "locked";
```

### 3.2 `AssetUpstreamContext`

用于记录步骤 03 如何读取步骤 01 和步骤 02 的上游数据。该结构只存摘要和引用，不复制完整上游数据。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `story_structure_ref` | `UpstreamStepRef` | 指向步骤 01 数据版本。 | 是 | 空引用对象 |
| `script_creation_ref` | `UpstreamStepRef` | 指向步骤 02 数据版本。 | 是 | 空引用对象 |
| `worldview_summary` | `string` | 从步骤 01 读取的世界观摘要。 | 否 | `""` |
| `character_relationship_summary` | `string` | 从步骤 01 读取的人物关系摘要。 | 否 | `""` |
| `episode_outline_refs` | `EpisodeOutlineRef[]` | 可用于资产提取的单集大纲引用。 | 否 | `[]` |
| `script_text_snapshot` | `string` | 从步骤 02 读取的正式剧本文本快照摘要或截断文本。 | 否 | `""` |
| `script_block_refs` | `ScriptBlockRef[]` | 指向步骤 02 结构化对白、旁白、动作块。 | 否 | `[]` |
| `sync_status` | `"not_synced" \| "synced" \| "outdated"` | 上游数据同步状态。 | 是 | `"not_synced"` |

```ts
type UpstreamStepRef = {
  step_id: "story-structure" | "script-creation";
  version_id: string | null;
  updated_at: string | null;
};

type EpisodeOutlineRef = {
  episode_id: string;
  episode_number: number;
  title: string;
  hook: string;
  outline_summary: string;
};

type ScriptBlockRef = {
  block_id: string;
  episode_id: string | null;
  block_type: "dialogue" | "narration" | "action" | "emotion" | "transition" | "note" | string;
  speaker: string | null;
  excerpt: string;
};
```

### 3.3 `AssetExtractionState`

覆盖「剧本资产提取」模块，用于从步骤 01/02 自动提取候选角色、场景、道具、服装和关键词。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `status` | `"idle" \| "extracting" \| "ready" \| "failed"` | 当前提取状态。 | 是 | `"idle"` |
| `source_step_versions` | `UpstreamStepRef[]` | 本次提取基于哪些上游版本。 | 是 | `[]` |
| `candidates` | `AssetExtractionCandidate[]` | 资产候选清单。 | 是 | `[]` |
| `selected_candidate_ids` | `string[]` | 用户勾选准备入库的候选 ID。 | 是 | `[]` |
| `last_extracted_at` | `string \| null` | 最近提取时间。 | 否 | `null` |
| `last_error` | `string \| null` | 最近提取失败原因。 | 否 | `null` |

```ts
type AssetCandidateKind = "character" | "scene" | "prop" | "costume" | "keyword" | "style_hint";

type AssetExtractionCandidate = {
  candidate_id: string;
  kind: AssetCandidateKind;
  name: string;
  description: string;
  confidence: number;
  source_episode_ids: string[];
  source_block_ids: string[];
  accepted: boolean;
};
```

### 3.4 `CharacterAssetCard`

覆盖「角色卡管理」模块，服务分镜、画面、视频和配音。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `character_id` | `string` | 角色唯一 ID。 | 是 | 前端生成临时 ID |
| `name` | `string` | 角色名称。 | 是 | `""` |
| `role_type` | `CharacterRoleType` | 主角、配角、反派、路人等。 | 是 | `"supporting"` |
| `age_label` | `string` | 年龄或年龄段。 | 否 | `""` |
| `identity` | `string` | 身份、职业、社会位置。 | 否 | `""` |
| `personality` | `string` | 性格特点。 | 否 | `""` |
| `motivation` | `string` | 动机与目标。 | 否 | `""` |
| `relationship_notes` | `string` | 从步骤 01 人物关系继承或人工补充的关系说明。 | 否 | `""` |
| `appearance` | `CharacterAppearance` | 外貌、发型、服装、标志物。 | 是 | 空外貌对象 |
| `expression_range` | `string[]` | 常见表情范围。 | 否 | `[]` |
| `voice_hint` | `string` | 后续配音可用的声音方向。 | 否 | `""` |
| `first_appearance_episode` | `number \| null` | 首次出现集数。 | 否 | `null` |
| `related_reference_ids` | `string[]` | 关联参考图 ID。 | 否 | `[]` |
| `source_candidate_id` | `string \| null` | 来源资产候选 ID。 | 否 | `null` |
| `locked` | `boolean` | 是否锁定角色设定，避免后续生成覆盖。 | 是 | `false` |

```ts
type CharacterRoleType = "protagonist" | "supporting" | "villain" | "minor" | "crowd";

type CharacterAppearance = {
  face_shape: string;
  hair_style: string;
  hair_color: string;
  body_shape: string;
  costume: string;
  signature_item: string;
  color_palette: string[];
};
```

### 3.5 `SceneAssetCard`

覆盖「场景卡管理」模块，服务分镜规划、提示词和画面生成。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `scene_id` | `string` | 场景唯一 ID。 | 是 | 前端生成临时 ID |
| `name` | `string` | 场景名称。 | 是 | `""` |
| `location` | `string` | 地点或空间名称。 | 是 | `""` |
| `era` | `string` | 年代、时代或世界观阶段。 | 否 | `""` |
| `spatial_structure` | `string` | 空间结构、布局、动线。 | 否 | `""` |
| `lighting` | `string` | 光线描述。 | 否 | `""` |
| `atmosphere` | `string` | 氛围、情绪、天气或色调。 | 否 | `""` |
| `common_camera_angles` | `string[]` | 常用镜头角度。 | 否 | `[]` |
| `related_episode_ids` | `string[]` | 关联集数。 | 否 | `[]` |
| `related_script_block_ids` | `string[]` | 关联剧本段落。 | 否 | `[]` |
| `related_reference_ids` | `string[]` | 关联参考图。 | 否 | `[]` |
| `prompt_keywords` | `string[]` | 供步骤 05 注入提示词的关键词。 | 否 | `[]` |

### 3.6 `PropAssetCard`

覆盖「道具卡管理」模块，服务分镜和画面生成。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `prop_id` | `string` | 道具唯一 ID。 | 是 | 前端生成临时 ID |
| `name` | `string` | 道具名称。 | 是 | `""` |
| `prop_type` | `PropType` | 道具类型。 | 是 | `"other"` |
| `appearance` | `string` | 外观描述。 | 否 | `""` |
| `function` | `string` | 功能或用途。 | 否 | `""` |
| `plot_role` | `string` | 剧情作用。 | 否 | `""` |
| `owner_character_id` | `string \| null` | 归属角色 ID。 | 否 | `null` |
| `first_appearance_episode` | `number \| null` | 首次出现集数。 | 否 | `null` |
| `related_scene_ids` | `string[]` | 关联场景。 | 否 | `[]` |
| `related_reference_ids` | `string[]` | 关联参考图。 | 否 | `[]` |
| `prompt_keywords` | `string[]` | 提示词关键词。 | 否 | `[]` |

```ts
type PropType = "weapon" | "token" | "device" | "costume_accessory" | "plot_item" | "other";
```

### 3.7 `StyleBoard`

覆盖「风格板」模块，定义整体画风、色彩、镜头质感和画面比例。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `style_board_id` | `string` | 风格板 ID。 | 是 | 前端生成临时 ID |
| `visual_style` | `string` | 画风描述。 | 是 | `""` |
| `color_palette` | `string[]` | 主色、辅助色、强调色。 | 是 | `[]` |
| `lighting_style` | `string` | 光影风格。 | 否 | `""` |
| `camera_texture` | `string` | 镜头质感、颗粒、景深等。 | 否 | `""` |
| `material_keywords` | `string[]` | 材质和画面关键词。 | 否 | `[]` |
| `aspect_ratio` | `"16:9" \| "9:16" \| "1:1" \| "4:5" \| string` | 默认画面比例。 | 是 | `"9:16"` |
| `negative_style_terms` | `string[]` | 风格层面的负面限制。 | 否 | `[]` |
| `reference_image_ids` | `string[]` | 关联风格参考图。 | 否 | `[]` |
| `locked` | `boolean` | 是否锁定风格板。 | 是 | `false` |

### 3.8 `ReferenceImageAsset`

覆盖「参考图管理」模块，记录上传或生成的角色、场景、道具、风格参考。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `reference_id` | `string` | 参考图 ID。 | 是 | 前端生成临时 ID |
| `asset_type` | `ReferenceAssetType` | 参考图所属类型。 | 是 | `"style"` |
| `owner_id` | `string \| null` | 所属角色、场景、道具或风格板 ID。 | 否 | `null` |
| `url` | `string` | 图片 URL 或本地资源引用。 | 是 | `""` |
| `file_name` | `string \| null` | 上传文件名。 | 否 | `null` |
| `mime_type` | `string \| null` | 文件类型。 | 否 | `null` |
| `caption` | `string` | 图片说明。 | 否 | `""` |
| `is_primary` | `boolean` | 是否主参考图。 | 是 | `false` |
| `source` | `"uploaded" \| "generated" \| "external_url"` | 来源。 | 是 | `"uploaded"` |
| `created_at` | `string \| null` | 创建或上传时间。 | 否 | `null` |

```ts
type ReferenceAssetType = "character" | "scene" | "prop" | "style";
```

### 3.9 `AssetConsistencyRule`

覆盖「一致性规则」模块，供步骤 05 提示词、步骤 06 画面生成和步骤 08 视频生成使用。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `rule_id` | `string` | 规则 ID。 | 是 | 前端生成临时 ID |
| `scope` | `ConsistencyRuleScope` | 规则作用域。 | 是 | `"global"` |
| `owner_id` | `string \| null` | 关联角色、场景、道具或风格板 ID。 | 否 | `null` |
| `positive_terms` | `string[]` | 必须保留或注入的正向描述。 | 是 | `[]` |
| `negative_terms` | `string[]` | 需要规避的负面描述。 | 是 | `[]` |
| `locked_terms` | `string[]` | 重新生成时不能丢失的锁定词。 | 否 | `[]` |
| `description` | `string` | 规则说明。 | 否 | `""` |
| `severity` | `"hint" \| "required" \| "blocking"` | 规则强度。 | 是 | `"required"` |
| `enabled` | `boolean` | 是否启用。 | 是 | `true` |

```ts
type ConsistencyRuleScope = "global" | "character" | "scene" | "prop" | "style";
```

### 3.10 `AssetPromptTemplate`

覆盖「提示词模板」模块，供步骤 05 生成 T2I/I2V 提示词时复用。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `template_id` | `string` | 模板 ID。 | 是 | 前端生成临时 ID |
| `template_type` | `PromptTemplateType` | 模板类型。 | 是 | `"character"` |
| `owner_id` | `string \| null` | 关联角色、场景、道具或风格板 ID。 | 否 | `null` |
| `title` | `string` | 模板标题。 | 是 | `""` |
| `body` | `string` | 模板正文，允许占位符。 | 是 | `""` |
| `variables` | `PromptTemplateVariable[]` | 模板变量定义。 | 否 | `[]` |
| `negative_prompt` | `string` | 模板配套负面词。 | 否 | `""` |
| `usage_hint` | `string` | 使用说明。 | 否 | `""` |
| `version_no` | `number` | 模板版本号。 | 是 | `1` |
| `enabled` | `boolean` | 是否可被步骤 05 使用。 | 是 | `true` |

```ts
type PromptTemplateType = "character" | "scene" | "prop" | "style" | "shot" | "negative";

type PromptTemplateVariable = {
  name: string;
  type: "string" | "number" | "boolean" | "string[]";
  required: boolean;
  default_value: string | number | boolean | string[] | null;
  description: string;
};
```

### 3.11 `AssetVersionRecord` 与 `AssetModificationRecord`

用于资产库版本保存、回滚和修改记录。

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `version_id` | `string` | 版本 ID。 | 是 | 前端生成临时 ID |
| `version_no` | `number` | 版本序号。 | 是 | `1` |
| `source` | `"manual_save" \| "ai_generation" \| "script_extraction" \| "import" \| "review_fix"` | 版本来源。 | 是 | `"manual_save"` |
| `summary` | `string` | 版本摘要。 | 是 | `""` |
| `snapshot` | `AssetLibrarySnapshot` | 可恢复快照。 | 是 | 空快照 |
| `created_at` | `string` | 创建时间。 | 是 | 当前时间 ISO 字符串 |
| `created_by` | `"human" \| "ai" \| "system" \| string` | 创建来源。 | 是 | `"human"` |

```ts
type AssetLibrarySnapshot = {
  characters: CharacterAssetCard[];
  scenes: SceneAssetCard[];
  props: PropAssetCard[];
  style_board: StyleBoard;
  references: ReferenceImageAsset[];
  consistency_rules: AssetConsistencyRule[];
  prompt_templates: AssetPromptTemplate[];
};

type AssetModificationRecord = {
  record_id: string;
  action: string;
  actor: "human" | "ai" | "system" | string;
  created_at: string;
  related_asset_id: string | null;
  related_version_id: string | null;
  detail: string;
};
```

## 4. 步骤 03 如何读取步骤 01 与步骤 02

### 4.1 读取步骤 01「故事架构」

步骤 03 不应复制完整步骤 01 数据，而应读取并缓存以下摘要或引用：

- 人物关系：映射到 `upstream_context.character_relationship_summary`，并用于生成 `CharacterAssetCard.relationship_notes`。
- 世界观：映射到 `upstream_context.worldview_summary`，用于场景卡、风格板和统一性规则。
- 单集大纲：映射到 `episode_outline_refs`，用于判断角色、场景、道具首次出现集数。
- 连续性提示：可转化为 `AssetConsistencyRule`，例如角色服装、阵营、重要道具不能漂移。

### 4.2 读取步骤 02「剧本创作」

步骤 03 应优先读取步骤 02 的正式剧本版本：

- `script_draft.plain_text` 或旧版 `script_text`：作为资产提取的主要输入。
- `structured_blocks`：若已存在，可将对白、旁白、动作块分别提取为角色、动作、道具和场景线索。
- `formatting_marks`：读取关键台词、情绪、爆点、反转等标记，辅助判断角色重要性和场景情绪。
- `review.review_notes`：若审核意见提示设定不一致，应同步到 `AssetConsistencyRule` 或候选问题提示。

建议使用 `UpstreamStepRef.version_id` 记录本次资产提取对应的步骤 01/02 版本。当上游版本变化时，将 `sync_status` 标为 `"outdated"`，提示用户重新提取或手动合并。

## 5. 下游消费方式

### 5.1 步骤 04「分镜规划」如何消费资产库

步骤 04 需要从步骤 03 读取：

- `characters`：作为镜头角色引用源，避免手输错名；镜头中的 `character_ids` 应来自角色卡。
- `scenes`：作为镜头场景引用源；镜头中的 `scene_id` 应来自场景卡。
- `props`：作为镜头道具引用源；镜头中的道具多选应来自道具卡。
- `style_board`：作为镜头构图和视觉风格约束。
- `consistency_rules`：用于提示分镜不能违反角色外貌、场景时代和道具归属。

步骤 04 不应复制完整资产正文，只保存资产 ID 与必要展示快照，避免资产修改后镜头引用失效。

### 5.2 步骤 05「提词生成」如何消费资产库

步骤 05 需要从步骤 03 读取：

- `characters.appearance`、`personality`、`costume`：注入 T2I/I2V 正向提示词。
- `scenes.spatial_structure`、`lighting`、`atmosphere`：注入场景提示词。
- `props.appearance`、`plot_role`：注入道具提示词。
- `style_board`：注入画风、色彩、光影、镜头质感和比例。
- `references`：提供参考图权重与归属关系。
- `consistency_rules.positive_terms`、`negative_terms`、`locked_terms`：生成负面提示词和锁定关键词。
- `prompt_templates`：作为角色、场景、道具、风格模板，支持批量套用和版本保存。

步骤 05 生成提示词时应保留资产 ID 来源，例如 `character_id`、`scene_id`、`prop_id`、`template_id`，便于后续画面生成和质检追踪。

## 6. 后续落地到 TypeScript 的建议

- 优先新增步骤 03 专用类型，不要直接把所有字段塞进现有 `ProjectRecord` 顶层。
- 建议将 `CharacterAssetCard`、`SceneAssetCard`、`PropAssetCard`、`ReferenceImageAsset` 抽为可复用类型，后续步骤 04-08 都会引用。
- `upstream_context` 第一版可以只存摘要和版本引用，不做复杂依赖图。
- 资产提取第一版可先返回 `AssetExtractionCandidate[]`，由用户勾选后再写入资产库。
- 参考图第一版只记录 URL 与元数据，不把本地二进制文件提交到 Git。
- 一致性规则应与提示词模板分开：规则负责约束，模板负责生成文本。
- 后续 API 落地时建议按 `projectId + stepId` 保存完整资产库，并在保存时生成 `AssetVersionRecord` 快照。
- 主控后续真正修改 `types.ts` 时，应同时提供默认值工厂，例如 `createDefaultAssetLibraryData(projectId, projectName)`。

## 7. 本任务不落地的内容

- 不修改 `apps/web/src/types.ts`。
- 不修改步骤 03 页面实现。
- 不新增 API 或后端模型。
- 不更新任务状态表、审核日志或协作调度文档。
- 不处理步骤 04、步骤 05 的页面实现。
