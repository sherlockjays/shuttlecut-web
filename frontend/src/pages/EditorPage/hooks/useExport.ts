import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startExport } from "@/apis/exports";
import { meOptions } from "@/queries/auth";
import { exportStatusOptions, exportsOptions, pollWhileExporting } from "@/queries/exports";
import { deriveExportPhase } from "../utils/exportPhase";

const EXPORT_ERROR_DISMISS_MS = 3000;

type Options = {
  projectId: number;
  /** 저장되지 않은 변경을 서버에 반영한다. 실패하면 거부된다. */
  flush: () => Promise<void>;
};

/**
 * 내보내기를 시작하고 끝날 때까지 상태를 폴링한다.
 * 완료된 내보내기의 id는 다운로드와 유튜브 업로드가 쓰므로 phase와 별도로 남긴다.
 */
export function useExport({ projectId, flush }: Options) {
  const queryClient = useQueryClient();
  const [exportId, setExportId] = useState<number | null>(null);

  const {
    mutate,
    isPending,
    error,
    reset: resetStart,
  } = useMutation({
    mutationFn: async () => {
      // 백엔드가 DB에서 읽어 영상을 만들므로, 미저장 변경사항을 먼저 반영해야 한다.
      try {
        await flush();
      } catch {
        throw new Error("저장에 실패해 내보내기를 중단했습니다.");
      }
      return startExport(projectId);
    },
    onSuccess: ({ export_id }) => {
      setExportId(export_id);
      // 서버가 기록에 pending 행을 만들었다.
      queryClient.invalidateQueries({ queryKey: exportsOptions.queryKey });
    },
  });

  const { data: exportStatus } = useQuery({
    ...exportStatusOptions(exportId),
    refetchInterval: pollWhileExporting,
  });

  const phase = deriveExportPhase({
    exportId,
    isStarting: isPending,
    startError: error?.message ?? null,
    exportStatus,
  });

  // 실패는 잠시 보여주고 처음으로 돌린다. 시작 거부와 서버 오류를 둘 다 여기서 지운다.
  useEffect(() => {
    if (phase.kind !== "failed") return;
    const timer = setTimeout(() => {
      resetStart();
      setExportId(null);
    }, EXPORT_ERROR_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [phase.kind, resetStart]);

  // 끝나면 기록 행의 status가 바뀌고, 성공이면 export_count도 오른다. 다음 방문 때 옛 값이 보이지 않게 한다.
  useEffect(() => {
    if (phase.kind !== "done" && phase.kind !== "failed") return;
    queryClient.invalidateQueries({ queryKey: exportsOptions.queryKey });
    if (phase.kind === "done") queryClient.invalidateQueries({ queryKey: meOptions.queryKey });
  }, [phase.kind, queryClient]);

  // mutate의 첫 인자는 뮤테이션 변수라, onClick에 그대로 주면 클릭 이벤트가 변수로 저장된다.
  const start = () => mutate();

  const reset = () => setExportId(null);

  return { phase, exportId, start, reset };
}
