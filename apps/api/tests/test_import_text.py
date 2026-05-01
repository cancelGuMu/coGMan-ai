from io import BytesIO
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _docx_bytes(text: str) -> bytes:
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{text}</w:t></w:r></w:p>
  </w:body>
</w:document>"""
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def test_import_docx_extracts_text() -> None:
    response = client.post(
        "/api/import/text",
        files={"file": ("story.docx", _docx_bytes("第一章 Word 导入测试"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "story.docx"
    assert "第一章 Word 导入测试" in data["content"]
    assert data["parse_status"] == "docx"


def test_import_gbk_text() -> None:
    response = client.post(
        "/api/import/text",
        files={"file": ("story.txt", "中文 GBK 导入测试".encode("gb18030"), "text/plain")},
    )

    assert response.status_code == 200
    assert "中文 GBK 导入测试" in response.json()["content"]


def test_import_legacy_doc_returns_clear_error() -> None:
    response = client.post(
        "/api/import/text",
        files={"file": ("story.doc", b"\xd0\xcf\x11\xe0legacy-doc", "application/msword")},
    )

    assert response.status_code == 415
    assert "暂不支持 .doc" in response.json()["detail"]
