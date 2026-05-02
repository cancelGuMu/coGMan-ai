import json
import os
from typing import Any

from fastapi.testclient import TestClient

from app import ai_services
from app.main import app
from app.prompt_registry import PROMPT_TASKS, build_text_messages, validate_prompt_registry


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


def test_image_generation_prompt_contains_hard_constraints(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setenv("IMAGE_GENERATION_API_KEY", "test-key")

    def fake_post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int = 120) -> dict[str, Any]:
        captured.update({"url": url, "payload": payload, "headers": headers, "timeout": timeout})
        return {"created": 1, "data": [{"url": "https://example.test/image.png"}]}

    monkeypatch.setattr(ai_services, "_post_json", fake_post)

    result = ai_services.generate_image("沈默站在锈钟馆门口", "第1集 #1")

    assert result["url"] == "https://example.test/image.png"
    prompt = captured["payload"]["prompt"]
    assert "coMGan-ai 图片生成硬约束" in prompt
    assert "目标位置：step_six.candidates 或 step_three 资产图字段" in prompt
    assert "镜头/资产标签：第1集 #1" in prompt
    assert "不在画面中生成字幕" in prompt


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
