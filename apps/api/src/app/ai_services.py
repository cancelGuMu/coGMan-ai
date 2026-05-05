from __future__ import annotations

import base64
import json
import os
import http.client
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .context_builder import ContextValidationError, validate_ai_output
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


def resolve_image_size(prompt: str, shot_label: str = "") -> str:
    configured = os.environ.get("IMAGE_GENERATION_SIZE", "auto").strip()
    combined = f"{shot_label}\n{prompt}"
    wide_markers = ("三视图", "正面、侧面、背面", "正面、侧面、背面并排", "横版构图", "场景概念图", "空间结构")
    vertical_markers = ("竖版", "封面", "海报", "portrait", "vertical")
    square_markers = ("头像", "单个物件", "图标", "logo", "icon")
    if any(marker in combined for marker in wide_markers):
        return "1536x1024"
    if any(marker in combined for marker in vertical_markers):
        return "1024x1536"
    if any(marker in combined for marker in square_markers):
        return "1024x1024"
    return configured or "auto"


def _image_prompt_for_api(prompt: str, shot_label: str = "") -> str:
    prompt = prompt.strip()
    if _env("IMAGE_GENERATION_WRAP_PROMPT", "false").lower() in {"1", "true", "yes"}:
        return build_image_generation_prompt(prompt, shot_label)
    return prompt


def _compact_image_prompt(prompt: str, shot_label: str = "") -> str:
    combined = f"{shot_label}\n{prompt}".strip()
    if len(combined) > 420:
        combined = combined[:420]
    lower = combined.lower()
    if any(marker in combined for marker in ("三视图", "正面、侧面、背面", "正面、侧面、背面并排")) or "turnaround" in lower:
        return (
            "Character turnaround sheet, front view, side view, back view, "
            "same character, consistent outfit and hairstyle, clean white background, no text. "
            f"Reference details: {combined}"
        )
    if any(marker in combined for marker in ("场景概念图", "横版构图", "空间结构")):
        return (
            "Wide environment concept art, clear spatial layout, cinematic composition, no text. "
            f"Reference details: {combined}"
        )
    return combined


def _image_payload_candidates(prompt: str, shot_label: str, model: str) -> list[dict[str, Any]]:
    group = _env("IMAGE_GENERATION_GROUP")
    quality = _env("IMAGE_GENERATION_QUALITY", "auto") or "auto"
    primary_prompt = _image_prompt_for_api(prompt, shot_label)
    compact_prompt = _compact_image_prompt(prompt, shot_label)
    primary_size = resolve_image_size(prompt, shot_label)
    configured_size = _env("IMAGE_GENERATION_SIZE", "auto") or "auto"
    candidates: list[dict[str, Any]] = []

    def add(candidate_prompt: str, size: str) -> None:
        payload = {
            "model": model,
            "group": group,
            "prompt": candidate_prompt,
            "n": 1,
            "size": size,
            "quality": quality,
        }
        if payload not in candidates:
            candidates.append(payload)

    add(primary_prompt, primary_size)
    add(primary_prompt, configured_size)
    add(primary_prompt, "auto")
    add(compact_prompt, "auto")
    add(compact_prompt, "1024x1024")
    return candidates


def build_video_generation_prompt(prompt: str, shot_label: str = "") -> str:
    label = shot_label.strip() or "未命名镜头"
    return f"{VIDEO_GENERATION_CONSTRAINTS}\n\n目标位置：step_eight.clips。\n镜头标签：{label}\n\n用户/上游提示词：\n{prompt.strip()}"


def _clip_video_prompt_for_minimax(prompt: str, shot_label: str = "") -> str:
    full_prompt = build_video_generation_prompt(prompt, shot_label).strip()
    if len(full_prompt) <= 2_000:
        return full_prompt
    prefix = (
        "coMGan-ai video constraints: preserve the provided first frame, character identity, "
        "scene, props, shot intent, camera movement, no subtitles, no watermark, no new plot.\n"
    )
    remaining = max(200, 2_000 - len(prefix))
    return f"{prefix}{prompt.strip()[:remaining]}".strip()


def _is_minimax_supported_image(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith(("http://", "https://", "data:image/"))


def load_env_files(override: bool = False) -> None:
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
            normalized_key = key.strip()
            normalized_value = value.strip().strip('"').strip("'")
            if override or normalized_key not in os.environ:
                os.environ[normalized_key] = normalized_value


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _key_fingerprint(value: str) -> str:
    if len(value) <= 16:
        return f"len={len(value)}"
    return f"{value[:10]}...{value[-6:]} len={len(value)}"


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
    except (http.client.RemoteDisconnected, http.client.IncompleteRead) as exc:
        raise AIServiceError("AI image upstream response was interrupted") from exc
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
    content = content.strip()
    if task_id:
        try:
            validate_ai_output(task_id, content)
        except ContextValidationError as exc:
            raise AIServiceError(f"DeepSeek 输出不符合任务契约：{exc}") from exc
    return content


def generate_image(prompt: str, shot_label: str = "") -> dict[str, str]:
    api_key = _env("IMAGE_GENERATION_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 IMAGE_GENERATION_API_KEY")

    base_url = _env("IMAGE_GENERATION_BASE_URL", "https://www.aiartmirror.com").rstrip("/")
    model = _env("IMAGE_GENERATION_MODEL", "gpt-image-2")
    errors: list[str] = []
    data: dict[str, Any] | None = None
    for payload in _image_payload_candidates(prompt, shot_label, model):
        try:
            data = _post_json(
                _api_url(base_url, "/v1/images/generations"),
                payload,
                {"Authorization": f"Bearer {api_key}"},
                timeout=600,
            )
            break
        except AIServiceError as exc:
            errors.append(str(exc))
    if data is None:
        detail = "；".join(errors[-2:]) if errors else "unknown"
        raise AIServiceError(f"Image generation failed after retries: {detail}")
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
    load_env_files(override=True)
    api_key = _env("MINIMAX_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 MINIMAX_API_KEY")

    base_url = _env("MINIMAX_BASE_URL", "https://api.minimaxi.com")
    model = _env("MINIMAX_VIDEO_MODEL", "MiniMax-Hailuo-2.3")
    payload: dict[str, Any] = {
        "model": model,
        "prompt": _clip_video_prompt_for_minimax(prompt, shot_label),
        "duration": duration,
        "resolution": _env("MINIMAX_VIDEO_RESOLUTION", "1080P"),
    }
    if _is_minimax_supported_image(first_frame_image):
        payload["first_frame_image"] = first_frame_image

    data = _post_json(
        _api_url(base_url, "/v1/video_generation"),
        payload,
        {"Authorization": f"Bearer {api_key}"},
        timeout=120,
    )
    task_id = data.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        raise AIServiceError(
            "MiniMax 未返回 task_id："
            f"{json.dumps(data, ensure_ascii=False)}；"
            f"base_url={base_url}；model={model}；key={_key_fingerprint(api_key)}"
        )
    return {
        "task_id": task_id,
        "model": model,
        "provider": "MiniMax",
        "status": "submitted",
    }


def query_minimax_video(task_id: str) -> dict[str, Any]:
    load_env_files(override=True)
    api_key = _env("MINIMAX_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 MINIMAX_API_KEY")
    base_url = _env("MINIMAX_BASE_URL", "https://api.minimaxi.com")
    data = _get_json(
        _api_url(base_url, f"/v1/query/video_generation?task_id={task_id}"),
        {"Authorization": f"Bearer {api_key}"},
    )
    return data


def retrieve_minimax_file(file_id: str) -> dict[str, Any]:
    load_env_files(override=True)
    api_key = _env("MINIMAX_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 MINIMAX_API_KEY")
    base_url = _env("MINIMAX_BASE_URL", "https://api.minimaxi.com")
    data = _get_json(
        _api_url(base_url, f"/v1/files/retrieve?file_id={file_id}"),
        {"Authorization": f"Bearer {api_key}"},
    )
    return data


def create_minimax_speech(
    text: str,
    voice_id: str = "",
    speed: float = 1,
    vol: float = 1,
    pitch: int = 0,
) -> dict[str, str]:
    load_env_files(override=True)
    api_key = _env("MINIMAX_API_KEY")
    if not api_key:
        raise AIServiceError("缺少 MINIMAX_API_KEY")
    base_url = _env("MINIMAX_BASE_URL", "https://api.minimaxi.com")
    model = _env("MINIMAX_TTS_MODEL", "speech-02-hd")
    selected_voice = voice_id.strip() or _env("MINIMAX_TTS_VOICE_ID", "male-qn-qingse")
    payload = {
        "model": model,
        "text": text.strip(),
        "stream": False,
        "voice_setting": {
            "voice_id": selected_voice,
            "speed": max(0.5, min(2, speed)),
            "vol": max(0.1, min(10, vol)),
            "pitch": max(-12, min(12, pitch)),
        },
        "audio_setting": {
            "sample_rate": int(_env("MINIMAX_TTS_SAMPLE_RATE", "32000")),
            "bitrate": int(_env("MINIMAX_TTS_BITRATE", "128000")),
            "format": _env("MINIMAX_TTS_FORMAT", "mp3"),
            "channel": int(_env("MINIMAX_TTS_CHANNEL", "1")),
        },
    }
    data = _post_json(
        _api_url(base_url, "/v1/t2a_v2"),
        payload,
        {"Authorization": f"Bearer {api_key}"},
        timeout=120,
    )
    audio = data.get("audio")
    if isinstance(audio, dict):
        audio_value = audio.get("audio") or audio.get("data") or audio.get("url") or audio.get("download_url")
    else:
        audio_value = audio
    if not isinstance(audio_value, str) or not audio_value:
        raise AIServiceError(f"MiniMax TTS 未返回音频：{json.dumps(data, ensure_ascii=False)}")
    if audio_value.startswith(("http://", "https://", "data:")):
        audio_url = audio_value
    else:
        compact_audio = re.sub(r"\s+", "", audio_value)
        try:
            bytes.fromhex(compact_audio[:32])
            raw = bytes.fromhex(compact_audio)
            audio_url = bytes_to_data_url(raw, "audio/mpeg")
        except ValueError:
            audio_url = f"data:audio/mpeg;base64,{compact_audio}"
    trace_id = str(data.get("trace_id") or data.get("extra_info", {}).get("audio_length") or "")
    return {
        "url": audio_url,
        "model": model,
        "provider": "MiniMax",
        "voice_id": selected_voice,
        "metadata": f"voice_id={selected_voice}; trace={trace_id}; key={_key_fingerprint(api_key)}",
    }


def normalize_minimax_video_task(task: dict[str, Any]) -> dict[str, Any]:
    raw_status = str(task.get("status") or task.get("Status") or task.get("task_status") or "").strip()
    normalized_status = raw_status.lower()
    if normalized_status in {"preparing", "queueing", "processing"}:
        status = "processing"
    elif normalized_status == "success":
        status = "success"
    elif normalized_status == "fail":
        status = "failed"
    else:
        status = normalized_status or "unknown"

    file_payload = task.get("file")
    file_info = file_payload if isinstance(file_payload, dict) else {}
    nested_file = file_info.get("file")
    if isinstance(nested_file, dict):
        file_info = nested_file
    download_url = (
        file_info.get("download_url")
        or file_info.get("url")
        or task.get("video_url")
        or task.get("download_url")
    )
    error_message = (
        task.get("error_message")
        or task.get("error")
        or task.get("fail_reason")
        or task.get("message")
    )
    return {
        **task,
        "raw_status": raw_status,
        "normalized_status": status,
        "download_url": str(download_url) if download_url else "",
        "error_message": str(error_message) if error_message else "",
    }


def bytes_to_data_url(raw: bytes, mime_type: str = "application/octet-stream") -> str:
    return f"data:{mime_type};base64,{base64.b64encode(raw).decode('ascii')}"


load_env_files()
