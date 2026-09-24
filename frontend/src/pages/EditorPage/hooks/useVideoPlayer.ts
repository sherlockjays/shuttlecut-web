import { useCallback, useRef, useState } from "react";

/**
 * <video> 엘리먼트를 소유하고 재생을 조작한다.
 * 초를 쓰는 DOM과 프레임으로만 말하는 랠리 도메인의 경계가 여기다.
 */
export type VideoSize = { width: number; height: number };

export function useVideoPlayer(fps: number) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  // 원본 해상도. 미리보기가 레터박스를 보정할 때 쓴다.
  const [videoSize, setVideoSize] = useState<VideoSize | null>(null);

  const getCurrentFrame = useCallback(
    () => Math.round((videoRef.current?.currentTime || 0) * fps),
    [fps],
  );

  const seekToFrame = useCallback(
    (frame: number) => {
      if (videoRef.current) videoRef.current.currentTime = frame / fps;
    },
    [fps],
  );

  const seekBy = useCallback((seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime += seconds;
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    setDuration(video?.duration || 0);
    setVideoSize(video?.videoWidth ? { width: video.videoWidth, height: video.videoHeight } : null);
  }, []);

  return {
    videoRef,
    duration,
    videoSize,
    getCurrentFrame,
    seekToFrame,
    seekBy,
    togglePlay,
    handleLoadedMetadata,
  };
}
