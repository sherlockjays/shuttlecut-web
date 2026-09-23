import { queryOptions, type Query } from "@tanstack/react-query";
import { getExportStatus, listExports } from "@/apis/exports";
import { YOUTUBE_UPLOADING, type ExportItem } from "@/models/export";

export const exportsOptions = queryOptions({
  queryKey: ["exports"],
  queryFn: listExports,
});

export const YOUTUBE_UPLOAD_POLL_MS = 3000;

export const pollWhileUploading = <TKey extends readonly unknown[]>(
  query: Query<ExportItem[], Error, ExportItem[], TKey>,
) =>
  query.state.data?.some((item) => item.youtube_url === YOUTUBE_UPLOADING)
    ? YOUTUBE_UPLOAD_POLL_MS
    : false;

export const exportStatusOptions = (exportId: number) =>
  queryOptions({
    queryKey: ["export-status", exportId],
    queryFn: () => getExportStatus(exportId),
  });
