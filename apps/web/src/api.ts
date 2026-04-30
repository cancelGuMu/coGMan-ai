import type {
  DashboardDistributionRow,
  DashboardMetric,
  DashboardOverview,
  DashboardRange,
  DashboardTopWork,
  DashboardTrafficSource,
  DashboardTrendPoint,
  DeleteProjectResponse,
  GeneratedTextResponse,
  GeneratedImageResponse,
  GeneratedVideoResponse,
  ProjectRecord,
  ProjectSummary,
  StepEightData,
  StepElevenData,
  StepFiveData,
  StepFourData,
  StepNineData,
  StepSevenData,
  StepSixData,
  StepTenData,
  StepOneData,
  StepThreeData,
  StepTwoData,
} from "./types";
import { MAX_IMPORT_FILE_BYTES, assertImportableFile } from "./payload";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "请求失败");
  }

  return response.json() as Promise<T>;
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const data = await request<{ projects: ProjectSummary[] }>("/api/projects");
  return data.projects;
}

export async function createProject(name: string): Promise<ProjectRecord> {
  const data = await request<{ project: ProjectRecord }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return data.project;
}

export async function fetchProject(projectId: string): Promise<ProjectRecord> {
  const data = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}`);
  return data.project;
}

export async function renameProject(projectId: string, name: string): Promise<ProjectRecord> {
  const data = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
  return data.project;
}

export async function updateProjectCover(projectId: string, coverImageUrl: string | null): Promise<ProjectRecord> {
  const data = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/cover`, {
    method: "PUT",
    body: JSON.stringify({ cover_image_url: coverImageUrl }),
  });
  return data.project;
}

export async function deleteProject(projectId: string): Promise<DeleteProjectResponse> {
  return request<DeleteProjectResponse>(`/api/projects/${projectId}`, {
    method: "DELETE",
  });
}

export async function saveStepOne(projectId: string, data: StepOneData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-one`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepTwo(projectId: string, data: StepTwoData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-two`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepThree(projectId: string, data: StepThreeData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-three`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepFour(projectId: string, data: StepFourData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-four`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepFive(projectId: string, data: StepFiveData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-five`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepSix(projectId: string, data: StepSixData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-six`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepSeven(projectId: string, data: StepSevenData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-seven`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepEight(projectId: string, data: StepEightData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-eight`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepNine(projectId: string, data: StepNineData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-nine`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepTen(projectId: string, data: StepTenData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-ten`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function saveStepEleven(projectId: string, data: StepElevenData): Promise<ProjectRecord> {
  const response = await request<{ project: ProjectRecord }>(`/api/projects/${projectId}/step-eleven`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
  return response.project;
}

export async function generateStepOneOutline(projectName: string, prompt: string): Promise<GeneratedTextResponse> {
  return request<GeneratedTextResponse>("/api/generate/step-one-season-outline", {
    method: "POST",
    body: JSON.stringify({ project_name: projectName, prompt, mode: "outline" }),
  });
}

export async function generateStepOneTask(projectName: string, prompt: string, taskId: string): Promise<GeneratedTextResponse> {
  return request<GeneratedTextResponse>("/api/generate/step-one-season-outline", {
    method: "POST",
    body: JSON.stringify({ project_name: projectName, prompt, mode: "foundation", task_id: taskId }),
  });
}

export async function generateStepTwoContent(
  projectName: string,
  prompt: string,
  mode: string
): Promise<GeneratedTextResponse> {
  return request<GeneratedTextResponse>("/api/generate/step-two", {
    method: "POST",
    body: JSON.stringify({ project_name: projectName, prompt, mode }),
  });
}

export async function generateTextTask(input: {
  project_name: string;
  prompt: string;
  mode?: string;
  task_id: string;
}): Promise<GeneratedTextResponse> {
  return request<GeneratedTextResponse>("/api/generate/text-task", {
    method: "POST",
    body: JSON.stringify({
      project_name: input.project_name,
      prompt: input.prompt,
      mode: input.mode ?? "generic",
      task_id: input.task_id,
    }),
  });
}

export async function generateImageCandidate(input: {
  prompt: string;
  shot_id: string;
  shot_label: string;
}): Promise<GeneratedImageResponse> {
  return request<GeneratedImageResponse>("/api/generate/image", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateVideoCandidate(input: {
  prompt: string;
  shot_id: string;
  shot_label: string;
  source_image_url?: string | null;
  duration_seconds: number;
}): Promise<GeneratedVideoResponse> {
  return request<GeneratedVideoResponse>("/api/generate/video", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchVideoTaskStatus(taskId: string): Promise<{ task: Record<string, unknown> }> {
  return request<{ task: Record<string, unknown> }>(`/api/generate/video/${encodeURIComponent(taskId)}`);
}

export async function importTextFile(file: File): Promise<{ filename: string; content: string }> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error("导入文件过大，请压缩内容后再试。");
  }

  assertImportableFile(file);

  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE}/api/import/text`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error("文件导入失败");
  }

  return response.json() as Promise<{ filename: string; content: string }>;
}

export async function fetchDashboardOverview(range: DashboardRange): Promise<DashboardOverview> {
  const data = await request<{ overview: DashboardOverview }>(
    `/api/dashboard/overview?range=${encodeURIComponent(range)}`
  );
  return data.overview;
}

export async function fetchDashboardMetrics(range: DashboardRange): Promise<DashboardMetric[]> {
  const data = await request<{ metrics: DashboardMetric[] }>(
    `/api/dashboard/metrics?range=${encodeURIComponent(range)}`
  );
  return data.metrics;
}

export async function fetchDashboardTrend(range: DashboardRange): Promise<{
  trend_title: string;
  trend_total: string;
  trend_peak_note: string;
  trend_yaxis: string[];
  trend_points: DashboardTrendPoint[];
}> {
  return request(`/api/dashboard/trend?range=${encodeURIComponent(range)}`);
}

export async function fetchDashboardTrafficSources(range: DashboardRange): Promise<DashboardTrafficSource[]> {
  const data = await request<{ traffic_sources: DashboardTrafficSource[] }>(
    `/api/dashboard/traffic-sources?range=${encodeURIComponent(range)}`
  );
  return data.traffic_sources;
}

export async function fetchDashboardTopWorks(range: DashboardRange): Promise<DashboardTopWork[]> {
  const data = await request<{ top_works: DashboardTopWork[] }>(
    `/api/dashboard/top-works?range=${encodeURIComponent(range)}`
  );
  return data.top_works;
}

export async function fetchDashboardDistribution(range: DashboardRange): Promise<DashboardDistributionRow[]> {
  const data = await request<{ distribution_rows: DashboardDistributionRow[] }>(
    `/api/dashboard/distribution?range=${encodeURIComponent(range)}`
  );
  return data.distribution_rows;
}
