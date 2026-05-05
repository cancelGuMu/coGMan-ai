from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_generated_video_media_mount() -> None:
    routes = {getattr(route, "path", "") for route in client.app.routes}
    assert "/media/generated-videos" in routes
    assert "/media/generated-audio" in routes


def test_generate_audio_endpoint(monkeypatch) -> None:
    def fake_speech(text: str, voice_id: str, speed: float, vol: float, pitch: int) -> dict[str, str]:
        return {
            "url": "data:audio/mpeg;base64,AAAA",
            "provider": "MiniMax",
            "model": "speech-02-hd",
            "voice_id": voice_id,
            "metadata": f"text={text};speed={speed};vol={vol};pitch={pitch}",
        }

    monkeypatch.setattr("app.main.create_minimax_speech", fake_speech)
    response = client.post(
        "/api/generate/audio",
        json={
            "text": "测试台词",
            "shot_id": "shot-1",
            "shot_label": "第1集 #1",
            "line_id": "line-1",
            "speaker": "旁白",
            "voice_id": "presenter_female",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["url"].startswith("http://127.0.0.1:8000/media/generated-audio/")
    assert payload["status"] == "generated"
    assert payload["voice_id"] == "presenter_female"
