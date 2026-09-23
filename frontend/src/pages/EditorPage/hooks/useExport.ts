import { useEffect, useState } from "react";
import { exportWsUrl, startExport } from "@/apis/exports";
import type { ExportProgressMessage } from "@/models/export";

const EXPORT_ERROR_DISMISS_MS = 3000;

export type ExportPhase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; pct: number; msg: string; eta: number | null }
  | { kind: "done" }
  | { kind: "failed"; msg: string };

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
      setPhase({ kind: "failed", msg: "저장에 실패해 내보내기를 중단했습니다." });
      return;
    }
    try {
      const { export_id } = await startExport(projectId);
      setExportId(export_id);
      setPhase({ kind: "running", pct: 0, msg: "시작 중...", eta: null });
    } catch (e: unknown) {
      setPhase({ kind: "failed", msg: e instanceof Error ? e.message : "내보내기 실패" });
    }
  };

  // 진행률은 WS로 받는다. 끊겼을 때의 재연결과 onerror는 #20에서 다룬다.
  useEffect(() => {
    if (exportId === null) return;
    const ws = new WebSocket(exportWsUrl(exportId));
    ws.onmessage = (e) => {
      const message: ExportProgressMessage = JSON.parse(e.data);
      switch (message.status) {
        case "done":
          setPhase({ kind: "done" });
          ws.close();
          break;
        case "error":
          setPhase({ kind: "failed", msg: message.msg });
          ws.close();
          break;
        default:
          setPhase({
            kind: "running",
            pct: message.pct,
            msg: message.msg,
            eta: message.eta ?? null,
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
