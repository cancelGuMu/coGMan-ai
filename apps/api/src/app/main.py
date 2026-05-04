from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
import os
from pathlib import Path
import re
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    CreateProjectRequest,
    GeneratedImageResponse,
    GeneratedTextResponse,
    GeneratedVideoResponse,
    GenerationRequest,
    ImageGenerationRequest,
    ProjectDetailResponse,
    ProjectDeleteResponse,
    ProjectListResponse,
    RenameProjectRequest,
    SaveStepEightRequest,
    SaveStepElevenRequest,
    SaveStepFiveRequest,
    SaveStepFourRequest,
    SaveStepNineRequest,
    SaveStepSixRequest,
    SaveStepTenRequest,
    SaveStepOneRequest,
    SaveStepThreeRequest,
    SaveStepTwoRequest,
    UpdateProjectCoverRequest,
    VideoGenerationRequest,
    VideoTaskStatusResponse,
)
from .ai_services import (
    AIServiceError,
    create_minimax_video,
    generate_deepseek_text,
    generate_image,
    normalize_minimax_video_task,
    query_minimax_video,
    retrieve_minimax_file,
)
from .context_builder import (
    ContextValidationError,
    build_fallback_context_prompt,
    build_task_context_prompt,
    validate_ai_output,
)
from .prompt_registry import describe_prompt_registry, get_prompt_task, validate_prompt_registry
from .storage import (
    create_project,
    delete_project,
    get_project,
    list_projects,
    rename_project,
    save_step_one,
    save_step_eight,
    save_step_eleven,
    save_step_four,
    save_step_five,
    save_step_nine,
    save_step_six,
    save_step_ten,
    save_step_three,
    save_step_two,
    update_project_cover,
)


MAX_IMPORT_BYTES = 8 * 1024 * 1024
MAX_IMPORT_TEXT_CHARS = 180_000
DASHBOARD_DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "dashboard.json"
TEXT_IMPORT_SUFFIXES = {
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".csv",
    ".tsv",
    ".rtf",
    ".srt",
    ".vtt",
    ".log",
}
WORD_IMPORT_SUFFIXES = {".docx"}
UNSUPPORTED_BINARY_IMPORT_SUFFIXES = {".doc", ".pdf", ".xlsx", ".xls", ".pptx", ".ppt"}


@dataclass(frozen=True)
class ImportedText:
    content: str
    parse_status: str

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
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _clip_text(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit]


def _normalize_import_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _decode_text_file(raw: bytes) -> ImportedText:
    for encoding in ("utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "gb18030", "big5", "latin-1"):
        try:
            text = raw.decode(encoding)
        except UnicodeDecodeError:
            continue
        normalized = _normalize_import_text(text)
        if normalized:
            return ImportedText(normalized, f"text/{encoding}")
    return ImportedText("", "text/empty")


def _rtf_to_plain_text(text: str) -> str:
    text = re.sub(r"{\\[^{}]+}|[{}]", " ", text)
    text = re.sub(r"\\'[0-9a-fA-F]{2}", " ", text)
    text = re.sub(r"\\[a-zA-Z]+-?\d* ?", " ", text)
    text = text.replace("\\par", "\n").replace("\\tab", "\t")
    return _normalize_import_text(text)


def _docx_xml_to_text(xml_bytes: bytes) -> str:
    namespace = {
        "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    }
    root = ElementTree.fromstring(xml_bytes)
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        parts: list[str] = []
        for node in paragraph.iter():
            tag = node.tag.rsplit("}", 1)[-1]
            if tag in {"t", "delText", "instrText"} and node.text:
                parts.append(node.text)
            elif tag == "tab":
                parts.append("\t")
            elif tag in {"br", "cr"}:
                parts.append("\n")
        line = "".join(parts).strip()
        if line:
            paragraphs.append(line)
    return "\n".join(paragraphs)


def _extract_docx_text(raw: bytes) -> ImportedText:
    try:
        with ZipFile(BytesIO(raw)) as archive:
            document_names = [
                "word/document.xml",
                *sorted(name for name in archive.namelist() if name.startswith("word/header") and name.endswith(".xml")),
                *sorted(name for name in archive.namelist() if name.startswith("word/footer") and name.endswith(".xml")),
            ]
            chunks = [_docx_xml_to_text(archive.read(name)) for name in document_names if name in archive.namelist()]
    except (BadZipFile, ElementTree.ParseError, KeyError) as exc:
        raise HTTPException(status_code=400, detail="Word 文档解析失败，请确认文件是有效的 .docx 格式。") from exc

    text = _normalize_import_text("\n\n".join(chunk for chunk in chunks if chunk.strip()))
    if not text:
        raise HTTPException(status_code=400, detail="Word 文档中没有可导入的文本内容。")
    return ImportedText(text, "docx")


def _extract_import_text(filename: str, raw: bytes) -> ImportedText:
    suffix = Path(filename).suffix.lower()
    if suffix in WORD_IMPORT_SUFFIXES:
        return _extract_docx_text(raw)
    if suffix in TEXT_IMPORT_SUFFIXES or not suffix:
        decoded = _decode_text_file(raw)
        if suffix == ".rtf":
            return ImportedText(_rtf_to_plain_text(decoded.content), "rtf")
        return decoded
    if suffix in UNSUPPORTED_BINARY_IMPORT_SUFFIXES:
        raise HTTPException(status_code=415, detail=f"暂不支持 {suffix} 二进制文件导入，请先另存为 .docx、.txt 或 .md 后再上传。")
    decoded = _decode_text_file(raw)
    if decoded.content:
        return decoded
    raise HTTPException(status_code=415, detail="暂不支持该文件格式，请上传 .txt、.md、.json、.csv、.srt、.vtt、.rtf 或 .docx 文件。")


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


def _build_generation_prompt(payload: GenerationRequest, task) -> str:
    if payload.prompt.startswith("AI_CONTEXT_GATEWAY_V1"):
        return payload.prompt
    project = get_project(payload.project_id) if payload.project_id else None
    try:
        if project is not None:
            bundle = build_task_context_prompt(
                task,
                project,
                payload.prompt,
                payload.target_type,
                payload.target_id,
            )
        else:
            bundle = build_fallback_context_prompt(task, payload.project_name, payload.prompt)
    except ContextValidationError as exc:
        raise HTTPException(status_code=422, detail=f"AI 输入上下文不符合要求：{exc}") from exc
    return bundle.prompt


def _validate_generation_output(task_id: str, content: str) -> None:
    try:
        validate_ai_output(task_id, content)
    except ContextValidationError as exc:
        raise HTTPException(status_code=502, detail=f"AI 输出不符合契约：{exc}") from exc


def _generate_context_gateway_text(payload: GenerationRequest, task) -> GeneratedTextResponse:
    try:
        content = generate_deepseek_text(payload.project_name, payload.prompt, payload.mode, task.task_id)
    except AIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return GeneratedTextResponse(content=content, record=f"DeepSeek 完成 {task.task_id}")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "time": datetime.now().isoformat()}


@app.get("/api/ai-tools/diagnostics")
def api_ai_tools_diagnostics() -> dict:
    registry_issues = validate_prompt_registry()
    return {
        "prompt_registry": {
            **describe_prompt_registry(),
            "status": "ok" if not registry_issues else "needs_fix",
            "issues": registry_issues,
        },
        "providers": {
            "deepseek_text": {
                "configured": bool(os.environ.get("DEEPSEEK_API_KEY", "").strip()),
                "default_model": os.environ.get("DEEPSEEK_TEXT_MODEL", "deepseek-v4-pro"),
                "used_by": ["story-structure", "script-creation", "prompt-generation", "publish-review"],
            },
            "image_generation": {
                "configured": bool(os.environ.get("IMAGE_GENERATION_API_KEY", "").strip()),
                "default_model": os.environ.get("IMAGE_GENERATION_MODEL", "gpt-image-2"),
                "used_by": ["image-generation"],
            },
            "minimax_video": {
                "configured": bool(os.environ.get("MINIMAX_API_KEY", "").strip()),
                "default_model": os.environ.get("MINIMAX_VIDEO_MODEL", "MiniMax-Hailuo-2.3"),
                "used_by": ["video-generation", "audio-subtitle"],
            },
        },
    }


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


@app.put("/api/projects/{project_id}/step-eight", response_model=ProjectDetailResponse)
def api_save_step_eight(project_id: str, payload: SaveStepEightRequest) -> ProjectDetailResponse:
    project = save_step_eight(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}/step-nine", response_model=ProjectDetailResponse)
def api_save_step_nine(project_id: str, payload: SaveStepNineRequest) -> ProjectDetailResponse:
    project = save_step_nine(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}/step-ten", response_model=ProjectDetailResponse)
def api_save_step_ten(project_id: str, payload: SaveStepTenRequest) -> ProjectDetailResponse:
    project = save_step_ten(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.put("/api/projects/{project_id}/step-eleven", response_model=ProjectDetailResponse)
def api_save_step_eleven(project_id: str, payload: SaveStepElevenRequest) -> ProjectDetailResponse:
    project = save_step_eleven(project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(project=project)


@app.post("/api/generate/step-one-season-outline", response_model=GeneratedTextResponse)
def generate_step_one_outline(payload: GenerationRequest) -> GeneratedTextResponse:
    task = get_prompt_task(payload.task_id, payload.mode or "outline")
    prompt = (
        f"{task.user_instruction}\n"
        f"输出要求：{task.output_contract}\n\n"
        "硬性格式：最终回答必须以 { 开头、以 } 结尾，且可被 JSON.parse 直接解析。\n"
        "如果素材不足，也要基于已有信息补齐结构，不要输出任何解释性段落。\n\n"
        f"{payload.prompt}"
    )
    prompt = _build_generation_prompt(payload, task)
    try:
        content = generate_deepseek_text(payload.project_name, prompt, payload.mode or "outline", task.task_id)
    except AIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return GeneratedTextResponse(content=content, record="DeepSeek 生成季纲草案")
@app.post("/api/generate/step-two", response_model=GeneratedTextResponse)
def generate_step_two(payload: GenerationRequest) -> GeneratedTextResponse:
    task = get_prompt_task(payload.task_id, payload.mode)
    if payload.prompt.startswith("AI_CONTEXT_GATEWAY_V1"):
        try:
            content = generate_deepseek_text(payload.project_name, payload.prompt, payload.mode, task.task_id)
        except AIServiceError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        label = {
            "reference": "DeepSeek 生成参考文本",
            "novel": "DeepSeek 生成小说正文",
            "roles": "DeepSeek 生成角色画像",
            "terms": "DeepSeek 生成术语库",
            "guidance": "DeepSeek 生成写作指导",
            "script": "DeepSeek 生成剧本",
            "check": "DeepSeek 完成一致性检查",
        }.get(payload.mode, "DeepSeek 生成内容")
        return GeneratedTextResponse(content=content, record=label)
    prompt = f"{task.user_instruction}\n输出要求：{task.output_contract}\n\n{payload.prompt}"
    try:
        content = generate_deepseek_text(payload.project_name, prompt, payload.mode, task.task_id)
    except AIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    label = {
        "reference": "DeepSeek 生成参考文本",
        "novel": "DeepSeek 生成小说正文",
        "roles": "DeepSeek 生成角色画像",
        "terms": "DeepSeek 生成术语库",
        "guidance": "DeepSeek 生成写作指导",
        "script": "DeepSeek 生成剧本",
        "check": "DeepSeek 完成一致性检查",
    }.get(payload.mode, "DeepSeek 生成内容")
    return GeneratedTextResponse(content=content, record=label)


@app.post("/api/generate/text-task", response_model=GeneratedTextResponse)
def api_generate_text_task(payload: GenerationRequest) -> GeneratedTextResponse:
    task = get_prompt_task(payload.task_id, payload.mode)
    if payload.prompt.startswith("AI_CONTEXT_GATEWAY_V1"):
        return _generate_context_gateway_text(payload, task)
    prompt = (
        f"{task.user_instruction}\n"
        f"输出要求：{task.output_contract}\n\n"
        "硬性格式：最终回答必须以 { 开头、以 } 结尾，且可被 JSON.parse 直接解析。"
        "不要输出 Markdown、解释、寒暄或代码块。\n\n"
        f"{payload.prompt}"
    )
    try:
        content = generate_deepseek_text(payload.project_name, prompt, payload.mode, task.task_id)
    except AIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return GeneratedTextResponse(content=content, record=f"DeepSeek 完成 {task.task_id}")


@app.post("/api/generate/image", response_model=GeneratedImageResponse)
def api_generate_image(payload: ImageGenerationRequest) -> GeneratedImageResponse:
    try:
        result = generate_image(payload.prompt, payload.shot_label)
    except AIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return GeneratedImageResponse(
        url=result["url"],
        prompt=payload.prompt,
        provider=result["provider"],
        model=result["model"],
        metadata=result.get("metadata", ""),
    )


@app.post("/api/generate/video", response_model=GeneratedVideoResponse)
def api_generate_video(payload: VideoGenerationRequest) -> GeneratedVideoResponse:
    duration = min(max(payload.duration_seconds, 1), 10)
    try:
        result = create_minimax_video(payload.prompt, payload.source_image_url, duration, payload.shot_label)
    except AIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    metadata = f"{payload.shot_label or '未命名镜头'}；MiniMax 已提交任务；task_id={result['task_id']}"
    return GeneratedVideoResponse(
        task_id=result["task_id"],
        provider=result["provider"],
        model=result["model"],
        status=result["status"],
        metadata=metadata,
    )


@app.get("/api/generate/video/{task_id}", response_model=VideoTaskStatusResponse)
def api_get_video_task(task_id: str) -> VideoTaskStatusResponse:
    try:
        task = query_minimax_video(task_id)
        file_id = task.get("file_id")
        if isinstance(file_id, str) and file_id:
            try:
                task["file"] = retrieve_minimax_file(file_id)
            except AIServiceError as file_exc:
                task["file_error"] = str(file_exc)
    except AIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return VideoTaskStatusResponse(task=normalize_minimax_video_task(task))


@app.post("/api/import/text")
async def import_text_file(file: UploadFile = File(...)) -> dict[str, str | None]:
    raw = await file.read()
    filename = Path(file.filename or "uploaded.txt").name
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail=f"导入文件过大，请控制在 {MAX_IMPORT_BYTES // 1024 // 1024}MB 以内。")
    imported = _extract_import_text(filename, raw)
    return {
        "filename": filename[:255],
        "content": _clip_text(imported.content, MAX_IMPORT_TEXT_CHARS),
        "parse_status": imported.parse_status,
    }
