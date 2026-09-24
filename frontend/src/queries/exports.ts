import { queryOptions, skipToken, type Query } from "@tanstack/react-query";
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

// 조회할 내보내기가 아직 없으면 skipToken으로 쿼리를 끈다.
export const exportStatusOptions = (exportId: number | null) =>
  queryOptions({
    queryKey: ["export-status", exportId],
    queryFn: exportId === null ? skipToken : () => getExportStatus(exportId),
  });
