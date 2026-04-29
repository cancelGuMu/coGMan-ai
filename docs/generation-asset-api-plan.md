# API-DOC-003：AI 生成任务与素材资产接口设计文档

## 任务边界

本文档整理 coMGan-ai 后端中 AI 生成任务与素材资产接口的设计方案，重点覆盖提示词、图片、视频、音频、字幕生成任务如何建模、流转、保存与迁移。

本任务只写接口设计文档，不实现后端接口，不修改后端代码。

## 设计目标

AI 生成任务与普通步骤保存接口需要分层：

- 普通步骤保存接口负责保存用户确认后的正式创作数据。
- AI 生成任务接口负责管理长耗时、可失败、可重试、可取消的生成过程。
- 素材资产接口负责保存图片、视频、音频、字幕、文本等产物引用。
- 步骤数据中的 `step_xxx` 只保存最终选中或采纳的任务结果引用，不直接塞入大量中间生成记录。

这样可以避免一次生成失败污染项目正式数据，也便于未来迁移到数据库、对象存储和异步队列。

## 核心枚举建议

### 任务类型：`GenerationTaskType`

| 值 | 含义 | 主要使用步骤 |
| --- | --- | --- |
| `prompt` | 提示词生成或优化 | 05 提词生成 |
| `image` | 图片、关键帧、分镜图生成 | 06 画面生成 |
| `image_repaint` | 局部重绘、换脸、换服装、换背景 | 06 画面生成、07 质检返工 |
| `video` | 图生视频、首尾帧视频、镜头片段生成 | 08 视频生成 |
| `audio_voice` | 角色配音、旁白生成 | 09 音频字幕 |
| `audio_music` | 背景音乐生成 | 09 音频字幕 |
| `audio_effect` | 音效生成 | 09 音频字幕 |
| `subtitle` | 字幕文本、字幕时间轴生成 | 09 音频字幕 |
| `lip_sync` | 口型同步生成 | 09 音频字幕 |
| `review_report` | 发布复盘报告生成 | 11 发布复盘 |

### 任务状态：`GenerationTaskStatus`

| 值 | 含义 | 是否终态 |
| --- | --- | --- |
| `queued` | 已创建任务，等待执行 | 否 |
| `running` | 任务执行中 | 否 |
| `succeeded` | 任务成功，输出可用 | 是 |
| `failed` | 任务失败，错误信息可查看 | 是 |
| `cancelled` | 用户或系统取消任务 | 是 |

### 素材类型：`AssetType`

| 值 | 含义 |
| --- | --- |
| `prompt_text` | 提示词文本 |
| `image` | 图片、关键帧、分镜图 |
| `video` | 视频片段或成片 |
| `audio` | 配音、旁白、音效、音乐 |
| `subtitle` | 字幕文件或字幕时间轴 |
| `document` | 导入文本、剧本、报告类文档 |
| `metadata` | 仅用于记录结构化元数据，不对应实体文件 |

### 素材来源：`AssetSource`

| 值 | 含义 |
| --- | --- |
| `uploaded` | 用户上传 |
| `generated` | AI 生成 |
| `imported` | 从文本、项目或外部来源导入 |
| `manual` | 用户手动录入 |
| `system` | 系统内置或自动生成 |

## `GenerationTask` 字段草案

建议模型名：

- `GenerationTask`

字段草案：

| 字段 | 类型建议 | 必填 | 默认值 | 用途 |
| --- | --- | --- | --- | --- |
| `task_id` | `str` | 是 | 生成 UUID | 任务唯一 ID |
| `project_id` | `str` | 是 | 无 | 所属项目 ID |
| `step_id` | `StepId` | 是 | 无 | 所属 11 步工作流步骤 |
| `task_type` | `GenerationTaskType` | 是 | 无 | 生成任务类型 |
| `status` | `GenerationTaskStatus` | 是 | `queued` | 当前任务状态 |
| `input` | `GenerationTaskInput` | 是 | 默认对象 | 任务输入参数 |
| `output` | `GenerationTaskOutput | None` | 否 | `None` | 任务输出结果 |
| `error` | `GenerationTaskError | None` | 否 | `None` | 错误信息 |
| `created_at` | `datetime` | 是 | 当前时间 | 创建时间 |
| `updated_at` | `datetime` | 是 | 当前时间 | 更新时间 |
| `started_at` | `datetime | None` | 否 | `None` | 开始执行时间 |
| `finished_at` | `datetime | None` | 否 | `None` | 结束时间 |
| `created_by` | `str` | 否 | `"人工"` | 创建来源，如人工、AI、系统 |
| `model_provider` | `str` | 否 | `""` | 模型供应方，如 OpenAI、Gemini、可灵、Runway |
| `model_name` | `str` | 否 | `""` | 模型名称 |
| `attempt_count` | `int` | 否 | `0` | 已尝试次数 |
| `parent_task_id` | `str | None` | 否 | `None` | 重试、重绘、派生任务来源 |
| `related_asset_ids` | `list[str]` | 否 | `[]` | 任务读写过的素材 ID |
| `related_shot_ids` | `list[str]` | 否 | `[]` | 关联镜头 ID |
| `metadata` | `dict[str, Any]` | 否 | `{}` | 供应商响应摘要、耗时、成本、队列信息 |

### `GenerationTaskInput`

建议作为通用输入容器，不同任务类型使用不同字段：

| 字段 | 类型建议 | 用途 |
| --- | --- | --- |
| `prompt` | `str` | 正向提示词、文本生成指令 |
| `negative_prompt` | `str` | 负面提示词 |
| `source_text` | `str` | 剧本、旁白、字幕生成输入文本 |
| `reference_asset_ids` | `list[str]` | 参考图、参考视频、参考音频 |
| `source_asset_ids` | `list[str]` | 首帧、尾帧、待重绘图片、待配音文本等来源素材 |
| `shot_id` | `str | None` | 单镜头任务关联 |
| `episode_number` | `int | None` | 所属集数 |
| `parameters` | `dict[str, Any]` | 比例、分辨率、时长、seed、音色、语速等参数 |
| `callback_url` | `str | None` | 外部模型回调地址，早期可不启用 |

### `GenerationTaskOutput`

| 字段 | 类型建议 | 用途 |
| --- | --- | --- |
| `asset_ids` | `list[str]` | 输出素材 ID 列表 |
| `text` | `str` | 文本类输出，如提示词、字幕、复盘报告 |
| `raw_response` | `dict[str, Any]` | 模型供应商响应摘要 |
| `selected_asset_id` | `str | None` | 用户采纳的默认结果，早期可为空 |
| `quality_score` | `float | None` | 自动质检或模型返回评分 |

### `GenerationTaskError`

| 字段 | 类型建议 | 用途 |
| --- | --- | --- |
| `code` | `str` | 错误码，如 `MODEL_TIMEOUT` |
| `message` | `str` | 面向用户或开发者的错误说明 |
| `retryable` | `bool` | 是否建议重试 |
| `provider_error` | `dict[str, Any]` | 外部供应商原始错误摘要 |

## `AssetReference` 字段草案

建议模型名：

- `AssetReference`

字段草案：

| 字段 | 类型建议 | 必填 | 默认值 | 用途 |
| --- | --- | --- | --- | --- |
| `asset_id` | `str` | 是 | 生成 UUID | 素材唯一 ID |
| `project_id` | `str` | 是 | 无 | 所属项目 ID |
| `asset_type` | `AssetType` | 是 | 无 | 素材类型 |
| `source` | `AssetSource` | 是 | 无 | 素材来源 |
| `url` | `str | None` | 否 | `None` | 可访问 URL |
| `local_path` | `str | None` | 否 | `None` | 本地文件相对路径 |
| `related_step_id` | `StepId | None` | 否 | `None` | 关联步骤 |
| `related_shot_id` | `str | None` | 否 | `None` | 关联镜头 |
| `related_episode_number` | `int | None` | 否 | `None` | 关联集数 |
| `generation_task_id` | `str | None` | 否 | `None` | 来源生成任务 |
| `filename` | `str` | 否 | `""` | 原始文件名或展示名 |
| `mime_type` | `str` | 否 | `""` | MIME 类型 |
| `size_bytes` | `int | None` | 否 | `None` | 文件大小 |
| `duration_ms` | `int | None` | 否 | `None` | 音视频时长 |
| `width` | `int | None` | 否 | `None` | 图片或视频宽度 |
| `height` | `int | None` | 否 | `None` | 图片或视频高度 |
| `metadata` | `dict[str, Any]` | 否 | `{}` | seed、模型、角色名、字幕语言等扩展信息 |
| `created_at` | `datetime` | 是 | 当前时间 | 创建时间 |
| `updated_at` | `datetime` | 是 | 当前时间 | 更新时间 |

### 路径约定

本地 JSON 阶段建议：

- `url` 用于已经可公开或内部访问的远程资源。
- `local_path` 用于本地相对路径，例如 `assets/{project_id}/images/{asset_id}.png`。
- 不建议写入绝对路径，避免换机器后路径失效。
- 不建议把二进制或 base64 直接写入 JSON。

## 生成任务接口总览

### 通用任务接口

通用接口适合所有任务类型：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/projects/{project_id}/generation-tasks` | 创建生成任务 |
| `GET` | `/api/projects/{project_id}/generation-tasks` | 查询项目任务列表 |
| `GET` | `/api/projects/{project_id}/generation-tasks/{task_id}` | 查询单个任务 |
| `POST` | `/api/projects/{project_id}/generation-tasks/{task_id}/cancel` | 取消任务 |
| `POST` | `/api/projects/{project_id}/generation-tasks/{task_id}/retry` | 基于旧任务重试 |
| `POST` | `/api/projects/{project_id}/generation-tasks/{task_id}/accept` | 采纳任务输出 |
| `POST` | `/api/projects/{project_id}/generation-tasks/{task_id}/reject` | 拒绝任务输出 |

建议第一阶段先实现通用任务接口，步骤专用接口作为语义封装。

### 素材资产接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/projects/{project_id}/assets` | 上传或登记素材 |
| `GET` | `/api/projects/{project_id}/assets` | 查询项目素材列表 |
| `GET` | `/api/projects/{project_id}/assets/{asset_id}` | 查询单个素材 |
| `PUT` | `/api/projects/{project_id}/assets/{asset_id}` | 更新素材元数据 |
| `DELETE` | `/api/projects/{project_id}/assets/{asset_id}` | 删除或标记素材不可用 |

`DELETE` 第一阶段建议做软删除，在 `metadata.deleted = true` 或增加 `status` 字段，不要直接删文件，避免步骤引用断裂。

## 四类生成任务接口路径建议

### 图片生成任务

适用范围：

- 步骤 06 画面生成
- 步骤 07 质检返工中的局部重绘
- 步骤 03 资产设定中的角色、场景、道具参考图生成

推荐路径：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/projects/{project_id}/generation-tasks/image` | 创建图片生成任务 |
| `POST` | `/api/projects/{project_id}/generation-tasks/image-repaint` | 创建局部重绘任务 |
| `GET` | `/api/projects/{project_id}/generation-tasks/{task_id}` | 查询图片任务状态 |
| `POST` | `/api/projects/{project_id}/generation-tasks/{task_id}/accept` | 采纳候选图片 |

图片任务请求体建议：

```json
{
  "step_id": "image-generation",
  "task_type": "image",
  "input": {
    "prompt": "画面提示词",
    "negative_prompt": "负面提示词",
    "reference_asset_ids": ["asset-reference-image"],
    "shot_id": "shot-001",
    "episode_number": 1,
    "parameters": {
      "aspect_ratio": "9:16",
      "width": 1080,
      "height": 1920,
      "seed": 12345,
      "count": 4
    }
  }
}
```

成功创建响应：

- `202 Accepted`
- 返回 `GenerationTask`
- 状态为 `queued` 或 `running`

任务成功后输出：

- `output.asset_ids` 指向候选图片资产。
- 候选图片资产写入 `AssetReference`，`asset_type = "image"`，`source = "generated"`。

### 视频生成任务

适用范围：

- 步骤 08 视频生成
- 步骤 10 剪辑成片中短预告或导出片段生成时的扩展场景

推荐路径：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/projects/{project_id}/generation-tasks/video` | 创建视频生成任务 |
| `GET` | `/api/projects/{project_id}/generation-tasks/{task_id}` | 查询视频任务状态 |
| `POST` | `/api/projects/{project_id}/generation-tasks/{task_id}/cancel` | 取消视频任务 |
| `POST` | `/api/projects/{project_id}/generation-tasks/{task_id}/accept` | 采纳视频候选 |

视频任务请求体建议：

```json
{
  "step_id": "video-generation",
  "task_type": "video",
  "input": {
    "prompt": "视频动作和运镜提示词",
    "negative_prompt": "避免人物变形、闪烁、错脸",
    "source_asset_ids": ["asset-first-frame", "asset-last-frame"],
    "shot_id": "shot-001",
    "episode_number": 1,
    "parameters": {
      "duration_seconds": 5,
      "fps": 24,
      "motion_strength": 0.65,
      "camera_motion": "push-in"
    }
  }
}
```

成功创建响应：

- `202 Accepted`
- 返回 `GenerationTask`
- 状态为 `queued` 或 `running`

任务成功后输出：

- `output.asset_ids` 指向候选视频素材。
- 视频素材写入 `AssetReference`，`asset_type = "video"`，`duration_ms`、`width`、`height` 写入元数据字段。

### 音频生成任务

适用范围：

- 步骤 09 音频字幕中的角色配音、旁白、背景音乐、音效。

推荐路径：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/projects/{project_id}/generation-tasks/audio` | 创建音频生成任务 |
| `POST` | `/api/projects/{project_id}/generation-tasks/lip-sync` | 创建口型同步任务 |
| `GET` | `/api/projects/{project_id}/generation-tasks/{task_id}` | 查询音频任务状态 |
| `POST` | `/api/projects/{project_id}/generation-tasks/{task_id}/accept` | 采纳音频输出 |

音频任务请求体建议：

```json
{
  "step_id": "audio-subtitle",
  "task_type": "audio_voice",
  "input": {
    "source_text": "角色台词或旁白文本",
    "reference_asset_ids": ["asset-voice-sample"],
    "shot_id": "shot-001",
    "episode_number": 1,
    "parameters": {
      "voice_id": "role-lin",
      "speed": 1.0,
      "emotion": "calm",
      "language": "zh-CN"
    }
  }
}
```

成功创建响应：

- `202 Accepted`
- 返回 `GenerationTask`
- 状态为 `queued` 或 `running`

任务成功后输出：

- `output.asset_ids` 指向音频素材。
- 音频素材写入 `AssetReference`，`asset_type = "audio"`，`duration_ms` 写入元数据字段。

### 字幕生成任务

适用范围：

- 步骤 09 音频字幕中的字幕文本、字幕时间轴、字幕翻译。

推荐路径：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/projects/{project_id}/generation-tasks/subtitle` | 创建字幕生成任务 |
| `GET` | `/api/projects/{project_id}/generation-tasks/{task_id}` | 查询字幕任务状态 |
| `POST` | `/api/projects/{project_id}/generation-tasks/{task_id}/accept` | 采纳字幕输出 |

字幕任务请求体建议：

```json
{
  "step_id": "audio-subtitle",
  "task_type": "subtitle",
  "input": {
    "source_text": "已确认剧本台词或旁白",
    "source_asset_ids": ["asset-final-video-or-audio"],
    "episode_number": 1,
    "parameters": {
      "format": "srt",
      "language": "zh-CN",
      "max_chars_per_line": 14,
      "safe_area": "short-video"
    }
  }
}
```

成功创建响应：

- `202 Accepted`
- 返回 `GenerationTask`
- 状态为 `queued` 或 `running`

任务成功后输出：

- `output.text` 可保存字幕文本摘要。
- `output.asset_ids` 指向字幕文件或字幕时间轴资产。
- 字幕素材写入 `AssetReference`，`asset_type = "subtitle"`。

## 生成任务和普通步骤保存接口的边界

### 写入 `GenerationTask` 的数据

以下数据属于生成过程，应写入任务模型：

- 任务类型、任务状态、任务输入、任务输出、错误信息。
- 模型供应商、模型名称、seed、生成参数。
- 任务创建、开始、完成、失败、取消时间。
- 生成候选列表。
- 失败原因、供应商错误、是否可重试。
- 中间态信息，如排队位置、进度百分比、外部任务 ID。

这些数据不应该直接写入 `step_xxx` 作为正式创作结果。

### 写入 `AssetReference` 的数据

以下数据属于素材引用，应写入资产模型：

- 图片、视频、音频、字幕文件的 URL 或本地路径。
- 素材类型、来源、大小、尺寸、时长、MIME 类型。
- 素材关联的项目、步骤、镜头、集数。
- 素材来源任务 ID。
- 用于检索和回显的元数据。

### 写入 `step_xxx` 的数据

以下数据属于正式步骤成果，应写入对应步骤数据：

- 用户最终确认的角色卡、场景卡、分镜镜头表。
- 用户最终确认的提示词版本。
- 被选中的关键帧资产 ID。
- 通过质检的素材 ID。
- 被选中的视频片段资产 ID。
- 被选中的配音、音乐、字幕轨资产 ID。
- 最终剪辑时间线和导出版本。
- 发布记录和复盘结论。

换句话说，`step_xxx` 保存的是“项目当前采用什么”，`GenerationTask` 保存的是“生成过程发生了什么”，`AssetReference` 保存的是“产物在哪里以及是什么”。

### 采纳生成结果的建议流程

1. 创建生成任务，写入 `GenerationTask`。
2. 任务运行中持续更新 `GenerationTask.status` 和 `metadata.progress`。
3. 任务成功后创建一个或多个 `AssetReference`。
4. `GenerationTask.output.asset_ids` 记录候选资产。
5. 用户预览候选结果。
6. 用户点击采纳。
7. 服务端可记录 `GenerationTask.output.selected_asset_id`。
8. 前端或服务端再调用普通步骤保存接口，把被采纳的 `asset_id` 写入 `step_xxx`。

`accept` 接口可以只标记采纳，也可以同时返回建议写入步骤的数据，但不建议默认绕过步骤保存接口直接修改大量步骤字段。

## 任务状态流转

### 标准流转

```text
queued -> running -> succeeded
queued -> running -> failed
queued -> cancelled
queued -> running -> cancelled
failed -> queued
failed -> running
```

说明：

- `queued`：任务已创建，等待 worker 或外部模型执行。
- `running`：任务已经开始执行。
- `succeeded`：任务成功完成，输出结果可查看。
- `failed`：任务失败，必须写入 `error`。
- `cancelled`：任务被用户或系统取消，终止后不应继续写输出。

### 状态字段更新要求

| 状态 | 必须字段 | 建议字段 |
| --- | --- | --- |
| `queued` | `task_id`、`project_id`、`step_id`、`task_type`、`input`、`created_at`、`updated_at` | `model_provider`、`model_name` |
| `running` | `started_at`、`updated_at` | `metadata.progress`、`metadata.external_task_id` |
| `succeeded` | `finished_at`、`output`、`updated_at` | `output.asset_ids`、`metadata.cost` |
| `failed` | `finished_at`、`error`、`updated_at` | `error.retryable`、`provider_error` |
| `cancelled` | `finished_at`、`updated_at` | `metadata.cancel_reason` |

### 重试策略

重试建议新建任务，而不是原地覆盖旧任务：

- 新任务 `parent_task_id` 指向失败任务。
- 新任务 `attempt_count = parent.attempt_count + 1`。
- 旧任务保持 `failed`，便于审计。
- 如果只是同一外部任务继续轮询，不算重试，不创建新任务。

## 本地 JSON 阶段临时保存方案

当前项目使用本地 JSON 存储。AI 任务和素材数据不建议全部塞进 `projects.json`，否则项目详情会越来越大，也容易造成并发写入冲突。

### 建议文件结构

```text
apps/api/data/
  projects.json
  generation_tasks.json
  assets.json
  assets/
    {project_id}/
      images/
      videos/
      audios/
      subtitles/
      documents/
```

### `generation_tasks.json`

建议结构：

```json
{
  "tasks": [
    {
      "task_id": "task-id",
      "project_id": "project-id",
      "step_id": "image-generation",
      "task_type": "image",
      "status": "queued",
      "input": {},
      "output": null,
      "error": null,
      "created_at": "2026-04-28T00:00:00",
      "updated_at": "2026-04-28T00:00:00"
    }
  ]
}
```

### `assets.json`

建议结构：

```json
{
  "assets": [
    {
      "asset_id": "asset-id",
      "project_id": "project-id",
      "asset_type": "image",
      "source": "generated",
      "url": null,
      "local_path": "assets/project-id/images/asset-id.png",
      "related_step_id": "image-generation",
      "related_shot_id": "shot-001",
      "metadata": {}
    }
  ]
}
```

### 本地阶段注意事项

- `projects.json` 中只保存正式项目状态和 `step_xxx` 数据。
- `generation_tasks.json` 保存生成任务过程。
- `assets.json` 保存素材索引。
- 本地文件保存到 `apps/api/data/assets/{project_id}/...`，JSON 只保存相对路径。
- 写入 JSON 时建议临时文件 + 原子替换。
- 对任务和资产文件建议增加软删除字段，避免步骤引用失效。
- 大文本输出可以先放在 `GenerationTask.output.text`，但长字幕、长报告建议也落为 `document` 或 `subtitle` 素材。

## 未来迁移到数据库或对象存储

### 数据库表建议

未来可迁移为以下表：

| 表 | 用途 |
| --- | --- |
| `projects` | 项目基础信息 |
| `project_steps` | 每个项目每个步骤的正式数据 JSON |
| `generation_tasks` | AI 生成任务 |
| `assets` | 素材引用与元数据 |
| `asset_links` | 素材与步骤、镜头、任务的多对多关系 |
| `task_events` | 任务状态变更日志 |

### 对象存储建议

图片、视频、音频、字幕文件应迁移到对象存储：

- 本地阶段：`local_path`
- 对象存储阶段：`url` 或 `object_key`
- 数据库中保存 `bucket`、`object_key`、`mime_type`、`size_bytes`、`checksum`

对象存储路径建议：

```text
projects/{project_id}/assets/{asset_type}/{asset_id}.{ext}
```

### 迁移策略

1. 保留当前 `AssetReference.local_path` 字段。
2. 增加 `object_key`、`bucket`、`storage_provider` 字段。
3. 后台迁移本地文件到对象存储。
4. 迁移成功后补写 `url` 或签名访问策略。
5. 前端读取素材时优先使用 `url`，没有 `url` 再使用本地文件代理接口。

### 任务执行队列建议

数据库阶段可增加任务队列：

- API 创建任务，状态为 `queued`。
- worker 拉取任务并置为 `running`。
- worker 调用模型供应商。
- worker 产出素材并写入 `assets`。
- worker 更新任务为 `succeeded` 或 `failed`。

这样 FastAPI 请求不需要长时间阻塞，也方便重试和横向扩容。

## 建议错误码

| 错误码 | 含义 |
| --- | --- |
| `PROJECT_NOT_FOUND` | 项目不存在 |
| `TASK_NOT_FOUND` | 任务不存在 |
| `ASSET_NOT_FOUND` | 素材不存在 |
| `TASK_ALREADY_FINISHED` | 终态任务不能再次取消或修改 |
| `TASK_CANCELLED` | 任务已取消 |
| `MODEL_PROVIDER_ERROR` | 外部模型供应商错误 |
| `MODEL_TIMEOUT` | 模型调用超时 |
| `ASSET_WRITE_FAILED` | 素材文件写入失败 |
| `TASK_STORAGE_FAILED` | 任务状态保存失败 |
| `INVALID_TASK_INPUT` | 任务输入字段不合法 |

## 实施顺序建议

1. 先定义 `GenerationTask` 与 `AssetReference` 模型。
2. 本地新增 `generation_tasks.json` 与 `assets.json` 两个索引文件。
3. 实现通用任务创建、查询、取消、重试接口。
4. 实现素材登记、查询、更新元数据接口。
5. 图片、视频、音频、字幕生成先作为通用任务接口的 `task_type`，再视前端需要增加语义路径。
6. 普通步骤保存接口只保存采纳结果引用。
7. 后续再接入真实异步队列、数据库和对象存储。

## 验收对应

- `GenerationTask` 字段草案：见“`GenerationTask` 字段草案”。
- `AssetReference` 字段草案：见“`AssetReference` 字段草案”。
- 图片、视频、音频、字幕四类任务接口路径：见“四类生成任务接口路径建议”。
- 生成任务和普通步骤保存接口边界：见“生成任务和普通步骤保存接口的边界”。
- 任务状态流转：见“任务状态流转”。
- 本地 JSON 与未来迁移方案：见“本地 JSON 阶段临时保存方案”和“未来迁移到数据库或对象存储”。
