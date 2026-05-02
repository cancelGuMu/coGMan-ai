from datetime import datetime

from app.models import AssetCharacter, ProjectRecord, StepThreeData
from app.storage import _clean_project_record


def test_clean_project_record_blocks_bad_character_cards() -> None:
    bad_text = "警探/调查员，理性冷静，执着不信鬼神；颈部左侧有椭圆形褐色胎记，深色外套；调查锈钟馆案及模仿投毒案。"
    record = ProjectRecord(
        id="project-1",
        name="七日祭",
        created_at=datetime.now(),
        updated_at=datetime.now(),
        step_three=StepThreeData(
            characters=[
                AssetCharacter(
                    id="bad-1",
                    name="沈默",
                    role="主要角色",
                    age="",
                    personality="",
                    appearance=bad_text,
                    motivation=bad_text,
                    outfit="",
                )
            ]
        ),
    )

    cleaned = _clean_project_record(record)

    assert cleaned.step_three.characters == []
    assert "已拦截历史不合格角色卡" in cleaned.step_three.reference_notes


def test_clean_project_record_keeps_complete_character_cards() -> None:
    record = ProjectRecord(
        id="project-1",
        name="七日祭",
        created_at=datetime.now(),
        updated_at=datetime.now(),
        step_three=StepThreeData(
            characters=[
                AssetCharacter(
                    id="good-1",
                    name="沈默",
                    role="刑警/调查员，锈钟馆旧案重新调查者",
                    age="36岁",
                    personality="理性冷静，观察细致，对超常现象保持怀疑但会持续追查矛盾细节。",
                    motivation="查清锈钟馆案与自身胎记、笔记本预言之间的关系，并守住自己的真实身份。",
                    appearance="高瘦身形，眼神克制，后颈左侧有椭圆形褐色胎记，神情常显疲惫。",
                    outfit="深色现代外套，内搭简洁衬衫，便于行动的长裤，随身携带办案笔记本。",
                )
            ]
        ),
    )

    cleaned = _clean_project_record(record)

    assert len(cleaned.step_three.characters) == 1
    assert cleaned.step_three.characters[0].name == "沈默"
