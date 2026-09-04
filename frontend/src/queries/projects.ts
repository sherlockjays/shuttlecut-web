import { queryOptions } from "@tanstack/react-query";
import { getProject, listProjects } from "@/apis/projects";

export const projectsOptions = queryOptions({
  queryKey: ["projects"],
  queryFn: listProjects,
});

export const projectOptions = (id: number) =>
  queryOptions({
    queryKey: ["project", id],
    queryFn: () => getProject(id),
    staleTime: Infinity,
  });
