# 步骤 01「故事架构」前端数据类型草案

本文档基于 [项目步骤功能说明.md](/C:/Users/86158/Desktop/codex/coGMan-ai（终）/项目步骤功能说明.md) 与 [主要功能页面开发明细表.md](/C:/Users/86158/Desktop/codex/coGMan-ai（终）/主要功能页面开发明细表.md) 编写，仅用于类型设计，不直接修改 `apps/web/src/types.ts`。

## 1. 设计目标

步骤 01 的前端数据需要同时覆盖四件事：

1. 项目基础信息。
2. 故事本体信息，包括核心故事、世界观、主线目标。
3. 内容结构信息，包括人物关系、季集结构、单集大纲。
4. 质量控制信息，包括连续性检查、版本信息、导入信息。

因此，建议把现有 `StepOneData` 扩展为一个更完整的“故事架构步骤数据对象”，并按子模块拆分字段，避免后续 UI 继续把所有内容塞进一个大文本对象里。

---

## 2. 建议的根类型

```ts
export type StoryStructureStepData = {
  schema_version: "step01.v1";
  project_info: StoryStructureProjectInfo;
  core_story: StoryStructureCoreStory;
  worldview: StoryStructureWorldview;
  main_goal: StoryStructureMainGoal;
  character_relations: StoryStructureCharacterRelations;
  season_structure: StoryStructureSeasonStructure;
  episode_outlines: StoryStructureEpisodeOutline[];
  continuity_check: StoryStructureContinuityCheck;
  step_meta: StoryStructureStepMeta;
};
```

说明：
- `schema_version` 用于前端和后端识别草案版本。
- `project_info` 负责项目基础信息。
- `core_story` 负责核心故事输入和摘要。
- `worldview` 负责世界观。
- `main_goal` 负责主线目标。
- `character_relations` 负责人物关系。
- `season_structure` 负责季集结构。
- `episode_outlines` 负责单集大纲。
- `continuity_check` 负责连续性检查结果。
- `step_meta` 负责导入、版本、编辑者等元信息。

---

## 3. 项目基础信息

### 3.1 `StoryStructureProjectInfo`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `project_name` | `string` | 项目展示名，顶部栏和步骤页标题的主要来源 | 是 | `""` |
| `project_topic` | `string` | 项目题材或方向，如都市、古风、科幻等 | 否 | `""` |
| `target_audience` | `string` | 面向人群描述，如“短视频漫剧用户” | 否 | `""` |
| `content_length` | `string` | 内容长度说明，如“12集 / 24集 / 自定义” | 否 | `"12集"` |
| `platform_target` | `string[]` | 目标平台列表，如抖音、快手、B站 | 否 | `[]` |
| `project_label` | `string` | 项目标签，便于内部归档 | 否 | `""` |
| `project_status` | `string` | 步骤 01 的前端展示状态 | 否 | `"草稿中"` |
| `linked_project` | `boolean` | 是否已经和主项目记录绑定 | 否 | `false` |

### 3.2 说明

- `project_name` 仍然是当前页面最重要的主键式展示字段。
- `content_length` 建议保留字符串型，方便兼容当前 `12集` 这类展示格式。
- `platform_target` 建议使用字符串数组，便于后续做多平台适配提示。

---

## 4. 核心故事

### 4.1 `StoryStructureCoreStory`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `core_idea` | `string` | 当前步骤最核心的故事想法 | 是 | `""` |
| `story_summary` | `string` | 对核心故事的简要摘要 | 否 | `""` |
| `story_keywords` | `string[]` | 关键词集合，便于检索和生成提示词 | 否 | `[]` |
| `story_tone` | `string` | 故事整体语气，如热血、悬疑、轻喜 | 否 | `""` |
| `source_story_name` | `string \| null` | 导入来源文件名或素材名 | 否 | `null` |
| `source_story_text` | `string` | 从外部导入的原始故事文本 | 否 | `""` |

### 4.2 说明

- `core_idea` 对应当前页面里的核心故事输入。
- `source_story_text` 与 `core_idea` 可以并存，便于“导入文本”和“人工编辑文本”共用同一层数据。

---

## 5. 世界观

### 5.1 `StoryStructureWorldview`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `world_name` | `string` | 世界观标题或代号 | 否 | `""` |
| `world_summary` | `string` | 世界观总述 | 是 | `""` |
| `time_background` | `string` | 时间背景，如现代、架空、未来 | 否 | `""` |
| `space_background` | `string` | 空间背景、地域结构、世界范围 | 否 | `""` |
| `world_rules` | `string` | 世界运行规则、特殊设定、能力体系 | 否 | `""` |
| `conflict_background` | `string` | 世界级冲突与环境压力 | 否 | `""` |
| `visual_style_hint` | `string` | 给资产设定和分镜的风格提示 | 否 | `""` |

### 5.2 说明

- `world_summary` 是世界观模块的主文本。
- `world_rules` 建议单独保留，后续可直接给提示词、资产和质检复用。

---

## 6. 主线目标

### 6.1 `StoryStructureMainGoal`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `protagonist_goal` | `string` | 主角目标 | 是 | `""` |
| `antagonist_blocker` | `string` | 反派阻力或外部阻力 | 否 | `""` |
| `central_conflict` | `string` | 核心矛盾 | 是 | `""` |
| `growth_arc` | `string` | 主角成长线 | 否 | `""` |
| `theme_sentence` | `string` | 主题句或价值表达 | 否 | `""` |
| `season_pressure` | `string` | 整季持续施压点 | 否 | `""` |

### 6.2 说明

- `central_conflict` 是串联故事架构、剧本和复盘的关键字段。
- `theme_sentence` 建议尽量短，适合后续做标题、封面和简介提炼。

---

## 7. 人物关系

### 7.1 `StoryStructureCharacterRelations`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `characters` | `StoryStructureCharacterRelation[]` | 人物关系列表 | 是 | `[]` |
| `relationship_summary` | `string` | 人物关系总体总结 | 否 | `""` |
| `camp_summary` | `string` | 阵营关系总结 | 否 | `""` |

### 7.2 `StoryStructureCharacterRelation`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `character_id` | `string` | 角色唯一标识 | 是 | `""` |
| `character_name` | `string` | 角色姓名 | 是 | `""` |
| `role_type` | `string` | 角色类型，如主角、配角、反派、路人 | 是 | `"配角"` |
| `camp_name` | `string` | 阵营或所属组 | 否 | `""` |
| `relation_to_protagonist` | `string` | 与主角的关系 | 否 | `""` |
| `emotion_relation` | `string` | 情感关系说明 | 否 | `""` |
| `conflict_point` | `string` | 与其他角色的冲突点 | 否 | `""` |
| `character_goal` | `string` | 该角色的目标 | 否 | `""` |
| `notes` | `string` | 补充说明 | 否 | `""` |

### 7.3 说明

- `characters` 建议用数组保存，避免后续人物数量变化导致表单难扩展。
- `character_id` 不建议直接拿姓名当主键，后续重命名会更稳。

---

## 8. 季集结构

### 8.1 `StoryStructureSeasonStructure`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_count_mode` | `"fixed" \| "custom"` | 集数模式 | 是 | `"fixed"` |
| `total_episode_count` | `number` | 当前总集数 | 是 | `12` |
| `custom_episode_count` | `number \| null` | 自定义集数 | 否 | `null` |
| `season_outline` | `string` | 整季大纲 | 否 | `""` |
| `season_milestones` | `string[]` | 季级关键节点 | 否 | `[]` |
| `season_structure_notes` | `string` | 结构说明 | 否 | `""` |

### 8.2 说明

- 当前 UI 已有“12 集 / 24 集 / 36 集 / 自定义集数”的表达习惯，建议保留 `episode_count_mode` + `total_episode_count` 的双字段结构。
- `custom_episode_count` 只在 `episode_count_mode = "custom"` 时有效。

---

## 9. 单集大纲

### 9.1 `StoryStructureEpisodeOutline`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_number` | `number` | 集号 | 是 | `1` |
| `episode_title` | `string` | 集标题 | 是 | `""` |
| `episode_brief` | `string` | 单集摘要，适合承接当前 `content` 字段 | 否 | `""` |
| `core_event` | `string` | 本集核心事件 | 否 | `""` |
| `hook` | `string` | 本集钩子 | 否 | `""` |
| `twist` | `string` | 本集反转 | 否 | `""` |
| `ending_cliffhanger` | `string` | 结尾悬念 | 否 | `""` |
| `episode_goal` | `string` | 本集目标 | 否 | `""` |
| `status` | `string` | 本集状态，如草稿/已生成/待修改 | 否 | `"草稿中"` |
| `notes` | `string` | 备注 | 否 | `""` |

### 9.2 说明

- 当前 `StepOneData.episodes[]` 的 `title`、`content`、`hook` 可以平滑映射到这里的 `episode_title`、`episode_brief`、`hook`。
- 如果后续页面想保留“每集标题 + 内容 + 钩子”的简单模式，也可以只使用这三个字段，其他字段作为增强项逐步开放。

---

## 10. 连续性检查

### 10.1 `StoryStructureContinuityCheck`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `enabled` | `boolean` | 是否启用连续性检查 | 否 | `true` |
| `last_checked_at` | `string \| null` | 最近检查时间 | 否 | `null` |
| `overall_result` | `string` | 总体结论，如通过、待修改、风险较高 | 否 | `"待检查"` |
| `summary` | `string` | 检查摘要 | 否 | `""` |
| `risk_level` | `"low" \| "medium" \| "high"` | 风险等级 | 否 | `"low"` |
| `issues` | `StoryStructureContinuityIssue[]` | 问题列表 | 否 | `[]` |
| `repair_suggestions` | `string[]` | 修复建议列表 | 否 | `[]` |

### 10.2 `StoryStructureContinuityIssue`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `issue_id` | `string` | 问题唯一标识 | 是 | `""` |
| `severity` | `"low" \| "medium" \| "high"` | 问题严重级别 | 是 | `"medium"` |
| `scope` | `string` | 问题范围，如世界观、主线、人物、某集 | 是 | `""` |
| `episode_numbers` | `number[]` | 涉及的集数 | 否 | `[]` |
| `description` | `string` | 问题描述 | 是 | `""` |
| `suggestion` | `string` | 修复建议 | 否 | `""` |
| `status` | `"open" \| "fixed" \| "ignored"` | 问题状态 | 否 | `"open"` |

### 10.3 说明

- 连续性检查建议保持独立对象，避免把“检查结果”直接塞进单集大纲里。
- 后续如果接入自动一致性检测，这个结构可以直接承接后端返回。

---

## 11. 步骤元信息

### 11.1 `StoryStructureStepMeta`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `imported_story_name` | `string \| null` | 导入素材文件名 | 否 | `null` |
| `linked_project` | `boolean` | 是否已绑定项目 | 否 | `false` |
| `last_modified_by` | `string` | 最近修改者 | 否 | `"人工"` |
| `version_status` | `string` | 版本状态，如 v1 草稿 | 否 | `"v1 草稿"` |
| `modification_records` | `string[]` | 修改记录摘要 | 否 | `[]` |
| `updated_at` | `string \| null` | 最近更新时间 | 否 | `null` |

### 11.2 说明

- 这一层主要承接当前 `StepOneData` 已有的辅助字段，便于平滑升级，不让旧数据直接丢失。

---

## 12. 从当前 `StepOneData` 的平滑迁移建议

当前 `StepOneData` 只有这些字段：

- `project_name`
- `core_story_idea`
- `season_episode_count`
- `custom_episode_count`
- `imported_story_name`
- `linked_project`
- `episodes[]`

建议迁移映射如下：

| 当前字段 | 新字段 | 迁移方式 |
| --- | --- | --- |
| `project_name` | `project_info.project_name` | 直接映射 |
| `core_story_idea` | `core_story.core_idea` | 直接映射 |
| `season_episode_count` | `season_structure.episode_count_mode` + `season_structure.total_episode_count` | 解析字符串中的数字与模式 |
| `custom_episode_count` | `season_structure.custom_episode_count` | 直接映射 |
| `imported_story_name` | `step_meta.imported_story_name` | 直接映射 |
| `linked_project` | `project_info.linked_project` 或 `step_meta.linked_project` | 建议放到元信息层，兼容当前行为 |
| `episodes[]` 的 `episode_number` | `episode_outlines[].episode_number` | 直接映射 |
| `episodes[]` 的 `title` | `episode_outlines[].episode_title` | 直接映射 |
| `episodes[]` 的 `content` | `episode_outlines[].episode_brief` | 保留原始内容作为概要 |
| `episodes[]` 的 `hook` | `episode_outlines[].hook` | 直接映射 |

### 迁移顺序建议

1. 先增加新结构，但继续兼容旧 `StepOneData` 的读取。
2. 保存时优先写新结构，读取时同时兼容旧字段。
3. 当旧字段全部回填完成后，再逐步废弃 `StepOneData` 的扁平结构。
4. `episodes[]` 先保持可空数组兼容，避免历史项目在加载时丢集数。

---

## 13. 落地到 TypeScript 的建议

1. 先保留 `StepOneData` 作为旧结构兼容层，不要立刻删除。
2. 新增 `StoryStructureStepData`、`StoryStructureProjectInfo`、`StoryStructureCoreStory` 等独立接口，按职责拆分。
3. 如果页面仍然只做第一阶段，可先用 `StoryStructureStepData` 的子集字段；不要因为暂时没 UI 就删掉类型。
4. 建议把 `episode_outlines` 和 `character_relations` 这种列表类型独立成 `[]` 数组，后续扩展最稳。
5. 如果短期内后端还没同步，前端可用类型适配器把旧 `StepOneData` 映射到新结构，避免页面和存储同时改。

---

## 14. 结论

步骤 01 的数据类型不应继续停留在“项目名 + 核心故事 + 集数 + 单集数组”的扁平结构里。  
更合理的做法是把故事架构拆成“项目基础信息、核心故事、世界观、主线目标、人物关系、季集结构、单集大纲、连续性检查、步骤元信息”九个部分，既能覆盖当前步骤 01 的编辑需求，也能为后续步骤 02 及之后的流程提供稳定输入。

