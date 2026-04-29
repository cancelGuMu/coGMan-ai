import type { EpisodeDraft, StepTwoData, StoryRelationship } from "./types";

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

export type ParsedSeasonOutline = {
  season_outline: string;
  episodes: EpisodeDraft[];
  formatted: boolean;
};

export type ParsedFoundationResult = {
  fields: Record<string, string>;
  relationships: StoryRelationship[];
  formatted: boolean;
};

type RawEpisodeOutline = {
  episode_number?: unknown;
  episode?: unknown;
  number?: unknown;
  title?: unknown;
  episode_title?: unknown;
  content?: unknown;
  core_event?: unknown;
  summary?: unknown;
  hook?: unknown;
  ending_hook?: unknown;
  cliffhanger?: unknown;
};

type RawSeasonOutline = {
  season_outline?: unknown;
  outline?: unknown;
  summary?: unknown;
  episodes?: unknown;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asTextBlock(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function asEpisodeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.floor(value));
  if (typeof value !== "string") return null;
  const match = value.match(/\d+/);
  if (match) return Math.max(1, Number.parseInt(match[0], 10));
  return chineseEpisodeNumber(value);
}

function chineseEpisodeNumber(value: string): number | null {
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const text = value.replace(/[第集\s]/g, "");
  if (!text) return null;
  if (text === "十") return 10;
  const hundredParts = text.split("百");
  let total = 0;
  let remainder = text;
  if (hundredParts.length === 2) {
    total += (digits[hundredParts[0]] || 1) * 100;
    remainder = hundredParts[1];
  }
  const tenParts = remainder.split("十");
  if (tenParts.length === 2) {
    total += (digits[tenParts[0]] || 1) * 10;
    total += digits[tenParts[1]] || 0;
    return total || null;
  }
  return digits[remainder] ?? null;
}

function stripJsonFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function collectJsonCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const fenced = raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fenced) {
    const candidate = stripJsonFence(match[1]);
    if (candidate) candidates.push(candidate);
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(raw.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return Array.from(new Set(candidates));
}

function normalizeRawEpisode(value: RawEpisodeOutline, fallbackIndex: number): EpisodeDraft | null {
  const episodeNumber =
    asEpisodeNumber(value.episode_number) ??
    asEpisodeNumber(value.episode) ??
    asEpisodeNumber(value.number) ??
    fallbackIndex + 1;
  const title = asText(value.title) || asText(value.episode_title) || `第 ${episodeNumber} 集`;
  const content = asText(value.content) || asText(value.core_event) || asText(value.summary);
  const hook = asText(value.hook) || asText(value.ending_hook) || asText(value.cliffhanger);

  if (!content && !hook && !title) return null;
  return {
    episode_number: episodeNumber,
    title,
    content,
    hook,
  };
}

function parseJsonSeasonOutline(raw: string): ParsedSeasonOutline | null {
  const episodesByNumber = new Map<number, EpisodeDraft>();
  const outlines: string[] = [];

  for (const candidate of collectJsonCandidates(raw)) {
    try {
      const parsed = JSON.parse(candidate) as RawSeasonOutline;
      const outline = asText(parsed.season_outline) || asText(parsed.outline) || asText(parsed.summary);
      if (outline) outlines.push(outline);

      if (Array.isArray(parsed.episodes)) {
        parsed.episodes.forEach((item, index) => {
          if (!item || typeof item !== "object") return;
          const episode = normalizeRawEpisode(item as RawEpisodeOutline, index);
          if (episode) episodesByNumber.set(episode.episode_number, episode);
        });
      }
    } catch {
      // Continue with the next candidate; model responses often wrap JSON with extra text.
    }
  }

  if (!outlines.length && !episodesByNumber.size) return null;
  return {
    season_outline: outlines.join("\n\n"),
    episodes: Array.from(episodesByNumber.values()).sort((a, b) => a.episode_number - b.episode_number),
    formatted: episodesByNumber.size > 0,
  };
}

function parseJsonObjects(raw: string): Array<Record<string, unknown>> {
  return collectJsonCandidates(raw).flatMap((candidate) => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return [parsed as Record<string, unknown>];
    } catch {
      // Continue with the next candidate.
    }
    return [];
  });
}

function asRelationship(value: unknown, index: number): StoryRelationship | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const characterA = asTextBlock(item.character_a);
  const characterB = asTextBlock(item.character_b);
  const relationship = asTextBlock(item.relationship);
  const conflict = asTextBlock(item.conflict);
  if (!characterA && !characterB && !relationship && !conflict) return null;
  return {
    id: `rel-ai-${Date.now()}-${index}`,
    character_a: characterA || "待补充角色A",
    character_b: characterB || "待补充角色B",
    relationship,
    conflict,
  };
}

export function parseStepOneFoundationResult(raw: string): ParsedFoundationResult {
  const fields: Record<string, string> = {};
  const relationships: StoryRelationship[] = [];
  const objects = parseJsonObjects(normalizeText(raw));

  for (const item of objects) {
    for (const key of [
      "world_background",
      "era_setting",
      "rule_system",
      "conflict_environment",
      "protagonist_goal",
      "antagonist_pressure",
      "core_conflict",
      "character_growth",
      "relationship_notes",
    ]) {
      const value = asTextBlock(item[key]);
      if (value) fields[key] = value;
    }

    if (Array.isArray(item.relationships)) {
      item.relationships.forEach((relationship, index) => {
        const parsed = asRelationship(relationship, index);
        if (parsed) relationships.push(parsed);
      });
    }
  }

  return {
    fields,
    relationships,
    formatted: Object.keys(fields).length > 0 || relationships.length > 0,
  };
}

function parseEpisodeSections(raw: string): EpisodeDraft[] {
  const marker = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:第\s*([0-9一二三四五六七八九十百]+)\s*集|Episode\s*(\d+))\s*[：:.\-\s]*(.*)/gi;
  const matches = Array.from(raw.matchAll(marker));
  if (!matches.length) return [];

  return matches
    .map((match, index) => {
      const fullIndex = match.index ?? 0;
      const nextIndex = matches[index + 1]?.index ?? raw.length;
      const header = (match[3] ?? "").trim();
      const body = raw.slice(fullIndex + match[0].length, nextIndex).trim();
      const numberText = match[1] || match[2] || String(index + 1);
      const episodeNumber = asEpisodeNumber(numberText) ?? index + 1;
      const titleMatch = body.match(/(?:标题|本集标题)\s*[：:]\s*(.+)/);
      const hookMatch = body.match(/(?:钩子|结尾悬念|悬念|hook)\s*[：:]\s*(.+)/i);
      const title = (header || titleMatch?.[1] || `第 ${episodeNumber} 集`).trim();
      const hook = (hookMatch?.[1] ?? "").trim();
      const content = body
        .replace(/(?:标题|本集标题)\s*[：:]\s*.+/g, "")
        .replace(/(?:钩子|结尾悬念|悬念|hook)\s*[：:]\s*.+/gi, "")
        .trim();

      return {
        episode_number: episodeNumber,
        title,
        content: content || body || header,
        hook,
      };
    })
    .filter((episode) => episode.content.trim() || episode.hook.trim());
}

export function parseSeasonOutlineResult(raw: string): ParsedSeasonOutline {
  const normalized = normalizeText(raw);
  const parsedJson = parseJsonSeasonOutline(normalized);
  if (parsedJson?.episodes.length) {
    return {
      season_outline: parsedJson.season_outline || normalized,
      episodes: parsedJson.episodes,
      formatted: true,
    };
  }

  const sectionEpisodes = parseEpisodeSections(normalized);
  if (sectionEpisodes.length) {
    return {
      season_outline: normalized,
      episodes: sectionEpisodes,
      formatted: true,
    };
  }

  return {
    season_outline: normalized,
    episodes: [],
    formatted: false,
  };
}

export function buildStepOneChunks(coreStoryIdea: string, episodeCount?: number): string[] {
  const chunks = chunkText(coreStoryIdea, MAX_GENERATION_CHUNK_CHARS, 4);
  const countInstruction = episodeCount ? `目标集数：${episodeCount} 集。` : "目标集数：按当前项目设置。";
  const formatInstruction =
    "必须只返回 JSON，不要输出寒暄、前置说明、Markdown 标题或解释文字。JSON 字段为 season_outline 和 episodes；episodes 每项必须包含 episode_number、title、content、hook。";
  const fallback = "请根据当前项目生成季纲草案。";
  return (chunks.length ? chunks : [fallback]).map((chunk, index) =>
    [`分段：${index + 1}/${Math.max(chunks.length, 1)}。`, countInstruction, formatInstruction, "故事输入：", chunk].join("\n")
  );
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
