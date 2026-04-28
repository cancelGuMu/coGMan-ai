import type { StepTwoData } from "./types";

export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_GENERATION_CHUNK_CHARS = 4_000;
export const MAX_GENERATION_CHUNKS = 8;

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function chunkText(value: string, chunkSize: number, maxChunks: number): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length && chunks.length < maxChunks) {
    let end = Math.min(cursor + chunkSize, normalized.length);
    if (end < normalized.length) {
      const splitAt = normalized.lastIndexOf("\n", end);
      if (splitAt > cursor + Math.floor(chunkSize * 0.5)) end = splitAt;
    }
    chunks.push(normalized.slice(cursor, end).trim());
    cursor = end;
    while (normalized[cursor] === "\n") cursor += 1;
  }

  if (cursor < normalized.length && chunks.length > 0) {
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n\n[后续内容已并入当前分段摘要]\n${normalized
      .slice(cursor, cursor + Math.floor(chunkSize * 0.5))
      .trim()}`;
  }

  return chunks.filter(Boolean);
}

export function assertImportableFile(file: File): void {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`导入文件过大，请控制在 ${(MAX_IMPORT_FILE_BYTES / 1024 / 1024).toFixed(0)}MB 以内。`);
  }
}

export function buildStepOneChunks(coreStoryIdea: string): string[] {
  const chunks = chunkText(coreStoryIdea, MAX_GENERATION_CHUNK_CHARS, 4);
  return chunks.length ? chunks : ["请根据当前项目生成季纲草案。"];
}

export function buildStepTwoChunks(form: StepTwoData): Array<{ label: string; content: string }> {
  const sections = [
    { label: "素材文本", value: form.source_material },
    { label: "小说正文", value: form.novel_text },
    { label: "参考文本", value: form.reference_text },
    { label: "角色画像", value: form.character_profiles },
    { label: "术语库", value: form.terminology_library },
    { label: "写作指导", value: form.writing_guidance },
  ];

  const chunks = sections.flatMap((section) =>
    chunkText(section.value, MAX_GENERATION_CHUNK_CHARS, 2).map((content, index) => ({
      label: `${section.label}-${index + 1}`,
      content,
    }))
  );

  return chunks.slice(0, MAX_GENERATION_CHUNKS);
}

export function mergeChunkResults(parts: string[]): string {
  return parts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join("\n\n");
}
