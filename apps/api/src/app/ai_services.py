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
        f"{base_url}/chat/completions",
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

    base_url = _env("IMAGE_GENERATION_BASE_URL", "https://tokhub.ai").rstrip("/")
    model = _env("IMAGE_GENERATION_MODEL", "gpt-image-2")
    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": _env("IMAGE_GENERATION_SIZE", "1024x1024"),
        "quality": _env("IMAGE_GENERATION_QUALITY", "medium"),
    }
    data = _post_json(
        f"{base_url}/v1/images/generations",
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
        "provider": "TokHub / NewAPI",
        "metadata": f"{shot_label or '未命名镜头'}；{model}；{data.get('created', '')}",
    }


def create_minimax_video(prompt: str, first_frame_image: str | None = None, duration: int = 6) -> dict[str, str]:
    api_key = _env("MINIMAX_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 MINIMAX_API_KEY")

    model = _env("MINIMAX_VIDEO_MODEL", "MiniMax-Hailuo-2.3")
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
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
