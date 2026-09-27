import { RallyWinner, type ProjectData, type ScoringTeam } from "@/models/project";
import { THEMES, SIZES } from "@/models/theme";

type ScoreboardSettings = Pick<
  ProjectData,
  "scoreboard_scale" | "scoreboard_theme" | "player1_name" | "player2_name"
>;

type Props = {
  scoreboard: ScoreboardSettings & Pick<ProjectData, "player1_score" | "player2_score">;
  onChange: (patch: Partial<ScoreboardSettings>) => void;
  onAddScore: (team: ScoringTeam) => void;
  onResetScore: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export default function ScoreboardPanel({
  scoreboard,
  onChange,
  onAddScore,
  onResetScore,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">점수판</h3>
      {/* 크기 선택 */}
      <div className="flex items-center gap-1 mb-2">
        <span className="text-xs text-gray-500 w-8">크기</span>
        {SIZES.map((sz) => (
          <button
            key={sz.value}
            onClick={() => onChange({ scoreboard_scale: sz.value })}
            className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${scoreboard.scoreboard_scale === sz.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            {sz.label}
          </button>
        ))}
      </div>
      {/* 테마 선택 */}
      <div className="flex items-center gap-1 mb-2">
        <span className="text-xs text-gray-500 w-8">테마</span>
        {THEMES.map((th) => (
          <button
            key={th.id}
            onClick={() => onChange({ scoreboard_theme: th.id })}
            title={th.label}
            className={`flex-1 h-6 rounded text-xs transition-all ${scoreboard.scoreboard_theme === th.id ? "ring-2 ring-white scale-110" : "opacity-70 hover:opacity-100"}`}
            style={{
              backgroundColor: th.bg,
              color: th.accent,
              border: `1px solid ${th.accent}`,
            }}
          >
            {th.label[0]}
          </button>
        ))}
      </div>
      <div className="rounded-xl overflow-hidden text-center">
        <div className="grid grid-cols-2">
          <div className="flex flex-col items-center p-3 bg-blue-900">
            <input
              value={scoreboard.player1_name}
              onChange={(e) => onChange({ player1_name: e.target.value })}
              className="bg-transparent text-yellow-300 font-medium text-sm w-full text-center outline-none"
            />
            <span className="text-2xl font-bold text-white">{scoreboard.player1_score}</span>
          </div>
          <div className="flex flex-col items-center p-3 bg-red-900">
            <input
              value={scoreboard.player2_name}
              onChange={(e) => onChange({ player2_name: e.target.value })}
              className="bg-transparent text-yellow-300 font-medium text-sm w-full text-center outline-none"
            />
            <span className="text-2xl font-bold text-white">{scoreboard.player2_score}</span>
          </div>
        </div>
        <div className="flex gap-0">
          <button
            onClick={() => onAddScore(RallyWinner.Team1)}
            className="flex-1 bg-blue-700 hover:bg-blue-600 text-white py-2 text-sm transition-colors"
          >
            1팀 득점 (1)
          </button>
          <button
            onClick={() => onAddScore(RallyWinner.Team2)}
            className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 text-sm transition-colors"
          >
            2팀 득점 (2)
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="되돌리기 (Ctrl+Z)"
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 py-1.5 rounded-lg text-xs transition-colors"
          >
            ↩ 되돌리기
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="다시하기 (Ctrl+Y)"
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 py-1.5 rounded-lg text-xs transition-colors"
          >
            ↪ 다시하기
          </button>
        </div>
        <div className="flex gap-2 mt-1">
          <button
            onClick={onResetScore}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 rounded-lg text-xs transition-colors"
          >
            점수 리셋
          </button>
        </div>
      </div>
    </section>
  );
}
