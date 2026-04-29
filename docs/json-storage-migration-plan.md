# API-DOC-004：后端数据迁移与本地 JSON 安全写入方案

## 任务边界

本文档整理 coMGan-ai 后端从当前 2 步项目数据扩展到 11 步项目数据时，本地 JSON 的兼容读取、安全写入、备份回滚和未来数据库迁移方案。

本任务只写方案文档，不实现迁移脚本，不修改后端代码。

## 当前数据现状

当前项目后端使用本地 JSON 文件保存项目：

- 主文件：`apps/api/data/projects.json`
- 当前 `ProjectRecord` 已有项目基础字段：`id`、`name`、`status`、`progress`、`cover_style`、`cover_image_url`、`created_at`、`updated_at`、`current_step`
- 当前步骤数据只有：
  - `step_one`
  - `step_two`
- 当前 `current_step` 已支持 11 步枚举。
- 当前 `storage.py` 已有 `LEGACY_STEP_MAP`，用于旧 stepId 到新 stepId 的映射。

扩展到 11 步后，需要新增：

- `step_three`
- `step_four`
- `step_five`
- `step_six`
- `step_seven`
- `step_eight`
- `step_nine`
- `step_ten`
- `step_eleven`

核心目标是：旧 `projects.json` 不需要一次性强迁移，也能被新模型安全读取、补默认值、保存和继续使用。

## 兼容读取策略

### 基本原则

`ProjectRecord` 从 2 步扩展到 11 步时，读取策略应遵循：

1. 旧项目能打开。
2. 缺失步骤能补默认值。
3. 旧 stepId 能映射到新 stepId。
4. 未知字段尽量保留，不在读取时误删。
5. 读取失败要给出可定位错误，不静默吞掉。

### 读取流程建议

建议读取 `projects.json` 时按以下顺序处理每个项目：

1. 读取原始 JSON 对象。
2. 校验根对象是否包含 `projects` 数组。
3. 对单个项目做轻量兼容预处理。
4. 映射旧版 `current_step`。
5. 补齐 `schema_version`。
6. 补齐 `step_three` 到 `step_eleven` 默认对象。
7. 补齐 `step_one`、`step_two` 新增字段默认值。
8. 使用 Pydantic 模型校验。
9. 保留原始未知字段到兼容容器，或暂不写回，避免旧字段丢失。

### 默认值补齐

新增步骤模型必须使用默认对象：

```python
step_three: StepThreeData = Field(default_factory=StepThreeData)
step_four: StepFourData = Field(default_factory=StepFourData)
step_five: StepFiveData = Field(default_factory=StepFiveData)
step_six: StepSixData = Field(default_factory=StepSixData)
step_seven: StepSevenData = Field(default_factory=StepSevenData)
step_eight: StepEightData = Field(default_factory=StepEightData)
step_nine: StepNineData = Field(default_factory=StepNineData)
step_ten: StepTenData = Field(default_factory=StepTenData)
step_eleven: StepElevenData = Field(default_factory=StepElevenData)
```

每个 `StepXData` 内部字段也必须有默认值：

- 字符串默认 `""`
- 数字默认 `0` 或业务合理值
- 可选字段默认 `None`
- 列表使用 `Field(default_factory=list)`
- 字典使用 `Field(default_factory=dict)`
- 嵌套对象使用 `Field(default_factory=NestedModel)`

这样旧项目缺少新增字段时，模型校验不会失败。

## `schema_version` 方案

### 建议新增字段

建议在项目根对象增加：

| 字段 | 类型 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `schema_version` | `int` | `1` | 项目数据结构版本 |
| `migration_notes` | `list[str]` | `[]` | 自动补齐、迁移或兼容处理说明 |

### 版本划分建议

| 版本 | 含义 |
| --- | --- |
| `1` | 当前 2 步项目结构，仅包含 `step_one`、`step_two` |
| `2` | 11 步项目结构，包含 `step_three` 到 `step_eleven` 默认对象 |
| `3` | 任务与素材从项目主 JSON 拆分到 `generation_tasks.json` 与 `assets.json` |
| `4` | 数据库和对象存储阶段 |

### 读取时处理

读取时不能只依赖 `schema_version`，还要兼容没有该字段的旧项目：

- 缺少 `schema_version`：按 `1` 处理。
- `schema_version = 1`：补齐 11 步默认对象。
- `schema_version = 2`：正常读取 11 步结构。
- 大于当前服务支持版本：尽量只读展示，避免写回降级破坏未来字段。

### 写入时处理

当旧项目被新服务保存时：

- 如果只保存步骤 01 或 02，也可以顺带补齐 `schema_version = 2`。
- 不建议启动服务时批量改写所有旧项目。
- 建议在用户打开并保存项目时自然升级。
- `migration_notes` 可记录类似：`"auto-filled step_three to step_eleven defaults"`。

## 旧 stepId 映射策略

当前已有旧 stepId 映射，扩展后应继续保留。

建议映射表：

| 旧 stepId | 新 stepId |
| --- | --- |
| `topic-planning` | `story-structure` |
| `storyboard-design` | `storyboard-planning` |
| `character-image` | `image-generation` |
| `image-to-video` | `video-generation` |
| `voice-subtitle` | `audio-subtitle` |
| `editing-export` | `final-editing` |
| `distribution` | `publish-review` |
| `data-review` | `publish-review` |

处理原则：

- 读取时映射，避免旧项目详情接口报错。
- 写入时统一写成新 stepId。
- 未知 stepId 不应导致服务崩溃，建议降级为 `story-structure` 并记录迁移备注，或返回明确错误。
- 不建议删除映射逻辑，至少保留到旧项目全部自然升级后。

## 未知字段保留策略

本地 JSON 在多人协作和多版本服务中可能出现未知字段。未知字段处理需要谨慎。

### 风险

如果 Pydantic 模型只保留已声明字段，`model_dump()` 写回时可能丢掉未知字段。例如：

- 未来版本写入了 `schema_version = 3` 的字段。
- 当前旧服务读取后保存项目。
- 未知字段被旧服务丢弃。

### 建议策略

1. 短期：尽量避免在读取后无意义写回全量项目。
2. 中期：模型允许额外字段，或把未知字段放进 `extra_fields`。
3. 长期：使用数据库分表，减少整项目大对象读写。

写入时建议：

- 只更新目标项目。
- 只更新目标步骤和必要项目元信息。
- 对原始项目对象中未知字段做 merge 保留。
- 如果服务发现 `schema_version` 高于自身支持版本，应拒绝写入或只允许安全字段写入。

## `projects.json` 安全写入方案

### 写入前备份

每次写入 `projects.json` 前，建议创建备份：

```text
apps/api/data/projects.json.bak
apps/api/data/backups/projects-YYYYMMDD-HHMMSS.json
```

备份策略：

- `projects.json.bak` 保存最近一次写入前版本。
- `backups/` 保存带时间戳的历史备份。
- 可限制保留最近 20 份，避免无限增长。
- 备份失败时不建议继续写入正式文件。

### 临时文件写入

不要直接覆盖 `projects.json`。建议流程：

1. 序列化新 payload。
2. 写入 `projects.json.tmp`。
3. flush 并确保内容落盘。
4. 重新读取 `projects.json.tmp` 验证 JSON 可解析。
5. 验证根对象包含 `projects` 数组。
6. 验证项目数量和目标项目 ID 合理。
7. 再执行原子替换。

### 原子替换

Windows 环境建议使用同目录临时文件替换正式文件，保证尽量原子：

```text
projects.json.tmp -> projects.json
```

替换原则：

- 临时文件必须在同一个目录，避免跨磁盘移动不原子。
- 替换前正式文件已备份。
- 替换失败时保留原文件和临时文件，返回明确错误。

### 写入失败回滚

失败场景与处理：

| 失败场景 | 处理方式 |
| --- | --- |
| JSON 序列化失败 | 不写临时文件，返回错误 |
| 备份失败 | 停止写入，返回错误 |
| 临时文件写入失败 | 删除残留 tmp，保留原文件 |
| 临时文件校验失败 | 删除 tmp 或改名为 `.bad`，保留原文件 |
| 原子替换失败 | 保留原文件和备份，返回错误 |
| 替换后读取失败 | 用 `.bak` 回滚，并记录严重错误 |

回滚原则：

- 永远不要在没有备份的情况下覆盖正式文件。
- 回滚失败时，不要继续写入其他文件。
- 错误信息要包含文件路径、阶段、项目 ID，但不要包含敏感密钥。

## 大素材不能写入 JSON 的原因

图片、视频、音频、字幕、长文档等大素材不能直接写入 `projects.json`，只能存引用。

原因：

1. JSON 文件会快速膨胀，读取项目列表也会变慢。
2. base64 会让文件体积明显增加。
3. 任意一次保存步骤都可能重写整个大 JSON，风险高。
4. 大文件写入中断容易损坏全部项目数据。
5. Git 或备份中容易误带入大体积文件。
6. 视频和音频不适合频繁序列化/反序列化。
7. 后续迁移对象存储时，引用模型更稳定。

建议做法：

- `projects.json` 只保存被采纳资产的 `asset_id`。
- `assets.json` 或数据库保存 `AssetReference`。
- 本地文件放到 `apps/api/data/assets/{project_id}/...`。
- 未来对象存储使用 `bucket`、`object_key`、`url`。

## 本地 JSON 拆分建议

11 步扩展后，建议把不同职责拆到不同 JSON：

```text
apps/api/data/
  projects.json
  generation_tasks.json
  assets.json
  backups/
  assets/
    {project_id}/
      images/
      videos/
      audios/
      subtitles/
      documents/
```

职责划分：

| 文件 | 保存内容 |
| --- | --- |
| `projects.json` | 项目基础信息和 11 步正式数据 |
| `generation_tasks.json` | AI 生成任务状态、输入、输出、错误 |
| `assets.json` | 素材引用、路径、元数据 |
| `assets/{project_id}/...` | 实际图片、视频、音频、字幕、文档文件 |

这样可以避免项目详情文件承载所有生成过程和大素材索引。

## 未来迁移数据库和对象存储阶段计划

### 阶段 0：当前本地 JSON

目标：

- 保持现有开发速度。
- 兼容旧项目。
- 完成 11 步模型设计和页面落地。

措施：

- 补默认值。
- schema_version。
- 备份和原子写入。
- 大素材只存引用。

### 阶段 1：JSON 拆分

目标：

- 降低 `projects.json` 体积。
- 将生成任务和素材索引独立出来。

措施：

- 新增 `generation_tasks.json`。
- 新增 `assets.json`。
- 项目步骤只保存正式采纳的任务 ID 或素材 ID。

### 阶段 2：数据库保存项目与步骤

目标：

- 支持更多项目、多人协作和查询。

建议表：

| 表 | 用途 |
| --- | --- |
| `projects` | 项目基础信息 |
| `project_steps` | 每个项目每个步骤的数据 JSON |
| `generation_tasks` | AI 生成任务 |
| `assets` | 素材索引和元数据 |
| `asset_links` | 素材与步骤、镜头、任务的关系 |
| `project_versions` | 项目和步骤版本记录 |

迁移方式：

- 写迁移脚本读取 `projects.json`。
- 每个项目写入 `projects`。
- 11 步数据拆入 `project_steps`。
- 素材索引写入 `assets`。
- 保留旧 JSON 只读备份。

### 阶段 3：对象存储保存大素材

目标：

- 让图片、视频、音频、字幕可扩展、安全访问。

措施：

- 本地文件上传到对象存储。
- `assets` 表新增 `storage_provider`、`bucket`、`object_key`、`checksum`。
- 前端读取优先使用签名 URL 或内部代理 URL。
- 旧 `local_path` 保留为回滚字段。

### 阶段 4：异步任务队列

目标：

- 支持长耗时 AI 生成任务、重试、取消、进度追踪。

措施：

- API 创建任务后返回 `queued`。
- Worker 执行任务并更新状态。
- 成功后写入资产表。
- 用户采纳后再写入步骤正式数据。

## 风险清单

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| 旧 JSON 缺少新增步骤字段 | 项目读取失败 | 所有新增字段提供默认值 |
| 旧 stepId 不在新枚举中 | Pydantic 校验失败 | 保留并扩展 `LEGACY_STEP_MAP` |
| 保存时丢失未知字段 | 未来版本数据被旧服务破坏 | merge 原始未知字段或高版本只读 |
| 写入中断导致 JSON 损坏 | 所有项目不可读 | 备份、临时文件、原子替换、回滚 |
| 多进程同时写 JSON | 后写覆盖先写 | 本地文件锁或迁移数据库 |
| 大素材写入 JSON | 文件膨胀、保存慢、损坏风险高 | 只存资产引用 |
| 备份无限增长 | 占满磁盘 | 限制备份数量和大小 |
| 自动迁移误改所有项目 | 难以回滚 | 采用读取补齐、保存时自然升级 |
| 高版本字段被低版本服务覆盖 | 数据降级丢失 | schema_version 高于支持版本时限制写入 |
| 回滚失败 | 数据状态不确定 | 保留 `.tmp`、`.bak` 并输出明确错误 |

## 人工验收清单

| 编号 | 验收项 | 通过标准 |
| --- | --- | --- |
| MIG-001 | 旧 2 步项目可打开 | 缺少 `step_three` 到 `step_eleven` 时仍能读取项目详情 |
| MIG-002 | 旧项目保存后不丢 `step_one`、`step_two` | 保存任一步后，原有故事和剧本数据仍存在 |
| MIG-003 | 新 11 步项目可保存 | 11 步默认对象存在，保存目标步骤不影响其他步骤 |
| MIG-004 | 旧 stepId 可映射 | 老项目 `topic-planning` 等 stepId 不导致崩溃 |
| MIG-005 | 未知字段不被误删 | 手动加入未知字段后，保存目标步骤不会清空该字段 |
| MIG-006 | 写入前有备份 | 保存项目后能看到最近备份或可验证备份流程 |
| MIG-007 | 临时文件校验失败不覆盖正式文件 | 构造非法 tmp 时正式 `projects.json` 仍可读 |
| MIG-008 | 写入失败可回滚 | 模拟替换失败后项目数据仍保持旧版本 |
| MIG-009 | 大素材不进入 `projects.json` | 图片、视频、音频只保存 `asset_id` 或路径引用 |
| MIG-010 | 未来迁移路径清晰 | 数据库表和对象存储字段能覆盖当前 JSON 字段 |

## 实施顺序建议

1. 先为 `ProjectRecord` 增加 `schema_version` 和 11 步默认对象。
2. 保留并扩展旧 stepId 映射。
3. 增加读取补默认值的兼容层。
4. 增加写入前备份。
5. 增加临时文件写入和原子替换。
6. 增加写入失败回滚。
7. 将生成任务和素材索引拆出 `projects.json`。
8. 等 11 步数据稳定后迁移数据库和对象存储。

## 验收对应

- 2 步扩展到 11 步兼容读取策略：见“兼容读取策略”。
- `schema_version`、默认值补齐、旧 stepId 映射、未知字段保留：见对应章节。
- 备份、临时文件、原子替换、失败回滚：见“`projects.json` 安全写入方案”。
- 大素材不能写入 JSON：见“大素材不能写入 JSON 的原因”。
- 未来数据库和对象存储迁移计划：见“未来迁移数据库和对象存储阶段计划”。
- 风险清单和人工验收清单：见“风险清单”和“人工验收清单”。
