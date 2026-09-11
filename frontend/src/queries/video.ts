import { queryOptions } from "@tanstack/react-query";
import { getPreviewStatus } from "@/apis/video";

const PREVIEW_POLL_MS = 4000;

export const previewStatusOptions = (videoId: string) =>
  queryOptions({
    queryKey: ["preview-status", videoId],
    queryFn: () => getPreviewStatus(videoId),
    // 준비되면 더 물을 것이 없다. 서버는 프리뷰가 없으면 조회를 받은 김에 생성을 시작한다.
    refetchInterval: (query) =>
      query.state.data?.status === "ready" ? false : PREVIEW_POLL_MS,
  });
