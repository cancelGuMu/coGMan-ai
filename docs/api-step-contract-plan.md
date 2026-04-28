# API-DOC-002：后端步骤接口请求/响应模型设计文档

## 任务边界

本文档基于 `API-DOC-001` 中的 11 步后端存储扩展方案，继续整理步骤接口契约设计。

本任务只写设计文档，不实现接口，不修改后端代码。

## 当前接口现状

当前后端已经存在：

- `PUT /api/projects/{project_id}/step-one`
- `PUT /api/projects/{project_id}/step-two`
- `GET /api/projects/{project_id}`
- `GET /api/projects`
- `POST /api/projects`
- `PUT /api/projects/{project_id}`
- `PUT /api/projects/{project_id}/cover`
- `DELETE /api/projects/{project_id}`

其中 `step-one` 与 `step-two` 的响应都使用 `ProjectDetailResponse`，即：

```json
{
  "project": {
    "id": "project-id",
    "name": "项目名",
    "status": "草稿中",
    "progress": 10,
    "cover_style": "starlight",
    "cover_image_url": null,
    "created_at": "2026-04-28T00:00:00",
    "updated_at": "2026-04-28T00:00:00",
    "current_step": "story-structure",
    "step_one": {},
    "step_two": {}
  }
}
```

后续步骤接口建议继续复用这个响应形态，降低前端接入成本。

## 通用契约约定

### 路由命名

建议保留当前短横线命名风格：

- `/step-one`
- `/step-two`
- `/step-three`
- 直到 `/step-eleven`

这样与现有接口保持一致，也便于前端按步骤编号直观调用。

### 请求体统一格式

每个步骤保存接口建议统一为：

```json
{
  "data": {
    "本步骤字段": "..."
  }
}
```

对应模型命名建议：

- `SaveStepThreeRequest`
- `SaveStepFourRequest`
- `SaveStepFiveRequest`
- `SaveStepSixRequest`
- `SaveStepSevenRequest`
- `SaveStepEightRequest`
- `SaveStepNineRequest`
- `SaveStepTenRequest`
- `SaveStepElevenRequest`

### 响应体统一格式

保存成功统一返回 `ProjectDetailResponse`：

```json
{
  "project": {
    "id": "project-id",
    "name": "项目名",
    "status": "待下一步骤",
    "progress": 40,
    "updated_at": "2026-04-28T00:00:00",
    "current_step": "storyboard-planning",
    "step_three": {}
  }
}
```

返回完整项目对象的好处是：前端保存后可直接刷新项目状态、进度、当前步骤和当前步骤数据，不需要再发一次详情请求。

### 通用成功状态

| 场景 | HTTP 状态 | 响应 |
| --- | --- | --- |
| 保存成功 | `200 OK` | `ProjectDetailResponse` |
| 保存成功但未改变内容 | `200 OK` | `ProjectDetailResponse`，`updated_at` 可按实现策略更新或保持 |

### 通用失败状态

| 场景 | HTTP 状态 | 响应建议 |
| --- | --- | --- |
| 项目不存在 | `404 Not Found` | `{"detail":"项目不存在"}` |
| 请求体验证失败 | `422 Unprocessable Entity` | FastAPI/Pydantic 默认校验错误 |
| 字段语义不合法 | `400 Bad Request` | `{"detail":"字段不合法：具体原因"}` |
| 步骤状态不允许保存 | `409 Conflict` | `{"detail":"当前步骤状态不允许执行此操作"}` |
| 本地 JSON 读写失败 | `500 Internal Server Error` | `{"detail":"项目数据保存失败"}` |

`409 Conflict` 不建议第一版强制启用。早期可以允许用户自由保存任意步骤，等工作流门禁更明确后再加入步骤顺序限制。

## 步骤 03 到 11 保存接口设计

### 03 资产设定

接口路径：

- `PUT /api/projects/{project_id}/step-three`

请求模型：

- `SaveStepThreeRequest`

请求体字段：

| 字段 | 类型建议 | 必填 | 用途 |
| --- | --- | --- | --- |
| `data.character_cards` | `list[CharacterCard]` | 否 | 主角、配角、反派、路人的角色卡 |
| `data.scene_cards` | `list[SceneCard]` | 否 | 场景卡，包括地点、光线、氛围、镜头角度 |
| `data.prop_cards` | `list[PropCard]` | 否 | 道具、武器、信物、服装配件 |
| `data.style_board` | `StyleBoard` | 否 | 画风、色彩、光影、材质、比例 |
| `data.reference_assets` | `list[AssetReference]` | 否 | 角色、场景、道具参考图 |
| `data.consistency_rules` | `list[str]` | 否 | 脸型、发色、服装、体型、负面限制 |
| `data.prompt_templates` | `list[PromptTemplate]` | 否 | 可复用提示词模板 |
| `data.save_meta` | `StepSaveMeta` | 否 | 保存状态、版本号、最近修改方 |

成功响应：

- `200 OK`
- 返回 `ProjectDetailResponse`
- 建议更新 `status` 为 `资产设定中` 或 `待分镜规划`
- 建议更新 `current_step` 为 `asset-setting` 或 `storyboard-planning`

失败状态：

- `404`：项目不存在
- `422`：请求字段类型不符合模型
- `400`：引用素材 ID 格式不合法或角色卡关键字段冲突
- `500`：本地 JSON 保存失败

### 04 分镜规划

接口路径：

- `PUT /api/projects/{project_id}/step-four`

请求模型：

- `SaveStepFourRequest`

请求体字段：

| 字段 | 类型建议 | 必填 | 用途 |
| --- | --- | --- | --- |
| `data.selected_episode_number` | `int | None` | 否 | 当前分镜集数 |
| `data.shot_list` | `list[StoryboardShot]` | 否 | 镜头表核心数据 |
| `data.scene_sequence` | `list[str]` | 否 | 场景顺序 |
| `data.pacing_table` | `list[PacingItem]` | 否 | 节奏表、情绪强度、镜头时长 |
| `data.generation_queue` | `list[GenerationQueueItem]` | 否 | 后续画面或视频生成任务队列 |
| `data.review_notes` | `str` | 否 | 分镜审核意见 |
| `data.versions` | `list[VersionRecord]` | 否 | 分镜版本历史 |
| `data.save_meta` | `StepSaveMeta` | 否 | 保存状态、版本号、最近修改方 |

成功响应：

- `200 OK`
- 返回 `ProjectDetailResponse`
- 建议更新 `status` 为 `分镜规划中` 或 `待提词生成`
- 建议更新 `current_step` 为 `storyboard-planning` 或 `prompt-generation`

失败状态：

- `404`：项目不存在
- `422`：请求字段类型不符合模型
- `400`：镜头编号重复、镜头时长小于 0、集数不在故事架构范围内
- `500`：本地 JSON 保存失败

### 05 提词生成

接口路径：

- `PUT /api/projects/{project_id}/step-five`

请求模型：

- `SaveStepFiveRequest`

请求体字段：

| 字段 | 类型建议 | 必填 | 用途 |
| --- | --- | --- | --- |
| `data.image_prompts` | `list[PromptRecord]` | 否 | 每个镜头的 T2I 图片提示词 |
| `data.video_prompts` | `list[PromptRecord]` | 否 | 每个镜头的 I2V 视频提示词 |
| `data.negative_prompts` | `list[PromptRecord]` | 否 | 负面提示词 |
| `data.model_parameters` | `PromptModelParameters` | 否 | 比例、分辨率、模型、种子、参考权重 |
| `data.locked_keywords` | `list[str]` | 否 | 人工锁定关键词 |
| `data.batch_replace_rules` | `list[ReplaceRule]` | 否 | 批量替换规则 |
| `data.versions` | `list[VersionRecord]` | 否 | 提示词版本历史 |
| `data.save_meta` | `StepSaveMeta` | 否 | 保存状态、版本号、最近修改方 |

成功响应：

- `200 OK`
- 返回 `ProjectDetailResponse`
- 建议更新 `status` 为 `提词生成中` 或 `待画面生成`
- 建议更新 `current_step` 为 `prompt-generation` 或 `image-generation`

失败状态：

- `404`：项目不存在
- `422`：请求字段类型不符合模型
- `400`：提示词关联的镜头不存在、模型参数越界、锁定关键词为空
- `500`：本地 JSON 保存失败

### 06 画面生成

接口路径：

- `PUT /api/projects/{project_id}/step-six`

请求模型：

- `SaveStepSixRequest`

请求体字段：

| 字段 | 类型建议 | 必填 | 用途 |
| --- | --- | --- | --- |
| `data.image_generation_tasks` | `list[GenerationAttempt]` | 否 | 图片生成任务记录引用 |
| `data.candidate_images` | `list[ImageCandidate]` | 否 | 每个镜头的候选图 |
| `data.selected_keyframes` | `list[AssetReference]` | 否 | 入选关键帧或分镜图 |
| `data.repaint_requests` | `list[ReworkRequest]` | 否 | 局部重绘、换脸、换服装、改背景需求 |
| `data.filter_state` | `dict[str, str]` | 否 | 当前筛选状态 |
| `data.asset_links` | `list[ShotAssetLink]` | 否 | 图片与镜头、提示词版本的绑定关系 |
| `data.save_meta` | `StepSaveMeta` | 否 | 保存状态、版本号、最近修改方 |

成功响应：

- `200 OK`
- 返回 `ProjectDetailResponse`
- 建议更新 `status` 为 `画面生成中` 或 `待质检返工`
- 建议更新 `current_step` 为 `image-generation` 或 `quality-rework`

失败状态：

- `404`：项目不存在
- `422`：请求字段类型不符合模型
- `400`：候选图引用不存在、同一镜头选中多张互斥关键帧、资产类型不匹配
- `500`：本地 JSON 保存失败

### 07 质检返工

接口路径：

- `PUT /api/projects/{project_id}/step-seven`

请求模型：

- `SaveStepSevenRequest`

请求体字段：

| 字段 | 类型建议 | 必填 | 用途 |
| --- | --- | --- | --- |
| `data.quality_checks` | `list[QualityCheckItem]` | 否 | 角色、场景、构图、动作、生成错误检查 |
| `data.rework_reasons` | `list[ReviewIssue]` | 否 | 待修问题和返工原因 |
| `data.repair_suggestions` | `list[ReworkRequest]` | 否 | 修复建议与执行方式 |
| `data.approved_assets` | `list[AssetReference]` | 否 | 通过质检的素材 |
| `data.rejected_assets` | `list[AssetReference]` | 否 | 废弃素材 |
| `data.gate_status` | `str` | 否 | 是否允许进入视频生成 |
| `data.save_meta` | `StepSaveMeta` | 否 | 保存状态、版本号、最近修改方 |

成功响应：

- `200 OK`
- 返回 `ProjectDetailResponse`
- 建议更新 `status` 为 `质检返工中` 或 `待视频生成`
- 建议 `gate_status` 通过时更新 `current_step` 为 `video-generation`

失败状态：

- `404`：项目不存在
- `422`：请求字段类型不符合模型
- `400`：通过素材不属于本项目、质检状态值非法、废弃素材仍被标记为通过
- `409`：未通过质检却请求推进到视频生成
- `500`：本地 JSON 保存失败

### 08 视频生成

接口路径：

- `PUT /api/projects/{project_id}/step-eight`

请求模型：

- `SaveStepEightRequest`

请求体字段：

| 字段 | 类型建议 | 必填 | 用途 |
| --- | --- | --- | --- |
| `data.video_generation_tasks` | `list[GenerationAttempt]` | 否 | 视频生成任务记录引用 |
| `data.motion_settings` | `list[MotionSetting]` | 否 | 运镜、动作、表情、环境动态设置 |
| `data.video_candidates` | `list[VideoCandidate]` | 否 | 每个镜头的视频候选版本 |
| `data.selected_clips` | `list[AssetReference]` | 否 | 选中的最终镜头视频 |
| `data.retry_reasons` | `list[ReviewIssue]` | 否 | 失败片段和重试原因 |
| `data.shot_video_links` | `list[ShotAssetLink]` | 否 | 视频片段与镜头、关键帧、提示词版本绑定 |
| `data.save_meta` | `StepSaveMeta` | 否 | 保存状态、版本号、最近修改方 |

成功响应：

- `200 OK`
- 返回 `ProjectDetailResponse`
- 建议更新 `status` 为 `视频生成中` 或 `待音频字幕`
- 建议更新 `current_step` 为 `video-generation` 或 `audio-subtitle`

失败状态：

- `404`：项目不存在
- `422`：请求字段类型不符合模型
- `400`：视频片段引用不存在、候选视频未关联镜头、视频时长不合法
- `409`：质检未通过时禁止保存正式视频片段
- `500`：本地 JSON 保存失败

### 09 音频字幕

接口路径：

- `PUT /api/projects/{project_id}/step-nine`

请求模型：

- `SaveStepNineRequest`

请求体字段：

| 字段 | 类型建议 | 必填 | 用途 |
| --- | --- | --- | --- |
| `data.voice_profiles` | `list[VoiceProfile]` | 否 | 角色声音、音色、语速、语气 |
| `data.voice_tracks` | `list[AssetReference]` | 否 | 角色配音和旁白音频 |
| `data.lip_sync_tasks` | `list[GenerationAttempt]` | 否 | 口型同步任务记录引用 |
| `data.subtitle_tracks` | `list[SubtitleTrack]` | 否 | 字幕文本、时间轴、样式 |
| `data.sound_effects` | `list[AssetReference]` | 否 | 环境音、动作音效、转场音效 |
| `data.music_tracks` | `list[AssetReference]` | 否 | 背景音乐 |
| `data.mixing_notes` | `str` | 否 | 音量、淡入淡出、对白可听性调整说明 |
| `data.save_meta` | `StepSaveMeta` | 否 | 保存状态、版本号、最近修改方 |

成功响应：

- `200 OK`
- 返回 `ProjectDetailResponse`
- 建议更新 `status` 为 `音频字幕中` 或 `待剪辑成片`
- 建议更新 `current_step` 为 `audio-subtitle` 或 `final-editing`

失败状态：

- `404`：项目不存在
- `422`：请求字段类型不符合模型
- `400`：字幕时间轴越界、音频引用不存在、角色声音配置重复冲突
- `500`：本地 JSON 保存失败

### 10 剪辑成片

接口路径：

- `PUT /api/projects/{project_id}/step-ten`

请求模型：

- `SaveStepTenRequest`

请求体字段：

| 字段 | 类型建议 | 必填 | 用途 |
| --- | --- | --- | --- |
| `data.timeline` | `list[TimelineItem]` | 否 | 镜头视频、配音、字幕、音效的时间线 |
| `data.transition_settings` | `list[TransitionSetting]` | 否 | 转场、卡点、节奏点 |
| `data.color_adjustments` | `list[ColorAdjustment]` | 否 | 调色和画面修正 |
| `data.edit_checks` | `list[ReviewIssue]` | 否 | 字幕遮挡、声音错位、黑帧、跳帧等检查 |
| `data.export_variants` | `list[ExportVariant]` | 否 | 横版、竖版、预告版、正片版 |
| `data.cover_candidates` | `list[AssetReference]` | 否 | 封面候选 |
| `data.title_candidates` | `list[str]` | 否 | 标题候选 |
| `data.save_meta` | `StepSaveMeta` | 否 | 保存状态、版本号、最近修改方 |

成功响应：

- `200 OK`
- 返回 `ProjectDetailResponse`
- 建议更新 `status` 为 `剪辑成片中` 或 `待发布复盘`
- 建议更新 `current_step` 为 `final-editing` 或 `publish-review`

失败状态：

- `404`：项目不存在
- `422`：请求字段类型不符合模型
- `400`：时间线片段重叠、导出版本缺少文件引用、标题候选为空字符串
- `500`：本地 JSON 保存失败

### 11 发布复盘

接口路径：

- `PUT /api/projects/{project_id}/step-eleven`

请求模型：

- `SaveStepElevenRequest`

请求体字段：

| 字段 | 类型建议 | 必填 | 用途 |
| --- | --- | --- | --- |
| `data.publish_assets` | `list[PublishAsset]` | 否 | 标题、简介、标签、话题、封面、发布文案 |
| `data.platform_adaptations` | `list[PlatformAdaptation]` | 否 | 平台比例、时长、字幕安全区、封面样式 |
| `data.publish_records` | `list[PublishRecord]` | 否 | 平台、发布时间、版本编号、投放策略 |
| `data.performance_metrics` | `list[PerformanceMetric]` | 否 | 播放、完播、点赞、评论、收藏、转发、转粉 |
| `data.retention_analysis` | `str` | 否 | 开头留存、跳出节点、剧情钩子分析 |
| `data.review_report` | `str` | 否 | 复盘报告 |
| `data.feedback_to_steps` | `list[FeedbackItem]` | 否 | 回流到故事、剧本、资产、剪辑的优化建议 |
| `data.next_experiments` | `list[str]` | 否 | 下一集或下一季实验方向 |
| `data.save_meta` | `StepSaveMeta` | 否 | 保存状态、版本号、最近修改方 |

成功响应：

- `200 OK`
- 返回 `ProjectDetailResponse`
- 建议更新 `status` 为 `已发布`、`复盘中` 或 `已完成`
- 建议 `progress` 可更新到 `100`
- 建议 `current_step` 保持 `publish-review`

失败状态：

- `404`：项目不存在
- `422`：请求字段类型不符合模型
- `400`：平台指标数值非法、发布时间格式错误、发布记录缺少平台名称
- `500`：本地 JSON 保存失败

## 与现有 step-one、step-two 接口的兼容方案

### 保持旧接口不变

现有接口应继续保留：

- `PUT /api/projects/{project_id}/step-one`
- `PUT /api/projects/{project_id}/step-two`

不要把它们立即替换成通用 `/steps/{step_id}`。原因是当前前端已经接入了这两个接口，且它们内部包含特定业务逻辑：

- `step-one` 会根据集数内容和钩子完整度更新故事架构进度。
- `step-two` 会根据剧本文本、小说正文长度、修改记录更新剧本状态。

这类逻辑不适合直接用通用 JSON 保存接口覆盖。

### 响应形态保持一致

后续 `step-three` 到 `step-eleven` 应与 `step-one`、`step-two` 一样返回 `ProjectDetailResponse`，避免前端为不同步骤写多套响应解析。

### 请求体继续使用 `{ "data": ... }`

现有两个接口已经使用：

- `SaveStepOneRequest.data`
- `SaveStepTwoRequest.data`

后续接口继续沿用 `SaveStepXRequest.data`，这样前端请求封装可以复用。

### 允许旧项目缺少后续步骤字段

即使新增接口后，旧项目仍可能只有 `step_one` 与 `step_two`。服务端读取项目详情时应通过模型默认值补齐 `step_three` 到 `step_eleven`，而不是要求旧 JSON 立即迁移。

### `current_step` 推进策略渐进增强

第一版可采用“保存当前步骤后按完成度推进下一步”的策略。后续再加入更严格的步骤门禁，例如：

- 分镜没有镜头表时，不推进到提词生成。
- 质检未通过时，不推进到视频生成。
- 没有导出成片时，不推进到发布复盘。

这能避免早期接口过度阻塞前端开发。

## 通用步骤接口是否适合本项目

候选接口：

- `GET /api/projects/{project_id}/steps/{step_id}`
- `PUT /api/projects/{project_id}/steps/{step_id}`
- `GET /api/projects/{project_id}/steps`

### 适合的部分

通用 `GET` 比较适合本项目：

- 前端可以按当前步骤懒加载单步数据。
- 列表页或工作台可以只拉取步骤摘要。
- 后续步骤增多后，可减少一次性返回完整项目大对象的压力。
- 可以用于只读预览、对比版本、跨步骤引用。

建议优先考虑：

- `GET /api/projects/{project_id}/steps`
- `GET /api/projects/{project_id}/steps/{step_id}`

### 需要谨慎的部分

通用 `PUT` 可以做，但不建议第一阶段作为主保存接口。原因：

- 每个步骤的业务校验不同，例如质检门禁、时间线校验、字幕时间轴校验。
- 每个步骤保存后对 `status`、`progress`、`current_step` 的推进规则不同。
- 通用接口如果直接接收任意 JSON，容易绕过 Pydantic 的具体模型校验。
- 通用接口会让错误提示变得笼统，不利于前端展示具体修复建议。

如果未来实现通用 `PUT`，必须满足：

- `step_id` 只能来自 `StepId` 白名单。
- 服务端必须把 `step_id` 映射到具体 `StepXData` 模型。
- 服务端必须把 `step_id` 映射到具体保存函数或校验函数。
- 不允许把请求体直接 merge 到项目根对象。

### 推荐结论

本项目推荐第一阶段采用“显式步骤保存接口 + 可选通用读取接口”：

- 保存：继续使用 `/step-three` 到 `/step-eleven` 这类显式接口。
- 读取：可以增加 `/steps` 和 `/steps/{step_id}` 做轻量读取。

等 11 步模型稳定后，再评估是否增加通用 `PUT /steps/{step_id}`。

## AI 生成任务接口与普通保存接口的边界

### 普通保存接口负责什么

普通保存接口只负责保存用户已经确认或编辑过的数据：

- 表单字段
- 文本内容
- 结构化表格
- 选中的素材引用
- 审核意见
- 版本状态
- 人工修改记录
- AI 生成结果被用户采纳后的最终内容

普通保存接口应尽量同步完成，返回 `ProjectDetailResponse`。

### AI 生成任务接口负责什么

AI 生成任务接口负责启动、查询、取消或记录异步生成任务：

- 文本生成
- 提示词生成
- 图片生成
- 视频生成
- 口型同步
- 字幕生成
- 复盘报告生成

建议接口：

- `POST /api/projects/{project_id}/generation-tasks`
- `GET /api/projects/{project_id}/generation-tasks/{task_id}`
- `PUT /api/projects/{project_id}/generation-tasks/{task_id}`
- `POST /api/projects/{project_id}/generation-tasks/{task_id}/accept`
- `POST /api/projects/{project_id}/generation-tasks/{task_id}/reject`

### 两类接口不要混用

不建议让普通保存接口直接触发长耗时 AI 生成。原因：

- 保存操作应快速、可预期、可重试。
- AI 生成可能耗时较长，需要排队、重试、取消、失败恢复。
- AI 生成失败不应导致用户已编辑内容保存失败。
- 用户可能生成多个候选结果，只采纳其中一个。

### 推荐交互顺序

以画面生成为例：

1. 前端调用普通保存接口保存提示词或参数。
2. 前端调用 AI 生成任务接口创建图片生成任务。
3. 前端轮询或订阅任务状态。
4. 任务完成后返回候选图片资产引用。
5. 用户选择候选图。
6. 前端调用普通保存接口保存 `selected_keyframes` 和 `asset_links`。

这样可以把“生成过程”和“最终项目状态”分开，避免项目数据里混入大量中间失败状态。

## 建议错误响应结构

第一阶段可以继续使用 FastAPI 默认错误格式。中长期建议统一为：

```json
{
  "detail": "错误说明",
  "code": "STEP_VALIDATION_ERROR",
  "field": "data.shot_list[0].duration",
  "retryable": false
}
```

建议常用错误码：

| 错误码 | 含义 |
| --- | --- |
| `PROJECT_NOT_FOUND` | 项目不存在 |
| `STEP_VALIDATION_ERROR` | 步骤字段语义校验失败 |
| `STEP_GATE_BLOCKED` | 当前步骤门禁不允许推进 |
| `ASSET_NOT_FOUND` | 素材引用不存在 |
| `GENERATION_TASK_RUNNING` | 生成任务仍在执行 |
| `STORAGE_WRITE_FAILED` | 本地 JSON 写入失败 |

## 实施顺序建议

1. 保持 `step-one` 与 `step-two` 接口不变。
2. 先实现 `step-three` 到 `step-eleven` 的显式保存接口。
3. 每个步骤接口先返回完整 `ProjectDetailResponse`。
4. 每个步骤保存函数只更新本步骤数据和必要项目元信息。
5. 增加通用 `GET /steps` 与 `GET /steps/{step_id}` 做轻量读取。
6. 最后再加入 AI 生成任务接口，并把生成结果通过普通保存接口写入正式步骤数据。

## 验收对应

- 步骤 03 到步骤 11 保存接口路径：见“步骤 03 到 11 保存接口设计”。
- 每个接口请求体、响应体、成功状态、失败状态：见各步骤接口小节。
- 兼容现有 `step-one` 和 `step-two`：见“与现有 step-one、step-two 接口的兼容方案”。
- 通用步骤接口利弊：见“通用步骤接口是否适合本项目”。
- AI 生成任务接口与普通保存接口边界：见“AI 生成任务接口与普通保存接口的边界”。
