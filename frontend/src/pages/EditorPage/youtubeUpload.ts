import { YOUTUBE_UPLOADING, type ExportStatusResponse } from "@/models/export";

export type YoutubeUploadState =
  { kind: "idle" } | { kind: "uploading" } | { kind: "done"; url: string } | { kind: "failed" };

/**
 * 업로드 시작 요청과 상태 폴링 결과를 화면 상태 하나로 합친다.
 * 폴링 결과가 아직 없는 것(undefined)과 URL이 비어 있는 것(null)을 구분해야 한다.
 * 전자는 기다리는 중이고 후자는 서버가 실패를 알린 것이다.
 */
export const deriveYoutubeUploadState = ({
  isStarting,
  trackedId,
  exportStatus,
}: {
  /** 업로드 시작 요청이 아직 응답을 받지 못했다. */
  isStarting: boolean;
  /** 시작 요청이 성공해 상태를 폴링 중인 내보내기. 없으면 시작 전이다. */
  trackedId: number | null;
  exportStatus: ExportStatusResponse | undefined;
}): YoutubeUploadState => {
  if (isStarting) return { kind: "uploading" };
  if (trackedId === null) return { kind: "idle" };
  if (exportStatus === undefined) return { kind: "uploading" };

  const url = exportStatus.youtube_url;
  if (url === YOUTUBE_UPLOADING) return { kind: "uploading" };
  if (url === null) return { kind: "failed" };
  return { kind: "done", url };
};
