# 步骤 09「音频字幕」前端数据类型草案

本文档基于 [项目步骤功能说明.md](/C:/Users/86158/Desktop/codex/coGMan-ai-B/项目步骤功能说明.md) 与 [主要功能页面开发明细表.md](/C:/Users/86158/Desktop/codex/coGMan-ai-B/主要功能页面开发明细表.md) 编写，仅用于步骤 09 前端类型设计，不直接修改 `apps/web/src/types.ts`。

## 1. 设计目标

步骤 09「音频字幕」负责完成声音层生产，把剧本对白、旁白、视频片段、角色声音设定组织成可剪辑的配音轨、字幕轨、口型同步任务、音效轨、BGM 轨和混音配置。

本草案覆盖：

1. 角色声音设定。
2. 旁白与对白台词。
3. 配音生成任务。
4. 口型同步任务。
5. 字幕轨与字幕样式。
6. 环境音、动作音效、转场音效、情绪音效。
7. BGM 与混音说明。
8. 与步骤 02、08、10 的数据衔接方式。

---

## 2. 建议的根类型

```ts
export type AudioSubtitleStepData = {
  schema_version: "step09.v1";
  source_context: AudioSubtitleSourceContext;
  dialogue_lines: AudioSubtitleLine[];
  voice_profiles: CharacterVoiceProfile[];
  voice_tasks: VoiceGenerationTask[];
  voice_tracks: VoiceTrackAsset[];
  lip_sync_tasks: LipSyncTask[];
  subtitle_tracks: SubtitleTrack[];
  subtitle_styles: SubtitleStyleTemplate[];
  sound_effect_tracks: SoundEffectTrack[];
  bgm_tracks: BgmTrack[];
  mix_settings: AudioMixSettings;
  preview_state: AudioSubtitlePreviewState;
  step_meta: AudioSubtitleStepMeta;
};
```

说明：
- `source_context` 保存上游剧本、视频片段和角色资产的读取摘要。
- `dialogue_lines` 是对白、旁白、字幕和停顿标记的统一台词表。
- `voice_profiles` 保存角色声音设定。
- `voice_tasks` 管理配音生成队列。
- `voice_tracks` 保存生成后的配音、旁白音频素材。
- `lip_sync_tasks` 管理口型同步任务。
- `subtitle_tracks` 与 `subtitle_styles` 保存字幕时间轴和样式。
- `sound_effect_tracks` 与 `bgm_tracks` 保存音效和背景音乐。
- `mix_settings` 保存音量、淡入淡出、响度和对白可听性配置。

---

## 3. 上游来源上下文

### 3.1 `AudioSubtitleSourceContext`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `episode_number` | `number` | 当前处理的集数 | 是 | `1` |
| `script_source` | `AudioScriptSource` | 步骤 02 剧本来源摘要 | 是 | 见下方 |
| `video_source` | `AudioVideoSource` | 步骤 08 视频片段来源摘要 | 否 | 见下方 |
| `asset_source` | `AudioAssetSource` | 步骤 03 角色资产与声音设定摘要 | 否 | 见下方 |
| `source_warnings` | `AudioSourceWarning[]` | 上游缺失、过期或不一致提示 | 否 | `[]` |

### 3.2 `AudioScriptSource`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `script_id` | `string` | 剧本 ID 或版本 ID | 否 | `""` |
| `script_version_status` | `string` | 剧本版本状态 | 否 | `"v1 草稿"` |
| `episode_title` | `string` | 当前集标题 | 否 | `""` |
| `dialogue_ref_ids` | `string[]` | 已读取的对白 ID 列表 | 否 | `[]` |
| `voiceover_ref_ids` | `string[]` | 已读取的旁白 ID 列表 | 否 | `[]` |
| `beat_ref_ids` | `string[]` | 情绪、停顿和节奏节点 ID | 否 | `[]` |
| `last_synced_at` | `string \| null` | 最近同步剧本时间 | 否 | `null` |

### 3.3 `AudioVideoSource`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `video_step_id` | `string` | 步骤 08 数据 ID 或版本 ID | 否 | `""` |
| `video_version_status` | `string` | 视频片段版本状态 | 否 | `"v1 草稿"` |
| `available_clips` | `AudioVideoClipRef[]` | 可对齐音频和字幕的视频片段 | 否 | `[]` |
| `total_duration_sec` | `number` | 当前集视频总时长 | 否 | `0` |
| `last_synced_at` | `string \| null` | 最近同步视频片段时间 | 否 | `null` |

### 3.4 `AudioVideoClipRef`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `clip_id` | `string` | 视频片段 ID | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID | 是 | `""` |
| `shot_number` | `number` | 当前集镜头序号 | 是 | `1` |
| `video_url` | `string` | 视频片段 URL | 否 | `""` |
| `duration_sec` | `number` | 片段时长 | 否 | `0` |
| `start_time_sec` | `number` | 在成片时间线中的建议开始时间 | 否 | `0` |
| `end_time_sec` | `number` | 在成片时间线中的建议结束时间 | 否 | `0` |
| `status` | `"draft" \| "final" \| "needs_rework"` | 视频片段状态 | 否 | `"draft"` |

### 3.5 `AudioAssetSource`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `asset_library_id` | `string` | 步骤 03 资产库 ID 或版本 ID | 否 | `""` |
| `character_refs` | `AudioCharacterRef[]` | 可配置声音的角色引用 | 否 | `[]` |
| `default_narrator_ref_id` | `string \| null` | 默认旁白声音引用 ID | 否 | `null` |
| `style_notes` | `string` | 整体声音风格说明 | 否 | `""` |

### 3.6 `AudioCharacterRef`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `character_ref_id` | `string` | 角色资产 ID | 是 | `""` |
| `display_name` | `string` | 角色显示名 | 是 | `""` |
| `role_type` | `"lead" \| "supporting" \| "villain" \| "extra" \| "narrator"` | 角色类型 | 否 | `"supporting"` |
| `gender_hint` | `string` | 声音性别或声线提示 | 否 | `""` |
| `age_hint` | `string` | 年龄感提示 | 否 | `""` |
| `personality_hint` | `string` | 性格、语气提示 | 否 | `""` |

### 3.7 `AudioSourceWarning`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `warning_id` | `string` | 提示唯一 ID | 是 | `""` |
| `warning_type` | `"missing_script" \| "missing_video" \| "missing_voice_profile" \| "version_mismatch" \| "duration_conflict" \| "other"` | 提示类型 | 是 | `"other"` |
| `message` | `string` | 提示文案 | 是 | `""` |
| `blocking` | `boolean` | 是否阻塞生成 | 否 | `false` |

---

## 4. 台词与旁白

### 4.1 `AudioSubtitleLine`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `line_id` | `string` | 台词行唯一 ID | 是 | `""` |
| `source_dialogue_id` | `string \| null` | 来源剧本对白或旁白 ID | 否 | `null` |
| `episode_number` | `number` | 所属集数 | 是 | `1` |
| `shot_id` | `string \| null` | 关联镜头 ID | 否 | `null` |
| `clip_id` | `string \| null` | 关联视频片段 ID | 否 | `null` |
| `line_type` | `"dialogue" \| "voiceover" \| "subtitle_only" \| "breath" \| "pause"` | 台词类型 | 是 | `"dialogue"` |
| `speaker_ref_id` | `string \| null` | 说话角色 ID，旁白可为空或指向旁白档案 | 否 | `null` |
| `speaker_name` | `string` | 说话人显示名 | 否 | `""` |
| `text` | `string` | 配音文本 | 是 | `""` |
| `subtitle_text` | `string` | 字幕文本，可与配音文本不同 | 否 | `""` |
| `emotion` | `string` | 情绪提示 | 否 | `""` |
| `tone` | `string` | 语气提示 | 否 | `""` |
| `pause_before_sec` | `number` | 台词前停顿 | 否 | `0` |
| `pause_after_sec` | `number` | 台词后停顿 | 否 | `0` |
| `target_duration_sec` | `number \| null` | 目标朗读时长 | 否 | `null` |
| `start_time_sec` | `number \| null` | 在视频片段或时间线中的开始时间 | 否 | `null` |
| `end_time_sec` | `number \| null` | 在视频片段或时间线中的结束时间 | 否 | `null` |
| `status` | `"draft" \| "ready" \| "voiced" \| "synced" \| "needs_edit"` | 台词处理状态 | 否 | `"draft"` |

### 4.2 说明

- `text` 服务配音，`subtitle_text` 服务字幕，可以保留口语化字幕或压缩字幕。
- `line_type = "pause"` 可表达纯停顿或节奏空拍，不一定生成音频。
- `shot_id` 和 `clip_id` 用于将台词、视频和口型同步任务对齐。

---

## 5. 角色声音设定

### 5.1 `CharacterVoiceProfile`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `voice_profile_id` | `string` | 声音设定唯一 ID | 是 | `""` |
| `character_ref_id` | `string \| null` | 关联角色 ID，旁白可为空 | 否 | `null` |
| `display_name` | `string` | 声音设定显示名 | 是 | `""` |
| `voice_role` | `"character" \| "narrator" \| "system" \| "extra"` | 声音用途 | 是 | `"character"` |
| `voice_provider` | `string` | TTS 服务商或模型名称 | 否 | `""` |
| `voice_id` | `string` | 服务商声音 ID | 否 | `""` |
| `voice_name` | `string` | 声音名称 | 否 | `""` |
| `timbre` | `string` | 音色描述，如清亮、低沉、少年感 | 否 | `""` |
| `speaking_rate` | `number` | 语速倍率，1 为默认 | 否 | `1` |
| `pitch` | `number` | 音高调整值 | 否 | `0` |
| `energy` | `number` | 表达强度，建议 0-1 | 否 | `0.7` |
| `emotion_default` | `string` | 默认情绪 | 否 | `""` |
| `style_prompt` | `string` | 声音风格提示词 | 否 | `""` |
| `sample_audio_url` | `string \| null` | 试听样本 URL | 否 | `null` |
| `locked` | `boolean` | 是否锁定角色声音，避免批量覆盖 | 否 | `false` |

### 5.2 说明

- 同一角色应稳定引用同一个 `voice_profile_id`，保障整集声音一致。
- `locked` 用于防止重新生成声音设定时覆盖已经确认的角色声线。

---

## 6. 配音生成任务

### 6.1 `VoiceGenerationTask`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `task_id` | `string` | 配音任务 ID | 是 | `""` |
| `line_id` | `string` | 关联台词行 ID | 是 | `""` |
| `voice_profile_id` | `string \| null` | 使用的声音设定 ID | 否 | `null` |
| `task_mode` | `"single_line" \| "batch_lines" \| "regenerate" \| "narration_batch"` | 任务模式 | 是 | `"single_line"` |
| `status` | `"pending" \| "ready" \| "queued" \| "running" \| "succeeded" \| "failed" \| "cancelled"` | 任务状态 | 是 | `"pending"` |
| `input_text_snapshot` | `string` | 生成时使用的文本快照 | 是 | `""` |
| `voice_params_snapshot` | `VoiceSynthesisParams` | 生成时使用的声音参数快照 | 否 | 见下方 |
| `output_track_id` | `string \| null` | 生成成功后的音频轨 ID | 否 | `null` |
| `failure_reason` | `string` | 失败原因 | 否 | `""` |
| `retry_count` | `number` | 已重试次数 | 否 | `0` |
| `created_at` | `string \| null` | 创建时间 | 否 | `null` |
| `updated_at` | `string \| null` | 最近更新时间 | 否 | `null` |

### 6.2 `VoiceSynthesisParams`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `format` | `"mp3" \| "wav" \| "aac"` | 输出格式 | 否 | `"wav"` |
| `sample_rate` | `number` | 采样率 | 否 | `48000` |
| `speaking_rate` | `number` | 语速倍率 | 否 | `1` |
| `pitch` | `number` | 音高调整 | 否 | `0` |
| `energy` | `number` | 表达强度 | 否 | `0.7` |
| `emotion` | `string` | 本句情绪 | 否 | `""` |
| `pause_before_sec` | `number` | 前置停顿 | 否 | `0` |
| `pause_after_sec` | `number` | 后置停顿 | 否 | `0` |
| `extra_settings` | `Record<string, string \| number \| boolean \| null>` | 服务商扩展参数 | 否 | `{}` |

---

## 7. 配音与旁白音频轨

### 7.1 `VoiceTrackAsset`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `track_id` | `string` | 音频轨或音频素材 ID | 是 | `""` |
| `line_id` | `string \| null` | 关联台词行 ID | 否 | `null` |
| `task_id` | `string \| null` | 来源配音任务 ID | 否 | `null` |
| `track_type` | `"dialogue" \| "voiceover" \| "breath" \| "wild_line"` | 音频类型 | 是 | `"dialogue"` |
| `speaker_ref_id` | `string \| null` | 说话角色 ID | 否 | `null` |
| `voice_profile_id` | `string \| null` | 声音设定 ID | 否 | `null` |
| `audio_url` | `string` | 音频文件 URL | 是 | `""` |
| `duration_sec` | `number` | 音频时长 | 否 | `0` |
| `start_time_sec` | `number` | 建议放置到时间线的开始时间 | 否 | `0` |
| `end_time_sec` | `number` | 建议结束时间 | 否 | `0` |
| `volume_db` | `number` | 该轨道音量增益 | 否 | `0` |
| `fade_in_sec` | `number` | 淡入时长 | 否 | `0` |
| `fade_out_sec` | `number` | 淡出时长 | 否 | `0` |
| `waveform_url` | `string \| null` | 波形预览数据 URL | 否 | `null` |
| `status` | `"draft" \| "approved" \| "needs_regenerate" \| "muted"` | 音频状态 | 否 | `"draft"` |

### 7.2 说明

- `wild_line` 用于不直接绑定某句台词的补录素材。
- `start_time_sec` 和 `end_time_sec` 是给步骤 10 剪辑时间线的建议值，后续可被剪辑阶段微调。

---

## 8. 口型同步任务

### 8.1 `LipSyncTask`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `lip_sync_task_id` | `string` | 口型同步任务 ID | 是 | `""` |
| `clip_id` | `string` | 关联视频片段 ID | 是 | `""` |
| `shot_id` | `string` | 关联镜头 ID | 是 | `""` |
| `line_ids` | `string[]` | 参与同步的台词行 ID | 否 | `[]` |
| `voice_track_ids` | `string[]` | 参与同步的音频轨 ID | 否 | `[]` |
| `status` | `"pending" \| "ready" \| "queued" \| "running" \| "succeeded" \| "failed" \| "skipped"` | 任务状态 | 是 | `"pending"` |
| `sync_mode` | `"mouth_only" \| "face_expression" \| "full_face"` | 同步模式 | 否 | `"mouth_only"` |
| `result_video_url` | `string \| null` | 口型同步后的视频 URL | 否 | `null` |
| `sync_report` | `LipSyncReport \| null` | 同步质量报告 | 否 | `null` |
| `failure_reason` | `string` | 失败原因 | 否 | `""` |
| `created_at` | `string \| null` | 创建时间 | 否 | `null` |
| `updated_at` | `string \| null` | 最近更新时间 | 否 | `null` |

### 8.2 `LipSyncReport`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `score` | `number` | 同步评分，建议 0-100 | 否 | `0` |
| `offset_sec` | `number` | 检测到的音画偏移 | 否 | `0` |
| `issues` | `string[]` | 同步问题描述 | 否 | `[]` |
| `needs_manual_adjustment` | `boolean` | 是否需要人工微调 | 否 | `false` |

---

## 9. 字幕轨

### 9.1 `SubtitleTrack`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `subtitle_track_id` | `string` | 字幕轨 ID | 是 | `""` |
| `track_name` | `string` | 字幕轨名称 | 否 | `"主字幕"` |
| `language` | `string` | 字幕语言 | 否 | `"zh-CN"` |
| `track_type` | `"main" \| "burned_in" \| "export_srt" \| "platform_caption"` | 字幕轨类型 | 否 | `"main"` |
| `cue_items` | `SubtitleCue[]` | 字幕条目 | 是 | `[]` |
| `style_template_id` | `string \| null` | 使用的字幕样式模板 ID | 否 | `null` |
| `status` | `"draft" \| "review" \| "approved" \| "needs_timing"` | 字幕轨状态 | 否 | `"draft"` |

### 9.2 `SubtitleCue`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `cue_id` | `string` | 字幕条目 ID | 是 | `""` |
| `line_id` | `string \| null` | 关联台词行 ID | 否 | `null` |
| `shot_id` | `string \| null` | 关联镜头 ID | 否 | `null` |
| `text` | `string` | 字幕文本 | 是 | `""` |
| `start_time_sec` | `number` | 开始时间 | 是 | `0` |
| `end_time_sec` | `number` | 结束时间 | 是 | `0` |
| `max_chars_per_line` | `number` | 每行最大字数建议 | 否 | `14` |
| `line_break_mode` | `"auto" \| "manual"` | 换行模式 | 否 | `"auto"` |
| `emphasis` | `"none" \| "keyword" \| "emotion" \| "warning"` | 强调样式类型 | 否 | `"none"` |
| `position_override` | `SubtitlePosition \| null` | 单条字幕位置覆盖 | 否 | `null` |

### 9.3 `SubtitlePosition`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `x_percent` | `number` | 横向位置百分比 | 否 | `50` |
| `y_percent` | `number` | 纵向位置百分比 | 否 | `82` |
| `anchor` | `"center" \| "left" \| "right"` | 对齐锚点 | 否 | `"center"` |

---

## 10. 字幕样式

### 10.1 `SubtitleStyleTemplate`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `style_template_id` | `string` | 字幕样式模板 ID | 是 | `""` |
| `style_name` | `string` | 样式名称 | 是 | `"默认短视频字幕"` |
| `platform_target` | `"default" \| "douyin" \| "kuaishou" \| "bilibili" \| "xiaohongshu"` | 目标平台 | 否 | `"default"` |
| `aspect_ratio` | `"9:16" \| "16:9" \| "1:1" \| "4:3"` | 适配比例 | 否 | `"9:16"` |
| `font_family` | `string` | 字体 | 否 | `"system"` |
| `font_size` | `number` | 字号 | 否 | `42` |
| `font_weight` | `"normal" \| "medium" \| "bold"` | 字重 | 否 | `"bold"` |
| `text_color` | `string` | 字体颜色 | 否 | `"#FFFFFF"` |
| `stroke_color` | `string` | 描边颜色 | 否 | `"#000000"` |
| `stroke_width` | `number` | 描边宽度 | 否 | `4` |
| `shadow_enabled` | `boolean` | 是否启用阴影 | 否 | `true` |
| `background_enabled` | `boolean` | 是否启用字幕底色 | 否 | `false` |
| `background_color` | `string` | 字幕底色 | 否 | `"rgba(0,0,0,0.45)"` |
| `safe_area` | `SubtitleSafeArea` | 字幕安全区 | 否 | 见下方 |

### 10.2 `SubtitleSafeArea`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `top_percent` | `number` | 顶部安全边距 | 否 | `8` |
| `bottom_percent` | `number` | 底部安全边距 | 否 | `12` |
| `left_percent` | `number` | 左侧安全边距 | 否 | `6` |
| `right_percent` | `number` | 右侧安全边距 | 否 | `6` |
| `avoid_platform_ui` | `boolean` | 是否避开平台按钮/标题区域 | 否 | `true` |

---

## 11. 音效轨

### 11.1 `SoundEffectTrack`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `sfx_id` | `string` | 音效素材或轨道 ID | 是 | `""` |
| `sfx_type` | `"ambient" \| "action" \| "transition" \| "emotion" \| "ui" \| "other"` | 音效类型 | 是 | `"other"` |
| `display_name` | `string` | 音效名称 | 是 | `""` |
| `shot_id` | `string \| null` | 关联镜头 ID | 否 | `null` |
| `clip_id` | `string \| null` | 关联视频片段 ID | 否 | `null` |
| `audio_url` | `string` | 音效文件 URL | 是 | `""` |
| `start_time_sec` | `number` | 开始时间 | 是 | `0` |
| `duration_sec` | `number` | 音效时长 | 否 | `0` |
| `volume_db` | `number` | 音量增益 | 否 | `-6` |
| `fade_in_sec` | `number` | 淡入时长 | 否 | `0` |
| `fade_out_sec` | `number` | 淡出时长 | 否 | `0` |
| `loop` | `boolean` | 是否循环 | 否 | `false` |
| `emotion_tag` | `string` | 情绪标签 | 否 | `""` |
| `status` | `"draft" \| "approved" \| "muted"` | 音效状态 | 否 | `"draft"` |

### 11.2 说明

- 环境音可绑定场景或镜头，动作音效通常绑定具体镜头或时间点。
- 转场音效应能被步骤 10 剪辑时间线读取，并与转场配置对齐。

---

## 12. BGM 轨

### 12.1 `BgmTrack`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `bgm_id` | `string` | BGM 轨 ID | 是 | `""` |
| `display_name` | `string` | BGM 名称 | 是 | `""` |
| `audio_url` | `string` | BGM 文件 URL | 是 | `""` |
| `mood` | `string` | 情绪氛围，如紧张、温暖、悬疑 | 否 | `""` |
| `tempo_bpm` | `number \| null` | BPM | 否 | `null` |
| `start_time_sec` | `number` | 开始时间 | 否 | `0` |
| `end_time_sec` | `number \| null` | 结束时间 | 否 | `null` |
| `volume_db` | `number` | 音量增益 | 否 | `-18` |
| `duck_under_dialogue` | `boolean` | 对白出现时是否自动压低 | 否 | `true` |
| `fade_in_sec` | `number` | 淡入时长 | 否 | `1` |
| `fade_out_sec` | `number` | 淡出时长 | 否 | `1` |
| `loop_mode` | `"none" \| "loop" \| "extend_to_timeline"` | 循环方式 | 否 | `"extend_to_timeline"` |
| `license_note` | `string` | 授权或来源说明 | 否 | `""` |

---

## 13. 混音设置

### 13.1 `AudioMixSettings`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `master_volume_db` | `number` | 主输出音量 | 否 | `0` |
| `dialogue_bus_volume_db` | `number` | 对白总线音量 | 否 | `0` |
| `voiceover_bus_volume_db` | `number` | 旁白总线音量 | 否 | `0` |
| `sfx_bus_volume_db` | `number` | 音效总线音量 | 否 | `-6` |
| `bgm_bus_volume_db` | `number` | BGM 总线音量 | 否 | `-18` |
| `target_loudness_lufs` | `number` | 目标响度 | 否 | `-14` |
| `limit_peak_db` | `number` | 峰值限制 | 否 | `-1` |
| `auto_ducking_enabled` | `boolean` | 是否启用对白自动压低 BGM | 否 | `true` |
| `ducking_amount_db` | `number` | 自动压低幅度 | 否 | `-8` |
| `ducking_attack_ms` | `number` | 压低启动时间 | 否 | `80` |
| `ducking_release_ms` | `number` | 压低恢复时间 | 否 | `300` |
| `dialogue_clarity_note` | `string` | 对白可听性说明 | 否 | `""` |
| `mix_notes` | `string` | 混音说明 | 否 | `""` |

### 13.2 说明

- `target_loudness_lufs` 用于后续导出阶段统一平台响度。
- `auto_ducking_enabled` 是短视频场景中保证对白清晰的关键字段。

---

## 14. 预览状态与步骤元信息

### 14.1 `AudioSubtitlePreviewState`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `active_clip_id` | `string \| null` | 当前预览视频片段 ID | 否 | `null` |
| `active_line_id` | `string \| null` | 当前预览台词行 ID | 否 | `null` |
| `active_subtitle_track_id` | `string \| null` | 当前字幕轨 ID | 否 | `null` |
| `playhead_time_sec` | `number` | 预览播放头时间 | 否 | `0` |
| `solo_track_ids` | `string[]` | 独奏轨道 ID | 否 | `[]` |
| `muted_track_ids` | `string[]` | 静音轨道 ID | 否 | `[]` |
| `show_waveform` | `boolean` | 是否显示波形 | 否 | `true` |
| `show_subtitle_safe_area` | `boolean` | 是否显示字幕安全区 | 否 | `true` |

### 14.2 `AudioSubtitleStepMeta`

| 字段名 | 类型 | 用途 | 是否必填 | 默认值建议 |
| --- | --- | --- | --- | --- |
| `last_generated_at` | `string \| null` | 最近生成配音、字幕或音效时间 | 否 | `null` |
| `last_saved_at` | `string \| null` | 最近保存时间 | 否 | `null` |
| `last_modified_by` | `string` | 最近修改者 | 否 | `"人工"` |
| `version_status` | `string` | 当前版本状态 | 否 | `"v1 草稿"` |
| `voice_task_count` | `number` | 配音任务总数 | 否 | `0` |
| `subtitle_cue_count` | `number` | 字幕条目总数 | 否 | `0` |
| `lip_sync_task_count` | `number` | 口型同步任务总数 | 否 | `0` |
| `ready_for_editing` | `boolean` | 是否可交给步骤 10 剪辑成片 | 否 | `false` |
| `modification_records` | `string[]` | 修改记录摘要 | 否 | `[]` |

---

## 15. 上下游衔接方式

### 15.1 读取步骤 02 剧本

| 步骤 02 数据 | 映射到步骤 09 | 用途 |
| --- | --- | --- |
| 结构化对白 | `dialogue_lines[].line_type = "dialogue"` | 生成角色配音和字幕 |
| 旁白文本 | `dialogue_lines[].line_type = "voiceover"` | 生成旁白音频 |
| 情绪标记 | `dialogue_lines[].emotion` | 控制 TTS 情绪与字幕强调 |
| 停顿标记 | `pause_before_sec`、`pause_after_sec` | 控制朗读节奏和字幕时间 |
| 角色名 | `speaker_ref_id`、`speaker_name` | 匹配角色声音设定 |

### 15.2 读取步骤 08 视频生成

| 步骤 08 数据 | 映射到步骤 09 | 用途 |
| --- | --- | --- |
| 最终视频片段 | `video_source.available_clips` | 生成口型同步任务和字幕时间轴 |
| `clip_id`、`shot_id` | `dialogue_lines[].clip_id`、`lip_sync_tasks[].clip_id` | 台词与视频片段绑定 |
| 视频时长 | `duration_sec` | 校验音频与字幕是否超时 |
| 视频状态 | `available_clips[].status` | 只默认处理最终或可用片段 |

### 15.3 输出给步骤 10 剪辑成片

| 步骤 09 数据 | 步骤 10 用途 |
| --- | --- |
| `voice_tracks` | 对齐对白、旁白和镜头画面 |
| `subtitle_tracks` | 生成成片字幕和平台字幕文件 |
| `subtitle_styles` | 渲染横版、竖版、安全区字幕 |
| `sound_effect_tracks` | 对齐动作、环境和转场音效 |
| `bgm_tracks` | 铺设背景音乐和情绪节奏 |
| `mix_settings` | 执行响度、压限和自动压低 |
| `lip_sync_tasks.result_video_url` | 使用口型同步后的视频片段替换原片段 |

---

## 16. 后续落地到 TypeScript 的建议

1. 建议新增 `AudioSubtitleStepData`，不要只用 `voice_tracks`、`subtitle_tracks`、`sfx_tracks`、`mix_settings` 四个扁平字段承载所有状态。
2. `AudioSubtitleLine` 应作为声音和字幕的共同来源，避免配音文本、字幕文本、口型同步文本互相漂移。
3. 角色声音设定 `CharacterVoiceProfile` 应以 `character_ref_id` 关联步骤 03 角色卡，同时允许独立的旁白声音。
4. 配音任务、口型同步任务都建议接入统一生成任务队列，但前端仍保留本步骤专用快照字段，方便追溯。
5. 字幕样式应独立成模板，支持横版、竖版和不同平台安全区复用。
6. 音效和 BGM 需要保存时间线位置，才能被步骤 10 自动编排。
7. 混音配置建议先保存通用参数，模型或剪辑工具特有参数放入后续扩展字段。
8. 步骤 09 不应直接覆盖步骤 08 的视频片段；口型同步结果应作为新素材输出，由步骤 10 决定是否采用。

---

## 17. 结论

步骤 09「音频字幕」应作为声音、字幕和音画同步的生产中台。类型设计的重点不是只保存音频 URL 和字幕文本，而是把台词来源、角色声音、生成任务、口型同步、字幕时间轴、音效、BGM 和混音配置都建立可追溯关系，让步骤 10 能稳定完成时间线编排、音画字幕同步和最终导出。
