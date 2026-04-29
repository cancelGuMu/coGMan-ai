# S11-DOC-001：步骤 11「发布复盘」前端数据类型草案

## 任务边界

本文档基于《项目步骤功能说明.md》和《主要功能页面开发明细表.md》，整理步骤 11「发布复盘」完整前端数据类型草案。本任务只写独立文档，不修改 `apps/web/src/types.ts`，不做页面实现。

## 步骤目标

步骤 11「发布复盘」负责作品发布、平台适配、数据追踪和下一轮创作优化。它需要读取步骤 10 的成片、封面候选、标题候选和发布素材包，并沉淀发布素材、平台适配、发布记录、表现数据、留存分析、复盘报告、反馈回流和下一轮实验方向。

## 上游依赖

| 来源步骤 | 依赖数据 | 用途 |
| --- | --- | --- |
| 01 故事架构 | 项目题材、受众、主线目标、单集钩子 | 生成发布卖点和复盘回流建议 |
| 02 剧本创作 | 正式剧本、关键台词、情绪节奏 | 生成简介、标题、内容反馈定位 |
| 03 资产设定 | 角色卡、风格板、封面角色参考 | 评估角色吸引力、封面点击率 |
| 04 分镜规划 | 镜头顺序、剧情节点、时长 | 分析跳出节点和留存曲线 |
| 08 视频生成 | 最终镜头视频片段 | 关联视频表现与镜头质量 |
| 09 音频字幕 | 字幕轨、音频轨、口型同步结果 | 检查字幕安全区和声音表现 |
| 10 剪辑成片 | 导出版本、封面候选、标题候选、发布素材包 | 发布记录和平台适配的直接来源 |

## 下游用途

| 下游对象 | 消费数据 | 用途 |
| --- | --- | --- |
| 下一集故事架构 | 复盘结论、留存节点、观众反馈 | 优化下一集钩子、节奏和人物关系 |
| 下一集剧本创作 | 评论反馈、跳出节点、表现好的台词 | 调整对白、冲突密度和情绪节奏 |
| 资产设定 | 角色吸引力、封面点击率、评论关键词 | 优化角色形象、服装、场景风格 |
| 剪辑成片 | 完播率、开头留存、跳出节点 | 优化开头、节奏、字幕和封面标题 |
| 项目看板 | 发布指标、平台表现、版本表现 | 汇总项目进度、商业化效果和复盘状态 |

## 建议主类型：`StepElevenPublishReviewData`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `selectedEpisodeNumber` | `number \| null` | 当前复盘的集数 | 否 | `null` |
| `selectedPublishVersionId` | `string \| null` | 当前选中的发布版本 | 否 | `null` |
| `publishAssets` | `PublishAssetDraft[]` | 标题、简介、标签、话题、封面、发布文案 | 否 | `[]` |
| `platformAdaptations` | `PlatformAdaptationDraft[]` | 平台比例、时长、字幕安全区、封面规范 | 否 | `[]` |
| `publishRecords` | `PublishRecordDraft[]` | 发布平台、时间、版本、标题封面组合 | 否 | `[]` |
| `performanceMetrics` | `PerformanceMetricRecord[]` | 播放、完播、互动、涨粉等表现数据 | 否 | `[]` |
| `retentionAnalyses` | `RetentionAnalysisDraft[]` | 留存曲线、跳出节点、剧情钩子分析 | 否 | `[]` |
| `feedbackSummaries` | `AudienceFeedbackSummary[]` | 评论、角色吸引力、封面点击率反馈 | 否 | `[]` |
| `reviewReports` | `PublishReviewReport[]` | 复盘报告版本 | 否 | `[]` |
| `feedbackToSteps` | `FeedbackToStepItem[]` | 回流到前序步骤的建议 | 否 | `[]` |
| `nextExperimentPlans` | `NextExperimentPlan[]` | 下一集或下一季实验方向 | 否 | `[]` |
| `dashboardFilters` | `PublishDashboardFilters` | 发布复盘看板筛选条件 | 否 | 默认对象 |
| `versionRecords` | `PublishReviewVersionRecord[]` | 发布复盘版本记录 | 否 | `[]` |
| `saveMeta` | `StepSaveMetaDraft` | 保存状态、最近修改方、版本号 | 否 | 默认对象 |

## `PublishAssetDraft`

用于保存发布前后使用的标题、简介、标签、话题、封面和发布文案。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `assetId` | `string` | 发布素材 ID | 是 | 新建 UUID |
| `episodeNumber` | `number \| null` | 所属集数 | 否 | `null` |
| `sourceExportVersionId` | `string \| null` | 来源步骤 10 导出版本 ID | 否 | `null` |
| `title` | `string` | 发布标题 | 否 | `""` |
| `description` | `string` | 发布简介 | 否 | `""` |
| `tags` | `string[]` | 标签列表 | 否 | `[]` |
| `topics` | `string[]` | 平台话题列表 | 否 | `[]` |
| `coverAssetId` | `string \| null` | 封面素材 ID | 否 | `null` |
| `videoAssetId` | `string \| null` | 成片或平台版本视频素材 ID | 否 | `null` |
| `subtitleAssetId` | `string \| null` | 字幕文件或字幕轨素材 ID | 否 | `null` |
| `copywriting` | `string` | 平台发布文案 | 否 | `""` |
| `sellingPoints` | `string[]` | 剧情卖点、角色卖点、反转点 | 否 | `[]` |
| `status` | `PublishAssetStatus` | 素材状态 | 否 | `"draft"` |
| `createdAt` | `string` | 创建时间 | 是 | 当前时间 |
| `updatedAt` | `string` | 更新时间 | 是 | 当前时间 |

```ts
type PublishAssetStatus = "draft" | "ready" | "published" | "archived";
```

## `PlatformAdaptationDraft`

用于保存不同平台的格式适配规则和实际采用配置。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `adaptationId` | `string` | 平台适配记录 ID | 是 | 新建 UUID |
| `platform` | `PublishPlatform` | 发布平台 | 是 | `"douyin"` |
| `targetAspectRatio` | `"9:16" \| "16:9" \| "1:1" \| "4:3" \| "3:4"` | 目标比例 | 否 | `"9:16"` |
| `targetDurationSeconds` | `number \| null` | 平台目标时长 | 否 | `null` |
| `subtitleSafeArea` | `SubtitleSafeAreaDraft` | 字幕安全区配置 | 否 | 默认对象 |
| `coverStyleGuide` | `string` | 封面样式要求 | 否 | `""` |
| `titleStyleGuide` | `string` | 标题风格要求 | 否 | `""` |
| `exportVersionId` | `string \| null` | 对应步骤 10 导出版本 | 否 | `null` |
| `publishAssetId` | `string \| null` | 对应发布素材 | 否 | `null` |
| `checkItems` | `PlatformCheckItem[]` | 平台适配检查项 | 否 | `[]` |
| `status` | `"pending" \| "passed" \| "failed"` | 适配状态 | 否 | `"pending"` |

```ts
type PublishPlatform =
  | "douyin"
  | "kuaishou"
  | "bilibili"
  | "wechat_channels"
  | "xiaohongshu"
  | "youtube"
  | "tiktok"
  | "other";
```

### `SubtitleSafeAreaDraft`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `topPercent` | `number` | 顶部安全区百分比 | 否 | `8` |
| `bottomPercent` | `number` | 底部安全区百分比 | 否 | `14` |
| `leftPercent` | `number` | 左侧安全区百分比 | 否 | `5` |
| `rightPercent` | `number` | 右侧安全区百分比 | 否 | `5` |
| `note` | `string` | 安全区说明 | 否 | `""` |

### `PlatformCheckItem`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `checkId` | `string` | 检查项 ID | 是 | 新建 UUID |
| `label` | `string` | 检查项名称 | 是 | `""` |
| `status` | `"pending" \| "passed" \| "failed"` | 检查状态 | 否 | `"pending"` |
| `message` | `string` | 问题或通过说明 | 否 | `""` |

## `PublishRecordDraft`

用于记录一次实际发布行为。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `recordId` | `string` | 发布记录 ID | 是 | 新建 UUID |
| `platform` | `PublishPlatform` | 发布平台 | 是 | `"douyin"` |
| `publishAssetId` | `string` | 对应发布素材 ID | 是 | `""` |
| `exportVersionId` | `string \| null` | 对应成片导出版本 | 否 | `null` |
| `publishedAt` | `string \| null` | 发布时间 ISO 字符串 | 否 | `null` |
| `platformWorkUrl` | `string` | 平台作品链接 | 否 | `""` |
| `platformWorkId` | `string` | 平台作品 ID | 否 | `""` |
| `titleUsed` | `string` | 实际发布标题 | 否 | `""` |
| `coverAssetIdUsed` | `string \| null` | 实际发布封面 | 否 | `null` |
| `versionCode` | `string` | 发布版本号 | 否 | `""` |
| `campaignName` | `string` | 投放或运营活动名称 | 否 | `""` |
| `distributionStrategy` | `string` | 投放策略、发布时间策略、目标人群 | 否 | `""` |
| `status` | `PublishRecordStatus` | 发布状态 | 否 | `"draft"` |
| `note` | `string` | 备注 | 否 | `""` |

```ts
type PublishRecordStatus = "draft" | "scheduled" | "published" | "failed" | "removed";
```

## `PerformanceMetricRecord`

用于保存平台表现数据，可手动录入或未来从平台 API 导入。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `metricId` | `string` | 指标记录 ID | 是 | 新建 UUID |
| `publishRecordId` | `string` | 对应发布记录 ID | 是 | `""` |
| `platform` | `PublishPlatform` | 平台 | 是 | `"douyin"` |
| `collectedAt` | `string` | 数据采集时间 | 是 | 当前时间 |
| `plays` | `number` | 播放量 | 否 | `0` |
| `impressions` | `number \| null` | 曝光量 | 否 | `null` |
| `completionRate` | `number \| null` | 完播率 0-100 | 否 | `null` |
| `averageWatchSeconds` | `number \| null` | 平均观看秒数 | 否 | `null` |
| `likes` | `number` | 点赞数 | 否 | `0` |
| `comments` | `number` | 评论数 | 否 | `0` |
| `favorites` | `number` | 收藏数 | 否 | `0` |
| `shares` | `number` | 转发数 | 否 | `0` |
| `newFollowers` | `number` | 转粉数 | 否 | `0` |
| `clickThroughRate` | `number \| null` | 封面或推荐点击率 0-100 | 否 | `null` |
| `engagementRate` | `number \| null` | 互动率 0-100 | 否 | `null` |
| `source` | `"manual" \| "imported" \| "api"` | 数据来源 | 否 | `"manual"` |

## `RetentionAnalysisDraft`

用于保存留存曲线、跳出节点和剧情钩子分析。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `analysisId` | `string` | 留存分析 ID | 是 | 新建 UUID |
| `publishRecordId` | `string` | 对应发布记录 ID | 是 | `""` |
| `retentionPoints` | `RetentionPoint[]` | 留存曲线点 | 否 | `[]` |
| `dropOffNodes` | `DropOffNode[]` | 跳出节点 | 否 | `[]` |
| `openingHookScore` | `number \| null` | 开头钩子评分 0-100 | 否 | `null` |
| `plotHookNotes` | `string` | 剧情钩子分析 | 否 | `""` |
| `characterAppealNotes` | `string` | 角色吸引力分析 | 否 | `""` |
| `coverClickNotes` | `string` | 封面点击表现分析 | 否 | `""` |
| `summary` | `string` | 留存分析摘要 | 否 | `""` |

### `RetentionPoint`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `timeSeconds` | `number` | 视频时间点 | 是 | `0` |
| `retentionRate` | `number` | 留存率 0-100 | 是 | `100` |
| `relatedShotId` | `string \| null` | 关联镜头 ID | 否 | `null` |
| `note` | `string` | 说明 | 否 | `""` |

### `DropOffNode`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `nodeId` | `string` | 跳出节点 ID | 是 | 新建 UUID |
| `timeSeconds` | `number` | 跳出发生时间 | 是 | `0` |
| `dropRate` | `number \| null` | 跳出比例 | 否 | `null` |
| `relatedShotId` | `string \| null` | 关联镜头 | 否 | `null` |
| `relatedPlotBeat` | `string` | 关联剧情节点 | 否 | `""` |
| `possibleReason` | `string` | 可能原因 | 否 | `""` |
| `severity` | `"low" \| "medium" \| "high"` | 严重程度 | 否 | `"medium"` |

## `AudienceFeedbackSummary`

用于保存评论反馈、角色吸引力和封面点击相关结论。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `feedbackId` | `string` | 反馈摘要 ID | 是 | 新建 UUID |
| `publishRecordId` | `string \| null` | 对应发布记录 | 否 | `null` |
| `commentSamples` | `CommentSample[]` | 高价值评论样本 | 否 | `[]` |
| `positiveKeywords` | `string[]` | 正向关键词 | 否 | `[]` |
| `negativeKeywords` | `string[]` | 负向关键词 | 否 | `[]` |
| `frequentQuestions` | `string[]` | 高频疑问 | 否 | `[]` |
| `characterMentions` | `CharacterMentionMetric[]` | 角色讨论热度 | 否 | `[]` |
| `coverFeedback` | `string` | 封面反馈 | 否 | `""` |
| `titleFeedback` | `string` | 标题反馈 | 否 | `""` |
| `summary` | `string` | 反馈总结 | 否 | `""` |

### `CommentSample`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `commentId` | `string` | 评论 ID | 是 | 新建 UUID |
| `platform` | `PublishPlatform` | 来源平台 | 是 | `"douyin"` |
| `content` | `string` | 评论内容 | 是 | `""` |
| `sentiment` | `"positive" \| "neutral" \| "negative"` | 情绪倾向 | 否 | `"neutral"` |
| `likeCount` | `number` | 评论点赞数 | 否 | `0` |
| `relatedTopic` | `string` | 关联话题 | 否 | `""` |

### `CharacterMentionMetric`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `characterId` | `string` | 角色 ID | 是 | `""` |
| `characterName` | `string` | 角色名 | 否 | `""` |
| `mentionCount` | `number` | 评论提及次数 | 否 | `0` |
| `positiveRate` | `number \| null` | 正向提及比例 | 否 | `null` |
| `notes` | `string` | 角色反馈说明 | 否 | `""` |

## `PublishReviewReport`

用于保存复盘报告，可支持 AI 生成后人工编辑。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `reportId` | `string` | 报告 ID | 是 | 新建 UUID |
| `reportTitle` | `string` | 报告标题 | 否 | `""` |
| `publishRecordIds` | `string[]` | 覆盖的发布记录 | 否 | `[]` |
| `bestPerformingElements` | `string[]` | 表现好的元素 | 否 | `[]` |
| `issuesFound` | `ReviewIssueDraft[]` | 发现的问题 | 否 | `[]` |
| `optimizationSuggestions` | `string[]` | 优化建议 | 否 | `[]` |
| `summary` | `string` | 总结正文 | 否 | `""` |
| `generatedBy` | `"人工" \| "AI" \| "系统"` | 生成来源 | 否 | `"人工"` |
| `status` | `"draft" \| "reviewed" \| "applied"` | 报告状态 | 否 | `"draft"` |
| `createdAt` | `string` | 创建时间 | 是 | 当前时间 |
| `updatedAt` | `string` | 更新时间 | 是 | 当前时间 |

### `ReviewIssueDraft`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `issueId` | `string` | 问题 ID | 是 | 新建 UUID |
| `category` | `ReviewIssueCategory` | 问题分类 | 是 | `"other"` |
| `severity` | `"low" \| "medium" \| "high"` | 严重程度 | 否 | `"medium"` |
| `description` | `string` | 问题描述 | 否 | `""` |
| `evidence` | `string` | 数据证据 | 否 | `""` |
| `relatedStepId` | `StepIdDraft \| null` | 关联步骤 | 否 | `null` |
| `relatedShotId` | `string \| null` | 关联镜头 | 否 | `null` |

```ts
type ReviewIssueCategory =
  | "opening_hook"
  | "plot_pacing"
  | "character_appeal"
  | "cover_title"
  | "subtitle_audio"
  | "editing_rhythm"
  | "platform_fit"
  | "other";
```

## `FeedbackToStepItem`

用于把复盘结论回流到前序步骤。步骤 11 不应直接覆盖前序步骤数据，而是生成待采纳建议。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `feedbackItemId` | `string` | 回流建议 ID | 是 | 新建 UUID |
| `sourceReportId` | `string \| null` | 来源复盘报告 | 否 | `null` |
| `targetStepId` | `StepIdDraft` | 目标步骤 | 是 | `"story-structure"` |
| `targetEpisodeNumber` | `number \| null` | 目标集数 | 否 | `null` |
| `targetObjectId` | `string \| null` | 目标对象，如镜头、角色、导出版本 | 否 | `null` |
| `suggestionType` | `FeedbackSuggestionType` | 建议类型 | 是 | `"optimize"` |
| `content` | `string` | 建议内容 | 是 | `""` |
| `priority` | `"low" \| "medium" \| "high"` | 优先级 | 否 | `"medium"` |
| `status` | `"pending" \| "accepted" \| "rejected" \| "applied"` | 处理状态 | 否 | `"pending"` |
| `createdAt` | `string` | 创建时间 | 是 | 当前时间 |

```ts
type FeedbackSuggestionType =
  | "optimize"
  | "rewrite"
  | "replace_asset"
  | "adjust_edit"
  | "change_title_cover"
  | "new_experiment";
```

## `NextExperimentPlan`

用于保存下一集或下一季的实验方向。

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `experimentId` | `string` | 实验 ID | 是 | 新建 UUID |
| `name` | `string` | 实验名称 | 否 | `""` |
| `scope` | `"next_episode" \| "next_season" \| "cover_title" \| "editing" \| "platform"` | 实验范围 | 否 | `"next_episode"` |
| `hypothesis` | `string` | 实验假设 | 否 | `""` |
| `changePlan` | `string` | 计划改变什么 | 否 | `""` |
| `successMetric` | `string` | 成功指标 | 否 | `""` |
| `targetPlatform` | `PublishPlatform \| null` | 目标平台 | 否 | `null` |
| `linkedFeedbackItemIds` | `string[]` | 关联反馈建议 | 否 | `[]` |
| `status` | `"planned" \| "running" \| "completed" \| "cancelled"` | 实验状态 | 否 | `"planned"` |

## `PublishDashboardFilters`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `platform` | `PublishPlatform \| "all"` | 平台筛选 | 否 | `"all"` |
| `episodeNumber` | `number \| null` | 集数筛选 | 否 | `null` |
| `dateRange` | `"24h" \| "7d" \| "30d" \| "all"` | 时间范围 | 否 | `"7d"` |
| `metricFocus` | `"plays" \| "completion" \| "engagement" \| "followers"` | 重点指标 | 否 | `"plays"` |
| `keyword` | `string` | 搜索标题、标签、报告关键词 | 否 | `""` |

## `PublishReviewVersionRecord`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `versionId` | `string` | 版本 ID | 是 | 新建 UUID |
| `eventType` | `PublishReviewVersionEvent` | 事件类型 | 是 | `"manual_save"` |
| `targetId` | `string \| null` | 关联发布记录、报告或实验 ID | 否 | `null` |
| `summary` | `string` | 版本摘要 | 否 | `""` |
| `createdAt` | `string` | 创建时间 | 是 | 当前时间 |
| `createdBy` | `"人工" \| "AI" \| "系统"` | 创建来源 | 否 | `"人工"` |

```ts
type PublishReviewVersionEvent =
  | "manual_save"
  | "publish_asset_created"
  | "platform_adapted"
  | "publish_record_added"
  | "metrics_imported"
  | "retention_analyzed"
  | "report_generated"
  | "feedback_created"
  | "experiment_created";
```

## `StepIdDraft`

步骤 11 需要把反馈回流到任意步骤，建议复用全局 `StepId`：

```ts
type StepIdDraft =
  | "story-structure"
  | "script-creation"
  | "asset-setting"
  | "storyboard-planning"
  | "prompt-generation"
  | "image-generation"
  | "quality-rework"
  | "video-generation"
  | "audio-subtitle"
  | "final-editing"
  | "publish-review";
```

## `StepSaveMetaDraft`

| 字段名 | 类型 | 用途 | 必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `versionStatus` | `string` | 当前版本状态 | 否 | `"v1 草稿"` |
| `lastModifiedBy` | `"人工" \| "AI" \| "系统"` | 最近修改方 | 否 | `"人工"` |
| `updatedAt` | `string \| null` | 最近更新时间 | 否 | `null` |
| `isDirty` | `boolean` | 前端是否有未保存改动 | 否 | `false` |
| `saveStatus` | `"idle" \| "saving" \| "saved" \| "error"` | 保存状态 | 否 | `"idle"` |
| `errorMessage` | `string` | 保存错误信息 | 否 | `""` |

## 如何读取步骤 10

步骤 11 需要从步骤 10「剪辑成片」读取：

- `exportVariants`：横版、竖版、预告版、正片版。
- `coverCandidates`：封面候选。
- `titleCandidates`：标题候选。
- `timeline`：镜头顺序和片段时长。
- `publishPackage` 或发布素材包记录。

使用规则：

1. `PublishAssetDraft.sourceExportVersionId` 绑定步骤 10 导出版本。
2. `PublishAssetDraft.coverAssetId` 默认来自步骤 10 选中的封面候选。
3. `PublishAssetDraft.title` 可默认使用步骤 10 的标题候选，但必须允许人工改写。
4. 平台适配不应修改步骤 10 原始导出版本，只记录目标平台采用的派生配置。

## 发布记录与表现数据关系

- 一条 `PublishRecordDraft` 对应一次平台发布。
- 一条发布记录可以有多条 `PerformanceMetricRecord`，表示不同时间点采集的数据。
- `RetentionAnalysisDraft` 绑定具体发布记录，用于解释该版本的留存曲线。
- `AudienceFeedbackSummary` 可绑定具体发布记录，也可作为跨平台汇总。
- `PublishReviewReport` 可覆盖多个发布记录，做综合复盘。

## 反馈回流规则

1. 回流建议必须明确 `targetStepId`。
2. 如果能定位到集数、镜头、角色或导出版本，应填写 `targetEpisodeNumber` 和 `targetObjectId`。
3. 默认状态为 `pending`，由用户在目标步骤人工采纳。
4. 采纳后可在目标步骤生成新版本记录。
5. 拒绝或暂不处理的建议仍保留，便于后续复盘追踪。

## 下一轮实验方向保存规则

`NextExperimentPlan` 用于把复盘结论转成可执行实验：

- 下一集开头钩子实验。
- 封面标题 A/B 实验。
- 剪辑节奏实验。
- 字幕样式实验。
- 平台发布时间实验。
- 角色卖点强化实验。

实验计划只记录假设、计划和指标，不直接修改项目内容。

## 后续落地到 TypeScript 的建议

1. `PublishPlatform`、`StepIdDraft`、`StepSaveMetaDraft` 应复用全局类型，避免重复定义。
2. 指标类数值统一约定百分比字段为 0-100，不使用 0-1，便于 UI 展示。
3. 发布时间、采集时间、版本时间统一使用 ISO 字符串。
4. 所有列表字段默认 `[]`，避免空状态渲染出错。
5. 发布数据、复盘报告、反馈回流建议建议分区保存，避免单个表单过大。
6. 平台 API 接入前，`PerformanceMetricRecord.source` 默认使用 `"manual"`。
7. 反馈回流只保存建议，不直接修改前序步骤，避免误覆盖创作成果。
8. 后续实现时可先做手动录入和报告编辑，再接数据导入和 AI 分析。

## 最小可用默认值示例

```ts
const defaultStepElevenPublishReviewData: StepElevenPublishReviewData = {
  selectedEpisodeNumber: null,
  selectedPublishVersionId: null,
  publishAssets: [],
  platformAdaptations: [],
  publishRecords: [],
  performanceMetrics: [],
  retentionAnalyses: [],
  feedbackSummaries: [],
  reviewReports: [],
  feedbackToSteps: [],
  nextExperimentPlans: [],
  dashboardFilters: {
    platform: "all",
    episodeNumber: null,
    dateRange: "7d",
    metricFocus: "plays",
    keyword: "",
  },
  versionRecords: [],
  saveMeta: {
    versionStatus: "v1 草稿",
    lastModifiedBy: "人工",
    updatedAt: null,
    isDirty: false,
    saveStatus: "idle",
    errorMessage: "",
  },
};
```

## 验收对应

- 发布素材：见 `PublishAssetDraft`。
- 平台适配：见 `PlatformAdaptationDraft`。
- 发布记录：见 `PublishRecordDraft`。
- 表现数据：见 `PerformanceMetricRecord`。
- 留存分析：见 `RetentionAnalysisDraft`。
- 复盘报告：见 `PublishReviewReport`。
- 反馈回流：见 `FeedbackToStepItem` 和“反馈回流规则”。
- 下一轮实验方向：见 `NextExperimentPlan` 和“下一轮实验方向保存规则”。
