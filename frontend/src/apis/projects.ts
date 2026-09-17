import { apiFetch } from "@/api";
import {
  rallyFromWire,
  rallyToWire,
  type Project,
  type ProjectData,
  type ProjectDetail,
  type RallyWire,
} from "@/models/project";

export const listProjects = (): Promise<Project[]> => apiFetch<Project[]>("/api/projects/");

// rallies 컬럼이 nullable이라 서버가 null을 줄 수 있다.
type ProjectDetailWire = Partial<Omit<ProjectDetail, "rallies">> & {
  rallies?: RallyWire[] | null;
};

export const getProject = async (id: number): Promise<Partial<ProjectDetail>> => {
  const raw = await apiFetch<ProjectDetailWire>(`/api/projects/${id}`);
  return { ...raw, rallies: (raw.rallies ?? []).map(rallyFromWire) };
};

export const createProject = (data: object): Promise<{ id: number }> =>
  apiFetch<{ id: number }>("/api/projects/", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateProject = async (
  id: number,
  data: ProjectData,
): Promise<Partial<ProjectDetail>> => {
  const raw = await apiFetch<ProjectDetailWire>(`/api/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ...data, rallies: data.rallies.map(rallyToWire) }),
  });
  return { ...raw, rallies: (raw.rallies ?? []).map(rallyFromWire) };
};

export const deleteProject = (id: number) => apiFetch(`/api/projects/${id}`, { method: "DELETE" });
