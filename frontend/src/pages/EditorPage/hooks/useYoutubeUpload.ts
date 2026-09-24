import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uploadToYoutube } from "@/apis/exports";
import { YOUTUBE_UPLOADING } from "@/models/export";
import { exportStatusOptions, YOUTUBE_UPLOAD_POLL_MS } from "@/queries/exports";
import { deriveYoutubeUploadState } from "../youtubeUpload";

type Options = {
  /** 업로드할 내보내기. 완료된 내보내기가 없으면 null. */
  exportId: number | null;
  /** 업로드 시작 요청이 거부됐을 때. 알리는 수단은 호출부가 정한다. */
  onStartFailed: (message: string) => void;
};

/**
 * 완료된 내보내기를 YouTube에 올리고 끝날 때까지 상태를 폴링한다.
 * 업로드는 서버 스레드가 하고 결과는 youtube_url에만 남으므로 물어보는 수밖에 없다.
 */
export function useYoutubeUpload({ exportId, onStartFailed }: Options) {
  const queryClient = useQueryClient();
  const [trackedId, setTrackedId] = useState<number | null>(null);

  const { mutate, isPending, variables } = useMutation({
    mutationFn: ({ exportId, postComment }: { exportId: number; postComment: boolean }) =>
      uploadToYoutube(exportId, postComment),
    onSuccess: (_, { exportId }) => {
      // 시작 요청이 성공했다면 서버는 이미 uploading을 써뒀다. 캐시에 이전 시도의 null이
      // 남아 있으면 폴링 첫 결과가 오기 전에 실패로 읽히므로 같은 값을 먼저 넣어둔다.
      queryClient.setQueryData(exportStatusOptions(exportId).queryKey, (prev) =>
        prev ? { ...prev, youtube_url: YOUTUBE_UPLOADING } : undefined,
      );
      setTrackedId(exportId);
    },
    onError: (e) => onStartFailed(e.message),
  });

  // 시작 응답이 늦게 도착해 옛 id를 남겨도, 현재 내보내기가 아니면 폴링도 화면도 무시한다.
  const activeId = trackedId !== null && trackedId === exportId ? trackedId : null;

  const { data: exportStatus } = useQuery({
    ...exportStatusOptions(activeId),
    // 결과가 아직 없는 동안(첫 조회가 실패한 경우 포함)에도 계속 묻는다.
    refetchInterval: (query) => {
      const url = query.state.data?.youtube_url;
      return url === undefined || url === YOUTUBE_UPLOADING ? YOUTUBE_UPLOAD_POLL_MS : false;
    },
  });

  const state = deriveYoutubeUploadState({
    exportId,
    isStarting: isPending && variables?.exportId === exportId,
    trackedId,
    exportStatus,
  });

  const upload = (postComment: boolean) => {
    if (exportId !== null) mutate({ exportId, postComment });
  };

  return { state, upload };
}
