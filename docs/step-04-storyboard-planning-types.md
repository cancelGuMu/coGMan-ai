# 步骤 04「分镜规划」前端数据类型草案

本文档基于 [项目步骤功能说明.md](/C:/Users/86158/Desktop/codex/coGMan-ai（终）/项目步骤功能说明.md) 与 [主要功能页面开发明细表.md](/C:/Users/86158/Desktop/codex/coGMan-ai（终）/主要功能页面开发明细表.md) 编写，仅用于步骤 04 前端类型设计，不直接修改 `apps/web/src/types.ts`。

## 1. 设计目标

步骤 04「分镜规划」的核心产物是镜头级生产表。它需要把步骤 02 的正式剧本文本拆解成可生产镜头，并引用步骤 03 的角色、场景、道具和风格资产，让步骤 05「提词生成」和步骤 06「画面生成」可以稳定消费。

本草案覆盖：

1. 集数选择与上下文。
2. 镜头列表与镜头详情。
3. 景别、角度、构图、运镜、台词关联。
4. 角色、场景、道具引用。
5. 节奏统计与后续任务队列。
6. 上游读取关系与下游消费方式。

---

## 2. 建议的根类型

```ts
export type StoryboardPlanningStepData = {
  schema_version: "step04.v1";
  selected_episode: StoryboardSelectedEpisode;
  source_context: StoryboardSourceContext;
  shot_list: StoryboardShot[];
  shot_order: StoryboardShotOrder;
  rhythm_stats: StoryboardRhythmStats;
  downstream_queue: StoryboardDownstreamQueue;
  step_meta: StoryboardPlanningStepMeta;
};
```

说明：
- `selected_episode` 负责当前集数选择。
- `source_context` 保存从剧本和资产库读取到的上游摘要。
- `shot_list` 是核心镜头列表。
- `shot_order` 保存镜头排序和分组。
- `rhythm_stats` 用于统计当前集时长、节奏和情绪强度。
- `downstream_queue` 用于给提词、画面、视频、音频等后续步骤生成任务入口。
- `step_meta` 记录步骤保存、生成、版本等元信息。

---

## 3. 集数选择

### 3.1 `StoryboardSelectedEpisode`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_number` | `number` | 当前正在分镜的集数 | 是 | `1` |
| `episode_id` | `string` | 当前集唯一标识，便于跨步骤引用 | 否 | `""` |
| `episode_title` | `string` | 当前集标题 | 否 | `""` |
| `episode_status` | `"not_started" \| "draft" \| "generated" \| "review" \| "done"` | 当前集分镜状态 | 否 | `"draft"` |
| `available_episode_numbers` | `number[]` | 可切换的集数列表，来自步骤 01/02 | 否 | `[]` |
| `last_opened_shot_id` | `string \| null` | 最近编辑的镜头 ID | 否 | `null` |

### 3.2 说明

- `episode_number` 用于页面选择器。
- `episode_id` 用于下游引用，避免只靠数字导致跨季或重排时冲突。
- `last_opened_shot_id` 可以支持用户返回页面时自动定位到上次编辑的镜头。

---

## 4. 上游来源上下文

### 4.1 `StoryboardSourceContext`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `script_source` | `StoryboardScriptSource` | 步骤 02 剧本来源摘要 | 是 | 见下方 |
| `asset_source` | `StoryboardAssetSource` | 步骤 03 资产来源摘要 | 否 | 见下方 |
| `source_warnings` | `StoryboardSourceWarning[]` | 上游缺失或不一致提示 | 否 | `[]` |

### 4.2 `StoryboardScriptSource`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `script_id` | `string` | 剧本唯一 ID 或版本 ID | 否 | `""` |
| `episode_number` | `number` | 剧本所属集数 | 是 | `1` |
| `script_title` | `string` | 剧本标题 | 否 | `""` |
| `script_text_snapshot` | `string` | 用于拆镜的剧本文本快照 | 是 | `""` |
| `script_version_status` | `string` | 剧本版本状态 | 否 | `"v1 草稿"` |
| `beat_refs` | `StoryboardBeatRef[]` | 来自剧本的节奏节点引用 | 否 | `[]` |
| `dialogue_refs` | `StoryboardDialogueRef[]` | 来自剧本的对白/旁白引用 | 否 | `[]` |

### 4.3 `StoryboardAssetSource`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `asset_library_id` | `string` | 资产库 ID 或版本 ID | 否 | `""` |
| `asset_version_status` | `string` | 资产库版本状态 | 否 | `"v1 草稿"` |
| `available_character_refs` | `StoryboardAssetRef[]` | 可用角色引用 | 否 | `[]` |
| `available_scene_refs` | `StoryboardAssetRef[]` | 可用场景引用 | 否 | `[]` |
| `available_prop_refs` | `StoryboardAssetRef[]` | 可用道具引用 | 否 | `[]` |
| `style_board_ref` | `StoryboardAssetRef \| null` | 风格板引用 | 否 | `null` |
| `consistency_rule_refs` | `StoryboardAssetRef[]` | 一致性规则引用 | 否 | `[]` |

### 4.4 `StoryboardAssetRef`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `ref_id` | `string` | 上游资产 ID | 是 | `""` |
| `ref_type` | `"character" \| "scene" \| "prop" \| "style_board" \| "consistency_rule"` | 引用类型 | 是 | `"character"` |
| `display_name` | `string` | 页面显示名 | 是 | `""` |
| `summary` | `string` | 上游资产摘要，便于镜头编辑时查看 | 否 | `""` |

### 4.5 `StoryboardSourceWarning`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `warning_id` | `string` | 提示唯一 ID | 是 | `""` |
| `warning_type` | `"missing_script" \| "missing_asset" \| "version_mismatch" \| "empty_dialogue" \| "other"` | 提示类型 | 是 | `"other"` |
| `message` | `string` | 提示文案 | 是 | `""` |
| `blocking` | `boolean` | 是否阻塞自动拆镜 | 否 | `false` |

---

## 5. 剧本节奏与台词引用

### 5.1 `StoryboardBeatRef`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `beat_id` | `string` | 剧本节奏节点 ID | 是 | `""` |
| `beat_type` | `"hook" \| "turning_point" \| "conflict" \| "emotion" \| "ending"` | 节奏类型 | 否 | `"emotion"` |
| `label` | `string` | 节点显示名 | 否 | `""` |
| `source_text_range` | `StoryboardTextRange \| null` | 对应剧本文本范围 | 否 | `null` |
| `emotion_intensity` | `number` | 情绪强度，建议 1-5 | 否 | `3` |

### 5.2 `StoryboardDialogueRef`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `dialogue_id` | `string` | 对白或旁白 ID | 是 | `""` |
| `speaker_name` | `string` | 说话角色；旁白可为“旁白” | 否 | `""` |
| `line_type` | `"dialogue" \| "voiceover" \| "subtitle" \| "action"` | 文本类型 | 是 | `"dialogue"` |
| `text` | `string` | 原文内容 | 是 | `""` |
| `source_text_range` | `StoryboardTextRange \| null` | 在剧本中的范围 | 否 | `null` |

### 5.3 `StoryboardTextRange`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `start_index` | `number` | 原剧本文本起始字符位置 | 否 | `0` |
| `end_index` | `number` | 原剧本文本结束字符位置 | 否 | `0` |
| `paragraph_index` | `number \| null` | 段落序号 | 否 | `null` |

---

## 6. 镜头列表

### 6.1 `StoryboardShot`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `shot_id` | `string` | 镜头唯一 ID | 是 | `""` |
| `shot_number` | `number` | 当前集内镜头序号 | 是 | `1` |
| `episode_number` | `number` | 所属集数 | 是 | `1` |
| `shot_title` | `string` | 镜头标题或短标签 | 否 | `""` |
| `scene_purpose` | `string` | 剧情目的 | 是 | `""` |
| `source_script_refs` | `StoryboardShotScriptRefs` | 镜头关联的剧本文本 | 否 | 见下方 |
| `asset_refs` | `StoryboardShotAssetRefs` | 镜头引用的角色/场景/道具 | 否 | 见下方 |
| `visual_design` | `StoryboardShotVisualDesign` | 景别、角度、构图、动作等视觉设计 | 是 | 见下方 |
| `camera_motion` | `StoryboardCameraMotion` | 运镜设计 | 否 | 见下方 |
| `dialogue_links` | `StoryboardShotDialogueLink[]` | 台词、旁白、字幕关联 | 否 | `[]` |
| `timing` | `StoryboardShotTiming` | 时长和节奏信息 | 是 | 见下方 |
| `production_flags` | `StoryboardShotProductionFlags` | 后续任务标记 | 否 | 见下方 |
| `status` | `"draft" \| "generated" \| "review" \| "approved" \| "needs_update"` | 镜头状态 | 否 | `"draft"` |
| `notes` | `string` | 镜头备注 | 否 | `""` |

### 6.2 说明

- `shot_id` 是后续提示词、画面、视频等步骤的核心外键。
- `shot_number` 用于 UI 展示和用户手动排序。
- `source_script_refs` 让每个镜头能追溯到剧本文本。

---

## 7. 镜头剧本引用

### 7.1 `StoryboardShotScriptRefs`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `script_id` | `string` | 来源剧本 ID | 否 | `""` |
| `beat_ref_ids` | `string[]` | 关联的节奏节点 ID | 否 | `[]` |
| `dialogue_ref_ids` | `string[]` | 关联的对白或旁白 ID | 否 | `[]` |
| `source_text_excerpt` | `string` | 镜头对应剧本文本摘录 | 否 | `""` |
| `source_text_range` | `StoryboardTextRange \| null` | 剧本文本范围 | 否 | `null` |

---

## 8. 角色、场景、道具引用

### 8.1 `StoryboardShotAssetRefs`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `scene_ref_id` | `string \| null` | 关联场景 ID | 否 | `null` |
| `character_ref_ids` | `string[]` | 出镜角色 ID 列表 | 否 | `[]` |
| `primary_character_ref_id` | `string \| null` | 镜头主角色 ID | 否 | `null` |
| `prop_ref_ids` | `string[]` | 出现道具 ID 列表 | 否 | `[]` |
| `style_board_ref_id` | `string \| null` | 风格板 ID | 否 | `null` |
| `consistency_rule_ref_ids` | `string[]` | 需要遵守的一致性规则 ID | 否 | `[]` |

### 8.2 说明

- `scene_ref_id`、`character_ref_ids`、`prop_ref_ids` 均来自步骤 03 资产设定。
- 引用建议只存 ID，显示时再从资产库读取名称和摘要。

---

## 9. 景别、角度、构图与动作

### 9.1 `StoryboardShotVisualDesign`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `shot_size` | `StoryboardShotSize` | 景别 | 是 | `"medium"` |
| `camera_angle` | `StoryboardCameraAngle` | 镜头角度 | 是 | `"eye_level"` |
| `composition` | `string` | 构图说明 | 否 | `""` |
| `character_blocking` | `string` | 角色站位说明 | 否 | `""` |
| `character_action` | `string` | 角色动作 | 否 | `""` |
| `character_expression` | `string` | 角色表情 | 否 | `""` |
| `environment_change` | `string` | 环境变化或气氛变化 | 否 | `""` |
| `prop_usage` | `string` | 道具使用说明 | 否 | `""` |
| `visual_focus` | `string` | 画面焦点 | 否 | `""` |

### 9.2 `StoryboardShotSize`

| 取值 | 用途 | 默认建议 |
| --- | --- | --- |
| `"extreme_wide"` | 大远景 | 否 |
| `"wide"` | 远景 | 否 |
| `"full"` | 全景 | 否 |
| `"medium"` | 中景 | 是 |
| `"close"` | 近景 | 否 |
| `"extreme_close"` | 特写 | 否 |

### 9.3 `StoryboardCameraAngle`

| 取值 | 用途 | 默认建议 |
| --- | --- | --- |
| `"eye_level"` | 平视 | 是 |
| `"high_angle"` | 俯视 | 否 |
| `"low_angle"` | 仰视 | 否 |
| `"side"` | 侧面 | 否 |
| `"over_shoulder"` | 过肩 | 否 |
| `"pov"` | 主观视角 | 否 |

---

## 10. 运镜设计

### 10.1 `StoryboardCameraMotion`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `motion_type` | `StoryboardCameraMotionType` | 运镜类型 | 是 | `"static"` |
| `motion_description` | `string` | 运镜描述 | 否 | `""` |
| `motion_direction` | `string` | 运动方向，如向前、向右、环绕 | 否 | `""` |
| `motion_speed` | `"slow" \| "normal" \| "fast"` | 运镜速度 | 否 | `"normal"` |
| `motion_purpose` | `string` | 运镜目的，如强调情绪、揭示信息 | 否 | `""` |

### 10.2 `StoryboardCameraMotionType`

| 取值 | 用途 | 默认建议 |
| --- | --- | --- |
| `"static"` | 定镜 | 是 |
| `"push_in"` | 推进 | 否 |
| `"pull_out"` | 拉远 | 否 |
| `"pan"` | 横移或摇移 | 否 |
| `"track"` | 跟拍 | 否 |
| `"tilt"` | 摇镜 | 否 |
| `"orbit"` | 环绕 | 否 |

---

## 11. 台词、旁白与字幕关联

### 11.1 `StoryboardShotDialogueLink`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `link_id` | `string` | 关联唯一 ID | 是 | `""` |
| `dialogue_ref_id` | `string \| null` | 来源对白/旁白 ID | 否 | `null` |
| `line_type` | `"dialogue" \| "voiceover" \| "subtitle"` | 台词类型 | 是 | `"dialogue"` |
| `speaker_ref_id` | `string \| null` | 说话角色资产 ID | 否 | `null` |
| `speaker_name` | `string` | 说话角色显示名 | 否 | `""` |
| `text` | `string` | 镜头内实际使用文本 | 是 | `""` |
| `subtitle_text` | `string` | 字幕文本，可与台词不同 | 否 | `""` |
| `start_offset_sec` | `number` | 镜头内开始时间 | 否 | `0` |
| `duration_sec` | `number` | 台词持续时间 | 否 | `0` |

### 11.2 说明

- 步骤 09 音频字幕可直接读取 `dialogue_links` 生成配音和字幕。
- `subtitle_text` 单独保留，方便短视频口语化字幕与剧本文本不同。

---

## 12. 时长与节奏统计

### 12.1 `StoryboardShotTiming`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `duration_sec` | `number` | 镜头时长 | 是 | `3` |
| `emotion_intensity` | `number` | 情绪强度，建议 1-5 | 否 | `3` |
| `rhythm_tag` | `"setup" \| "build" \| "climax" \| "release" \| "hook"` | 节奏标签 | 否 | `"build"` |
| `is_key_shot` | `boolean` | 是否重点镜头 | 否 | `false` |
| `pace_note` | `string` | 节奏说明 | 否 | `""` |

### 12.2 `StoryboardRhythmStats`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_number` | `number` | 当前统计集数 | 是 | `1` |
| `shot_count` | `number` | 镜头总数 | 是 | `0` |
| `total_duration_sec` | `number` | 当前集总时长 | 是 | `0` |
| `average_shot_duration_sec` | `number` | 平均镜头时长 | 否 | `0` |
| `key_shot_count` | `number` | 重点镜头数量 | 否 | `0` |
| `rhythm_curve` | `StoryboardRhythmCurvePoint[]` | 节奏曲线 | 否 | `[]` |
| `warnings` | `string[]` | 节奏风险提示 | 否 | `[]` |

### 12.3 `StoryboardRhythmCurvePoint`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `shot_id` | `string` | 对应镜头 ID | 是 | `""` |
| `shot_number` | `number` | 对应镜头序号 | 是 | `1` |
| `emotion_intensity` | `number` | 情绪强度 | 是 | `3` |
| `duration_sec` | `number` | 镜头时长 | 是 | `3` |

---

## 13. 镜头排序

### 13.1 `StoryboardShotOrder`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_number` | `number` | 所属集数 | 是 | `1` |
| `ordered_shot_ids` | `string[]` | 当前镜头顺序 | 是 | `[]` |
| `group_by_scene` | `StoryboardSceneGroup[]` | 按场景分组 | 否 | `[]` |

### 13.2 `StoryboardSceneGroup`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `scene_ref_id` | `string \| null` | 场景 ID | 否 | `null` |
| `scene_name` | `string` | 场景显示名 | 否 | `""` |
| `shot_ids` | `string[]` | 该场景下的镜头 ID | 是 | `[]` |

---

## 14. 后续任务队列

### 14.1 `StoryboardDownstreamQueue`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `prompt_tasks` | `StoryboardDownstreamTask[]` | 步骤 05 提词任务 | 否 | `[]` |
| `image_tasks` | `StoryboardDownstreamTask[]` | 步骤 06 画面任务 | 否 | `[]` |
| `video_tasks` | `StoryboardDownstreamTask[]` | 步骤 08 视频任务预告 | 否 | `[]` |
| `audio_tasks` | `StoryboardDownstreamTask[]` | 步骤 09 音频字幕任务预告 | 否 | `[]` |

### 14.2 `StoryboardDownstreamTask`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `task_id` | `string` | 任务 ID | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID | 是 | `""` |
| `target_step` | `"prompt-generation" \| "image-generation" \| "video-generation" \| "audio-subtitle"` | 目标步骤 | 是 | `"prompt-generation"` |
| `task_type` | `string` | 任务类型，如 T2I、I2V、字幕 | 是 | `""` |
| `enabled` | `boolean` | 是否加入下游队列 | 否 | `true` |
| `status` | `"pending" \| "ready" \| "blocked"` | 任务状态 | 否 | `"pending"` |
| `blocking_reason` | `string` | 阻塞原因 | 否 | `""` |

---

## 15. 步骤元信息

### 15.1 `StoryboardPlanningStepMeta`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `last_generated_at` | `string \| null` | 最近自动拆镜时间 | 否 | `null` |
| `last_saved_at` | `string \| null` | 最近保存时间 | 否 | `null` |
| `last_modified_by` | `string` | 最近修改者 | 否 | `"人工"` |
| `version_status` | `string` | 当前版本状态 | 否 | `"v1 草稿"` |
| `modification_records` | `string[]` | 修改记录 | 否 | `[]` |
| `generation_source` | `"manual" \| "auto_split" \| "imported"` | 分镜来源 | 否 | `"manual"` |

---

## 16. 步骤 04 如何读取步骤 02 剧本和步骤 03 资产设定

### 16.1 读取步骤 02 剧本

步骤 04 需要从步骤 02 读取：

| 步骤 02 数据 | 映射到步骤 04 | 用途 |
| --- | --- | --- |
| 当前集数 | `selected_episode.episode_number` | 确定拆镜范围 |
| 正式剧本文本 | `source_context.script_source.script_text_snapshot` | 自动拆镜和人工分镜的文本来源 |
| 剧本版本状态 | `source_context.script_source.script_version_status` | 判断分镜是否需要更新 |
| 对白/旁白结构 | `source_context.script_source.dialogue_refs` | 生成 `dialogue_links` |
| 节奏节点 | `source_context.script_source.beat_refs` | 生成镜头节奏、重点镜头和情绪强度 |

建议步骤 04 不直接修改步骤 02 数据，只保存读取时的快照和引用 ID。若步骤 02 剧本更新，步骤 04 应显示 `version_mismatch` 提示，由用户决定是否重新拆镜。

### 16.2 读取步骤 03 资产设定

步骤 04 需要从步骤 03 读取：

| 步骤 03 数据 | 映射到步骤 04 | 用途 |
| --- | --- | --- |
| 角色卡库 | `source_context.asset_source.available_character_refs` | 镜头角色选择、角色站位、台词说话人 |
| 场景卡库 | `source_context.asset_source.available_scene_refs` | 镜头场景选择和场景分组 |
| 道具卡库 | `source_context.asset_source.available_prop_refs` | 镜头道具引用 |
| 风格板 | `source_context.asset_source.style_board_ref` | 给步骤 05 提词和步骤 06 画面生成提供风格约束 |
| 一致性规则 | `source_context.asset_source.consistency_rule_refs` | 给提示词、画面和质检提供一致性约束 |

建议步骤 04 的镜头内只保存资产 ID 和必要摘要，不复制完整资产详情，避免资产卡更新后分镜数据膨胀。

---

## 17. 步骤 05 和步骤 06 如何消费分镜数据

### 17.1 步骤 05「提词生成」消费方式

步骤 05 应读取：

| 分镜字段 | 提词用途 |
| --- | --- |
| `shot_id`、`shot_number` | 建立一镜一提示词的关联 |
| `asset_refs.character_ref_ids` | 注入角色一致性描述 |
| `asset_refs.scene_ref_id` | 注入场景描述 |
| `asset_refs.prop_ref_ids` | 注入道具描述 |
| `visual_design.shot_size` | 生成景别描述 |
| `visual_design.camera_angle` | 生成镜头角度描述 |
| `visual_design.composition` | 生成构图提示 |
| `visual_design.character_action` | 生成动作提示 |
| `camera_motion` | 生成 I2V 运镜提示 |
| `dialogue_links` | 生成字幕或口型相关提示 |
| `timing.duration_sec` | 生成视频时长参数 |

### 17.2 步骤 06「画面生成」消费方式

步骤 06 应读取：

| 分镜字段 | 画面生成用途 |
| --- | --- |
| `shot_id` | 绑定候选图和入选图 |
| `episode_number` | 按集数筛选生成任务 |
| `asset_refs` | 按角色、场景、道具筛选素材 |
| `visual_design` | 确定画面内容与构图 |
| `production_flags.needs_keyframe` | 判断是否需要生成关键帧 |
| `production_flags.needs_storyboard_image` | 判断是否生成分镜图 |
| `status` | 只消费已确认或待生成的镜头 |

---

## 18. `StoryboardShotProductionFlags`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `needs_prompt` | `boolean` | 是否需要进入提词生成 | 否 | `true` |
| `needs_storyboard_image` | `boolean` | 是否需要分镜图 | 否 | `true` |
| `needs_keyframe` | `boolean` | 是否需要关键帧 | 否 | `true` |
| `needs_video` | `boolean` | 是否需要视频生成 | 否 | `true` |
| `needs_audio` | `boolean` | 是否需要音频字幕 | 否 | `true` |
| `locked` | `boolean` | 镜头是否锁定，避免批量生成覆盖 | 否 | `false` |

---

## 19. 后续落地到 TypeScript 的建议

1. 不直接把所有字段塞进 `ProjectRecord` 顶层，建议新增 `step_four` 或统一 `steps.storyboard_planning` 容器。
2. `StoryboardShot` 必须独立成数组类型，后续步骤通过 `shot_id` 引用。
3. 景别、角度、运镜、节奏标签建议先定义联合字符串类型，便于 UI 下拉控件复用。
4. 上游引用只保存 ID 和快照摘要，不复制完整剧本或资产库对象。
5. 新增适配器函数时，应支持从步骤 02 的 `script_text` 和步骤 03 的资产草案生成 `source_context`。
6. 自动拆镜接口返回结果建议直接匹配 `StoryboardShot[]`，避免前端二次转换过多。
7. 保存时建议同时保存 `rhythm_stats`，但它也应能由 `shot_list` 重新计算，避免数据不一致。

---

## 20. 结论

步骤 04「分镜规划」应作为后续生产链路的镜头中台。类型设计的重点不是只存一段分镜文本，而是让每个镜头都能追溯剧本、引用资产、描述画面、绑定台词、统计节奏，并能被步骤 05 提词生成和步骤 06 画面生成稳定消费。

