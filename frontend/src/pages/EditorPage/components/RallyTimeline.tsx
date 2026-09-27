import { RallyWinner, type Rally } from "@/models/project";

const WINNER_BAR_CLASS: Record<RallyWinner, string> = {
  [RallyWinner.Team1]: "bg-blue-500",
  [RallyWinner.Team2]: "bg-red-500",
  [RallyWinner.None]: "bg-gray-500",
};

type Props = {
  rallies: Rally[];
  totalFrames: number;
  onSeek: (frame: number) => void;
};

export default function RallyTimeline({ rallies, totalFrames, onSeek }: Props) {
  if (rallies.length === 0 || totalFrames <= 0) return null;

  return (
    <div
      className="relative w-full h-6 bg-gray-700 rounded-lg overflow-hidden"
      title="랠리 타임라인 - 클릭하면 해당 구간으로 이동"
    >
      {rallies.map((r, i) => {
        const left = (r.start / totalFrames) * 100;
        const width = Math.max(0.5, ((r.end - r.start) / totalFrames) * 100);
        return (
          <div
            key={i}
            onClick={() => onSeek(r.start)}
            title={`랠리 ${i + 1}: ${r.p1Score}-${r.p2Score}`}
            className={`absolute top-0 h-full cursor-pointer hover:brightness-125 transition-all ${WINNER_BAR_CLASS[r.winner]}`}
            style={{
              left: `${left}%`,
              width: `${width}%`,
            }}
          />
        );
      })}
    </div>
  );
}
