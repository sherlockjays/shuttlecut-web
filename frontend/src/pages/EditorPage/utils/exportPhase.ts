import type { ExportStatusResponse } from "@/models/export";

export type ExportPhase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; percent: number; message: string; remainingSeconds: number | null }
  | { kind: "done" }
  | { kind: "failed"; message: string };

/**
 * 시작 요청과 상태 폴링 결과를 화면 상태 하나로 합친다.
 * 시작 요청이 진행 중이면 폴링 결과보다 먼저 본다. 늦게 도착한 옛 내보내기의 결과가
 * 새 시작을 덮으면 안 된다.
 */
export const deriveExportPhase = ({
  exportId,
  isStarting,
  startError,
  exportStatus,
}: {
  /** 지금 화면이 다루는 내보내기. 시작 전이거나 접은 뒤면 null. */
  exportId: number | null;
  /** 시작 요청(저장 반영 포함)이 아직 응답을 받지 못했다. */
  isStarting: boolean;
  /** 시작 요청이 거부된 이유. */
  startError: string | null;
  exportStatus: ExportStatusResponse | undefined;
}): ExportPhase => {
  if (isStarting) return { kind: "starting" };
  if (startError !== null) return { kind: "failed", message: startError };
  if (exportId === null) return { kind: "idle" };
  if (exportStatus === undefined) return { kind: "starting" };

  switch (exportStatus.status) {
    case "pending":
      return { kind: "starting" };
    case "processing": {
      const progress = exportStatus.progress;
      if (progress === null) return { kind: "starting" };
      return {
        kind: "running",
        percent: progress.percent,
        message: progress.message,
        remainingSeconds: progress.remaining_seconds,
      };
    }
    case "done":
      return { kind: "done" };
    case "error":
      return { kind: "failed", message: exportStatus.error_msg || "오류" };
    default: {
      // 상태가 추가됐는데 여기 case가 빠지면 컴파일 오류가 난다.
      const unreachable: never = exportStatus.status;
      return unreachable;
    }
  }
};
