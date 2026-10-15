import { queryOptions, skipToken, type Query } from "@tanstack/react-query";
import { getExportStatus, listExports } from "@/apis/exports";
import { YOUTUBE_UPLOADING, type ExportItem, type ExportStatusResponse } from "@/models/export";

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

export const EXPORT_PROGRESS_POLL_MS = 2000;

// 결과가 아직 없는 동안(첫 조회가 실패한 경우 포함)에도 계속 묻는다.
export const pollWhileExporting = <TKey extends readonly unknown[]>(
  query: Query<ExportStatusResponse, Error, ExportStatusResponse, TKey>,
) => {
  const status = query.state.data?.status;
  const isInProgress = status === undefined || status === "pending" || status === "processing";
  return isInProgress ? EXPORT_PROGRESS_POLL_MS : false;
};
