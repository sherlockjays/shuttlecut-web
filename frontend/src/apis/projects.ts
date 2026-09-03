import { apiFetch } from "@/api";
import {
  rallyFromWire,
  rallyToWire,
  type Project,
  type ProjectData,
  type RallyWire,
} from "@/models/project";

export const listProjects = (): Promise<Project[]> =>
  apiFetch<Project[]>("/api/projects/");

export const getProject = async (id: number): Promise<Partial<ProjectData>> => {
  const raw = await apiFetch<
    Partial<Omit<ProjectData, "rallies">> & { rallies?: RallyWire[] }
  >(`/api/projects/${id}`);
  return { ...raw, rallies: (raw.rallies ?? []).map(rallyFromWire) };
};

export const createProject = (data: object): Promise<{ id: number }> =>
  apiFetch<{ id: number }>("/api/projects/", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateProject = (id: number, data: ProjectData) =>
  apiFetch(`/api/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ...data, rallies: data.rallies.map(rallyToWire) }),
  });

export const deleteProject = (id: number) =>
  apiFetch(`/api/projects/${id}`, { method: "DELETE" });
