# coGMan-ai

`coGMan-ai` 当前已搭建为可本地运行的前后端分离项目：

- 前端：`React + Vite`
- 后端：`FastAPI`
- 当前已完成：
  - 展示页 Hero Page
  - 项目工作台入口
  - 步骤一：选题策划
  - 步骤二：剧本创作
  - 项目创建、保存、回显
  - 文件导入（文本读取）
  - 本地 JSON 持久化

## 目录

- 前端：`apps/web`
- 后端：`apps/api`
- 参考素材：`assets/references`
- 审核记录目录：`review`

## 启动方式

### 一键启动

直接双击：

```cmd
start-dev.cmd
```

或在命令行运行：

```cmd
start-dev.cmd
```

脚本会自动打开两个 `cmd` 窗口：

- 一个运行 FastAPI 后端
- 一个运行 Vite 前端

### 1. 启动后端

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir src --host 127.0.0.1 --port 8000
```

### 2. 启动前端

```powershell
cd apps/web
npm run dev
```

### 3. 访问

- 前端：`http://127.0.0.1:3000`
- 后端健康检查：`http://127.0.0.1:8000/healthz`

## 当前后端数据文件

- 项目数据：`apps/api/data/projects.json`

## 当前说明

- 步骤三到步骤九目前只保留工作流占位入口。
- 当前后端使用本地 JSON 存储，后续可平滑替换为 PostgreSQL。
- 目前 AI 功能为本地模拟生成接口，便于你先跑通产品链路和页面交互。
