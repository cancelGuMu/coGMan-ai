from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from .models import (
    AssetCharacter,
    CreateProjectRequest,
    EpisodeDraft,
    ProjectRecord,
    ProjectSummary,
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
    StepOneData,
)


ROOT = Path(__file__).resolve().parents[2]
DATA_FILE = ROOT / "data" / "projects.json"
LEGACY_STEP_MAP = {
    "topic-planning": "story-structure",
    "storyboard-design": "storyboard-planning",
    "character-image": "image-generation",
    "image-to-video": "video-generation",
    "quality-rework": "video-generation",
    "voice-subtitle": "audio-subtitle",
    "editing-export": "final-editing",
    "distribution": "publish-review",
    "data-review": "publish-review",
}


def _ensure_file() -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
      DATA_FILE.write_text('{"projects":[]}', encoding="utf-8")


def _read_records() -> list[ProjectRecord]:
    _ensure_file()
    raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    records = []
    for item in raw.get("projects", []):
        if item.get("current_step") in LEGACY_STEP_MAP:
            item = {**item, "current_step": LEGACY_STEP_MAP[item["current_step"]]}
        records.append(_clean_project_record(ProjectRecord.model_validate(item)))
    return records


def _write_records(records: list[ProjectRecord]) -> None:
    payload = {"projects": [record.model_dump(mode="json") for record in records]}
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _compact_asset_text(value: str) -> str:
    return "".join(ch for ch in value if ch not in " \n\r\t，。；;、:：,.")


def _has_asset_text(value: str) -> bool:
    text = value.strip()
    return bool(text) and text not in {"待补充", "未填写", "暂无", "无", "待定", "主要角色", "????", "??"}


def _character_issues(character: AssetCharacter) -> list[str]:
    issues: list[str] = []
    required = {
        "角色名": character.name,
        "定位": character.role,
        "年龄": character.age,
        "性格": character.personality,
        "外貌": character.appearance,
        "动机": character.motivation,
        "服装": character.outfit,
    }
    for label, value in required.items():
        if not _has_asset_text(value):
            issues.append(f"{label}缺失")
    field_hints = {
        "性格": (character.personality, ("穿", "外套", "胎记", "身形", "服装", "发型", "投毒")),
        "外貌": (character.appearance, ("动机", "目标", "案后", "消失", "可能", "调查", "投毒案", "定位")),
        "动机": (character.motivation, ("外套", "服装", "高瘦", "身形", "发型", "站姿", "穿")),
        "服装": (character.outfit, ("动机", "目标", "案件", "可能", "调查", "性格", "胎记")),
    }
    for label, (value, hints) in field_hints.items():
        if any(hint in value for hint in hints):
            issues.append(f"{label}串位")
    comparable = {
        "性格": _compact_asset_text(character.personality),
        "外貌": _compact_asset_text(character.appearance),
        "动机": _compact_asset_text(character.motivation),
        "服装": _compact_asset_text(character.outfit),
    }
    items = list(comparable.items())
    for index, (label, value) in enumerate(items):
        for other_label, other_value in items[index + 1:]:
            if len(value) > 16 and value == other_value:
                issues.append(f"{label}与{other_label}重复")
    return issues


def _clean_project_record(record: ProjectRecord) -> ProjectRecord:
    valid_characters = [character for character in record.step_three.characters if not _character_issues(character)]
    if len(valid_characters) == len(record.step_three.characters):
        return record
    note = "已拦截历史不合格角色卡：字段缺失、串位或重复。请重新使用 AI 补全生成。"
    return record.model_copy(
        update={
            "step_three": record.step_three.model_copy(
                update={
                    "characters": valid_characters,
                    "reference_notes": "\n".join(
                        item for item in [record.step_three.reference_notes.strip(), note] if item
                    ),
                }
            )
        }
    )


def list_projects() -> list[ProjectSummary]:
    records = _read_records()
    return [
        ProjectSummary(
            id=record.id,
            name=record.name,
            status=record.status,
            progress=record.progress,
            updated_at=record.updated_at,
            cover_style=record.cover_style,
            cover_image_url=record.cover_image_url,
        )
        for record in sorted(records, key=lambda item: item.updated_at, reverse=True)
    ]


def create_project(payload: CreateProjectRequest) -> ProjectRecord:
    records = _read_records()
    now = datetime.now()
    project = ProjectRecord(
        id=uuid4().hex,
        name=payload.name.strip(),
        created_at=now,
        updated_at=now,
        step_one=StepOneData(project_name=payload.name.strip(), linked_project=True),
    )
    records.append(project)
    _write_records(records)
    return project


def get_project(project_id: str) -> ProjectRecord | None:
    for record in _read_records():
        if record.id == project_id:
            return record
    return None


def rename_project(project_id: str, name: str) -> ProjectRecord | None:
    records = _read_records()
    target: ProjectRecord | None = None
    normalized_name = name.strip()
    for index, record in enumerate(records):
        if record.id != project_id:
            continue
        updated = record.model_copy(
            update={
                "name": normalized_name,
                "updated_at": datetime.now(),
                "step_one": record.step_one.model_copy(update={"project_name": normalized_name}),
                "step_two": record.step_two.model_copy(update={"project_name": normalized_name}),
            }
        )
        records[index] = updated
        target = updated
        break
    if target is not None:
        _write_records(records)
    return target


def update_project_cover(project_id: str, cover_image_url: str | None) -> ProjectRecord | None:
    records = _read_records()
    target: ProjectRecord | None = None
    normalized_url = cover_image_url.strip() if cover_image_url else None
    for index, record in enumerate(records):
        if record.id != project_id:
            continue
        updated = record.model_copy(
            update={
                "cover_image_url": normalized_url or None,
                "updated_at": datetime.now(),
            }
        )
        records[index] = updated
        target = updated
        break
    if target is not None:
        _write_records(records)
    return target


def delete_project(project_id: str) -> bool:
    records = _read_records()
    next_records = [record for record in records if record.id != project_id]
    if len(next_records) == len(records):
        return False
    _write_records(next_records)
    return True


def save_step_one(project_id: str, payload: SaveStepOneRequest) -> ProjectRecord | None:
    records = _read_records()
    target: ProjectRecord | None = None
    for index, record in enumerate(records):
        if record.id != project_id:
            continue
        incoming = payload.data
        episode_count = _resolve_episode_count(incoming.season_episode_count, incoming.custom_episode_count)
        episodes = _normalize_episodes(incoming.episodes, episode_count)
        content_done = sum(1 for item in episodes if item.content.strip())
        hook_done = sum(1 for item in episodes if item.hook.strip())
        progress = min(45, 10 + int((content_done + hook_done) / max(1, episode_count * 2) * 35))
        updated = record.model_copy(
            update={
                "name": incoming.project_name.strip() or record.name,
                "status": "故事架构中" if content_done < episode_count else "待剧本创作",
                "progress": progress,
                "updated_at": datetime.now(),
                "current_step": "story-structure" if content_done < episode_count else "script-creation",
                "step_one": incoming.model_copy(update={"linked_project": True, "episodes": episodes}),
            }
        )
        records[index] = updated
        target = updated
        break
    if target is not None:
        _write_records(records)
    return target


def save_step_two(project_id: str, payload: SaveStepTwoRequest) -> ProjectRecord | None:
    records = _read_records()
    target: ProjectRecord | None = None
    for index, record in enumerate(records):
        if record.id != project_id:
            continue
        incoming = payload.data
        script_ready = bool(incoming.script_text.strip())
        body_ready = min(100, int(len(incoming.novel_text.strip()) / 20))
        modification_records = incoming.modification_records or []
        if not modification_records:
            modification_records = ["人工初始化步骤二内容"]
        updated = record.model_copy(
            update={
                "name": incoming.project_name.strip() or record.name,
                "status": "剧本创作中" if not script_ready else "待资产设定",
                "progress": 55 if not script_ready else 72,
                "updated_at": datetime.now(),
                "current_step": "script-creation" if not script_ready else "asset-setting",
                "step_two": incoming.model_copy(
                    update={
                        "body_readiness": body_ready,
                        "script_status": "已生成" if script_ready else "未生成",
                        "modification_records": modification_records,
                    }
                ),
            }
        )
        records[index] = updated
        target = updated
        break
    if target is not None:
        _write_records(records)
    return target


def save_step_three(project_id: str, payload: SaveStepThreeRequest) -> ProjectRecord | None:
    return _save_step_data(project_id, "step_three", payload.data, "待分镜规划", 78, "storyboard-planning")


def save_step_four(project_id: str, payload: SaveStepFourRequest) -> ProjectRecord | None:
    return _save_step_data(project_id, "step_four", payload.data, "待提词生成", 82, "prompt-generation")


def save_step_five(project_id: str, payload: SaveStepFiveRequest) -> ProjectRecord | None:
    return _save_step_data(project_id, "step_five", payload.data, "待画面生成", 86, "image-generation")


def save_step_six(project_id: str, payload: SaveStepSixRequest) -> ProjectRecord | None:
    return _save_step_data(project_id, "step_six", payload.data, "待视频生成", 92, "video-generation")


def save_step_eight(project_id: str, payload: SaveStepEightRequest) -> ProjectRecord | None:
    return _save_step_data(project_id, "step_eight", payload.data, "待音频字幕", 94, "audio-subtitle")


def save_step_nine(project_id: str, payload: SaveStepNineRequest) -> ProjectRecord | None:
    return _save_step_data(project_id, "step_nine", payload.data, "待剪辑成片", 96, "final-editing")


def save_step_ten(project_id: str, payload: SaveStepTenRequest) -> ProjectRecord | None:
    return _save_step_data(project_id, "step_ten", payload.data, "待发布复盘", 98, "publish-review")


def save_step_eleven(project_id: str, payload: SaveStepElevenRequest) -> ProjectRecord | None:
    status = "项目已完结" if payload.data.project_completion_status == "已完结" else "发布复盘中"
    return _save_step_data(project_id, "step_eleven", payload.data, status, 100, "publish-review")


def _save_step_data(
    project_id: str,
    field_name: str,
    data: object,
    status: str,
    progress: int,
    current_step: str,
) -> ProjectRecord | None:
    records = _read_records()
    target: ProjectRecord | None = None
    for index, record in enumerate(records):
        if record.id != project_id:
            continue
        updated = record.model_copy(
            update={
                field_name: data,
                "status": status,
                "progress": progress,
                "updated_at": datetime.now(),
                "current_step": current_step,
            }
        )
        records[index] = updated
        target = updated
        break
    if target is not None:
        _write_records(records)
    return target


def _resolve_episode_count(season_episode_count: str, custom_episode_count: int | None) -> int:
    if season_episode_count == "自定义集数" and custom_episode_count:
        return max(1, custom_episode_count)
    digits = "".join(ch for ch in season_episode_count if ch.isdigit())
    return int(digits) if digits else 12


def _normalize_episodes(episodes: list[EpisodeDraft], total_count: int) -> list[EpisodeDraft]:
    normalized: list[EpisodeDraft] = []
    for index in range(total_count):
        existing = episodes[index] if index < len(episodes) else None
        normalized.append(
            EpisodeDraft(
                episode_number=index + 1,
                title=(existing.title if existing else f"第 {index + 1} 集"),
                content=(existing.content if existing else ""),
                hook=(existing.hook if existing else ""),
            )
        )
    return normalized
