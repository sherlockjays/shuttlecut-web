import { useQuery } from "@tanstack/react-query";
import { videoPreviewUrl, videoStreamUrl } from "@/apis/video";
import { previewStatusOptions } from "@/queries/video";

/**
 * 무엇을 재생할지 정한다.
 * 프리뷰는 원본을 H.264로 다시 인코딩한 것이라 만들어진 뒤에만 쓸 수 있고,
 * 그전에는 원본을 튼다. 브라우저가 원본 코덱을 못 읽으면 재생만 안 될 뿐이다.
 */
export function useVideoSource(videoId: string) {
  const hasVideo = videoId !== "";

  const { data } = useQuery({
    ...previewStatusOptions(videoId),
    enabled: hasVideo,
  });

  const previewReady = data?.status === "ready";
  return {
    hasVideo,
    previewProcessing: data?.status === "processing",
    src: !hasVideo ? "" : previewReady ? videoPreviewUrl(videoId) : videoStreamUrl(videoId),
  };
}
