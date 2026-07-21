import { queryOptions } from "@tanstack/react-query";
import { youtube } from "@/api";

export const youtubeStatusOptions = queryOptions({
  queryKey: ["youtube-status"],
  queryFn: youtube.status,
  staleTime: Infinity,
});
