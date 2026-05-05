from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from .models import ProjectRecord
from .prompt_registry import PromptTask


MAX_CONTEXT_CHARS = 60_000
MAX_USER_EDIT_CHARS = 10_000
MAX_LONG_TEXT_CHARS = 12_000
MAX_SCRIPT_EXCERPT_CHARS = 18_000
MAX_SMALL_FIELD_CHARS = 1_200

MEDIA_KEYS = {
    "url",
    "image_url",
    "cover_image_url",
    "source_image_url",
    "first_frame_image",
    "b64_json",
}
SECRET_KEY_RE = re.compile(r"\b(?:sk|key|ak)-[A-Za-z0-9_\-]{16,}\b")
DATA_URL_RE = re.compile(r"data:[^,\s]+;base64,[A-Za-z0-9+/=_-]+", re.IGNORECASE)
LONG_BASE64_RE = re.compile(r"\b[A-Za-z0-9+/]{400,}={0,2}\b")


class ContextValidationError(ValueError):
    pass


@dataclass(frozen=True)
class AiContextBundle:
    task_id: str
    step_id: str
    prompt: str
    context: dict[str, Any]
    diagnostics: dict[str, Any]


EXPECTED_OUTPUT_KEYS: dict[str, set[str]] = {
    "S01_STORY_PARSE": {"core_story_title", "core_story_idea", "keywords", "facts", "result"},
    "S01_WORLDVIEW": {"world_background", "era_setting", "rule_system", "conflict_environment", "result"},
    "S01_MAIN_CONFLICT": {"protagonist_goal", "antagonist_pressure", "core_conflict", "character_growth", "result"},
    "S01_RELATIONSHIPS": {"relationship_notes", "relationships", "result"},
    "S01_SEASON_OUTLINE": {"season_outline", "episodes", "result"},
    "S01_CONTINUITY_CHECK": {"issues", "continuity_issues", "report", "summary", "result"},
    "S02_REFERENCE": {"reference_summary", "usable_plots", "style_tips", "risks", "result"},
    "S02_NOVEL": {"novel_text", "key_beats", "dialogue_candidates", "adaptation_notes", "result"},
    "S02_ROLES": {"roles", "characters", "character_profiles", "result"},
    "S02_TERMS": {"terms", "terminology", "items", "result"},
    "S02_GUIDANCE": {"writing_guidance", "dialogue_rules", "narration_rules", "pacing_rules", "result"},
    "S02_SCRIPT": {"script_text", "scenes", "ending_hook", "result"},
    "S02_CHECK": {"review_notes", "issues", "pass_for_storyboard", "result"},
    "S02_REWRITE": {"rewritten_text", "change_notes", "result"},
    "S02_SCRIPT_MARKUP": {"marked_script", "script_text", "marked_text", "markup_notes", "result"},
    "S03_ASSET_EXTRACT": {"characters", "scenes", "props", "assets", "items", "result"},
    "S03_CHARACTER_CARDS": {"characters", "roles", "character_cards", "items", "result"},
    "S03_SCENE_CARDS": {"scenes", "scene_cards", "items", "result"},
    "S03_PROP_CARDS": {"props", "prop_cards", "items", "result"},
    "S03_STYLE_BOARD": {"art_style", "color_palette", "lighting_rules", "prompt_style_block", "style_board", "result"},
    "S03_CONSISTENCY_RULES": {"consistency_rules", "rules", "prompt_text", "result"},
    "S04_STORYBOARD_SPLIT": {"shots", "storyboard", "task_preview", "result"},
    "S04_STORYBOARD_CHECK": {"issues", "pass_for_prompt", "review_notes", "result"},
    "S05_T2I_PROMPT": {"positive_prompt", "t2i_prompt", "negative_prompt", "parameters", "locked_terms", "result"},
    "S05_I2V_PROMPT": {"i2v_prompt", "negative_prompt", "parameters", "locked_terms", "result"},
    "S05_NEGATIVE_PROMPT": {"terms", "prompt_text", "scope", "enabled", "result"},
    "S05_PROMPT_CHECK": {"pass_for_generation", "issues", "result"},
    "S06_IMAGE_TASK": {"task_type", "shot_id", "prompt", "negative_prompt", "parameters", "result"},
    "S06_REPAINT_PROMPT": {"repaint_prompt", "negative_prompt", "keep_terms", "change_terms", "result"},
    "S08_VIDEO_TASK": {"task_type", "shot_id", "prompt", "negative_prompt", "duration_seconds", "result"},
    "S08_VIDEO_QC": {"recommended_status", "usable_for_editing", "issues", "regeneration_strategy", "result"},
    "S09_DIALOGUE_EXTRACT": {"dialogue_lines", "result"},
    "S09_VOICE_PROFILE": {"voice_profiles", "lip_sync_tasks", "result"},
    "S09_SUBTITLE_TIMELINE": {"subtitle_cues", "result"},
    "S09_SOUND_EFFECTS": {"sound_effects", "mix_notes", "result"},
    "S10_TIMELINE": {"timeline_clips", "rhythm_marks", "blocking_issues", "package_checklist", "result"},
    "S10_EDIT_QC": {"edit_qc_report", "issues", "pass_for_export", "result"},
    "S10_COVER_TITLE": {"cover_candidates", "title_candidates", "result"},
    "S11_PUBLISH_COPY": {"publish_copy", "title", "description", "tags", "topics", "comment_pin", "result"},
    "S11_PERFORMANCE_ANALYSIS": {"metric_summary", "strengths", "weaknesses", "data_gaps", "result"},
    "S11_REVIEW_REPORT": {"review_report", "good_elements", "needs_improvement", "optimization_tasks", "result"},
    "S11_NEXT_EPISODE": {"next_episode_suggestions", "carry_over_elements", "experiments", "data_gaps", "result"},
}


def clip_text(value: Any, limit: int = MAX_SMALL_FIELD_CHARS) -> str:
    text = _clean_text(value)
    if len(text) <= limit:
        return text
    head_len = max(1, int(limit * 0.7))
    tail_len = max(1, limit - head_len)
    omitted = len(text) - head_len - tail_len
    return f"{text[:head_len]}\n[context shortened: {omitted} chars]\n{text[-tail_len:]}"


def sanitize_for_ai(value: Any) -> Any:
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, str):
        return _sanitize_string(value)
    if isinstance(value, list | tuple | set):
        return [sanitize_for_ai(item) for item in value]
    if hasattr(value, "model_dump"):
        return sanitize_for_ai(value.model_dump(mode="json"))
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        media_seen: dict[str, bool] = {}
        for key, raw_value in value.items():
            normalized_key = str(key)
            lowered = normalized_key.lower()
            if _looks_secret_key(lowered):
                continue
            if lowered in MEDIA_KEYS or lowered.endswith("_url"):
                if _has_value(raw_value):
                    media_seen[_media_flag_name(lowered)] = True
                continue
            sanitized[normalized_key] = sanitize_for_ai(raw_value)
        sanitized.update(media_seen)
        return sanitized
    return _sanitize_string(str(value))


def build_fallback_context_prompt(task: PromptTask, project_name: str, user_prompt: str) -> AiContextBundle:
    context = {
        "task_id": task.task_id,
        "step_id": task.step_id,
        "output_contract": task.output_contract,
        "write_target": _write_target_from_contract(task.output_contract),
        "project_brief": {"name": clip_text(project_name, 200)},
        "locked_facts": [],
        "target_object": {},
        "relevant_context": {},
        "user_edits": clip_text(sanitize_for_ai(user_prompt), MAX_USER_EDIT_CHARS),
        "context_policy": _policy(),
    }
    return _finalize_bundle(task, context)


def build_task_context_prompt(
    task: PromptTask,
    project: ProjectRecord,
    user_prompt: str = "",
    target_type: str | None = None,
    target_id: str | None = None,
) -> AiContextBundle:
    target = find_target_object(project, target_type, target_id)
    relevant_context = _relevant_context_for_task(task.task_id, project, target, target_type)
    user_edit_limit = _user_edit_limit_for_task(task.task_id)
    context = {
        "task_id": task.task_id,
        "step_id": task.step_id,
        "output_contract": task.output_contract,
        "write_target": _write_target_from_contract(task.output_contract),
        "project_brief": _project_brief(project),
        "locked_facts": _locked_facts(project),
        "target_object": sanitize_for_ai(target or {}),
        "relevant_context": relevant_context,
        "user_edits": clip_text(sanitize_for_ai(user_prompt), user_edit_limit),
        "context_policy": _policy(),
    }
    return _finalize_bundle(task, context)


def _user_edit_limit_for_task(task_id: str) -> int:
    if task_id.startswith("S05_") or task_id.startswith("S06_") or task_id.startswith("S08_"):
        return 2_000
    if task_id.startswith("S04_"):
        return 4_000
    return MAX_USER_EDIT_CHARS


def validate_ai_output(task_id: str, content: str) -> dict[str, Any]:
    if "```" in content:
        raise ContextValidationError("AI output contains Markdown fences; strict JSON is required")
    parsed = extract_json_object(content)
    if parsed is None:
        raise ContextValidationError("AI output is not a valid JSON object")
    expected = EXPECTED_OUTPUT_KEYS.get(task_id, set())
    if expected and not (set(parsed.keys()) & expected):
        expected_text = ", ".join(sorted(expected))
        raise ContextValidationError(f"AI output misses expected root keys for {task_id}: {expected_text}")
    return parsed


def extract_json_object(raw: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    depth = 0
    start = -1
    in_string = False
    escaped = False
    for index, char in enumerate(raw):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                try:
                    parsed = json.loads(raw[start : index + 1])
                except json.JSONDecodeError:
                    start = -1
                    continue
                return parsed if isinstance(parsed, dict) else None
    return None


def find_target_object(project: ProjectRecord, target_type: str | None, target_id: str | None) -> Any:
    normalized_type = (target_type or "").strip().lower()
    normalized_id = (target_id or "").strip()
    if not normalized_id and normalized_type not in {"story", "script", "assets"}:
        return {}
    if normalized_type in {"episode", "episodes"}:
        for item in project.step_one.episodes:
            if str(item.episode_number) == normalized_id:
                return item
        return {}

    collections: dict[str, list[Any]] = {
        "character": project.step_three.characters,
        "characters": project.step_three.characters,
        "scene": project.step_three.scenes,
        "scenes": project.step_three.scenes,
        "prop": project.step_three.props,
        "props": project.step_three.props,
        "shot": project.step_four.shots,
        "shots": project.step_four.shots,
        "prompt": project.step_five.prompts,
        "prompts": project.step_five.prompts,
        "image": project.step_six.candidates,
        "images": project.step_six.candidates,
        "video": project.step_eight.clips,
        "clip": project.step_eight.clips,
        "dialogue": project.step_nine.dialogue_lines,
        "subtitle": project.step_nine.subtitle_cues,
        "timeline": project.step_ten.timeline_clips,
        "cover": project.step_ten.cover_candidates,
    }
    candidates = collections.get(normalized_type, [])
    for item in candidates:
        if getattr(item, "id", "") == normalized_id:
            return item
    for items in collections.values():
        for item in items:
            if getattr(item, "id", "") == normalized_id:
                return item
    return {}


def _finalize_bundle(task: PromptTask, context: dict[str, Any]) -> AiContextBundle:
    context = sanitize_for_ai(context)
    context = _compact_context_to_budget(context)
    diagnostics = validate_context(context)
    prompt = _render_prompt(task, context, diagnostics)
    prompt = _sanitize_string(prompt)
    if len(prompt) > MAX_CONTEXT_CHARS:
        context = _compact_context_to_budget(context, aggressive=True)
        diagnostics = validate_context(context)
        prompt = _render_prompt(task, context, diagnostics)
        prompt = _sanitize_string(prompt)
    if len(prompt) > MAX_CONTEXT_CHARS:
        raise ContextValidationError(f"AI context is still too large after compaction: {len(prompt)} chars")
    return AiContextBundle(
        task_id=task.task_id,
        step_id=task.step_id,
        prompt=prompt,
        context=context,
        diagnostics={**diagnostics, "prompt_chars": len(prompt)},
    )


def validate_context(context: dict[str, Any]) -> dict[str, Any]:
    raw = json.dumps(context, ensure_ascii=False, sort_keys=True)
    forbidden_hits = []
    for pattern in ('"image_url"', '"cover_image_url"', '"source_image_url"', '"url"', "data:image", ";base64"):
        if pattern.lower() in raw.lower():
            forbidden_hits.append(pattern)
    if SECRET_KEY_RE.search(raw):
        forbidden_hits.append("secret_key")
    if LONG_BASE64_RE.search(raw):
        forbidden_hits.append("long_encoded_payload")
    if forbidden_hits:
        raise ContextValidationError(f"AI context contains forbidden payloads: {', '.join(sorted(set(forbidden_hits)))}")
    if len(raw) > MAX_CONTEXT_CHARS:
        raise ContextValidationError(f"AI context exceeds budget: {len(raw)} chars")
    required = {"task_id", "output_contract", "write_target", "project_brief", "locked_facts", "target_object", "relevant_context", "user_edits"}
    missing = sorted(required - set(context))
    if missing:
        raise ContextValidationError(f"AI context misses required sections: {', '.join(missing)}")
    return {
        "context_chars": len(raw),
        "forbidden_payloads": [],
        "required_sections": sorted(required),
    }


def _compact_context_to_budget(context: dict[str, Any], aggressive: bool = False) -> dict[str, Any]:
    compacted = {
        **context,
        "target_object": _clip_nested_text(context.get("target_object", {}), 4_000 if not aggressive else 2_000),
        "relevant_context": _clip_nested_text(context.get("relevant_context", {}), 24_000 if not aggressive else 8_000),
        "user_edits": clip_text(context.get("user_edits", ""), 6_000 if not aggressive else 2_500),
    }
    raw = json.dumps(compacted, ensure_ascii=False, sort_keys=True)
    if len(raw) <= MAX_CONTEXT_CHARS:
        return compacted
    compacted["relevant_context"] = _clip_nested_text(compacted.get("relevant_context", {}), 12_000)
    compacted["target_object"] = _clip_nested_text(compacted.get("target_object", {}), 2_500)
    compacted["user_edits"] = clip_text(compacted.get("user_edits", ""), 3_000)
    raw = json.dumps(compacted, ensure_ascii=False, sort_keys=True)
    if len(raw) <= MAX_CONTEXT_CHARS:
        return compacted
    compacted["relevant_context"] = _clip_nested_text(compacted.get("relevant_context", {}), 6_000)
    compacted["target_object"] = _clip_nested_text(compacted.get("target_object", {}), 1_500)
    compacted["user_edits"] = clip_text(compacted.get("user_edits", ""), 2_000)
    return compacted


def _render_prompt(task: PromptTask, context: dict[str, Any], diagnostics: dict[str, Any]) -> str:
    return "\n".join(
        [
            "AI_CONTEXT_GATEWAY_V1",
            "Use only the minimized context below. Do not infer from omitted files, media payloads, URLs, API keys, or full project JSON.",
            f"task_id: {task.task_id}",
            f"step_id: {task.step_id}",
            f"model_role: {task.model_role}",
            "task_instruction:",
            task.user_instruction,
            "output_contract:",
            task.output_contract,
            "input_validation:",
            json.dumps(diagnostics, ensure_ascii=False, sort_keys=True),
            "minimized_context_json:",
            json.dumps(context, ensure_ascii=False, sort_keys=True),
            "Return one strict JSON object that satisfies output_contract. No Markdown, no comments, no extra prose.",
        ]
    )


def _relevant_context_for_task(task_id: str, project: ProjectRecord, target: Any, target_type: str | None) -> dict[str, Any]:
    if task_id.startswith("S01_"):
        return {
            "story": _step_one_summary(project, include_episodes=True),
        }
    if task_id.startswith("S02_"):
        return {
            "story": _step_one_summary(project, include_episodes=True),
            "script_workspace": _step_two_summary(project, include_script=True),
        }
    if task_id.startswith("S03_"):
        target_terms = _target_terms(target)
        script_excerpt = _excerpt_for_terms(
            project.step_two.script_text or project.step_two.novel_text or project.step_two.source_material,
            target_terms,
            MAX_SCRIPT_EXCERPT_CHARS,
        )
        return {
            "story": _step_one_summary(project, include_episodes=True),
            "upstream_character_terms_script": {
                "character_profiles": clip_text(project.step_two.character_profiles, 5_000),
                "terminology_library": clip_text(project.step_two.terminology_library, 4_000),
                "writing_guidance": clip_text(project.step_two.writing_guidance, 3_000),
                "script_excerpt": script_excerpt,
            },
            "existing_assets": _asset_summary(project),
        }
    if task_id.startswith("S04_"):
        episode_number = _target_episode_number(target) or project.step_four.selected_episode_number
        return {
            "target_episode": _episode_summary(target),
            "story": _step_one_summary(project, include_episodes=False),
            "script_excerpt": _episode_script_context(project, episode_number),
            "assets": _asset_summary(project),
        }
    if task_id.startswith("S05_"):
        target_terms = _target_terms(target)
        target_shot_id = _target_shot_id(target)
        return {
            "target_shot": _single_shot_summary(project, target_shot_id) or sanitize_for_ai(target),
            "neighbor_shots": _neighbor_shots_summary(project, target_shot_id, radius=2),
            "matched_assets": _matched_assets(project, target_terms),
            "style_and_rules": _style_rules(project),
            "existing_prompt_for_shot": _single_prompt_summary(project, target_shot_id),
        }
    if task_id.startswith("S06_"):
        target_shot_id = _target_shot_id(target)
        return {
            "target_image_or_shot": sanitize_for_ai(target),
            "target_shot": _single_shot_summary(project, target_shot_id),
            "target_prompt": _single_prompt_summary(project, target_shot_id),
            "related_image_candidates": _related_images_summary(project, target_shot_id, limit=6),
            "style_and_rules": _style_rules(project),
        }
    if task_id.startswith("S08_"):
        target_shot_id = _target_shot_id(target)
        return {
            "target_video_source": sanitize_for_ai(target),
            "target_shot": _single_shot_summary(project, target_shot_id),
            "target_prompt": _single_prompt_summary(project, target_shot_id),
            "related_image_candidates": _related_images_summary(project, target_shot_id, limit=6),
            "style_and_rules": _style_rules(project),
            "video_settings": {
                "motion_settings": clip_text(project.step_eight.motion_settings, 1_000),
                "reference_bindings": clip_text(project.step_eight.reference_bindings, 1_000),
            },
        }
    if task_id.startswith("S09_"):
        target_shot_id = _target_shot_id(target)
        if target_shot_id:
            target_terms = _target_terms(_single_shot_summary(project, target_shot_id))
            return {
                "script_excerpt": _excerpt_for_terms(project.step_two.script_text or project.step_two.novel_text, target_terms, 8_000),
                "target_shot": _single_shot_summary(project, target_shot_id),
                "neighbor_shots": _neighbor_shots_summary(project, target_shot_id, radius=1),
                "videos": _videos_summary_for_shot(project, target_shot_id, limit=8),
                "dialogue_audio_workspace": _audio_summary_for_shot(project, target_shot_id),
                "characters": _asset_summary(project).get("characters", [])[:12],
            }
        return {
            "script_excerpt": _excerpt_for_terms(project.step_two.script_text or project.step_two.novel_text, [], 16_000),
            "shots": _shots_summary(project, limit=40),
            "videos": _videos_summary(project, limit=40),
            "dialogue_audio_workspace": _audio_summary(project),
            "characters": _asset_summary(project).get("characters", []),
        }
    if task_id.startswith("S10_"):
        target_shot_id = _target_shot_id(target)
        if target_shot_id:
            return {
                "target_shot": _single_shot_summary(project, target_shot_id),
                "neighbor_shots": _neighbor_shots_summary(project, target_shot_id, radius=1),
                "videos": _videos_summary_for_shot(project, target_shot_id, limit=8),
                "audio_subtitle": _audio_summary_for_shot(project, target_shot_id),
                "timeline": _timeline_summary_for_shot(project, target_shot_id, limit=12),
                "package": {
                    "transition_settings": clip_text(project.step_ten.transition_settings, 1_000),
                    "package_checklist": clip_text(project.step_ten.package_checklist, 1_000),
                },
            }
        return {
            "videos": _videos_summary(project, limit=60),
            "audio_subtitle": _audio_summary(project),
            "timeline": _timeline_summary(project, limit=80),
            "package": {
                "transition_settings": clip_text(project.step_ten.transition_settings, 2_000),
                "package_checklist": clip_text(project.step_ten.package_checklist, 3_000),
            },
        }
    if task_id.startswith("S11_"):
        return {
            "story": _step_one_summary(project, include_episodes=False),
            "script_summary": _step_two_summary(project, include_script=False),
            "package": _timeline_summary(project, limit=80),
            "publish_review": _publish_summary(project),
        }
    return {
        "story": _step_one_summary(project, include_episodes=True),
        "current_step": project.current_step,
    }


def _project_brief(project: ProjectRecord) -> dict[str, Any]:
    step_one = project.step_one
    return {
        "id": project.id,
        "name": clip_text(project.name, 200),
        "status": clip_text(project.status, 200),
        "current_step": project.current_step,
        "genre": clip_text(step_one.genre, 200),
        "target_audience": clip_text(step_one.target_audience, 200),
        "target_platform": clip_text(step_one.target_platform, 200),
        "core_story_title": clip_text(step_one.core_story_title, 300),
    }


def _locked_facts(project: ProjectRecord) -> dict[str, Any]:
    return {
        "character_names": [clip_text(item.name, 120) for item in project.step_three.characters if item.name.strip()],
        "scene_names": [clip_text(item.name, 120) for item in project.step_three.scenes if item.name.strip()],
        "prop_names": [clip_text(item.name, 120) for item in project.step_three.props if item.name.strip()],
        "terms_excerpt": clip_text(project.step_two.terminology_library, 2_000),
        "consistency_rules": clip_text(project.step_three.consistency_rules, 3_000),
    }


def _step_one_summary(project: ProjectRecord, include_episodes: bool) -> dict[str, Any]:
    step = project.step_one
    summary: dict[str, Any] = {
        "project_name": clip_text(step.project_name or project.name, 200),
        "genre": clip_text(step.genre, 200),
        "target_audience": clip_text(step.target_audience, 200),
        "target_platform": clip_text(step.target_platform, 200),
        "core_story_title": clip_text(step.core_story_title, 300),
        "core_story_idea": clip_text(step.core_story_idea, 6_000),
        "world_background": clip_text(step.world_background, 2_000),
        "era_setting": clip_text(step.era_setting, 1_000),
        "rule_system": clip_text(step.rule_system, 2_000),
        "conflict_environment": clip_text(step.conflict_environment, 2_000),
        "protagonist_goal": clip_text(step.protagonist_goal, 1_000),
        "antagonist_pressure": clip_text(step.antagonist_pressure, 1_000),
        "core_conflict": clip_text(step.core_conflict, 1_000),
        "character_growth": clip_text(step.character_growth, 1_000),
        "relationship_notes": clip_text(step.relationship_notes, 2_000),
        "season_outline": clip_text(step.season_outline, 6_000),
    }
    if include_episodes:
        summary["episodes"] = [
            {
                "episode_number": episode.episode_number,
                "title": clip_text(episode.title, 160),
                "content": clip_text(episode.content, 1_500),
                "hook": clip_text(episode.hook, 500),
            }
            for episode in step.episodes[:40]
        ]
    return summary


def _step_two_summary(project: ProjectRecord, include_script: bool) -> dict[str, Any]:
    step = project.step_two
    summary = {
        "selected_episode_number": step.selected_episode_number,
        "current_episode_context": clip_text(step.current_episode_context, 2_000),
        "reference_text": clip_text(step.reference_text, 4_000),
        "character_profiles": clip_text(step.character_profiles, 5_000),
        "terminology_library": clip_text(step.terminology_library, 4_000),
        "writing_guidance": clip_text(step.writing_guidance, 4_000),
        "review_notes": clip_text(step.review_notes, 3_000),
    }
    if include_script:
        summary.update(
            {
                "source_material_excerpt": clip_text(step.source_material, 4_000),
                "novel_text_excerpt": clip_text(step.novel_text, 8_000),
                "script_text_excerpt": clip_text(step.script_text, MAX_SCRIPT_EXCERPT_CHARS),
            }
        )
    return summary


def _episode_summary(target: Any) -> dict[str, Any]:
    target = sanitize_for_ai(target)
    if not isinstance(target, dict):
        return {}
    return {
        "episode_number": target.get("episode_number"),
        "title": clip_text(target.get("title"), 160),
        "content": clip_text(target.get("content"), 2_000),
        "hook": clip_text(target.get("hook"), 600),
    }


def _target_episode_number(target: Any) -> int:
    target = sanitize_for_ai(target)
    if not isinstance(target, dict):
        return 0
    raw = target.get("episode_number") or target.get("id")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def _episode_script_context(project: ProjectRecord, episode_number: int) -> dict[str, str]:
    step = project.step_two
    source = step.script_text or step.novel_text or step.source_material
    excerpt = _episode_segment_excerpt(source, episode_number, 12_000)
    return {
        "selected_episode_number": episode_number,
        "current_episode_context": clip_text(step.current_episode_context, 1_500),
        "script_or_novel_excerpt": excerpt,
        "character_profiles": clip_text(step.character_profiles, 2_500),
        "terminology_library": clip_text(step.terminology_library, 2_000),
        "writing_guidance": clip_text(step.writing_guidance, 1_500),
    }


def _episode_segment_excerpt(text: str, episode_number: int, limit: int) -> str:
    normalized = _clean_text(text)
    if not normalized:
        return ""
    if episode_number <= 0:
        return clip_text(normalized, min(limit, 8_000))
    marker_re = re.compile(rf"(?:^|\n)\s*(?:第\s*{episode_number}\s*集|Episode\s*{episode_number}\b)", re.IGNORECASE)
    next_marker_re = re.compile(rf"\n\s*(?:第\s*{episode_number + 1}\s*集|Episode\s*{episode_number + 1}\b)", re.IGNORECASE)
    start_match = marker_re.search(normalized)
    if start_match:
        start = start_match.start()
        next_match = next_marker_re.search(normalized, start_match.end())
        end = next_match.start() if next_match else len(normalized)
        return clip_text(normalized[start:end], limit)
    terms = [f"第 {episode_number} 集", f"第{episode_number}集", f"Episode {episode_number}"]
    return _excerpt_for_terms(normalized, terms, limit)


def _asset_summary(project: ProjectRecord) -> dict[str, Any]:
    step = project.step_three
    return {
        "characters": [
            {
                "id": item.id,
                "name": clip_text(item.name, 120),
                "role": clip_text(item.role, 500),
                "age": clip_text(item.age, 120),
                "personality": clip_text(item.personality, 500),
                "appearance": clip_text(item.appearance, 700),
                "motivation": clip_text(item.motivation, 500),
                "outfit": clip_text(item.outfit, 700),
                "image_prompt": clip_text(item.image_prompt, 800),
                "has_image": bool(item.image_url.strip()),
            }
            for item in step.characters[:80]
        ],
        "scenes": [
            {
                "id": item.id,
                "name": clip_text(item.name, 120),
                "location": clip_text(item.location, 500),
                "atmosphere": clip_text(item.atmosphere, 700),
                "episodes": clip_text(item.episodes, 200),
                "image_prompt": clip_text(item.image_prompt, 800),
                "has_image": bool(item.image_url.strip()),
            }
            for item in step.scenes[:80]
        ],
        "props": [
            {
                "id": item.id,
                "name": clip_text(item.name, 120),
                "type": clip_text(item.type, 200),
                "story_function": clip_text(item.story_function, 700),
                "image_prompt": clip_text(item.image_prompt, 800),
                "has_image": bool(item.image_url.strip()),
            }
            for item in step.props[:80]
        ],
        "style_board": clip_text(step.style_board, 3_000),
        "reference_notes": clip_text(step.reference_notes, 2_000),
        "prompt_templates": clip_text(step.prompt_templates, 2_000),
        "consistency_rules": clip_text(step.consistency_rules, 3_000),
    }


def _style_rules(project: ProjectRecord) -> dict[str, str]:
    step = project.step_three
    return {
        "style_board": clip_text(step.style_board, 3_000),
        "prompt_templates": clip_text(step.prompt_templates, 3_000),
        "consistency_rules": clip_text(step.consistency_rules, 3_000),
    }


def _shots_summary(project: ProjectRecord, limit: int) -> list[dict[str, Any]]:
    return [
        {
            "id": item.id,
            "episode_number": item.episode_number,
            "shot_number": item.shot_number,
            "scene": clip_text(item.scene, 300),
            "characters": [clip_text(name, 120) for name in item.characters],
            "props": [clip_text(name, 120) for name in item.props],
            "purpose": clip_text(item.purpose, 600),
            "story_beat": clip_text(item.story_beat, 500),
            "visual_description": clip_text(item.visual_description, 900),
            "action": clip_text(item.action, 700),
            "blocking": clip_text(item.blocking, 700),
            "duration_seconds": item.duration_seconds,
            "shot_size": clip_text(item.shot_size, 120),
            "camera_angle": clip_text(item.camera_angle, 120),
            "composition": clip_text(item.composition, 400),
            "lens": clip_text(item.lens, 160),
            "movement": clip_text(item.movement, 400),
            "camera_motion": clip_text(item.camera_motion, 500),
            "lighting": clip_text(item.lighting, 300),
            "color_mood": clip_text(item.color_mood, 300),
            "dialogue": clip_text(item.dialogue, 700),
            "sound_design": clip_text(item.sound_design, 600),
            "rhythm": clip_text(item.rhythm, 300),
            "transition": clip_text(item.transition, 300),
            "continuity_notes": clip_text(item.continuity_notes, 500),
            "asset_requirements": clip_text(item.asset_requirements, 700),
            "generation_notes": clip_text(item.generation_notes, 800),
            "vfx_notes": clip_text(item.vfx_notes, 400),
            "risk_flags": clip_text(item.risk_flags, 500),
            "status": item.status,
        }
        for item in project.step_four.shots[:limit]
    ]


def _prompts_summary(project: ProjectRecord, limit: int) -> list[dict[str, Any]]:
    return [
        {
            "id": item.id,
            "shot_id": item.shot_id,
            "shot_label": clip_text(item.shot_label, 200),
            "selected": item.selected,
            "t2i_prompt": clip_text(item.t2i_prompt, 2_000),
            "i2v_prompt": clip_text(item.i2v_prompt, 2_000),
            "negative_prompt": clip_text(item.negative_prompt, 1_000),
            "parameters": clip_text(item.parameters, 500),
            "locked_terms": clip_text(item.locked_terms, 1_000),
            "version": clip_text(item.version, 120),
        }
        for item in project.step_five.prompts[:limit]
    ]


def _images_summary(project: ProjectRecord, limit: int) -> list[dict[str, Any]]:
    return [
        {
            "id": item.id,
            "shot_id": item.shot_id,
            "shot_label": clip_text(item.shot_label, 200),
            "prompt": clip_text(item.prompt, 2_000),
            "status": item.status,
            "metadata": clip_text(item.metadata, 500),
            "repaint_prompt": clip_text(item.repaint_prompt, 1_500),
            "has_image": bool(item.url.strip()),
        }
        for item in project.step_six.candidates[:limit]
    ]


def _target_shot_id(target: Any) -> str:
    target = sanitize_for_ai(target)
    if not isinstance(target, dict):
        return ""
    shot_id = target.get("shot_id") or target.get("id")
    return str(shot_id).strip() if shot_id else ""


def _target_asset_id(target: Any) -> str:
    target = sanitize_for_ai(target)
    if not isinstance(target, dict):
        return ""
    asset_id = target.get("id") or target.get("asset_id") or target.get("source_image_id")
    return str(asset_id).strip() if asset_id else ""


def _single_shot_summary(project: ProjectRecord, shot_id: str) -> dict[str, Any]:
    for item in project.step_four.shots:
        if item.id != shot_id:
            continue
        return {
            "id": item.id,
            "episode_number": item.episode_number,
            "shot_number": item.shot_number,
            "scene": clip_text(item.scene, 200),
            "characters": [clip_text(name, 120) for name in item.characters],
            "props": [clip_text(name, 120) for name in item.props],
            "purpose": clip_text(item.purpose, 500),
            "story_beat": clip_text(item.story_beat, 400),
            "visual_description": clip_text(item.visual_description, 700),
            "action": clip_text(item.action, 500),
            "blocking": clip_text(item.blocking, 500),
            "shot_size": clip_text(item.shot_size, 120),
            "camera_angle": clip_text(item.camera_angle, 120),
            "composition": clip_text(item.composition, 350),
            "lens": clip_text(item.lens, 160),
            "movement": clip_text(item.movement, 300),
            "camera_motion": clip_text(item.camera_motion, 300),
            "lighting": clip_text(item.lighting, 240),
            "color_mood": clip_text(item.color_mood, 240),
            "dialogue": clip_text(item.dialogue, 400),
            "continuity_notes": clip_text(item.continuity_notes, 400),
            "asset_requirements": clip_text(item.asset_requirements, 500),
            "generation_notes": clip_text(item.generation_notes, 600),
        }
    return {}


def _neighbor_shots_summary(project: ProjectRecord, shot_id: str, radius: int = 2) -> list[dict[str, Any]]:
    shots = project.step_four.shots
    index = next((idx for idx, item in enumerate(shots) if item.id == shot_id), -1)
    if index < 0:
        return []
    start = max(0, index - radius)
    end = min(len(shots), index + radius + 1)
    return [
        {
            "id": item.id,
            "episode_number": item.episode_number,
            "shot_number": item.shot_number,
            "scene": clip_text(item.scene, 160),
            "characters": [clip_text(name, 100) for name in item.characters],
            "props": [clip_text(name, 100) for name in item.props],
            "purpose": clip_text(item.purpose, 300),
            "visual_description": clip_text(item.visual_description, 400),
            "action": clip_text(item.action, 300),
            "shot_size": clip_text(item.shot_size, 100),
            "camera_angle": clip_text(item.camera_angle, 100),
            "composition": clip_text(item.composition, 240),
            "continuity_notes": clip_text(item.continuity_notes, 240),
        }
        for item in shots[start:end]
    ]


def _single_prompt_summary(project: ProjectRecord, shot_id: str) -> dict[str, Any]:
    for item in project.step_five.prompts:
        if item.shot_id != shot_id:
            continue
        return {
            "id": item.id,
            "shot_id": item.shot_id,
            "shot_label": clip_text(item.shot_label, 160),
            "t2i_prompt": clip_text(item.t2i_prompt, 1_800),
            "i2v_prompt": clip_text(item.i2v_prompt, 800),
            "negative_prompt": clip_text(item.negative_prompt, 800),
            "parameters": clip_text(item.parameters, 400),
            "locked_terms": clip_text(item.locked_terms, 800),
            "version": clip_text(item.version, 120),
        }
    return {}


def _related_images_summary(project: ProjectRecord, shot_id: str, limit: int) -> list[dict[str, Any]]:
    related = [item for item in project.step_six.candidates if item.shot_id == shot_id]
    if not related:
        related = project.step_six.candidates[:limit]
    return [
        {
            "id": item.id,
            "shot_id": item.shot_id,
            "shot_label": clip_text(item.shot_label, 160),
            "prompt": clip_text(item.prompt, 1_200),
            "status": item.status,
            "metadata": clip_text(item.metadata, 300),
            "repaint_instruction": clip_text(item.repaint_instruction, 800),
            "repaint_prompt": clip_text(item.repaint_prompt, 1_000),
            "has_image": bool(item.url.strip()),
        }
        for item in related[:limit]
    ]


def _videos_summary(project: ProjectRecord, limit: int) -> list[dict[str, Any]]:
    return [
        {
            "id": item.id,
            "shot_id": item.shot_id,
            "shot_label": clip_text(item.shot_label, 200),
            "source_image_id": item.source_image_id,
            "duration_seconds": item.duration_seconds,
            "motion_prompt": clip_text(item.motion_prompt, 2_000),
            "reference_note": clip_text(item.reference_note, 1_000),
            "status": item.status,
            "fail_reason": clip_text(item.fail_reason, 800),
            "regeneration_strategy": clip_text(item.regeneration_strategy, 1_000),
            "version": clip_text(item.version, 120),
            "metadata": clip_text(item.metadata, 600),
            "has_video": bool(item.url.strip()),
        }
        for item in project.step_eight.clips[:limit]
    ]


def _videos_summary_for_shot(project: ProjectRecord, shot_id: str, limit: int) -> list[dict[str, Any]]:
    related = [item for item in project.step_eight.clips if item.shot_id == shot_id]
    return [
        {
            "id": item.id,
            "shot_id": item.shot_id,
            "shot_label": clip_text(item.shot_label, 200),
            "source_image_id": item.source_image_id,
            "duration_seconds": item.duration_seconds,
            "motion_prompt": clip_text(item.motion_prompt, 1_500),
            "reference_note": clip_text(item.reference_note, 600),
            "status": item.status,
            "fail_reason": clip_text(item.fail_reason, 500),
            "regeneration_strategy": clip_text(item.regeneration_strategy, 600),
            "version": clip_text(item.version, 120),
            "metadata": clip_text(item.metadata, 400),
            "has_video": bool(item.url.strip()),
        }
        for item in related[:limit]
    ]


def _audio_summary(project: ProjectRecord) -> dict[str, Any]:
    step = project.step_nine
    return {
        "dialogue_lines": [sanitize_for_ai(item) for item in step.dialogue_lines[:120]],
        "voice_profiles": [sanitize_for_ai(item) for item in step.voice_profiles[:80]],
        "subtitle_cues": [sanitize_for_ai(item) for item in step.subtitle_cues[:160]],
        "subtitle_style": clip_text(step.subtitle_style, 1_000),
        "sound_effects": [sanitize_for_ai(item) for item in step.sound_effects[:100]],
        "bgm_settings": clip_text(step.bgm_settings, 1_000),
        "mix_settings": clip_text(step.mix_settings, 1_000),
        "lip_sync_tasks": [clip_text(item, 400) for item in step.lip_sync_tasks[:80]],
        "validation_report": clip_text(step.validation_report, 2_000),
    }


def _audio_summary_for_shot(project: ProjectRecord, shot_id: str) -> dict[str, Any]:
    step = project.step_nine
    shot = _single_shot_summary(project, shot_id)
    shot_label = f"第{shot.get('episode_number')}集 #{shot.get('shot_number')}" if shot else ""
    return {
        "dialogue_lines": [sanitize_for_ai(item) for item in step.dialogue_lines if item.shot_id == shot_id][:20],
        "voice_profiles": [sanitize_for_ai(item) for item in step.voice_profiles[:40]],
        "subtitle_cues": [sanitize_for_ai(item) for item in step.subtitle_cues if item.shot_id == shot_id][:40],
        "subtitle_style": clip_text(step.subtitle_style, 600),
        "sound_effects": [sanitize_for_ai(item) for item in step.sound_effects if not shot_label or shot_label in item.shot_label][:30],
        "bgm_settings": clip_text(step.bgm_settings, 600),
        "mix_settings": clip_text(step.mix_settings, 600),
        "lip_sync_tasks": [clip_text(item, 300) for item in step.lip_sync_tasks if not shot_label or shot_label in item][:20],
        "validation_report": clip_text(step.validation_report, 1_000),
    }


def _timeline_summary(project: ProjectRecord, limit: int) -> dict[str, Any]:
    step = project.step_ten
    return {
        "timeline_clips": [sanitize_for_ai(item) for item in step.timeline_clips[:limit]],
        "rhythm_marks": [clip_text(item, 400) for item in step.rhythm_marks[:100]],
        "transition_settings": clip_text(step.transition_settings, 1_000),
        "edit_qc_report": clip_text(step.edit_qc_report, 2_000),
        "cover_candidates": [sanitize_for_ai(item) for item in step.cover_candidates[:20]],
        "package_checklist": clip_text(step.package_checklist, 2_000),
        "validation_report": clip_text(step.validation_report, 2_000),
    }


def _timeline_summary_for_shot(project: ProjectRecord, shot_id: str, limit: int) -> dict[str, Any]:
    step = project.step_ten
    video_ids = {item.id for item in project.step_eight.clips if item.shot_id == shot_id}
    related_timeline = [item for item in step.timeline_clips if item.source_id in video_ids]
    shot = _single_shot_summary(project, shot_id)
    shot_label = f"第{shot.get('episode_number')}集 #{shot.get('shot_number')}" if shot else ""
    return {
        "timeline_clips": [sanitize_for_ai(item) for item in related_timeline[:limit]],
        "rhythm_marks": [clip_text(item, 300) for item in step.rhythm_marks if shot_id in item or (shot_label and shot_label in item)][:20],
        "transition_settings": clip_text(step.transition_settings, 600),
        "edit_qc_report": clip_text(step.edit_qc_report, 1_000),
        "cover_candidates": [sanitize_for_ai(item) for item in step.cover_candidates[:10]],
        "package_checklist": clip_text(step.package_checklist, 1_000),
        "validation_report": clip_text(step.validation_report, 1_000),
    }


def _publish_summary(project: ProjectRecord) -> dict[str, Any]:
    step = project.step_eleven
    return {
        "publish_copy": clip_text(step.publish_copy, 4_000),
        "platform_adaptations": clip_text(step.platform_adaptations, 2_000),
        "publish_records": [sanitize_for_ai(item) for item in step.publish_records[:40]],
        "metrics": [sanitize_for_ai(item) for item in step.metrics[:80]],
        "data_import_note": clip_text(step.data_import_note, 2_000),
        "retention_analysis": clip_text(step.retention_analysis, 3_000),
        "comment_summary": clip_text(step.comment_summary, 3_000),
        "review_report": clip_text(step.review_report, 5_000),
        "optimization_tasks": [sanitize_for_ai(item) for item in step.optimization_tasks[:80]],
        "next_episode_suggestions": clip_text(step.next_episode_suggestions, 3_000),
        "project_completion_status": step.project_completion_status,
    }


def _matched_assets(project: ProjectRecord, terms: list[str]) -> dict[str, Any]:
    if not terms:
        return _asset_summary(project)
    lowered_terms = [term.lower() for term in terms if term]

    def matches(*values: str) -> bool:
        haystack = " ".join(values).lower()
        return any(term in haystack for term in lowered_terms)

    all_assets = _asset_summary(project)
    return {
        **all_assets,
        "characters": [
            item for item in all_assets["characters"]
            if matches(str(item.get("name", "")), str(item.get("role", "")))
        ] or all_assets["characters"][:10],
        "scenes": [
            item for item in all_assets["scenes"]
            if matches(str(item.get("name", "")), str(item.get("location", "")))
        ] or all_assets["scenes"][:10],
        "props": [
            item for item in all_assets["props"]
            if matches(str(item.get("name", "")), str(item.get("type", "")))
        ] or all_assets["props"][:10],
    }


def _excerpt_for_terms(text: str, terms: list[str], limit: int) -> str:
    normalized = _clean_text(text)
    if not normalized:
        return ""
    terms = [term for term in terms if term]
    if not terms:
        return clip_text(normalized, limit)
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    picked: list[str] = []
    for index, line in enumerate(lines):
        if not any(term in line for term in terms):
            continue
        picked.extend(lines[max(0, index - 1) : min(len(lines), index + 2)])
    excerpt = "\n".join(dict.fromkeys(picked))
    return clip_text(excerpt or normalized, limit)


def _target_terms(target: Any) -> list[str]:
    target = sanitize_for_ai(target)
    if not isinstance(target, dict):
        return []
    terms: list[str] = []
    for key in ("name", "shot_label", "scene", "speaker", "source_id", "shot_id"):
        value = target.get(key)
        if isinstance(value, str) and value.strip():
            terms.append(value.strip())
    for key in ("characters", "props"):
        value = target.get(key)
        if isinstance(value, list):
            terms.extend(str(item).strip() for item in value if str(item).strip())
    return terms[:20]


def _clip_nested_text(value: Any, limit: int) -> Any:
    if isinstance(value, str):
        return clip_text(value, limit)
    if isinstance(value, list):
        return [_clip_nested_text(item, max(600, limit // 4)) for item in value[:30]]
    if isinstance(value, dict):
        return {key: _clip_nested_text(item, max(600, limit // max(2, len(value)))) for key, item in value.items()}
    return value


def _policy() -> dict[str, Any]:
    return {
        "input_budget_chars": MAX_CONTEXT_CHARS,
        "media_payloads": "omitted; only has_image/has_video flags are exposed",
        "full_project_json": "forbidden",
        "api_keys": "forbidden",
        "long_text_strategy": "task-specific excerpt plus head/tail shortening",
    }


def _write_target_from_contract(contract: str) -> str:
    marker = "write target:"
    lower = contract.lower()
    if marker in lower:
        return contract[lower.index(marker) + len(marker) :].strip()[:500]
    for token in ("step_", "step."):
        index = contract.find(token)
        if index >= 0:
            return contract[index : index + 500]
    return "task output contract"


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(sanitize_for_ai(value), ensure_ascii=False, sort_keys=True)
    text = _sanitize_string(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _sanitize_string(value: str) -> str:
    for key in sorted(MEDIA_KEYS, key=len, reverse=True):
        flag = _media_flag_name(key)
        value = re.sub(rf'"{re.escape(key)}"\s*:\s*"[^"]*"', f'"{flag}": true', value, flags=re.IGNORECASE)
        value = re.sub(rf"\b{re.escape(key)}\s*=\s*\S+", f"{flag}=true", value, flags=re.IGNORECASE)
    value = DATA_URL_RE.sub("[omitted media payload]", value)
    value = LONG_BASE64_RE.sub("[omitted encoded payload]", value)
    value = SECRET_KEY_RE.sub("[omitted secret]", value)
    return value


def _looks_secret_key(key: str) -> bool:
    return any(part in key for part in ("api_key", "apikey", "secret", "token", "password", "authorization"))


def _media_flag_name(key: str) -> str:
    if "video" in key:
        return "has_video"
    if "cover" in key:
        return "has_cover_image"
    if "source" in key or "frame" in key:
        return "has_source_image"
    return "has_image"


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)
