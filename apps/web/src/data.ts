import type { ProjectRecord, StepId, StepOneData, StepTwoData } from "./types";

export const workflowSteps: Array<{ id: StepId; label: string }> = [
  { id: "topic-planning", label: "01 选题策划" },
  { id: "script-creation", label: "02 剧本创作" },
  { id: "storyboard-design", label: "03 分镜设计" },
  { id: "character-image", label: "04 角色生图" },
  { id: "image-to-video", label: "05 图生视频" },
  { id: "voice-subtitle", label: "06 配音字幕" },
  { id: "editing-export", label: "07 剪辑导出" },
  { id: "distribution", label: "08 矩阵发布" },
  { id: "data-review", label: "09 数据复盘" },
];

export function defaultStepOneData(projectName = ""): StepOneData {
  return {
    project_name: projectName,
    core_story_idea: "",
    season_episode_count: "12集",
    custom_episode_count: null,
    imported_story_name: null,
    linked_project: false,
    episodes: Array.from({ length: 12 }, (_, index) => ({
      episode_number: index + 1,
      title: `第 ${index + 1} 集`,
      content: "",
      hook: "",
    })),
  };
}

export function defaultStepTwoData(projectName = ""): StepTwoData {
  return {
    project_name: projectName,
    project_status: "草稿中",
    body_readiness: 0,
    script_status: "未生成",
    last_modified_by: "人工",
    source_material: "",
    imported_source_name: null,
    reference_text: "",
    novel_text: "",
    imported_novel_name: null,
    character_profiles: "",
    terminology_library: "",
    writing_guidance: "",
    version_status: "v1 草稿",
    script_text: "",
    review_notes: "",
    rewrite_tool: {
      mode: "partial",
      selected_target: "novel",
      selection_text: "",
      rewrite_prompt: "",
    },
    modification_records: [],
  };
}

export function mergeProjectDefaults(project: ProjectRecord): ProjectRecord {
  const stepOneDefaults = defaultStepOneData(project.name);
  const stepTwoDefaults = defaultStepTwoData(project.name);

  return {
    ...project,
    cover_image_url: project.cover_image_url ?? null,
    step_one: {
      ...stepOneDefaults,
      ...project.step_one,
      episodes: project.step_one.episodes.length ? project.step_one.episodes : stepOneDefaults.episodes,
    },
    step_two: {
      ...stepTwoDefaults,
      ...project.step_two,
      rewrite_tool: {
        ...stepTwoDefaults.rewrite_tool,
        ...project.step_two.rewrite_tool,
      },
      modification_records: project.step_two.modification_records ?? [],
    },
  };
}
