import { queryOptions } from "@tanstack/react-query";
import { listProjects } from "@/apis/projects";

export const projectsOptions = queryOptions({
  queryKey: ["projects"],
  queryFn: listProjects,
});
