from datetime import datetime
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    DialogueLine,
    ProjectRecord,
    StepEightData,
    StepNineData,
    StepTenData,
    SubtitleCue,
    TimelineClip,
    VideoClipItem,
)


client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_generated_video_media_mount() -> None:
    routes = {getattr(route, "path", "") for route in client.app.routes}
    assert "/media/generated-videos" in routes
    assert "/media/generated-audio" in routes
    assert "/media/jianying-exports" in routes


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


def test_export_jianying_project_endpoint(monkeypatch, tmp_path) -> None:
    project = ProjectRecord(
        id="project-1",
        name="Export Test",
        created_at=datetime.now(),
        updated_at=datetime.now(),
        step_eight=StepEightData(
            clips=[
                VideoClipItem(
                    id="video-1",
                    shot_id="shot-1",
                    shot_label="S1",
                    url="http://127.0.0.1:8000/media/generated-videos/video-1.mp4",
                    duration_seconds=5,
                    status="final",
                )
            ]
        ),
        step_nine=StepNineData(
            dialogue_lines=[
                DialogueLine(
                    id="line-1",
                    shot_id="shot-1",
                    shot_label="S1",
                    speaker="Narrator",
                    text="Test line",
                    audio_url="http://127.0.0.1:8000/media/generated-audio/line-1.mp3",
                )
            ],
            subtitle_cues=[SubtitleCue(id="sub-1", shot_id="shot-1", start_seconds=0, end_seconds=2, text="Test subtitle")],
        ),
        step_ten=StepTenData(
            timeline_clips=[
                TimelineClip(id="tl-1", track="video", name="Video", source_id="video-1", start_seconds=0, end_seconds=5),
                TimelineClip(id="tl-2", track="audio", name="Audio", source_id="line-1", start_seconds=0, end_seconds=2),
                TimelineClip(id="tl-3", track="subtitle", name="Subtitle", source_id="sub-1", start_seconds=0, end_seconds=2),
            ]
        ),
    )
    monkeypatch.setattr("app.main.get_project", lambda project_id: project if project_id == "project-1" else None)
    monkeypatch.setattr("app.main.JIANYING_EXPORT_DIR", tmp_path)

    response = client.post("/api/export/jianying-project/project-1")
    assert response.status_code == 200
    payload = response.json()
    assert payload["url"].startswith("http://127.0.0.1:8000/media/jianying-exports/")
    archive_path = tmp_path / payload["filename"]
    assert archive_path.exists()
    with ZipFile(archive_path) as archive:
        names = set(archive.namelist())
    assert "draft_content.json" in names
    assert "draft_meta_info.json" in names
    assert "assets_manifest.json" in names
