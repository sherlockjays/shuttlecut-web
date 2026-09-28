import { apiFetch } from "@/api";
import {
  projectFromWire,
  rallyToWire,
  type Project,
  type ProjectData,
  type ProjectDetail,
  type ProjectDetailWire,
} from "@/models/project";

export const listProjects = (): Promise<Project[]> => apiFetch<Project[]>("/api/projects/");

export const getProject = async (id: number): Promise<ProjectDetail> =>
  projectFromWire(await apiFetch<ProjectDetailWire>(`/api/projects/${id}`));

export const createProject = (data: object): Promise<{ id: number }> =>
  apiFetch<{ id: number }>("/api/projects/", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateProject = async (id: number, data: ProjectData): Promise<ProjectDetail> =>
  projectFromWire(
    await apiFetch<ProjectDetailWire>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...data, rallies: data.rallies.map(rallyToWire) }),
    }),
  );

export const deleteProject = (id: number) => apiFetch(`/api/projects/${id}`, { method: "DELETE" });
