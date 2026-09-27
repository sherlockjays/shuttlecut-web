import { useState, type RefObject } from "react";
import type { ScoreboardFields, Size } from "../scoreboard";
import ScoreboardOverlay from "./ScoreboardOverlay";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string;
  scoreboard: ScoreboardFields;
  videoSize: Size | null;
  onLoadedMetadata: () => void;
};

/** 영상과 그 위의 점수판 미리보기. 재생 실패 안내는 여기서만 쓰이므로 여기서 관리한다. */
export default function VideoPlayer({
  videoRef,
  src,
  scoreboard,
  videoSize,
  onLoadedMetadata,
}: Props) {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);

  return (
    <div className="relative w-full">
      <video
        ref={videoRef}
        src={src}
        controls
        className="w-full rounded-xl bg-black"
        style={{ maxHeight: "60vh" }}
        onLoadedMetadata={onLoadedMetadata}
        onError={(e) => {
          console.error("영상 재생 실패", e.currentTarget.error);
          setHasPlaybackError(true);
        }}
      />
      <ScoreboardOverlay scoreboard={scoreboard} videoSize={videoSize} />
      {hasPlaybackError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center pointer-events-none rounded-xl bg-black/80">
          <p className="text-base font-semibold text-red-300">영상을 재생할 수 없습니다.</p>
          <p className="text-sm text-gray-300">
            브라우저가 이 영상의 코덱을 지원하지 않거나, 로그인이 만료되었을 수 있습니다. 새로고침
            후 다시 시도해주세요.
          </p>
        </div>
      )}
    </div>
  );
}
