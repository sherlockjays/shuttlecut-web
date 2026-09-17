import { queryOptions, type Query } from "@tanstack/react-query";
import { exports as exportsApi } from "@/api";
import type { ExportItem } from "@/models/export";

export const exportsOptions = queryOptions({
  queryKey: ["exports"],
  queryFn: exportsApi.list,
});

export const pollWhileUploading = <TKey extends readonly unknown[]>(
  query: Query<ExportItem[], Error, ExportItem[], TKey>,
) => (query.state.data?.some((item) => item.youtube_url === "uploading") ? 3000 : false);

export const exportStatusOptions = (exportId: number) =>
  queryOptions({
    queryKey: ["export-status", exportId],
    queryFn: () => exportsApi.status(exportId),
  });
