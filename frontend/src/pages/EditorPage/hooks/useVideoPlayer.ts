import { useCallback, useRef, useState } from "react";

/**
 * <video> 엘리먼트를 소유하고 재생을 조작한다.
 * 초를 쓰는 DOM과 프레임으로만 말하는 랠리 도메인의 경계가 여기다.
 */
export function useVideoPlayer(fps: number) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);

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

  const handleLoadedMetadata = useCallback(() => setDuration(videoRef.current?.duration || 0), []);

  return {
    videoRef,
    duration,
    getCurrentFrame,
    seekToFrame,
    seekBy,
    togglePlay,
    handleLoadedMetadata,
  };
}
