import { RallyWinner, type Rally } from "@/models/project";
import { applyPoint } from "../rally";

const WINNER_LIST_CLASSES: Record<RallyWinner, { bg: string; text: string }> = {
  [RallyWinner.Team1]: { bg: "bg-blue-950", text: "text-blue-300" },
  [RallyWinner.Team2]: { bg: "bg-red-900", text: "text-red-300" },
  [RallyWinner.None]: { bg: "bg-gray-700", text: "text-gray-300" },
};

type Props = {
  rallies: Rally[];
  marking: boolean;
  onToggleMarking: () => void;
  onSeek: (frame: number) => void;
  onDeleteRally: (index: number) => void;
};

export default function RallyPanel({
  rallies,
  marking,
  onToggleMarking,
  onSeek,
  onDeleteRally,
}: Props) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">랠리 마킹</h3>
      <button
        onClick={onToggleMarking}
        className={`w-full py-3 rounded-xl font-medium text-sm transition-colors ${
          marking ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {marking ? "● 마킹 중... (R로 종료)" : "랠리 시작 (R)"}
      </button>
      <RallyList rallies={rallies} onSeek={onSeek} onDeleteRally={onDeleteRally} />
    </section>
  );
}

function RallyList({
  rallies,
  onSeek,
  onDeleteRally,
}: {
  rallies: Rally[];
  onSeek: (frame: number) => void;
  onDeleteRally: (index: number) => void;
}) {
  return (
    <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
      {rallies.map((r, i) => {
        const scoreAfterRally = applyPoint(r.p1Score, r.p2Score, r.winner);
        return (
          <div
            key={i}
            onClick={() => onSeek(r.start)}
            className={`flex items-center justify-between rounded px-2 py-1.5 text-xs cursor-pointer hover:brightness-125 transition-all ${WINNER_LIST_CLASSES[r.winner].bg}`}
          >
            <span className="text-gray-300 w-10 shrink-0">랠리 {i + 1}</span>
            <span className={`font-mono font-medium ${WINNER_LIST_CLASSES[r.winner].text}`}>
              {r.p1Score}-{r.p2Score} → {scoreAfterRally.player1_score}-
              {scoreAfterRally.player2_score}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRally(i);
              }}
              className="text-gray-500 hover:text-red-400 ml-1 shrink-0"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
