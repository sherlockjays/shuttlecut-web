import { queryOptions } from "@tanstack/react-query";
import { isRetriableError } from "@/apis/client";
import { getProject, listProjects } from "@/apis/projects";

// tanstack 기본값과 같다. 4xx만 건너뛰려고 함수로 바꾼 것이라 횟수는 유지한다.
const MAX_RETRY_COUNT = 3;

export const projectsOptions = queryOptions({
  queryKey: ["projects"],
  queryFn: listProjects,
});

export const projectOptions = (id: number) =>
  queryOptions({
    queryKey: ["project", id],
    queryFn: () => getProject(id),
    staleTime: Infinity,
    retry: (failureCount, error) => isRetriableError(error) && failureCount < MAX_RETRY_COUNT,
  });
