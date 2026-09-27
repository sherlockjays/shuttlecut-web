import { SEEK_STEP_SECONDS, SEEK_STEP_LARGE_SECONDS } from "../shortcuts";

// ←→ 단축키와 같은 걸음이다. 버튼은 그 마우스판이다.
const SEEK_BUTTON_STEPS = [
  -SEEK_STEP_SECONDS,
  -SEEK_STEP_LARGE_SECONDS,
  SEEK_STEP_LARGE_SECONDS,
  SEEK_STEP_SECONDS,
];

type Props = {
  onSeekBy: (seconds: number) => void;
};

export default function PlaybackControls({ onSeekBy }: Props) {
  return (
    <div className="flex gap-2 text-sm">
      {SEEK_BUTTON_STEPS.map((sec) => (
        <button
          key={sec}
          onClick={() => onSeekBy(sec)}
          className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors"
        >
          {sec < 0 ? `⏮ ${-sec}초` : `${sec}초 ⏭`}
        </button>
      ))}
    </div>
  );
}
