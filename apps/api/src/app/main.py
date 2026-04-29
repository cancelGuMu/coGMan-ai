from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    CreateProjectRequest,
    GeneratedTextResponse,
    GenerationRequest,
    ProjectDetailResponse,
    ProjectDeleteResponse,
    ProjectListResponse,
    RenameProjectRequest,
    SaveStepFiveRequest,
    SaveStepFourRequest,
    SaveStepSixRequest,
    SaveStepOneRequest,
    SaveStepThreeRequest,
    SaveStepTwoRequest,
    UpdateProjectCoverRequest,
)
from .storage import (
    create_project,
    delete_project,
    get_project,
    list_projects,
    rename_project,
    save_step_one,
    save_step_three,
    save_step_four,
    save_step_five,
    save_step_six,
    save_step_two,
    update_project_cover,
)


MAX_IMPORT_BYTES = 8 * 1024 * 1024
MAX_IMPORT_TEXT_CHARS = 180_000
DASHBOARD_DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "dashboard.json"

DASHBOARD_FALLBACK = {
    "7d": {
        "range": "7d",
        "range_label": "最近七天",
        "metrics": [
            {"label": "播放量", "value": "2,345,678", "growth": "较上周 +18.6%"},
            {"label": "互动量", "value": "128,765", "growth": "较上周 +12.4%"},
            {"label": "涨粉量", "value": "23,456", "growth": "较上周 +24.8%"},
            {"label": "完播率", "value": "68.7%", "growth": "较上周 +6.3%"},
        ],
        "trend_title": "播放趋势",
        "trend_total": "近七天总播放量 2,345,678",
        "trend_peak_note": "06-20 峰值 320,456",
        "trend_yaxis": ["400K", "300K", "200K", "100K", "0"],
        "trend_points": [
            {"label": "06-14", "value": 210456, "display_value": "21.0万"},
            {"label": "06-16", "value": 266120, "display_value": "26.6万"},
            {"label": "06-18", "value": 302330, "display_value": "30.2万"},
            {"label": "06-20", "value": 320456, "display_value": "32.0万"},
            {"label": "06-22", "value": 284920, "display_value": "28.5万"},
            {"label": "06-24", "value": 305840, "display_value": "30.6万"},
            {"label": "06-26", "value": 655556, "display_value": "65.6万"},
        ],
        "trend_area_path": "",
        "trend_line_path": "",
        "trend_highlight": {"label": "06-20", "value": "320,456", "cx": 362, "cy": 92},
        "trend_xaxis": ["06-14", "06-16", "06-18", "06-20", "06-22", "06-24", "06-26"],
        "traffic_sources": [
            {"label": "推荐页", "value": "60%", "numeric_value": 60},
            {"label": "关注页", "value": "20%", "numeric_value": 20},
            {"label": "搜索", "value": "10%", "numeric_value": 10},
            {"label": "其他", "value": "10%", "numeric_value": 10},
        ],
        "top_works": [
            {"order": "1", "title": "都市异能：觉醒之城", "value": "120.3 万", "width": 100},
            {"order": "2", "title": "古风武侠：剑雨苍穹", "value": "96.6 万", "width": 80},
            {"order": "3", "title": "未来纪元：星际追航", "value": "76.4 万", "width": 63},
            {"order": "4", "title": "异世界之门", "value": "54.7 万", "width": 45},
            {"order": "5", "title": "爱在次元站", "value": "42.1 万", "width": 35},
        ],
        "distribution_rows": [
            {"platform": "抖音", "plays": "1,234,567", "interactions": "80,456", "completion_rate": "70.3%"},
            {"platform": "快手", "plays": "567,890", "interactions": "30,231", "completion_rate": "65.2%"},
            {"platform": "B站", "plays": "345,678", "interactions": "15,678", "completion_rate": "72.1%"},
            {"platform": "视频号", "plays": "197,543", "interactions": "9,876", "completion_rate": "68.9%"},
        ],
    }
}


app = FastAPI(title="coGMan-ai API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _clip_text(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit]


def _read_dashboard_data() -> dict:
    if DASHBOARD_DATA_FILE.exists():
        try:
            raw = DASHBOARD_DATA_FILE.read_text(encoding="utf-8")
            data = __import__("json").loads(raw)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {"ranges": DASHBOARD_FALLBACK}


def _dashboard_overview(range_key: str) -> dict:
    data = _read_dashboard_data()
    ranges = data.get("ranges", data)
    overview = ranges.get(range_key) or DASHBOARD_FALLBACK.get(range_key)
    if overview is None:
        raise HTTPException(status_code=404, detail="dashboard range not found")
    return dict(overview)


def _dashboard_range(range: str) -> str:
    return range if range in {"24h", "7d", "30d", "all"} else "7d"


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "time": datetime.now().isoformat()}


@app.get("/api/projects", response_model=ProjectListResponse)
def api_list_projects() -> ProjectListResponse:
    return ProjectListResponse(projects=list_projects())


@app.get("/api/dashboard/overview")
def api_dashboard_overview(range: str = "7d") -> dict:
    return {"overview": _dashboard_overview(_dashboard_range(range))}


@app.put("/api/dashboard/overview")
def api_update_dashboard_overview(payload: dict) -> dict:
    range_key = _dashboard_range(str(payload.get("range", "7d")))
    overview = dict(payload)
    overview["range"] = range_key
    data = _read_dashboard_data()
    ranges = data.get("ranges") if isinstance(data.get("ranges"), dict) else {}
    ranges[range_key] = overview
    DASHBOARD_DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DASHBOARD_DATA_FILE.write_text(
        __import__("json").dumps({"ranges": ranges}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {"overview": overview}


@app.get("/api/dashboard/metrics")
def api_dashboard_metrics(range: str = "7d") -> dict:
    return {"metrics": _dashboard_overview(_dashboard_range(range)).get("metrics", [])}


@app.get("/api/dashboard/trend")
def api_dashboard_trend(range: str = "7d") -> dict:
    overview = _dashboard_overview(_dashboard_range(range))
    return {
        "trend_title": overview.get("trend_title", "播放趋势"),
        "trend_total": overview.get("trend_total", ""),
        "trend_peak_note": overview.get("trend_peak_note", ""),
        "trend_yaxis": overview.get("trend_yaxis", []),
        "trend_points": overview.get("trend_points", []),
    }


@app.get("/api/dashboard/traffic-sources")
def api_dashboard_traffic_sources(range: str = "7d") -> dict:
    return {"traffic_sources": _dashboard_overview(_dashboard_range(range)).get("traffic_sources", [])}


@app.get("/api/dashboard/top-works")
def api_dashboard_top_works(range: str = "7d") -> dict:
    return {"top_works": _dashboard_overview(_dashboard_range(range)).get("top_works", [])}


@app.get("/api/dashboard/distribution")
def api_dashboard_distribution(range: str = "7d") -> dict:
    return {"distribution_rows": _dashboard_overview(_dashboard_range(range)).get("distribution_rows", [])}


@app.post("/api/projects", response_model=ProjectDetailResponse)
def api_create_project(payload: CreateProjectRequest) -> ProjectDetailResponse:
    return ProjectDetailResponse(project=create_project(payload))


@app.get("/api/projects/{project_id}", response_model=ProjectDetailResponse)
def api_get_project(project_id: str) -> ProjectDetailResponse:
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}", response_model=ProjectDetailResponse)
def api_rename_project(project_id: str, payload: RenameProjectRequest) -> ProjectDetailResponse:
    project = rename_project(project_id, payload.name)
    if project is None:
        raise HTTPException(status_code=404, detail="\u9879\u76ee\u4e0d\u5b58\u5728")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}/cover", response_model=ProjectDetailResponse)
def api_update_project_cover(project_id: str, payload: UpdateProjectCoverRequest) -> ProjectDetailResponse:
    project = update_project_cover(project_id, payload.cover_image_url)
    if project is None:
        raise HTTPException(status_code=404, detail="\u9879\u76ee\u4e0d\u5b58\u5728")
    return ProjectDetailResponse(project=project)


@app.delete("/api/projects/{project_id}", response_model=ProjectDeleteResponse)
def api_delete_project(project_id: str) -> ProjectDeleteResponse:
    deleted = delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="\u9879\u76ee\u4e0d\u5b58\u5728")
    return ProjectDeleteResponse()


@app.put("/api/projects/{project_id}/step-one", response_model=ProjectDetailResponse)
def api_save_step_one(project_id: str, payload: SaveStepOneRequest) -> ProjectDetailResponse:
    project = save_step_one(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}/step-two", response_model=ProjectDetailResponse)
def api_save_step_two(project_id: str, payload: SaveStepTwoRequest) -> ProjectDetailResponse:
    project = save_step_two(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}/step-three", response_model=ProjectDetailResponse)
def api_save_step_three(project_id: str, payload: SaveStepThreeRequest) -> ProjectDetailResponse:
    project = save_step_three(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}/step-four", response_model=ProjectDetailResponse)
def api_save_step_four(project_id: str, payload: SaveStepFourRequest) -> ProjectDetailResponse:
    project = save_step_four(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}/step-five", response_model=ProjectDetailResponse)
def api_save_step_five(project_id: str, payload: SaveStepFiveRequest) -> ProjectDetailResponse:
    project = save_step_five(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}/step-six", response_model=ProjectDetailResponse)
def api_save_step_six(project_id: str, payload: SaveStepSixRequest) -> ProjectDetailResponse:
    project = save_step_six(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.post("/api/generate/step-one-season-outline", response_model=GeneratedTextResponse)
def generate_step_one_outline(payload: GenerationRequest) -> GeneratedTextResponse:
    base_story = payload.prompt.strip() or "一个从微光中成长的主角，踏上对抗命运的旅程。"
    content = (
        "第1集：主角在危机中觉醒，发现故事核心冲突。\n"
        "第2集：关系线展开，初次行动遭遇反噬。\n"
        "第3集：反派视角露出，钩出更大的世界观。\n\n"
        f"核心故事基调：{base_story}"
    )
    return GeneratedTextResponse(content=content, record="AI 生成季纲草案")


@app.post("/api/generate/step-two", response_model=GeneratedTextResponse)
def generate_step_two(payload: GenerationRequest) -> GeneratedTextResponse:
    prompt = payload.prompt.strip() or "围绕主角突破、冲突升级和结尾反转展开。"
    mapping = {
        "reference": "参考文本方向：强化人物动机、升级情绪张力，并保持每一幕都有明确推动力。",
        "novel": "小说正文样稿：夜色压低天幕，主角站在旧城楼顶，第一次意识到自己并不只是故事的旁观者。",
        "roles": "角色画像：主角克制冷静但内心执拗，反派优雅克制且行动果决，辅助角色嘴硬心软。",
        "terms": "术语库：源光、觉醒层级、星域协议、记忆锚点、镜界回廊。",
        "guidance": "写作指导：每段对话尽量推动剧情或刻画关系，避免解释性独白过长。",
        "script": "【场景一】天台夜风。\n主角望向远处光塔，低声说：'如果答案在那，我就自己去拿。'\n【场景二】警报响起，第一轮冲突爆发。",
        "check": "一致性检查结果：角色动机基本统一，第二场景转场略快，建议补一段情绪承接。",
    }
    content = mapping.get(payload.mode, "AI 已根据你的输入生成内容。") + f"\n\n补充提示：{prompt}"
    label = {
        "reference": "AI 生成参考文本",
        "novel": "AI 生成小说正文",
        "roles": "AI 生成角色画像",
        "terms": "AI 生成术语库",
        "guidance": "AI 生成写作指导",
        "script": "AI 生成剧本",
        "check": "AI 完成一致性检查",
    }.get(payload.mode, "AI 生成内容")
    return GeneratedTextResponse(content=content, record=label)


@app.post("/api/import/text")
async def import_text_file(file: UploadFile = File(...)) -> dict[str, str]:
    raw = await file.read()
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="导入文件过大，请控制在 2MB 以内")
    text = raw.decode("utf-8", errors="ignore")
    filename = Path(file.filename or "uploaded.txt").name
    return {"filename": filename[:255], "content": _clip_text(text, MAX_IMPORT_TEXT_CHARS)}
