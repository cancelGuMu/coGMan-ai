import json
import os
from typing import Any

from fastapi.testclient import TestClient

from app import ai_services
from app.context_builder import build_task_context_prompt, validate_ai_output
from app.main import app
from app.models import (
    AssetCharacter,
    AssetProp,
    AssetScene,
    EpisodeDraft,
    ImageCandidate,
    ProjectRecord,
    PromptItem,
    ShotItem,
    StepEightData,
    StepFiveData,
    StepFourData,
    StepOneData,
    StepSixData,
    StepThreeData,
    StepTwoData,
)
from app.prompt_registry import PROMPT_TASKS, build_text_messages, get_prompt_task, validate_prompt_registry


client = TestClient(app)


def test_prompt_registry_every_task_has_strict_json_contract_and_write_target() -> None:
    assert len(PROMPT_TASKS) >= 40
    assert validate_prompt_registry() == []

    for task_id, task in PROMPT_TASKS.items():
        contract = task.output_contract
        assert task_id == task.task_id
        assert task.step_id
        assert task.model_role
        assert task.user_instruction.strip()
        assert "只返回合法 JSON" in contract or "只返回一个合法 JSON" in contract
        assert "写入位置：" in contract
        assert "不要输出 Markdown" in contract


def test_text_messages_include_step_role_task_and_output_contract() -> None:
    messages = build_text_messages(
        project_name="测试项目",
        prompt="镜头：主角推门进入锈钟馆",
        mode="generic",
        task_id="S05_T2I_PROMPT",
    )

    assert messages[0]["role"] == "system"
    assert "保持项目连续性" in messages[0]["content"]
    user = messages[1]["content"]
    assert "当前步骤：prompt-generation" in user
    assert "任务编号：S05_T2I_PROMPT" in user
    assert "模型角色：prompt_engineer" in user
    assert "写入位置：step_five.prompts[]" in user
    assert "请只输出满足契约的 JSON 对象" in user


def test_prompt_generation_tasks_require_single_english_language() -> None:
    for task_id in ("S05_T2I_PROMPT", "S05_I2V_PROMPT", "S05_NEGATIVE_PROMPT"):
        task = get_prompt_task(task_id, "generic")
        combined = f"{task.user_instruction}\n{task.output_contract}"
        assert "不得中英混写" in combined
        assert "纯英文" in combined or "统一使用英文" in combined


def test_t2i_prompt_requires_eyeline_and_prop_orientation_consistency() -> None:
    task = get_prompt_task("S05_T2I_PROMPT", "generic")
    combined = f"{task.user_instruction}\n{task.output_contract}"
    assert "角色视线" in combined
    assert "道具朝向" in combined
    assert "over-the-shoulder view" in combined
    assert "contradictory eyeline" in combined


def test_directorial_grammar_is_embedded_in_visual_pipeline_tasks() -> None:
    for task_id in ("S04_STORYBOARD_SPLIT", "S04_STORYBOARD_CHECK", "S05_T2I_PROMPT", "S05_I2V_PROMPT", "S08_VIDEO_TASK"):
        task = get_prompt_task(task_id, "generic")
        combined = f"{task.user_instruction}\n{task.output_contract}"
        assert "导演镜头语言规则" in combined
        assert "景别含义" in combined
        assert "机位含义" in combined
        assert "揭示信息" in combined or "信息展示" in combined
        assert "emotional" in combined or "情绪" in combined


def test_repaint_prompt_task_requires_complete_gpt_image_prompt_from_user_feedback() -> None:
    task = get_prompt_task("S06_REPAINT_PROMPT", "generic")
    combined = f"{task.user_instruction}\n{task.output_contract}"
    assert "用户提交的画面修改意见" in combined
    assert "完整英文 T2I 重绘提示词" in combined
    assert "gpt-image-2" in combined
    assert "角色视线" in combined
    assert "prop orientation" in combined


def test_ai_tools_diagnostics_returns_determined_registry_output() -> None:
    response = client.get("/api/ai-tools/diagnostics")

    assert response.status_code == 200
    data = response.json()
    assert data["prompt_registry"]["status"] == "ok"
    assert data["prompt_registry"]["issues"] == []
    assert data["prompt_registry"]["steps"]["story-structure"] >= 1
    assert data["prompt_registry"]["steps"]["publish-review"] >= 1


def test_generate_text_task_routes_to_task_contract(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def fake_generate(project_name: str, prompt: str, mode: str, task_id: str | None = None) -> str:
        captured.update({"project_name": project_name, "prompt": prompt, "mode": mode, "task_id": task_id})
        return json.dumps({"positive_prompt": "主角推门进入锈钟馆", "negative_prompt": "字幕残影", "parameters": "16:9", "locked_terms": ["沈默"]}, ensure_ascii=False)

    monkeypatch.setattr("app.main.generate_deepseek_text", fake_generate)

    response = client.post(
        "/api/generate/text-task",
        json={
            "project_name": "测试项目",
            "task_id": "S05_T2I_PROMPT",
            "mode": "s05_t2i_prompt",
            "prompt": "生成镜头提示词",
        },
    )

    assert response.status_code == 200
    assert response.json()["record"] == "DeepSeek 完成 S05_T2I_PROMPT"
    assert captured["task_id"] == "S05_T2I_PROMPT"
    assert "写入位置：step_five.prompts[]" in captured["prompt"]
    assert response.json()["content"].startswith("{")


def test_context_gateway_removes_media_payloads_from_project_memory() -> None:
    project = ProjectRecord(
        id="p-context",
        name="context project",
        created_at="2026-05-02T00:00:00",
        updated_at="2026-05-02T00:00:00",
        step_two=StepTwoData(
            script_text="Scene: the lead enters the glass station.\n" * 800,
            character_profiles="Lead: calm investigator.",
            terminology_library="Glass station: recurring scene.",
        ),
        step_three=StepThreeData(
            scenes=[
                AssetScene(
                    id="scene-1",
                    name="Glass Station",
                    location="Old town",
                    atmosphere="rain, neon, empty",
                    episodes="1",
                    image_url="data:image/png;base64," + "A" * 3_000_000,
                    image_prompt="wide station concept",
                )
            ]
        ),
        step_six=StepSixData(
            candidates=[
                ImageCandidate(
                    id="img-1",
                    shot_id="shot-1",
                    shot_label="E1#1",
                    url="data:image/png;base64," + "B" * 3_000_000,
                    prompt="station first frame",
                )
            ]
        ),
    )

    bundle = build_task_context_prompt(
        get_prompt_task("S03_SCENE_CARDS", "generic"),
        project,
        user_prompt="complete scene card image_url=data:image/png;base64,CCCC",
        target_type="scene",
        target_id="scene-1",
    )

    assert bundle.prompt.startswith("AI_CONTEXT_GATEWAY_V1")
    assert len(bundle.prompt) < 60_000
    assert "data:image" not in bundle.prompt
    assert "image_url" not in bundle.prompt
    assert "has_image" in bundle.prompt


def test_generate_text_task_with_project_id_sends_minimized_context(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    project = ProjectRecord(
        id="p-api-context",
        name="api context project",
        created_at="2026-05-02T00:00:00",
        updated_at="2026-05-02T00:00:00",
        step_two=StepTwoData(script_text="Scene: tower negotiation. " * 500),
        step_three=StepThreeData(
            scenes=[
                AssetScene(
                    id="scene-api",
                    name="Tower",
                    location="North city",
                    atmosphere="oppressive",
                    episodes="1",
                    image_url="data:image/png;base64," + "Z" * 2_000_000,
                )
            ]
        ),
    )

    def fake_get_project(project_id: str):
        return project if project_id == project.id else None

    def fake_generate(project_name: str, prompt: str, mode: str, task_id: str | None = None) -> str:
        captured.update({"project_name": project_name, "prompt": prompt, "mode": mode, "task_id": task_id})
        return json.dumps({"scenes": [{"name": "Tower", "location": "North city", "atmosphere": "oppressive", "episodes": "1"}]}, ensure_ascii=False)

    monkeypatch.setattr("app.storage.get_project", fake_get_project)
    monkeypatch.setattr("app.main.get_project", fake_get_project)
    monkeypatch.setattr("app.main.generate_deepseek_text", fake_generate)

    response = client.post(
        "/api/generate/text-task",
        json={
            "project_name": "api context project",
            "project_id": project.id,
            "task_id": "S03_SCENE_CARDS",
            "mode": "s03_scene_cards",
            "target_type": "scene",
            "target_id": "scene-api",
            "prompt": "user text data:image/png;base64,AAAA",
        },
    )

    assert response.status_code == 200
    assert captured["prompt"].startswith("AI_CONTEXT_GATEWAY_V1")
    assert len(captured["prompt"]) < 60_000
    assert "data:image" not in captured["prompt"]
    assert "image_url" not in captured["prompt"]
    assert "has_image" in captured["prompt"]


def test_repaint_context_stays_within_budget_with_large_image_candidates() -> None:
    project = ProjectRecord(
        id="p-repaint-budget",
        name="repaint budget project",
        created_at="2026-05-03T00:00:00",
        updated_at="2026-05-03T00:00:00",
        step_four=StepFourData(
            shots=[
                ShotItem(
                    id="shot-repaint",
                    episode_number=1,
                    shot_number=5,
                    scene="Archive basement",
                    characters=["Shen Mo"],
                    props=["black notebook"],
                    purpose="Shen Mo reads the warning and dismisses it as a prank.",
                    story_beat="He relaxes before the later reversal.",
                    visual_description="Notebook foreground, character reaction on the side.",
                    action="Shen Mo reads, then smirks.",
                    blocking="Notebook should face the character, not the audience.",
                    shot_size="close-up to medium close-up",
                    camera_angle="eye level",
                    composition="over-the-shoulder reading composition",
                    generation_notes="avoid front-facing document display",
                )
            ]
        ),
        step_six=StepSixData(
            candidates=[
                ImageCandidate(
                    id=f"img-repaint-{index}",
                    shot_id="shot-repaint",
                    shot_label=f"E1#{index}",
                    url="data:image/png;base64," + ("A" * 250_000),
                    prompt="Over-the-shoulder archive image prompt. " * 300,
                    repaint_instruction="The notebook page must face Shen Mo, not the audience.",
                    repaint_prompt="Previous repaint prompt. " * 300,
                )
                for index in range(12)
            ]
        ),
    )

    bundle = build_task_context_prompt(
        get_prompt_task("S06_REPAINT_PROMPT", "generic"),
        project,
        user_prompt="Fix the composition so the notebook is seen by the character, not presented to the viewer.",
        target_type="image",
        target_id="img-repaint-0",
    )

    assert bundle.prompt.startswith("AI_CONTEXT_GATEWAY_V1")
    assert len(bundle.prompt) < 60_000
    assert "data:image" not in bundle.prompt
    assert "url" not in bundle.prompt
    assert "related_image_candidates" in bundle.prompt
    assert "front-facing document" in bundle.prompt


def test_repaint_context_clips_legacy_frontend_prompt_payload() -> None:
    project = ProjectRecord(
        id="p-repaint-legacy-payload",
        name="legacy repaint payload project",
        created_at="2026-05-03T00:00:00",
        updated_at="2026-05-03T00:00:00",
        step_four=StepFourData(
            shots=[ShotItem(id="shot-legacy", episode_number=1, shot_number=5, scene="Archive", characters=["Shen Mo"], props=["Notebook"], purpose="read clue")]
        ),
        step_six=StepSixData(
            candidates=[
                ImageCandidate(
                    id="img-legacy",
                    shot_id="shot-legacy",
                    shot_label="E1#5",
                    url="data:image/png;base64," + ("A" * 250_000),
                    prompt="Original prompt. " * 500,
                )
            ]
        ),
    )
    legacy_frontend_prompt = json.dumps(
        {
            "director_grammar": "导演镜头语言规则：" * 200,
            "shot": {"id": "shot-legacy", "verbose": "shot payload " * 2000},
            "image": {"id": "img-legacy", "original_prompt": "image prompt " * 3000},
            "step_five_prompt": {"t2i_prompt": "t2i prompt " * 3000},
            "user_revision_instruction": "页面朝向角色，改为肩后视角",
        },
        ensure_ascii=False,
    )

    bundle = build_task_context_prompt(
        get_prompt_task("S06_REPAINT_PROMPT", "generic"),
        project,
        user_prompt=legacy_frontend_prompt,
        target_type="image",
        target_id="img-legacy",
    )

    assert len(bundle.prompt) < 60_000
    assert bundle.diagnostics["context_chars"] < 60_000
    assert "data:image" not in bundle.prompt
    assert len(bundle.context["user_edits"]) <= 2_100
    assert "target_prompt" in bundle.prompt


def test_video_context_clips_legacy_frontend_prompt_payload() -> None:
    project = ProjectRecord(
        id="p-video-legacy-payload",
        name="legacy video payload project",
        created_at="2026-05-04T00:00:00",
        updated_at="2026-05-04T00:00:00",
        step_four=StepFourData(
            shots=[
                ShotItem(
                    id="shot-video",
                    episode_number=1,
                    shot_number=1,
                    scene="Archive basement",
                    characters=[],
                    props=[],
                    purpose="Establish a cold, oppressive archive corridor.",
                    story_beat="The scene begins with a slow pan through the archive.",
                    visual_description="Blurred shelves in the foreground, corridor receding into darkness.",
                    action="The camera slowly tracks and pans across the archive racks.",
                    blocking="No character in frame; shelves create layered depth.",
                    shot_size="wide shot to medium shot",
                    camera_angle="eye level with slight high angle",
                    composition="foreground shelves, midground corridor, dust in light beams",
                    lens="wide angle",
                    movement="slow dolly pan from right to left",
                    camera_motion="slow dolly pan from right to left",
                    lighting="flickering cold fluorescent practicals",
                    color_mood="cold desaturated psychological thriller",
                    generation_notes="no subtitles or unrelated text",
                )
            ]
        ),
        step_five=StepFiveData(
            prompts=[
                PromptItem(
                    id="prompt-video",
                    shot_id="shot-video",
                    shot_label="E1#1",
                    i2v_prompt="Slow dolly pan across cold underground archive shelves, motivated by spatial reveal. " * 80,
                    negative_prompt="subtitles, watermark, warm daylight, cartoon, sudden jump cut",
                    parameters="16:9, cinematic, first frame locked",
                    locked_terms="Archive basement\ncold low saturation",
                )
            ]
        ),
        step_six=StepSixData(
            candidates=[
                ImageCandidate(
                    id="img-video",
                    shot_id="shot-video",
                    shot_label="E1#1",
                    url="data:image/png;base64," + ("A" * 250_000),
                    prompt="Wide archive image prompt. " * 500,
                    status="selected",
                    metadata="AIArtMirror / gpt-image-2",
                )
            ]
        ),
        step_eight=StepEightData(
            motion_settings="动作：自然推进；环境动态：轻微；运镜：按分镜；时长：跟随镜头。" * 40,
            reference_bindings="首帧绑定 img-video，保持档案架和冷雾一致。" * 40,
        ),
    )
    legacy_frontend_prompt = json.dumps(
        {
            "director_grammar": "导演镜头语言规则：" * 200,
            "shot": {"id": "shot-video", "verbose": "shot payload " * 2000},
            "image": {
                "id": "img-video",
                "url": "data:image/png;base64," + ("B" * 250_000),
                "original_prompt": "image prompt " * 3000,
            },
            "i2v_prompt": "video prompt " * 3000,
            "negative_prompt": "negative prompt " * 2000,
            "motion_settings": "motion settings " * 2000,
            "reference_bindings": "reference bindings " * 2000,
            "qc_reports": [{"issue": "qc payload " * 2000}],
        },
        ensure_ascii=False,
    )

    bundle = build_task_context_prompt(
        get_prompt_task("S08_VIDEO_TASK", "generic"),
        project,
        user_prompt=legacy_frontend_prompt,
        target_type="image",
        target_id="img-video",
    )

    assert len(bundle.prompt) < 60_000
    assert bundle.diagnostics["context_chars"] < 60_000
    assert "data:image" not in bundle.prompt
    assert '"url"' not in bundle.prompt
    assert len(bundle.context["user_edits"]) <= 2_100
    assert "target_shot" in bundle.prompt
    assert "target_prompt" in bundle.prompt
    assert "qc_reports" not in bundle.prompt


def test_storyboard_and_prompt_context_use_target_slices() -> None:
    project = ProjectRecord(
        id="p-sliced-context",
        name="sliced context project",
        created_at="2026-05-03T00:00:00",
        updated_at="2026-05-03T00:00:00",
        step_one=StepOneData(
            episodes=[
                EpisodeDraft(episode_number=1, title="Episode One", content="First episode archive discovery.", hook="Notebook warning."),
                EpisodeDraft(episode_number=2, title="Episode Two", content="Second episode clock tower.", hook="Red tea."),
            ]
        ),
        step_two=StepTwoData(
            script_text=("第1集 沈默进入档案馆，发现黑皮笔记本。\n" * 200)
            + ("第2集 沈默进入钟楼，遇到红茶。\n" * 200),
            character_profiles="Shen Mo: skeptical investigator.",
            terminology_library="Seven Day Ritual: time loop.",
            writing_guidance="Keep suspense tight.",
        ),
        step_three=StepThreeData(
            characters=[AssetCharacter(id="char-1", name="沈默", role="protagonist")],
            scenes=[AssetScene(id="scene-1", name="档案馆", location="basement")],
            props=[AssetProp(id="prop-1", name="黑皮笔记本", story_function="warning carrier")],
            style_board="cold archive thriller",
            consistency_rules="keep Shen Mo consistent",
        ),
        step_four=StepFourData(
            selected_episode_number=1,
            shots=[
                ShotItem(id=f"shot-{index}", episode_number=1, shot_number=index, scene="档案馆", characters=["沈默"], props=["黑皮笔记本"], purpose="reveal clue")
                for index in range(1, 8)
            ],
        ),
    )

    storyboard_bundle = build_task_context_prompt(
        get_prompt_task("S04_STORYBOARD_SPLIT", "generic"),
        project,
        user_prompt="Split only the selected episode.",
        target_type="episode",
        target_id="1",
    )
    prompt_bundle = build_task_context_prompt(
        get_prompt_task("S05_T2I_PROMPT", "generic"),
        project,
        user_prompt="Generate T2I prompt for current shot.",
        target_type="shot",
        target_id="shot-4",
    )

    assert "target_episode" in storyboard_bundle.prompt
    assert "script_or_novel_excerpt" in storyboard_bundle.prompt
    assert "第2集 沈默进入钟楼" not in storyboard_bundle.prompt
    assert "neighbor_shots" in prompt_bundle.prompt
    assert "existing_prompt_for_shot" in prompt_bundle.prompt
    assert '"shots"' not in prompt_bundle.prompt
    assert len(prompt_bundle.prompt) < 60_000


def test_validate_ai_output_rejects_contract_mismatch() -> None:
    try:
        validate_ai_output("S03_SCENE_CARDS", json.dumps({"characters": []}, ensure_ascii=False))
    except ValueError as exc:
        assert "misses expected root keys" in str(exc)
    else:
        raise AssertionError("contract mismatch should be rejected")


def test_storyboard_contract_requires_product_level_fields() -> None:
    contract = PROMPT_TASKS["S04_STORYBOARD_SPLIT"].output_contract

    for field in (
        "story_beat",
        "visual_description",
        "action",
        "blocking",
        "lens",
        "camera_motion",
        "sound_design",
        "transition",
        "continuity_notes",
        "asset_requirements",
        "generation_notes",
        "risk_flags",
    ):
        assert field in contract

    check_contract = PROMPT_TASKS["S04_STORYBOARD_CHECK"].output_contract
    assert "product_ready" in check_contract
    assert "has_generation_constraints" in check_contract


def test_shot_item_accepts_product_level_fields_and_defaults() -> None:
    shot = ShotItem(scene="station", purpose="reveal clue")

    assert shot.visual_description == ""
    assert shot.action == ""
    assert shot.blocking == ""
    assert shot.camera_motion == ""
    assert shot.sound_design == ""
    assert shot.generation_notes == ""
    assert shot.risk_flags == ""

    complete = ShotItem(
        scene="station",
        purpose="reveal clue",
        story_beat="turning point",
        visual_description="wide hall with red sign",
        action="lead opens the locker",
        blocking="lead foreground, witness background",
        lens="35mm",
        camera_motion="slow push in",
        sound_design="low hum",
        transition="hard cut",
        asset_requirements="lead, locker, station",
        generation_notes="no text rendered in frame",
        risk_flags="mirror reflections may duplicate face",
    )

    assert complete.story_beat == "turning point"
    assert complete.asset_requirements == "lead, locker, station"


def test_product_storyboard_output_passes_contract_and_feeds_downstream_context() -> None:
    output = {
        "shots": [
            {
                "shot_id": "shot-1",
                "episode_number": 1,
                "shot_number": 1,
                "scene": "Glass Station",
                "characters": ["Lead"],
                "props": ["locker key"],
                "purpose": "reveal clue",
                "story_beat": "turning point",
                "visual_description": "wide hall with red sign",
                "action": "lead opens the locker",
                "blocking": "lead foreground, witness background",
                "duration_seconds": 6,
                "shot_size": "medium wide",
                "camera_angle": "eye level",
                "composition": "lead on left third, locker centered",
                "lens": "35mm",
                "movement": "slow push",
                "camera_motion": "slow push in",
                "lighting": "cold fluorescent",
                "color_mood": "blue gray tension",
                "dialogue": "Lead: I found it.",
                "sound_design": "low hum and locker click",
                "rhythm": "slow reveal",
                "transition": "hard cut",
                "continuity_notes": "key remains in lead's right hand",
                "asset_requirements": "Lead, Glass Station, locker key",
                "generation_notes": "no readable text rendered in frame",
                "vfx_notes": "none",
                "risk_flags": "mirror reflections may duplicate face",
            }
        ],
        "task_preview": "one product-ready shot",
        "total_duration_seconds": 6,
    }
    assert validate_ai_output("S04_STORYBOARD_SPLIT", json.dumps(output, ensure_ascii=False))["shots"]

    project = ProjectRecord(
        id="p-shot-context",
        name="storyboard context project",
        created_at="2026-05-02T00:00:00",
        updated_at="2026-05-02T00:00:00",
        step_four=StepFourData(shots=[ShotItem(id="shot-1", **output["shots"][0])]),
    )
    bundle = build_task_context_prompt(
        get_prompt_task("S05_T2I_PROMPT", "generic"),
        project,
        user_prompt="build image prompt",
        target_type="shot",
        target_id="shot-1",
    )

    assert "visual_description" in bundle.prompt
    assert "asset_requirements" in bundle.prompt
    assert "generation_notes" in bundle.prompt
    assert "risk_flags" in bundle.prompt


def test_image_generation_uses_document_compatible_prompt_by_default(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setenv("IMAGE_GENERATION_API_KEY", "test-key")

    def fake_post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int = 120) -> dict[str, Any]:
        captured.update({"url": url, "payload": payload, "headers": headers, "timeout": timeout})
        return {"created": 1, "data": [{"url": "https://example.test/image.png"}]}

    monkeypatch.setattr(ai_services, "_post_json", fake_post)

    result = ai_services.generate_image("asset prompt", "asset #1")

    assert result["url"] == "https://example.test/image.png"
    assert captured["payload"]["prompt"] == "asset prompt"
    assert captured["payload"]["n"] == 1
    assert captured["payload"]["quality"] == "auto"
    assert captured["payload"]["group"] == ""


def test_image_generation_uses_aiartmirror_successful_options(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setenv("IMAGE_GENERATION_API_KEY", "test-key")
    monkeypatch.setenv("IMAGE_GENERATION_BASE_URL", "https://www.aiartmirror.com")
    monkeypatch.setenv("IMAGE_GENERATION_MODEL", "gpt-image-2")
    monkeypatch.setenv("IMAGE_GENERATION_QUALITY", "auto")
    monkeypatch.setenv("IMAGE_GENERATION_SIZE", "auto")

    def fake_post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int = 120) -> dict[str, Any]:
        captured.update({"url": url, "payload": payload, "headers": headers, "timeout": timeout})
        return {"created": 1, "data": [{"b64_json": "iVBORw0KGgo="}]}

    monkeypatch.setattr(ai_services, "_post_json", fake_post)

    result = ai_services.generate_image(
        "\u751f\u6210\u89d2\u8272\u8bbe\u5b9a\u4e09\u89c6\u56fe\uff0c\u6b63\u9762\u3001\u4fa7\u9762\u3001\u80cc\u9762\u5e76\u6392\uff0c\u5e72\u51c0\u6d45\u8272\u80cc\u666f",
        "\u6d4b\u8bd5\u89d2\u8272",
    )

    assert captured["url"] == "https://www.aiartmirror.com/v1/images/generations"
    assert captured["payload"]["model"] == "gpt-image-2"
    assert captured["payload"]["quality"] == "auto"
    assert captured["payload"]["size"] == "1536x1024"
    assert result["url"].startswith("data:image/png;base64,")


def test_image_generation_retries_with_fallback_payload(monkeypatch) -> None:
    attempts: list[dict[str, Any]] = []
    monkeypatch.setenv("IMAGE_GENERATION_API_KEY", "test-key")
    monkeypatch.setenv("IMAGE_GENERATION_BASE_URL", "https://www.aiartmirror.com")
    monkeypatch.setenv("IMAGE_GENERATION_MODEL", "gpt-image-2")
    monkeypatch.setenv("IMAGE_GENERATION_QUALITY", "auto")
    monkeypatch.setenv("IMAGE_GENERATION_SIZE", "auto")

    def fake_post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int = 120) -> dict[str, Any]:
        attempts.append(payload)
        if len(attempts) == 1:
            raise ai_services.AIServiceError("HTTP 500 upstream error")
        return {"created": 1, "data": [{"b64_json": "iVBORw0KGgo="}]}

    monkeypatch.setattr(ai_services, "_post_json", fake_post)

    result = ai_services.generate_image(
        "\u751f\u6210\u89d2\u8272\u8bbe\u5b9a\u4e09\u89c6\u56fe\uff0c\u6b63\u9762\u3001\u4fa7\u9762\u3001\u80cc\u9762\u5e76\u6392",
        "\u6d4b\u8bd5\u89d2\u8272",
    )

    assert len(attempts) == 2
    assert attempts[0]["size"] == "1536x1024"
    assert attempts[1]["size"] == "auto"
    assert result["url"].startswith("data:image/png;base64,")


def test_video_generation_prompt_contains_hard_constraints(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setenv("MINIMAX_API_KEY", "test-key")

    def fake_post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int = 120) -> dict[str, Any]:
        captured.update({"url": url, "payload": payload, "headers": headers, "timeout": timeout})
        return {"task_id": "video-task-1"}

    monkeypatch.setattr(ai_services, "_post_json", fake_post)

    result = ai_services.create_minimax_video("沈默缓慢推门，镜头推进", "https://example.test/first.png", 6, "第1集 #1")

    assert result["task_id"] == "video-task-1"
    prompt = captured["payload"]["prompt"]
    assert "coMGan-ai 视频生成硬约束" in prompt
    assert "目标位置：step_eight.clips" in prompt
    assert "镜头标签：第1集 #1" in prompt
    assert "严格继承输入首帧" in prompt
    assert captured["payload"]["first_frame_image"] == "https://example.test/first.png"


def test_minimax_video_accepts_data_url_first_frame_and_clips_prompt(monkeypatch, tmp_path) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setenv("MINIMAX_API_KEY", "test-key")
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text("MINIMAX_API_KEY=test-key\n", encoding="utf-8")

    def fake_post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int = 120) -> dict[str, Any]:
        captured.update({"url": url, "payload": payload, "headers": headers, "timeout": timeout})
        return {"task_id": "video-task-2"}

    monkeypatch.setattr(ai_services, "_post_json", fake_post)
    first_frame = "data:image/png;base64," + ("A" * 128)

    result = ai_services.create_minimax_video("slow dolly move, preserve first frame. " * 200, first_frame, 6, "E1#1")

    assert result["task_id"] == "video-task-2"
    assert captured["url"] == "https://api.minimaxi.com/v1/video_generation"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["payload"]["first_frame_image"] == first_frame
    assert len(captured["payload"]["prompt"]) <= 2_000


def test_minimax_video_uses_configurable_base_url(monkeypatch, tmp_path) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text(
        "MINIMAX_API_KEY=test-key\nMINIMAX_BASE_URL=https://example.minimax.test/v1\n",
        encoding="utf-8",
    )

    def fake_post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int = 120) -> dict[str, Any]:
        captured.update({"url": url, "payload": payload, "headers": headers, "timeout": timeout})
        return {"task_id": "video-task-base-url"}

    monkeypatch.setattr(ai_services, "_post_json", fake_post)

    ai_services.create_minimax_video("slow move", "https://example.test/first.png", 6, "E1#1")

    assert captured["url"] == "https://example.minimax.test/v1/video_generation"


def test_minimax_video_refreshes_env_file_before_request(monkeypatch, tmp_path) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setenv("MINIMAX_API_KEY", "old-process-key")
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text("MINIMAX_API_KEY=fresh-file-key\n", encoding="utf-8")

    def fake_post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int = 120) -> dict[str, Any]:
        captured.update({"url": url, "payload": payload, "headers": headers, "timeout": timeout})
        return {"task_id": "video-task-3"}

    monkeypatch.setattr(ai_services, "_post_json", fake_post)

    ai_services.create_minimax_video("slow move", "https://example.test/first.png", 6, "E1#1")

    assert captured["headers"]["Authorization"] == "Bearer fresh-file-key"


def test_minimax_video_query_normalizes_success_file(monkeypatch) -> None:
    monkeypatch.setenv("MINIMAX_API_KEY", "test-key")

    def fake_query(task_id: str) -> dict[str, Any]:
        assert task_id == "video-task-success"
        return {"task_id": task_id, "status": "Success", "file_id": "file-1"}

    def fake_retrieve(file_id: str) -> dict[str, Any]:
        assert file_id == "file-1"
        return {"file": {"download_url": "https://example.test/video.mp4"}}

    monkeypatch.setattr("app.main.query_minimax_video", fake_query)
    monkeypatch.setattr("app.main.retrieve_minimax_file", fake_retrieve)

    response = client.get("/api/generate/video/video-task-success")

    assert response.status_code == 200
    task = response.json()["task"]
    assert task["normalized_status"] == "success"
    assert task["download_url"] == "https://example.test/video.mp4"
    assert task["raw_status"] == "Success"
