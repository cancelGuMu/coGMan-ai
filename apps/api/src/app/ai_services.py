from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .prompt_registry import build_text_messages


class AIServiceError(RuntimeError):
    pass


IMAGE_GENERATION_CONSTRAINTS = """coMGan-ai 图片生成硬约束：
1. 严格执行传入的角色、场景、道具、构图、风格和锁定词，不自行改名、换服装或换场景。
2. 不在画面中生成字幕、水印、乱码文字、界面元素或说明文字。
3. 资产设定图必须清晰展示外貌/服装/结构；镜头图必须服务对应 shot_id 的画面目标。
4. 遇到输入缺少信息时，用保守、可追溯的视觉补全，不引入与项目无关的新设定。
5. 输出必须是可用于 coMGan-ai 工作台候选图/关键帧/资产图回显的单张图像。"""


VIDEO_GENERATION_CONSTRAINTS = """coMGan-ai 视频生成硬约束：
1. 严格继承输入首帧、镜头提示词、角色服装、场景、道具和镜头时长，不漂移到新剧情。
2. 动作、表情和运镜只围绕当前 shot_id 的分镜目标展开，不新增角色、不改结局。
3. 不生成字幕、水印、界面元素或不可控文字。
4. 若提示中包含失败原因或重生成策略，只修复该问题，保留原镜头可用部分。
5. 输出必须是可回填到 coMGan-ai 工作台候选视频/最终视频字段的视频任务。"""


def build_image_generation_prompt(prompt: str, shot_label: str = "") -> str:
    label = shot_label.strip() or "未命名镜头/资产"
    return f"{IMAGE_GENERATION_CONSTRAINTS}\n\n目标位置：step_six.candidates 或 step_three 资产图字段。\n镜头/资产标签：{label}\n\n用户/上游提示词：\n{prompt.strip()}"


def build_video_generation_prompt(prompt: str, shot_label: str = "") -> str:
    label = shot_label.strip() or "未命名镜头"
    return f"{VIDEO_GENERATION_CONSTRAINTS}\n\n目标位置：step_eight.clips。\n镜头标签：{label}\n\n用户/上游提示词：\n{prompt.strip()}"


def load_env_files() -> None:
    roots = [
        Path(__file__).resolve().parents[2],
        Path(__file__).resolve().parents[4],
        Path.cwd(),
    ]
    for root in roots:
        env_file = root / ".env"
        if not env_file.exists():
            continue
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _api_url(base_url: str, path: str) -> str:
    normalized_base = base_url.rstrip("/")
    normalized_path = path if path.startswith("/") else f"/{path}"
    if normalized_base.endswith("/v1") and normalized_path.startswith("/v1/"):
        normalized_path = normalized_path[3:]
    return f"{normalized_base}{normalized_path}"


def _post_json(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int = 120) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise AIServiceError(f"AI 接口请求失败：HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise AIServiceError(f"AI 接口连接失败：{exc.reason}") from exc
    except TimeoutError as exc:
        raise AIServiceError("AI 接口请求超时") from exc


def _get_json(url: str, headers: dict[str, str], timeout: int = 60) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise AIServiceError(f"AI 接口请求失败：HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise AIServiceError(f"AI 接口连接失败：{exc.reason}") from exc


def generate_deepseek_text(project_name: str, prompt: str, mode: str, task_id: str | None = None) -> str:
    api_key = _env("DEEPSEEK_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 DEEPSEEK_API_KEY")

    base_url = _env("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = _env("DEEPSEEK_TEXT_MODEL", "deepseek-v4-pro")
    payload = {
        "model": model,
        "messages": build_text_messages(project_name, prompt, mode, task_id),
        "stream": False,
        "reasoning_effort": _env("DEEPSEEK_REASONING_EFFORT", "high"),
        "thinking": {"type": _env("DEEPSEEK_THINKING", "enabled")},
    }
    data = _post_json(
        _api_url(base_url, "/chat/completions"),
        payload,
        {"Authorization": f"Bearer {api_key}"},
        timeout=180,
    )
    choices = data.get("choices") or []
    if not choices:
        raise AIServiceError("DeepSeek 未返回候选内容")
    content = (choices[0].get("message") or {}).get("content")
    if not isinstance(content, str) or not content.strip():
        raise AIServiceError("DeepSeek 返回内容为空")
    return content.strip()


def generate_image(prompt: str, shot_label: str = "") -> dict[str, str]:
    api_key = _env("IMAGE_GENERATION_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 IMAGE_GENERATION_API_KEY")

    base_url = _env("IMAGE_GENERATION_BASE_URL", "https://www.aiartmirror.com").rstrip("/")
    model = _env("IMAGE_GENERATION_MODEL", "gpt-image-2")
    payload = {
        "model": model,
        "prompt": build_image_generation_prompt(prompt, shot_label),
        "n": 1,
        "size": _env("IMAGE_GENERATION_SIZE", "1024x1024"),
        "quality": _env("IMAGE_GENERATION_QUALITY", "medium"),
    }
    data = _post_json(
        _api_url(base_url, "/v1/images/generations"),
        payload,
        {"Authorization": f"Bearer {api_key}"},
        timeout=240,
    )
    items = data.get("data") or []
    if not items:
        raise AIServiceError("图片生成接口未返回图片")
    first = items[0]
    if first.get("url"):
        url = str(first["url"])
    elif first.get("b64_json"):
        url = f"data:image/png;base64,{first['b64_json']}"
    else:
        raise AIServiceError("图片生成接口返回格式缺少 url/b64_json")
    return {
        "url": url,
        "model": model,
        "provider": "AIArtMirror / NewAPI",
        "metadata": f"{shot_label or '未命名镜头'}；{model}；{data.get('created', '')}",
    }


def create_minimax_video(prompt: str, first_frame_image: str | None = None, duration: int = 6, shot_label: str = "") -> dict[str, str]:
    api_key = _env("MINIMAX_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 MINIMAX_API_KEY")

    model = _env("MINIMAX_VIDEO_MODEL", "MiniMax-Hailuo-2.3")
    payload: dict[str, Any] = {
        "model": model,
        "prompt": build_video_generation_prompt(prompt, shot_label),
        "duration": duration,
        "resolution": _env("MINIMAX_VIDEO_RESOLUTION", "1080P"),
    }
    if first_frame_image and first_frame_image.startswith(("http://", "https://")):
        payload["first_frame_image"] = first_frame_image

    data = _post_json(
        "https://api.minimax.io/v1/video_generation",
        payload,
        {"Authorization": f"Bearer {api_key}"},
        timeout=120,
    )
    task_id = data.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        raise AIServiceError(f"MiniMax 未返回 task_id：{json.dumps(data, ensure_ascii=False)}")
    return {
        "task_id": task_id,
        "model": model,
        "provider": "MiniMax",
        "status": "submitted",
    }


def query_minimax_video(task_id: str) -> dict[str, Any]:
    api_key = _env("MINIMAX_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 MINIMAX_API_KEY")
    data = _get_json(
        f"https://api.minimax.io/v1/query/video_generation?task_id={task_id}",
        {"Authorization": f"Bearer {api_key}"},
    )
    return data


def retrieve_minimax_file(file_id: str) -> dict[str, Any]:
    api_key = _env("MINIMAX_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 MINIMAX_API_KEY")
    data = _get_json(
        f"https://api.minimax.io/v1/files/retrieve?file_id={file_id}",
        {"Authorization": f"Bearer {api_key}"},
    )
    return data


def bytes_to_data_url(raw: bytes, mime_type: str = "application/octet-stream") -> str:
    return f"data:{mime_type};base64,{base64.b64encode(raw).decode('ascii')}"


load_env_files()
