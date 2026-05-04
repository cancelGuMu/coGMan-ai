# 11 步跨步骤数据流矩阵

本文档基于 [项目步骤功能说明.md](/C:/Users/86158/Desktop/codex/coGMan-ai-B/项目步骤功能说明.md)、[主要功能页面开发明细表.md](/C:/Users/86158/Desktop/codex/coGMan-ai-B/主要功能页面开发明细表.md) 与 [主要功能页面现状盘点.md](/C:/Users/86158/Desktop/codex/coGMan-ai-B/主要功能页面现状盘点.md) 整理，仅用于 `DATA-DOC-001` 的跨步骤数据流设计说明，不修改生产代码。

## 1. 设计目标

创作中心 11 步页面应围绕同一个 `projectId` 读取和保存数据。每一步既要能独立保存草稿，也要能读取上游产物，并把关键结果稳定交给下游页面。本文用矩阵方式明确：

1. 每一步读取哪些上游数据。
2. 每一步产出哪些下游数据。
3. 哪些字段是强依赖，哪些字段是可选增强。
4. 数据缺失时页面如何降级显示。
5. 后续实现时数据应来自 `ProjectRecord`、`GenerationTask` 还是 `AssetReference`。

术语约定：

| 标记 | 含义 |
| --- | --- |
| 强依赖 | 页面核心功能必须读取的数据；缺失时应阻止相关生成或保存入口。 |
| 可选增强 | 页面可用但体验不完整的数据；缺失时显示提示、占位或跳过对应模块。 |
| `ProjectRecord` | 项目主记录与每步结构化保存数据，适合保存用户确认后的稳定结果。 |
| `GenerationTask` | AI 生成、重试、队列、失败原因、进度等运行时任务数据。 |
| `AssetReference` | 图片、视频、音频、参考图、封面等素材引用和元数据。 |

---

## 2. 总览矩阵

| 步骤 | 页面 | 强依赖上游 | 可选增强上游 | 核心产出 | 主要下游 | 主数据来源建议 | 缺失时降级 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | 故事架构 | 项目基础档案、故事想法 | 导入文本、平台目标、参考资料 | 世界观、主线、人物关系、季集结构、单集大纲、连续性报告 | 02、03、11 回流 | `ProjectRecord` | 无故事想法时显示空表单和导入入口，不阻塞手动编辑。 |
| 02 | 剧本创作 | 步骤 01 单集大纲、人物关系、主线目标 | 导入小说、术语库、写作指导、连续性报告 | 剧本文本、结构化对白/旁白、动作、节奏节点、审核意见、版本记录 | 03、04、09、10 | `ProjectRecord` + `GenerationTask` | 缺少大纲时允许手写剧本，但 AI 生成按钮显示缺少上游提示。 |
| 03 | 资产设定 | 步骤 02 剧本或步骤 01 人物关系/世界观 | 参考图、视觉风格、平台目标 | 角色卡、场景卡、道具卡、风格板、参考图、一致性规则、提示词模板 | 04、05、06、09 | `ProjectRecord` + `AssetReference` | 缺少剧本时可从故事人物关系建基础角色卡，资产提取置灰。 |
| 04 | 分镜规划 | 步骤 02 正式剧本、步骤 03 角色/场景/道具 | 步骤 02 节奏节点、风格板、连续性报告 | 镜头表、景别角度、构图站位、台词引用、运镜、时长、任务队列 | 05、06、08、09、10 | `ProjectRecord` + `GenerationTask` | 缺少资产时允许拆镜，但角色/场景选择显示未绑定。 |
| 05 | 提词生成 | 步骤 04 镜头表、步骤 03 资产库/风格板 | 负面词模板、参考图权重、锁定词 | T2I 提示词、I2V 提示词、负面词、参数模板、版本记录 | 06、08 | `ProjectRecord` + `GenerationTask` | 缺少资产时可生成基础镜头提示词，但一致性提示为空并给出风险。 |
| 06 | 画面生成 | 步骤 05 T2I 提示词、步骤 04 镜头表 | 步骤 03 参考图/一致性规则、筛选条件 | 图片生成任务、候选图、入选关键帧、废弃图、图片元数据 | 08、10 封面 | `GenerationTask` + `AssetReference` + `ProjectRecord` | 缺少 T2I 时任务面板为空；允许上传手工图片并绑定镜头。 |
| 08 | 视频生成 | 步骤 06 入选关键帧、步骤 05 I2V 提示词、步骤 04 镜头时长 | 动作参考、姿态参考、首尾帧、运镜参数 | 视频任务、候选视频、失败记录、最终视频片段、视频元数据 | 09、10 | `GenerationTask` + `AssetReference` + `ProjectRecord` | 缺少入选关键帧时默认生成入口警告。 |
| 09 | 音频字幕 | 步骤 02 对白/旁白、步骤 08 最终视频片段 | 步骤 03 角色声音设定、步骤 04 台词镜头映射 | 角色声音、配音任务、音频轨、口型同步、字幕轨、音效、BGM、混音 | 10、11 字幕适配 | `ProjectRecord` + `GenerationTask` + `AssetReference` | 缺少视频时仍可生成配音和字幕草稿；口型同步置灰。 |
| 10 | 剪辑成片 | 步骤 08 最终视频、步骤 09 音频/字幕、步骤 04 镜头顺序 | 步骤 06 封面候选、步骤 11 平台历史偏好 | 剪辑时间线、对齐配置、导出版本、封面候选、发布素材包 | 11 | `ProjectRecord` + `AssetReference` + `GenerationTask` | 缺少音频时可生成静音时间线；缺少视频时只显示素材缺口清单。 |
| 11 | 发布复盘 | 步骤 10 成片/封面/素材包 | 平台数据、评论、历史复盘、目标平台 | 发布记录、平台指标、留存分析、复盘报告、优化任务 | 01、02、03、10 下一轮优化 | `ProjectRecord` + `AssetReference` | 缺少真实平台数据时提供手动录入和空报告模板。 |

---

## 3. 分步骤数据流明细

### 3.1 步骤 01「故事架构」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `project.id`、`project.name`、`project.status` | 强依赖 | `ProjectRecord` | 绑定所有步骤保存和顶部栏展示。 |
| 读取 | `raw_story_input`、`imported_story_name` | 可选增强 | `ProjectRecord` | 可为空，空时显示故事输入空状态。 |
| 产出 | `worldview`、`main_goal`、`conflict` | 强依赖 | `ProjectRecord.step_one` | 步骤 02/03 的基础故事语境。 |
| 产出 | `character_relations` | 强依赖 | `ProjectRecord.step_one` | 步骤 02 剧本和步骤 03 资产提取的角色来源。 |
| 产出 | `season_structure`、`episode_outlines` | 强依赖 | `ProjectRecord.step_one` | 步骤 02 选择集数和生成剧本的直接来源。 |
| 产出 | `continuity_report` | 可选增强 | `ProjectRecord.step_one` | 步骤 02 和步骤 11 可读取风险提示。 |

降级显示：项目存在但故事内容为空时，页面显示基础表单、导入入口和示例占位；下游步骤读取不到单集大纲时，应提示“请先完善故事架构或手动输入本集内容”。

### 3.2 步骤 02「剧本创作」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `episode_outlines[].episode_number/title/hook` | 强依赖 | `ProjectRecord.step_one` | 生成单集剧本的核心输入。 |
| 读取 | `character_relations`、`worldview`、`main_goal` | 强依赖 | `ProjectRecord.step_one` | 保证剧本角色和主线一致。 |
| 读取 | `continuity_report`、`source_materials`、`term_bank` | 可选增强 | `ProjectRecord.step_one/step_two` | 缺失时只影响生成质量。 |
| 产出 | `script_text`、`structured_dialogues`、`voiceovers` | 强依赖 | `ProjectRecord.step_two` | 步骤 04 拆镜和步骤 09 配音字幕依赖。 |
| 产出 | `beats`、`emotion_marks`、`pause_marks` | 可选增强 | `ProjectRecord.step_two` | 步骤 04 节奏和步骤 09 语气停顿增强。 |
| 产出 | `review_notes`、`versions` | 可选增强 | `ProjectRecord.step_two` | 版本回滚和后续一致性检查使用。 |
| 任务 | 剧本生成、局部改写、批量改写 | 可选增强 | `GenerationTask` | 运行态记录，不应替代最终剧本文本。 |

降级显示：没有步骤 01 大纲时，保留剧本编辑器和导入入口，AI 生成按钮提示缺少大纲；没有结构化对白时，步骤 09 可从 `script_text` 做临时文本解析，但应标记“待结构化”。

### 3.3 步骤 03「资产设定」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `script_text`、`structured_dialogues` | 强依赖 | `ProjectRecord.step_two` | 从剧本抽取角色、场景、道具。 |
| 读取 | `character_relations`、`worldview` | 可选增强 | `ProjectRecord.step_one` | 缺失时仍可人工创建资产。 |
| 读取 | 参考图文件 | 可选增强 | `AssetReference` | 角色/场景/道具视觉参考。 |
| 产出 | `characters` | 强依赖 | `ProjectRecord.step_three` | 步骤 04/05/06/09 角色引用基础。 |
| 产出 | `scenes`、`props` | 强依赖 | `ProjectRecord.step_three` | 分镜、提词、质检使用。 |
| 产出 | `style_board`、`consistency_rules` | 强依赖 | `ProjectRecord.step_three` | 提词、画面和质检的稳定性基础。 |
| 产出 | `references` | 可选增强 | `AssetReference` | 参考图应保存 URL、归属对象和版本。 |
| 任务 | 资产提取、角色卡生成、参考图生成 | 可选增强 | `GenerationTask` | 生成过程记录和失败重试。 |

降级显示：没有剧本时显示手动新增角色、场景、道具入口，自动提取置灰；没有参考图时仍可保存文字资产卡，但后续画面生成展示一致性风险。

### 3.4 步骤 04「分镜规划」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `script_text`、`structured_dialogues`、`beats` | 强依赖 | `ProjectRecord.step_two` | 自动拆镜、台词引用和节奏统计基础。 |
| 读取 | `characters`、`scenes`、`props` | 强依赖 | `ProjectRecord.step_three` | 镜头角色、场景、道具绑定。 |
| 读取 | `style_board`、`consistency_rules` | 可选增强 | `ProjectRecord.step_three` | 帮助后续提词和画面生成。 |
| 产出 | `shots[].shot_id/shot_number/episode_number` | 强依赖 | `ProjectRecord.step_four` | 后续步骤 05-10 的核心外键。 |
| 产出 | `shots[].visual_design`、`camera_motion` | 强依赖 | `ProjectRecord.step_four` | 提词、画面、视频生成需要。 |
| 产出 | `shots[].dialogue_refs`、`duration` | 强依赖 | `ProjectRecord.step_four` | 音频字幕、视频时长和剪辑使用。 |
| 产出 | `downstream_queue` | 可选增强 | `GenerationTask` | 后续生成任务可从这里批量创建。 |

降级显示：没有资产库时允许文本拆镜，资产引用字段显示“未绑定”；没有结构化台词时允许手动填写字幕内容，但步骤 09 应提示台词来源不稳定。

### 3.5 步骤 05「提词生成」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `shots[].shot_id`、`visual_design`、`camera_motion` | 强依赖 | `ProjectRecord.step_four` | 一镜一提示词的核心输入。 |
| 读取 | `characters`、`scenes`、`props`、`style_board` | 强依赖 | `ProjectRecord.step_three` | 注入角色、场景、道具和风格描述。 |
| 读取 | `consistency_rules`、`references` | 可选增强 | `ProjectRecord.step_three` + `AssetReference` | 增强一致性与参考图权重。 |
| 产出 | `t2i_prompts` | 强依赖 | `ProjectRecord.step_five` | 步骤 06 画面生成使用。 |
| 产出 | `i2v_prompts` | 强依赖 | `ProjectRecord.step_five` | 步骤 08 视频生成使用。 |
| 产出 | `negative_prompts`、`params`、`locked_terms` | 可选增强 | `ProjectRecord.step_five` | 生成质量和可控性增强。 |
| 任务 | 提示词生成、批量替换、版本保存 | 可选增强 | `GenerationTask` | 记录生成状态和版本来源。 |

降级显示：没有镜头表时显示空任务列表；没有资产库时可生成基础画面描述，但给出“缺少角色/场景一致性”的提示。

### 3.6 步骤 06「画面生成」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `t2i_prompts[].prompt_id/shot_id/prompt_text` | 强依赖 | `ProjectRecord.step_five` | 创建图片生成任务。 |
| 读取 | `shots[].shot_id/shot_number` | 强依赖 | `ProjectRecord.step_four` | 候选图按镜头归档。 |
| 读取 | `references`、`consistency_rules` | 可选增强 | `AssetReference` + `ProjectRecord.step_three` | 参考图和一致性约束。 |
| 产出 | `image_generation_tasks` | 强依赖 | `GenerationTask` | 保存队列状态、失败原因、重试次数。 |
| 产出 | `candidate_images`、`selected_keyframes` | 强依赖 | `AssetReference` + `ProjectRecord.step_six` | 视频生成的输入。 |
| 产出 | `discarded_images`、`image_metadata` | 可选增强 | `AssetReference` + `ProjectRecord.step_six` | 筛选、恢复和追溯使用。 |

降级显示：没有 T2I 提示词时生成按钮置灰并提供跳转步骤 05；允许上传手工图片并绑定 `shot_id`，作为临时关键帧进入视频生成。

### 3.8 步骤 08「视频生成」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `selected_keyframes` | 强依赖 | `ProjectRecord.step_six` + `AssetReference` | I2V 首帧或关键帧输入。 |
| 读取 | `i2v_prompts` | 强依赖 | `ProjectRecord.step_five` | 视频动作、运镜和动态描述。 |
| 读取 | `shots[].duration`、`camera_motion` | 强依赖 | `ProjectRecord.step_four` | 视频时长与运镜约束。 |
| 读取 | `action_reference`、`pose_reference` | 可选增强 | `AssetReference` | 动作和姿态辅助。 |
| 产出 | `video_generation_tasks` | 强依赖 | `GenerationTask` | 任务状态、失败原因和重试。 |
| 产出 | `video_candidates`、`final_clips` | 强依赖 | `AssetReference` + `ProjectRecord.step_eight` | 步骤 09 和 10 的视频素材。 |
| 产出 | `failure_records`、`video_metadata` | 可选增强 | `ProjectRecord.step_eight` | 失败统计和追溯。 |

降级显示：没有入选关键帧时默认阻止批量生成；没有 I2V 提示词时只允许上传视频片段。

### 3.9 步骤 09「音频字幕」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `structured_dialogues`、`voiceovers` | 强依赖 | `ProjectRecord.step_two` | 配音与字幕文本来源。 |
| 读取 | `final_clips`、`clip.duration` | 强依赖 | `AssetReference` + `ProjectRecord.step_eight` | 字幕时间轴和口型同步依据。 |
| 读取 | `characters`、`voice_profiles` | 可选增强 | `ProjectRecord.step_three/step_nine` | 角色声音匹配。 |
| 读取 | `shots[].dialogue_refs` | 可选增强 | `ProjectRecord.step_four` | 台词与镜头精准对齐。 |
| 产出 | `voice_tracks`、`subtitle_tracks` | 强依赖 | `ProjectRecord.step_nine` + `AssetReference` | 步骤 10 音画字幕对齐使用。 |
| 产出 | `lip_sync_tasks` | 可选增强 | `GenerationTask` | 口型同步运行态和结果视频。 |
| 产出 | `sfx_tracks`、`bgm_tracks`、`mix_settings` | 可选增强 | `ProjectRecord.step_nine` + `AssetReference` | 剪辑增强和混音配置。 |

降级显示：没有视频片段时仍可生成配音和字幕草稿，口型同步模块置灰；没有角色声音时使用默认旁白/默认声音并提示后续可替换。

### 3.10 步骤 10「剪辑成片」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `final_clips` | 强依赖 | `AssetReference` + `ProjectRecord.step_eight` | 成片时间线主视频素材。 |
| 读取 | `voice_tracks`、`subtitle_tracks` | 强依赖 | `ProjectRecord.step_nine` + `AssetReference` | 对齐对白、旁白和字幕。 |
| 读取 | `shots[].shot_number/duration` | 强依赖 | `ProjectRecord.step_four` | 镜头顺序和节奏对齐。 |
| 读取 | `sfx_tracks`、`bgm_tracks`、`mix_settings` | 可选增强 | `ProjectRecord.step_nine` + `AssetReference` | 声音完整性增强。 |
| 读取 | `selected_keyframes` | 可选增强 | `AssetReference` | 封面候选或补帧使用。 |
| 产出 | `editing_timeline`、`tracks`、`transitions` | 强依赖 | `ProjectRecord.step_ten` | 成片编排结果。 |
| 产出 | `export_versions`、`cover_candidates`、`publish_asset_package` | 强依赖 | `AssetReference` + `ProjectRecord.step_ten` | 步骤 11 发布复盘输入。 |
| 任务 | 导出任务、质量检查任务 | 可选增强 | `GenerationTask` | 导出进度和失败重试。 |

降级显示：缺少音频时可创建静音时间线；缺少字幕时显示字幕轨空状态；缺少视频时只显示素材缺口清单并阻止导出。

### 3.11 步骤 11「发布复盘」

| 分类 | 字段/对象 | 依赖级别 | 来源建议 | 说明 |
| --- | --- | --- | --- | --- |
| 读取 | `export_versions`、`publish_asset_package` | 强依赖 | `ProjectRecord.step_ten` + `AssetReference` | 发布记录绑定的成片和素材。 |
| 读取 | `cover_candidates`、`title_candidates` | 可选增强 | `ProjectRecord.step_ten` + `AssetReference` | 平台适配和 A/B 记录。 |
| 读取 | `platform_metrics`、`comments` | 可选增强 | `ProjectRecord.step_eleven` 或外部导入 | 数据复盘和反馈分析。 |
| 产出 | `publish_records` | 强依赖 | `ProjectRecord.step_eleven` | 记录何时在哪个平台发布哪个版本。 |
| 产出 | `retention_analysis`、`review_report` | 可选增强 | `ProjectRecord.step_eleven` | 数据分析结果。 |
| 产出 | `optimization_tasks` | 可选增强 | `ProjectRecord.step_eleven` | 回流步骤 01/02/03/10 的优化建议。 |
| 任务 | 复盘报告生成、发布文案生成 | 可选增强 | `GenerationTask` | AI 报告生成状态。 |

降级显示：没有发布素材包时显示发布前准备清单；没有平台数据时允许手动录入或导入表格，复盘报告显示空模板。

---

## 4. 强依赖字段清单

| 字段/对象 | 所属步骤 | 被哪些步骤强依赖 | 说明 |
| --- | --- | --- | --- |
| `project.id` | 全局 | 全部 | 所有保存、任务、素材必须绑定项目。 |
| `episode_outlines` | 01 | 02 | 剧本生成的集数上下文。 |
| `character_relations` | 01 | 02、03 | 剧本和资产初始角色关系。 |
| `script_text` | 02 | 03、04 | 资产提取和拆镜基础。 |
| `structured_dialogues` | 02 | 04、09 | 台词绑定、字幕和配音基础。 |
| `characters` | 03 | 04、05、07 | 角色引用、一致性检查基础。 |
| `scenes`、`props` | 03 | 04、05、07 | 场景道具引用和质检基础。 |
| `style_board`、`consistency_rules` | 03 | 05、06、07 | 风格一致性与生成质量控制。 |
| `shots[].shot_id` | 04 | 05、06、08、09、10 | 镜头级外键，贯穿生产链。 |
| `shots[].duration` | 04 | 08、09、10 | 视频、字幕和剪辑对齐。 |
| `t2i_prompts` | 05 | 06 | 图片生成强依赖。 |
| `i2v_prompts` | 05 | 08 | 视频生成强依赖。 |
| `selected_keyframes` | 06 | 07、08 | 质检和视频生成的图片输入。 |
| `quality_reports.status`、`passed_assets` | 07 | 08 | 视频生成默认门禁。 |
| `final_clips` | 08 | 09、10 | 音频字幕和剪辑的主视频素材。 |
| `voice_tracks`、`subtitle_tracks` | 09 | 10 | 剪辑成片音频和字幕输入。 |
| `export_versions`、`publish_asset_package` | 10 | 11 | 发布复盘绑定的成片资产。 |
| `publish_records` | 11 | 后续轮次 | 下一轮复盘回流的发布事实。 |

---

## 5. 可选增强字段清单

| 字段/对象 | 价值 | 缺失影响 | 建议降级 |
| --- | --- | --- | --- |
| `continuity_report` | 剧情连续性提示 | 生成质量下降 | 显示“未检查连续性”，不阻塞。 |
| `source_materials`、`term_bank` | 剧本风格和术语一致 | 文本可能不贴合原作 | 保留人工输入和导入入口。 |
| `reference_images` | 视觉稳定性 | 画面一致性降低 | 使用文字资产卡继续生成。 |
| `locked_terms` | 提示词稳定性 | 重生成可能漂移 | 展示风险提示，允许手动锁词。 |
| `negative_prompts` | 生成错误控制 | 错误率可能更高 | 使用系统默认负面词。 |
| `discarded_images` | 追溯和恢复 | 无法恢复废弃选择 | 仅保留当前候选图状态。 |
| `quality_suggestions` | 自动返工效率 | 人工返工成本增加 | 显示手动标记入口。 |
| `action_reference`、`pose_reference` | 视频动作可控 | 动作稳定性下降 | 仅使用 I2V 提示词。 |
| `voice_profiles` | 角色声线一致 | 角色声音不稳定 | 使用默认声音并提示后续补齐。 |
| `sfx_tracks`、`bgm_tracks` | 成片表现力 | 成片声音层较薄 | 允许静音或只有对白导出。 |
| `platform_metrics` | 数据复盘准确性 | 无法自动分析表现 | 提供手动录入和空报告模板。 |

---

## 6. `ProjectRecord`、`GenerationTask`、`AssetReference` 分工建议

### 6.1 `ProjectRecord` 应保存的数据

`ProjectRecord` 负责稳定、可回显、可编辑的项目结构化数据：

| 范围 | 建议字段 |
| --- | --- |
| 全局 | `id`、`name`、`status`、`current_step`、`progress`、`created_at`、`updated_at` |
| 步骤 01 | `step_one.worldview`、`main_goal`、`character_relations`、`episode_outlines` |
| 步骤 02 | `step_two.script_text`、`structured_dialogues`、`beats`、`review_notes`、`versions` |
| 步骤 03 | `step_three.characters`、`scenes`、`props`、`style_board`、`consistency_rules` |
| 步骤 04 | `step_four.shots`、`shot_order`、`rhythm_stats`、`dialogue_refs` |
| 步骤 05 | `step_five.t2i_prompts`、`i2v_prompts`、`negative_prompts`、`params` |
| 步骤 06 | `step_six.selected_keyframes`、`discarded_assets`、`filters`、`selection_records` |
| 步骤 08 | `step_eight.final_clips`、`failure_records`、`video_metadata` |
| 步骤 09 | `step_nine.dialogue_lines`、`voice_profiles`、`subtitle_tracks`、`mix_settings` |
| 步骤 10 | `step_ten.editing_timeline`、`export_versions`、`publish_asset_package` |
| 步骤 11 | `step_eleven.publish_records`、`platform_metrics`、`review_report`、`optimization_tasks` |

### 6.2 `GenerationTask` 应保存的数据

`GenerationTask` 负责运行态、队列态和失败重试，不应作为最终业务数据唯一来源：

| 覆盖步骤 | 任务类型 |
| --- | --- |
| 01、02 | 世界观生成、剧本生成、局部改写、批量改写 |
| 03 | 资产提取、角色卡生成、参考图生成 |
| 04 | 自动拆镜、节奏表生成、后续任务队列创建 |
| 05 | T2I/I2V 提示词生成、批量替换、版本生成 |
| 06 | 图片生成、局部重绘、重新生成 |
| 07 | 自动质检、返工建议、重新质检 |
| 08 | 视频生成、重生成、失败策略应用 |
| 09 | 配音生成、口型同步、字幕生成、BGM 生成 |
| 10 | 成片导出、剪辑质检、多版本导出 |
| 11 | 发布文案生成、复盘报告生成、优化建议生成 |

关键字段建议：`task_id`、`project_id`、`step_id`、`target_entity_id`、`task_type`、`status`、`progress`、`input_snapshot`、`output_refs`、`failure_reason`、`retry_count`、`created_at`、`updated_at`。

### 6.3 `AssetReference` 应保存的数据

`AssetReference` 负责二进制或外部素材引用，避免把大文件塞进 `ProjectRecord`：

| 素材类型 | 主要来源 | 下游用途 |
| --- | --- | --- |
| 参考图 | 步骤 03 | 提词、画面生成、质检、视频参考 |
| 候选图/关键帧 | 步骤 06 | 质检、视频生成、封面候选 |
| 通过素材 | 步骤 07 | 视频生成默认输入 |
| 视频候选/最终片段 | 步骤 08 | 音频字幕、剪辑成片 |
| 配音/旁白音频 | 步骤 09 | 剪辑成片、发布素材包 |
| 音效/BGM | 步骤 09 | 剪辑成片 |
| 成片导出版本 | 步骤 10 | 发布复盘 |
| 封面候选 | 步骤 10 | 发布复盘、平台适配 |

关键字段建议：`asset_id`、`project_id`、`step_id`、`owner_entity_id`、`asset_type`、`url`、`thumbnail_url`、`mime_type`、`metadata`、`status`、`created_at`、`updated_at`。

---

## 7. 页面降级显示统一规则

| 场景 | 页面行为 | 操作入口 |
| --- | --- | --- |
| 项目不存在 | 显示项目不存在空状态，提供返回项目列表/新建项目入口 | 禁用保存和生成 |
| 上游强依赖缺失 | 显示缺失清单，给出跳转上游步骤按钮 | 禁用相关 AI 生成，保留手动编辑或上传入口 |
| 上游可选增强缺失 | 显示轻量提示，不阻断主流程 | 允许继续，标记风险 |
| 上游版本过期 | 显示“上游已更新”提示和重新同步按钮 | 不自动覆盖当前步骤草稿 |
| 任务运行中 | 显示任务进度、停止、刷新状态 | 禁止重复提交同类任务 |
| 任务失败 | 显示失败原因、重试、复制输入快照 | 保留旧成功结果 |
| 素材缺失或 URL 失效 | 显示素材占位和重新上传/重新生成入口 | 不删除引用记录 |
| 数据部分可用 | 可用模块正常展示，缺失模块用局部空状态 | 不让整页崩溃 |

---

## 8. 实现落地建议

1. 每个步骤页面读取 `ProjectRecord` 时先检查 `projectId`，再检查该步骤强依赖字段。
2. 强依赖缺失时，页面应提供明确跳转上游步骤入口，而不是只显示通用错误。
3. 生成任务的输入快照应包含上游关键字段版本，便于上游更新后提示数据过期。
4. 素材资产只在 `ProjectRecord` 保存轻量引用 ID，完整 URL、尺寸、类型、缩略图和服务商元数据放在 `AssetReference`。
5. 下游步骤默认读取“已确认/已通过/最终”的产物，不默认读取草稿、失败、废弃素材。
6. 回流型数据如步骤 11 的优化建议，不应直接覆盖步骤 01/02/03；应先生成可采纳的优化任务。
7. 所有跨步骤引用应优先使用稳定 ID，例如 `episode_id`、`shot_id`、`prompt_id`、`asset_id`、`clip_id`，避免只靠标题或序号匹配。
8. 页面刷新回显以 `ProjectRecord` 为准，生成进度以 `GenerationTask` 为准，媒体预览以 `AssetReference` 为准。

---

## 9. 结论

11 步创作中心的数据流应以 `ProjectRecord` 承载稳定创作结果，以 `GenerationTask` 承载 AI 运行态，以 `AssetReference` 承载媒体素材引用。强依赖字段决定页面是否能进入核心生产动作，可选增强字段决定生成质量和工作效率。页面实现时只要把缺失、过期、失败、素材不可用四类状态处理清楚，就能在 11 步尚未全部真实落地时保持可用、可回显、可继续扩展。
