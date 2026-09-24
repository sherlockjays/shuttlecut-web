import { useEffect, useState } from "react";
import { exportWsUrl, startExport } from "@/apis/exports";
import type { ExportProgressMessage } from "@/models/export";

const EXPORT_ERROR_DISMISS_MS = 3000;

export type ExportPhase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; percent: number; message: string; remainingSeconds: number | null }
  | { kind: "done" }
  | { kind: "failed"; message: string };

type Options = {
  projectId: number;
  /** 저장되지 않은 변경을 서버에 반영한다. 실패하면 거부된다. */
  flush: () => Promise<void>;
};

/**
 * 내보내기를 시작하고 진행률을 받는다.
 * 완료된 내보내기의 id는 다운로드와 유튜브 업로드가 쓰므로 phase와 별도로 남긴다.
 */
export function useExport({ projectId, flush }: Options) {
  const [phase, setPhase] = useState<ExportPhase>({ kind: "idle" });
  const [exportId, setExportId] = useState<number | null>(null);

  const start = async () => {
    setPhase({ kind: "starting" });
    // 백엔드가 DB에서 읽어 영상을 만들므로, 미저장 변경사항을 먼저 반영해야 한다.
    try {
      await flush();
    } catch {
      setPhase({ kind: "failed", message: "저장에 실패해 내보내기를 중단했습니다." });
      return;
    }
    try {
      const { export_id } = await startExport(projectId);
      // 첫 진행률 메시지가 올 때까지는 starting으로 둔다. running은 메시지를 받은 뒤다.
      setExportId(export_id);
    } catch (e: unknown) {
      setPhase({ kind: "failed", message: e instanceof Error ? e.message : "내보내기 실패" });
    }
  };

  // 진행률은 WS로 받는다. 끊겼을 때의 재연결과 onerror는 #20에서 다룬다.
  useEffect(() => {
    if (exportId === null) return;
    const ws = new WebSocket(exportWsUrl(exportId));
    ws.onmessage = (e) => {
      const progress: ExportProgressMessage = JSON.parse(e.data);
      switch (progress.status) {
        case "done":
          setPhase({ kind: "done" });
          ws.close();
          break;
        case "error":
          setPhase({ kind: "failed", message: progress.msg });
          ws.close();
          break;
        default:
          setPhase({
            kind: "running",
            percent: progress.pct,
            message: progress.msg,
            remainingSeconds: progress.eta ?? null,
          });
      }
    };
    return () => ws.close();
  }, [exportId]);

  useEffect(() => {
    if (phase.kind !== "failed") return;
    const timer = setTimeout(() => setPhase({ kind: "idle" }), EXPORT_ERROR_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [phase.kind]);

  const reset = () => {
    setExportId(null);
    setPhase({ kind: "idle" });
  };

  return { phase, exportId, start, reset };
}
