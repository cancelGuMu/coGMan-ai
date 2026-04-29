# API-DOC-005：11 步项目进度与状态后端设计方案

## 任务边界

本文档整理 coMGan-ai 11 步工作流中项目进度、当前步骤、步骤完成状态和更新时间的后端设计方案。本任务只写文档，不修改后端代码，不修改前端代码。

## 设计目标

11 步扩展后，项目状态需要同时回答四个问题：

1. 项目整体完成到哪里了：`progress`。
2. 用户当前应该看到哪一步：`current_step`。
3. 每一步自身处于什么状态：`step_statuses`。
4. 哪些数据最近被保存：`updated_at`、`step_updated_at`。

设计重点：保存某一步时，只能更新该步骤及必要项目摘要，不能误覆盖其他步骤数据。

## 核心字段建议

### `ProjectRecord` 根字段

| 字段名 | 类型建议 | 用途 | 默认值建议 |
| --- | --- | --- | --- |
| `progress` | `int` | 项目整体进度，0-100 | `10` |
| `current_step` | `StepId` | 当前推荐进入的步骤 | `story-structure` |
| `updated_at` | `datetime` | 项目任意核心内容最近更新时间 | 当前时间 |
| `last_active_step` | `StepId | None` | 用户最近打开或保存的步骤 | `None` |
| `step_statuses` | `dict[StepId, StepStatusRecord]` | 11 步完成状态摘要 | 默认 11 步对象 |
| `workflow_version` | `int` | 工作流版本 | `1` |

### `StepStatusRecord`

| 字段名 | 类型建议 | 用途 | 默认值建议 |
| --- | --- | --- | --- |
| `step_id` | `StepId` | 步骤 ID | 对应步骤 |
| `status` | `StepCompletionStatus` | 步骤完成状态 | `not_started` |
| `progress` | `int` | 单步骤完成度，0-100 | `0` |
| `updated_at` | `datetime | None` | 该步骤最近保存时间 | `None` |
| `completed_at` | `datetime | None` | 标记完成时间 | `None` |
| `last_modified_by` | `str` | 最近修改方 | `人工` |
| `blocking_reason` | `str` | 无法进入下一步的原因 | `""` |
| `version_status` | `str` | 当前版本说明 | `v1 草稿` |

### `StepCompletionStatus`

建议枚举：

```ts
type StepCompletionStatus =
  | "not_started"
  | "in_progress"
  | "ready_for_review"
  | "needs_rework"
  | "completed"
  | "blocked";
```

| 状态 | 含义 |
| --- | --- |
| `not_started` | 尚未开始 |
| `in_progress` | 已开始编辑或生成 |
| `ready_for_review` | 内容初步完成，等待人工确认 |
| `needs_rework` | 审核或质检后需要返工 |
| `completed` | 已完成，可稳定交给下游 |
| `blocked` | 被上游缺失、质检失败或数据错误阻塞 |

## 11 步建议进度区间

| 步骤 | `StepId` | 建议整体进度区间 | 完成后建议进度 |
| --- | --- | --- | --- |
| 01 故事架构 | `story-structure` | 10-20 | 20 |
| 02 剧本创作 | `script-creation` | 21-30 | 30 |
| 03 资产设定 | `asset-setting` | 31-40 | 40 |
| 04 分镜规划 | `storyboard-planning` | 41-50 | 50 |
| 05 提词生成 | `prompt-generation` | 51-58 | 58 |
| 06 画面生成 | `image-generation` | 59-66 | 66 |
| 07 质检返工 | `quality-rework` | 67-74 | 74 |
| 08 视频生成 | `video-generation` | 75-82 | 82 |
| 09 音频字幕 | `audio-subtitle` | 83-88 | 88 |
| 10 剪辑成片 | `final-editing` | 89-95 | 95 |
| 11 发布复盘 | `publish-review` | 96-100 | 100 |

## `progress` 更新规则

### 基本原则

1. 保存某一步时，只根据该步骤关键产物计算该步骤完成度。
2. 项目总进度取所有步骤状态的加权结果，或取当前最高完成步骤的区间值。
3. 不因为用户打开后续步骤就自动提高进度。
4. 不因为保存空草稿就标记步骤完成。
5. 允许后续步骤返工使步骤状态回到 `needs_rework`，但总进度是否回退要谨慎。

### 初期简单方案

第一阶段可采用区间推进：

- 当前步骤 `in_progress`：使用该步骤区间起点。
- 当前步骤 `ready_for_review`：使用区间中点。
- 当前步骤 `completed`：使用区间终点。
- 返工状态 `needs_rework`：维持已达到的总进度，但步骤状态显示返工。

### 后续加权方案

后续可以给每步权重：

| 步骤 | 权重建议 |
| --- | --- |
| 01 故事架构 | 10 |
| 02 剧本创作 | 10 |
| 03 资产设定 | 10 |
| 04 分镜规划 | 10 |
| 05 提词生成 | 8 |
| 06 画面生成 | 8 |
| 07 质检返工 | 8 |
| 08 视频生成 | 8 |
| 09 音频字幕 | 6 |
| 10 剪辑成片 | 7 |
| 11 发布复盘 | 15 |

总进度等于每步 `step.progress * weight` 的加权平均。

## `current_step` 更新规则

`current_step` 表示系统建议用户下一次进入的步骤，不等于用户最后点击的步骤。

更新规则：

1. 新项目默认 `story-structure`。
2. 步骤 01 完成后推进到 `script-creation`。
3. 步骤 02 完成后推进到 `asset-setting`。
4. 以此类推，步骤 10 完成后推进到 `publish-review`。
5. 步骤 11 完成后保持 `publish-review`。
6. 如果某一步被标记 `needs_rework` 或 `blocked`，`current_step` 可以回到该步骤。
7. 用户仅浏览某步骤，不应改变 `current_step`，可更新 `last_active_step`。

## 门禁规则

| 门禁 | 影响 |
| --- | --- |
| 步骤 04 没有镜头表 | 不应推进到 05 |
| 步骤 05 没有 I2V 提示词 | 不应推进到 08 |
| 步骤 07 质检未通过 | 不应推进到 08 |
| 步骤 08 没有最终片段 | 不应推进到 09 |
| 步骤 10 没有导出版本 | 不应推进到 11 |

第一阶段可以只提示，不强拦截；第二阶段再做严格门禁。

## `updated_at` 更新规则

### 项目根 `updated_at`

应在以下情况更新：

- 任一步骤保存成功。
- 项目重命名。
- 项目封面更新。
- 项目状态、进度、当前步骤发生变化。
- 删除、归档、恢复等项目级操作。

不建议在以下情况更新：

- 用户仅打开页面。
- 生成任务处于轮询中但没有被采纳。
- 临时筛选条件变化。
- 前端本地脏状态变化但未保存。

### 步骤级 `updated_at`

`step_statuses[step_id].updated_at` 只在该步骤保存成功时更新。

例如保存步骤 08：

- 更新 `step_eight` 数据。
- 更新 `step_statuses["video-generation"].updated_at`。
- 更新项目根 `updated_at`。
- 不更新其他步骤的 `updated_at`。

## 兼容旧项目

旧项目可能只有：

- `progress`
- `current_step`
- `updated_at`
- `step_one`
- `step_two`

兼容读取策略：

1. 缺少 `step_statuses` 时自动生成 11 步默认状态。
2. 根据现有 `current_step` 和 `progress` 推断前序步骤状态。
3. `step_one` 有内容时，步骤 01 至少标记 `in_progress`。
4. `step_two.script_text` 有内容时，步骤 02 至少标记 `in_progress` 或 `ready_for_review`。
5. 旧 stepId 继续通过 `LEGACY_STEP_MAP` 映射。
6. 缺少步骤级 `updated_at` 的状态保持 `None`，不要伪造具体时间。

推断示例：

| 条件 | 推断结果 |
| --- | --- |
| `current_step = story-structure` | 01 `in_progress`，其余 `not_started` |
| `current_step = script-creation` | 01 `completed`，02 `in_progress` |
| `current_step = asset-setting` | 01、02 `completed`，03 `in_progress` |
| `progress >= 100` | 11 可标记 `completed`，但仍需保留人工复核 |

## 避免误覆盖其他步骤

### 保存函数原则

每个步骤保存函数只允许更新：

- 当前步骤数据，例如 `step_eight`。
- 当前步骤状态，例如 `step_statuses["video-generation"]`。
- 项目根摘要字段：`status`、`progress`、`current_step`、`updated_at`、`last_active_step`。

不允许更新：

- 其他步骤数据。
- 其他步骤的版本记录。
- 其他步骤的 `updated_at`。
- 未在请求体中出现的步骤内容。

### 推荐保存流程

1. 读取完整项目。
2. 找到目标项目。
3. 校验请求体只包含目标步骤数据。
4. 替换目标步骤。
5. 重新计算当前步骤状态。
6. 重新计算项目摘要字段。
7. 保留其他步骤对象原样。
8. 写回项目列表。

### 防覆盖检查

保存前后可做轻量校验：

- 非目标步骤序列化结果应保持一致。
- 非目标步骤 `updated_at` 不变化。
- 项目 ID、创建时间不变化。
- 未知字段不被删除。

## 建议状态文案

| 后端状态 | 前端文案 |
| --- | --- |
| `not_started` | 未开始 |
| `in_progress` | 进行中 |
| `ready_for_review` | 待审核 |
| `needs_rework` | 待返工 |
| `completed` | 已完成 |
| `blocked` | 已阻塞 |

## 人工验收清单

| 编号 | 验收项 | 通过标准 |
| --- | --- | --- |
| PS-001 | 新项目默认状态 | `current_step` 为 01，`progress` 合理，11 步状态存在 |
| PS-002 | 保存步骤 01 | 只更新 `step_one`、01 状态、项目摘要 |
| PS-003 | 保存步骤 08 | 不覆盖步骤 01-07 和 09-11 数据 |
| PS-004 | 步骤完成推进 | 完成当前步骤后 `current_step` 推进到下一步 |
| PS-005 | 质检阻塞 | 步骤 07 未通过时不默认推进到 08 |
| PS-006 | 更新时间 | 根 `updated_at` 与当前步骤 `updated_at` 更新，其他步骤不变 |
| PS-007 | 旧项目读取 | 没有 `step_statuses` 的旧项目可打开并补默认值 |
| PS-008 | 旧 stepId | 老 stepId 能映射到新 stepId |
| PS-009 | 返工状态 | 某步骤设为 `needs_rework` 后导航状态清晰 |
| PS-010 | 未知字段 | 保存某一步不删除未知字段 |

## 后续落地建议

1. 先在模型层增加 `StepStatusRecord` 和 `step_statuses` 默认对象。
2. 把进度区间配置为常量，不散落在多个保存函数里。
3. 每个 `save_step_x` 只调用统一的状态计算函数。
4. 严格区分 `current_step` 和 `last_active_step`。
5. 保存接口返回完整 `ProjectDetailResponse`，方便前端刷新顶部栏和步骤导航。
6. 增加回归测试，确认保存某一步不会改变其他步骤 JSON。

## 验收对应

- `progress` 更新：见“`progress` 更新规则”。
- `current_step` 更新：见“`current_step` 更新规则”。
- `updated_at` 更新：见“`updated_at` 更新规则”。
- `step status` 更新：见 `StepStatusRecord` 和状态枚举。
- 旧项目兼容：见“兼容旧项目”。
- 避免误覆盖其他步骤：见“避免误覆盖其他步骤”。
