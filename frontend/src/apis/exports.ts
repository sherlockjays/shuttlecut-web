import { apiFetch } from "@/api";
import type { ExportItem, ExportStatusResponse } from "@/models/export";

export const listExports = (): Promise<ExportItem[]> => apiFetch<ExportItem[]>("/api/export/");

export const startExport = (projectId: number): Promise<{ export_id: number }> =>
  apiFetch<{ export_id: number }>(`/api/export/${projectId}`, { method: "POST" });

export const getExportStatus = (exportId: number): Promise<ExportStatusResponse> =>
  apiFetch<ExportStatusResponse>(`/api/export/${exportId}/status`);

export const exportWsUrl = (exportId: number) => {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/export/ws/${exportId}`;
};

// 다운로드는 <a href>로 열리므로 헤더를 못 싣는다. 토큰이 쿼리로 가는 건 #36에서 다룬다.
export const exportDownloadUrl = (exportId: number) =>
  `/api/export/${exportId}/download?token=${localStorage.getItem("token") || ""}`;

export const uploadToYoutube = (exportId: number, postComment = true) =>
  apiFetch(`/api/export/${exportId}/youtube`, {
    method: "POST",
    body: JSON.stringify({ post_comment: postComment }),
  });

export const deleteExport = (exportId: number) =>
  apiFetch(`/api/export/${exportId}`, { method: "DELETE" });
