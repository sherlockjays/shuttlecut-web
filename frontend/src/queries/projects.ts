import { queryOptions } from "@tanstack/react-query";
import { projects } from "@/api";

export const projectsOptions = queryOptions({
  queryKey: ["projects"],
  queryFn: projects.list,
});
