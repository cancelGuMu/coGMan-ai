# API-DOC-001：11 步工作流后端数据扩展方案

## 任务边界

本文档基于当前后端文件：

- `apps/api/src/app/models.py`
- `apps/api/src/app/storage.py`
- `apps/api/src/app/main.py`

本任务只整理后端数据扩展设计，不实现接口，不修改后端代码。

## 当前后端现状

### 已有模型

- `StepId` 已包含 11 步枚举：`story-structure`、`script-creation`、`asset-setting`、`storyboard-planning`、`prompt-generation`、`image-generation`、`quality-rework`、`video-generation`、`audio-subtitle`、`final-editing`、`publish-review`。
- `ProjectRecord` 当前已有项目基础字段：`id`、`name`、`status`、`progress`、`cover_style`、`cover_image_url`、`created_at`、`updated_at`、`current_step`。
- `ProjectRecord` 当前仅持久化两个步骤数据：`step_one: StepOneData`、`step_two: StepTwoData`。
- `StepOneData` 已覆盖故事架构的最小数据：项目名、核心故事、季集数、导入故事名、项目绑定状态、集数草案。
- `StepTwoData` 已覆盖剧本创作的最小数据：项目状态、正文准备度、剧本状态、素材导入、小说文本、角色画像、术语库、写作指导、剧本文本、审核意见、改写工具、修改记录。

### 已有存储机制

- 本地存储文件为 `apps/api/data/projects.json`。
- `_read_records()` 会读取 JSON 后逐条 `ProjectRecord.model_validate(item)`。
- `_write_records()` 会把 Pydantic 模型用 `model_dump(mode="json")` 写回 JSON。
- 已存在 `LEGACY_STEP_MAP`，用于把旧版 `current_step` 映射到新版 11 步枚举。
- 当前只有 `save_step_one()` 与 `save_step_two()` 两个步骤保存函数。
- 当前只有 `/api/projects/{project_id}/step-one` 与 `/api/projects/{project_id}/step-two` 两个步骤保存接口。

## 建议总体结构

建议继续沿用 `ProjectRecord` 按步骤嵌套数据的方式，补齐：

- `step_three: StepThreeData`
- `step_four: StepFourData`
- `step_five: StepFiveData`
- `step_six: StepSixData`
- `step_seven: StepSevenData`
- `step_eight: StepEightData`
- `step_nine: StepNineData`
- `step_ten: StepTenData`
- `step_eleven: StepElevenData`

同时建议新增通用辅助结构：

- `StepSaveMeta`：记录保存状态、更新时间、最近修改方、版本号、备注。
- `AssetReference`：记录上传或生成的图片、音频、视频、文档等素材引用。
- `GenerationAttempt`：记录 AI 生成任务的模型、提示词摘要、状态、错误信息、产物引用。
- `ReviewIssue`：记录质检、审核、返工意见。
- `VersionRecord`：记录每个步骤的版本历史。

这些通用结构可以在多个步骤中复用，避免每一步重复定义 `updated_at`、`modified_by`、`version_status`、`review_notes` 等字段。

## 11 步建议新增存储字段

### 01 故事架构：`step_one`

当前已有 `StepOneData`，建议后续补充字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `genre` | `str` | 题材类型，如都市、玄幻、科幻、校园 | `""` |
| `target_audience` | `str` | 目标受众与平台方向 | `""` |
| `worldview` | `str` | 世界观、时代背景、规则体系 | `""` |
| `protagonist_goal` | `str` | 主角长期目标 | `""` |
| `antagonist_force` | `str` | 反派阻力或主要对抗力量 | `""` |
| `core_conflict` | `str` | 核心矛盾 | `""` |
| `character_relationships` | `list[CharacterRelation]` | 人物关系、阵营关系、情感关系 | `[]` |
| `season_outline` | `str` | 整季大纲 | `""` |
| `continuity_checks` | `list[ReviewIssue]` | 主线连续性、节奏、重复内容检查 | `[]` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

兼容策略：保留现有字段不改名，新增字段全部设置默认值，旧项目读取时可自动补齐。

### 02 剧本创作：`step_two`

当前已有 `StepTwoData`，建议后续补充字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `selected_episode_number` | `int | None` | 当前正在创作的集数 | `None` |
| `episode_context` | `str` | 本集承接、钩子、前情摘要 | `""` |
| `dialogue_blocks` | `list[ScriptBlock]` | 按场景或段落拆分的对白、旁白、动作 | `[]` |
| `beat_markers` | `list[BeatMarker]` | 节奏点、反转点、停顿点、情绪峰值 | `[]` |
| `consistency_checks` | `list[ReviewIssue]` | 人设、称谓、时间线、剧情承接检查 | `[]` |
| `export_status` | `str` | 是否已确认给分镜、配音使用 | `"未导出"` |
| `versions` | `list[VersionRecord]` | 剧本版本历史 | `[]` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

兼容策略：保留 `script_text` 作为正式剧本文本主字段，新增结构化字段先作为增强数据，不强制旧数据拆分。

### 03 资产设定：`step_three`

建议新增 `StepThreeData`，存储字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `character_cards` | `list[CharacterCard]` | 主角、配角、反派、路人的角色卡 | `[]` |
| `scene_cards` | `list[SceneCard]` | 场景卡，包括地点、光线、氛围、镜头角度 | `[]` |
| `prop_cards` | `list[PropCard]` | 道具、武器、信物、服装配件 | `[]` |
| `style_board` | `StyleBoard` | 画风、色彩、光影、材质、比例 | 默认对象 |
| `reference_assets` | `list[AssetReference]` | 角色、场景、道具参考图 | `[]` |
| `consistency_rules` | `list[str]` | 脸型、发色、服装、体型、负面限制 | `[]` |
| `prompt_templates` | `list[PromptTemplate]` | 可复用提示词模板 | `[]` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

### 04 分镜规划：`step_four`

建议新增 `StepFourData`，存储字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `selected_episode_number` | `int | None` | 当前分镜集数 | `None` |
| `shot_list` | `list[StoryboardShot]` | 镜头表核心数据 | `[]` |
| `scene_sequence` | `list[str]` | 场景顺序 | `[]` |
| `pacing_table` | `list[PacingItem]` | 节奏表、情绪强度、镜头时长 | `[]` |
| `generation_queue` | `list[GenerationQueueItem]` | 后续画面或视频生成任务队列 | `[]` |
| `review_notes` | `str` | 分镜审核意见 | `""` |
| `versions` | `list[VersionRecord]` | 分镜版本历史 | `[]` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

### 05 提词生成：`step_five`

建议新增 `StepFiveData`，存储字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `image_prompts` | `list[PromptRecord]` | 每个镜头的 T2I 图片提示词 | `[]` |
| `video_prompts` | `list[PromptRecord]` | 每个镜头的 I2V 视频提示词 | `[]` |
| `negative_prompts` | `list[PromptRecord]` | 负面提示词 | `[]` |
| `model_parameters` | `PromptModelParameters` | 比例、分辨率、模型、种子、参考权重 | 默认对象 |
| `locked_keywords` | `list[str]` | 人工锁定关键词 | `[]` |
| `batch_replace_rules` | `list[ReplaceRule]` | 批量替换规则 | `[]` |
| `versions` | `list[VersionRecord]` | 提示词版本历史 | `[]` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

### 06 画面生成：`step_six`

建议新增 `StepSixData`，存储字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `image_generation_tasks` | `list[GenerationAttempt]` | 图片生成任务记录 | `[]` |
| `candidate_images` | `list[ImageCandidate]` | 每个镜头的候选图 | `[]` |
| `selected_keyframes` | `list[AssetReference]` | 入选关键帧或分镜图 | `[]` |
| `repaint_requests` | `list[ReworkRequest]` | 局部重绘、换脸、换服装、改背景需求 | `[]` |
| `filter_state` | `dict[str, str]` | 角色、场景、镜头、集数筛选状态 | `{}` |
| `asset_links` | `list[ShotAssetLink]` | 图片与镜头编号、提示词版本的绑定关系 | `[]` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

### 07 质检返工：`step_seven`

建议新增 `StepSevenData`，存储字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `quality_checks` | `list[QualityCheckItem]` | 角色、场景、构图、动作、生成错误检查 | `[]` |
| `rework_reasons` | `list[ReviewIssue]` | 待修问题和返工原因 | `[]` |
| `repair_suggestions` | `list[ReworkRequest]` | 修复建议与执行方式 | `[]` |
| `approved_assets` | `list[AssetReference]` | 通过质检的素材 | `[]` |
| `rejected_assets` | `list[AssetReference]` | 废弃素材 | `[]` |
| `gate_status` | `str` | 是否允许进入视频生成 | `"未通过"` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

### 08 视频生成：`step_eight`

建议新增 `StepEightData`，存储字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `video_generation_tasks` | `list[GenerationAttempt]` | 视频生成任务记录 | `[]` |
| `motion_settings` | `list[MotionSetting]` | 运镜、动作、表情、环境动态设置 | `[]` |
| `video_candidates` | `list[VideoCandidate]` | 每个镜头的视频候选版本 | `[]` |
| `selected_clips` | `list[AssetReference]` | 选中的最终镜头视频 | `[]` |
| `retry_reasons` | `list[ReviewIssue]` | 失败片段和重试原因 | `[]` |
| `shot_video_links` | `list[ShotAssetLink]` | 视频片段与镜头、关键帧、提示词版本绑定 | `[]` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

### 09 音频字幕：`step_nine`

建议新增 `StepNineData`，存储字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `voice_profiles` | `list[VoiceProfile]` | 角色声音、音色、语速、语气 | `[]` |
| `voice_tracks` | `list[AssetReference]` | 角色配音和旁白音频 | `[]` |
| `lip_sync_tasks` | `list[GenerationAttempt]` | 口型同步任务 | `[]` |
| `subtitle_tracks` | `list[SubtitleTrack]` | 字幕文本、时间轴、样式 | `[]` |
| `sound_effects` | `list[AssetReference]` | 环境音、动作音效、转场音效 | `[]` |
| `music_tracks` | `list[AssetReference]` | 背景音乐 | `[]` |
| `mixing_notes` | `str` | 音量、淡入淡出、对白可听性调整说明 | `""` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

### 10 剪辑成片：`step_ten`

建议新增 `StepTenData`，存储字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `timeline` | `list[TimelineItem]` | 镜头视频、配音、字幕、音效的时间线 | `[]` |
| `transition_settings` | `list[TransitionSetting]` | 转场、卡点、节奏点 | `[]` |
| `color_adjustments` | `list[ColorAdjustment]` | 调色和画面修正 | `[]` |
| `edit_checks` | `list[ReviewIssue]` | 字幕遮挡、声音错位、黑帧、跳帧等检查 | `[]` |
| `export_variants` | `list[ExportVariant]` | 横版、竖版、预告版、正片版 | `[]` |
| `cover_candidates` | `list[AssetReference]` | 封面候选 | `[]` |
| `title_candidates` | `list[str]` | 标题候选 | `[]` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

### 11 发布复盘：`step_eleven`

建议新增 `StepElevenData`，存储字段：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `publish_assets` | `list[PublishAsset]` | 标题、简介、标签、话题、封面、发布文案 | `[]` |
| `platform_adaptations` | `list[PlatformAdaptation]` | 平台比例、时长、字幕安全区、封面样式 | `[]` |
| `publish_records` | `list[PublishRecord]` | 平台、发布时间、版本编号、投放策略 | `[]` |
| `performance_metrics` | `list[PerformanceMetric]` | 播放、完播、点赞、评论、收藏、转发、转粉 | `[]` |
| `retention_analysis` | `str` | 开头留存、跳出节点、剧情钩子分析 | `""` |
| `review_report` | `str` | 复盘报告 | `""` |
| `feedback_to_steps` | `list[FeedbackItem]` | 回流到故事、剧本、资产、剪辑的优化建议 | `[]` |
| `next_experiments` | `list[str]` | 下一集或下一季实验方向 | `[]` |
| `save_meta` | `StepSaveMeta` | 保存状态与版本信息 | 默认对象 |

## `step_one`、`step_two` 与后续步骤兼容方案

### 保留现有字段与接口

- 不重命名 `step_one`、`step_two`。
- 不改变 `/api/projects/{project_id}/step-one` 与 `/api/projects/{project_id}/step-two` 的请求体结构。
- 不改变 `SaveStepOneRequest` 与 `SaveStepTwoRequest` 的入参语义。
- 旧前端仍可只保存前两步，不需要立即知道后续 9 步字段。

### 新增字段必须可选或有默认值

所有新增步骤数据模型都应使用默认对象：

- `step_three: StepThreeData = Field(default_factory=StepThreeData)`
- 直到 `step_eleven: StepElevenData = Field(default_factory=StepElevenData)`

新增字段内部也必须有默认值，避免旧 JSON 缺字段时 `ProjectRecord.model_validate(item)` 失败。

### 进度与当前步骤保持向后兼容

- 当前 `save_step_one()` 仍负责从故事架构推进到剧本创作。
- 当前 `save_step_two()` 仍负责从剧本创作推进到资产设定。
- 后续保存函数建议按同样模式更新 `status`、`progress`、`updated_at`、`current_step`。
- 进度值建议改为配置表或函数，不建议把所有步骤进度硬编码在多个保存函数中。

建议进度区间：

| 步骤 | `current_step` | 建议进度范围 |
| --- | --- | --- |
| 01 故事架构 | `story-structure` | 10-20 |
| 02 剧本创作 | `script-creation` | 21-30 |
| 03 资产设定 | `asset-setting` | 31-40 |
| 04 分镜规划 | `storyboard-planning` | 41-50 |
| 05 提词生成 | `prompt-generation` | 51-58 |
| 06 画面生成 | `image-generation` | 59-66 |
| 07 质检返工 | `quality-rework` | 67-74 |
| 08 视频生成 | `video-generation` | 75-82 |
| 09 音频字幕 | `audio-subtitle` | 83-88 |
| 10 剪辑成片 | `final-editing` | 89-95 |
| 11 发布复盘 | `publish-review` | 96-100 |

当前 `save_step_two()` 完成时已经把 `current_step` 推到 `asset-setting`，因此 `step_three` 是自然接续点。

## 本地 JSON 存储兼容方案

### 读取时兼容旧项目

当前 `_read_records()` 直接把 JSON 项校验为 `ProjectRecord`。扩展后必须确保：

- 旧项目没有 `step_three` 到 `step_eleven` 时，Pydantic 使用默认对象补齐。
- 旧项目没有新增的 `step_one`、`step_two` 字段时，使用字段默认值补齐。
- 旧项目存在旧版 `current_step` 时，继续使用 `LEGACY_STEP_MAP` 映射。
- 读取时不要原地删除未知字段，避免未来版本数据被旧服务误清洗。

### 写入时避免破坏旧数据

建议写入遵循以下原则：

- 只在保存目标步骤时更新对应 `step_xxx` 字段。
- 项目基础字段只更新确有必要的字段，如 `name`、`status`、`progress`、`updated_at`、`current_step`。
- 不因为保存某一步而清空其他步骤数据。
- 新增字段使用默认值，不通过迁移脚本批量改写旧项目，除非用户主动打开并保存项目。
- 对生成资产类字段仅存引用和元数据，不把大文件内容直接写进 `projects.json`。

### 建议增加存储版本号

建议未来在项目根对象增加：

| 字段 | 类型建议 | 用途 | 默认值 |
| --- | --- | --- | --- |
| `schema_version` | `int` | 项目数据结构版本 | `1` |
| `migration_notes` | `list[str]` | 自动兼容或迁移说明 | `[]` |

读取时可按 `schema_version` 做轻量补齐，写入时更新到当前版本。这样比依赖字段是否存在更清晰。

### 建议增加备份与原子写入

本地 JSON 存储在 11 步扩展后数据量会明显变大，建议未来：

- 写入前保留 `projects.json.bak`。
- 先写入临时文件，再替换正式文件，降低写入中断导致 JSON 损坏的风险。
- 对导入文本、图片、视频、音频等大素材保存为文件路径或对象存储 URL，JSON 只保存 `AssetReference`。
- 对写入失败返回明确错误，不吞掉异常。

## 未来接口扩展建议

以下为接口设计建议，不在本任务中实现。

### 按步骤扩展保存接口

保留现有接口，并新增：

- `PUT /api/projects/{project_id}/step-three`
- `PUT /api/projects/{project_id}/step-four`
- `PUT /api/projects/{project_id}/step-five`
- `PUT /api/projects/{project_id}/step-six`
- `PUT /api/projects/{project_id}/step-seven`
- `PUT /api/projects/{project_id}/step-eight`
- `PUT /api/projects/{project_id}/step-nine`
- `PUT /api/projects/{project_id}/step-ten`
- `PUT /api/projects/{project_id}/step-eleven`

每个接口对应独立 `SaveStepXRequest`，只保存本步骤数据。

### 增加通用步骤接口

中长期可以补充通用接口，减少重复路由：

- `GET /api/projects/{project_id}/steps/{step_id}`
- `PUT /api/projects/{project_id}/steps/{step_id}`
- `GET /api/projects/{project_id}/steps`

通用接口需要服务端做 `step_id` 到具体模型的白名单映射，避免任意字段写入项目对象。

### 增加资产与生成任务接口

11 步里有大量图片、视频、音频、字幕和生成任务，建议独立扩展：

- `POST /api/projects/{project_id}/assets`
- `GET /api/projects/{project_id}/assets`
- `POST /api/projects/{project_id}/generation-tasks`
- `GET /api/projects/{project_id}/generation-tasks/{task_id}`
- `PUT /api/projects/{project_id}/generation-tasks/{task_id}`

项目步骤数据中只保存资产引用和任务引用，避免步骤模型过度膨胀。

### 增加版本与审核接口

建议后续统一：

- `POST /api/projects/{project_id}/versions`
- `GET /api/projects/{project_id}/versions`
- `POST /api/projects/{project_id}/reviews`
- `GET /api/projects/{project_id}/reviews`

这样 `StepTwoData.modification_records`、各步骤 `review_notes`、`versions` 可以逐步统一为结构化记录。

## 实施顺序建议

1. 先新增步骤 03 到步骤 11 的 Pydantic 数据模型，全部带默认值。
2. 在 `ProjectRecord` 中挂载 `step_three` 到 `step_eleven` 默认对象。
3. 补充对应 `SaveStepXRequest`，但不移除现有请求模型。
4. 新增 storage 保存函数，保持“一次只保存一个步骤”的原则。
5. 新增 FastAPI 路由，先实现普通保存和读取，不急于接入 AI 生成。
6. 增加 JSON 原子写入和备份机制。
7. 最后再把资产上传、生成任务、版本记录拆成独立模块。

## 风险与注意事项

- 不要把图片、视频、音频二进制内容写进 `projects.json`。
- 不要在保存后续步骤时覆盖 `step_one`、`step_two`。
- 不要把 `current_step` 的旧值直接废弃，已有 `LEGACY_STEP_MAP` 需要继续保留。
- 不要一次性强制迁移所有旧项目；应优先采用读取补齐、保存时自然升级。
- 不要让通用步骤保存接口接收任意 JSON 并直接写入项目根对象，必须做字段白名单与模型校验。

## 验收对应

- 11 步每一步建议新增字段：见“11 步建议新增存储字段”。
- `step_one`、`step_two` 与后续步骤兼容：见“`step_one`、`step_two` 与后续步骤兼容方案”。
- 本地 JSON 存储不破坏旧数据：见“本地 JSON 存储兼容方案”。
- 未来接口扩展建议：见“未来接口扩展建议”。
