import { useCallback, useEffect, useRef, useState } from "react";
import { RallyWinner, type ScoringTeam } from "@/models/project";
import { applyPoint, isValidRallyRange } from "../rally";
import type { DraftTransition, RecordedPatch } from "./useProjectDraft";

type Options = {
  record: (patch: RecordedPatch) => void;
  getCurrentFrame: () => number;
  seekToFrame: (frame: number) => void;
  /** 마킹 구간이 유효하지 않을 때. 알리는 수단은 호출부가 정한다. */
  onInvalidRange: () => void;
};

/**
 * 랠리 기록과 득점을 다룬다. draft를 소유하지 않고 무엇을 바꿀지만 record로 넘긴다.
 * 시간 단위는 모르며 프레임으로만 말한다.
 */
export function useRallyEditor(options: Options) {
  // null이면 마킹 중이 아니다. 마킹 여부와 시작 지점이 한 값이라 서로 어긋날 수 없다.
  const [markStart, setMarkStart] = useState<number | null>(null);

  // 콜백은 이벤트 핸들러에서만 불리므로 렌더마다 최신 것으로 갱신해두면 된다.
  // useAutoSave와 같은 방식이고, 덕분에 호출부가 useCallback으로 감쌀 필요가 없다.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const startRally = useCallback(() => {
    setMarkStart(optionsRef.current.getCurrentFrame());
  }, []);

  const endRally = useCallback(
    (winner: RallyWinner) => {
      if (markStart === null) return;
      const { getCurrentFrame, record, onInvalidRange } = optionsRef.current;
      const end = getCurrentFrame();
      // 갱신 함수는 StrictMode에서 두 번 불릴 수 있어 순수해야 하므로 밖에서 검사한다.
      if (!isValidRallyRange(markStart, end)) {
        onInvalidRange();
        return;
      }
      // 랠리와 점수를 한 번에 바꿔야 되돌릴 때도 함께 돌아온다.
      record((prev) => ({
        rallies: [
          ...prev.rallies,
          {
            start: markStart,
            end,
            // 랠리에는 득점 전 점수를 남긴다. 내보내기가 이 값으로 점수판을 그리다가
            // 랠리가 끝나는 지점에서 득점 후 점수로 바꾼다.
            p1Score: prev.player1_score,
            p2Score: prev.player2_score,
            winner,
          },
        ],
        ...applyPoint(prev.player1_score, prev.player2_score, winner),
      }));
      setMarkStart(null);
    },
    [markStart],
  );

  const toggleRally = useCallback(() => {
    if (markStart === null) startRally();
    else endRally(RallyWinner.None);
  }, [markStart, startRally, endRally]);

  const addScore = useCallback(
    (team: ScoringTeam) => {
      // 득점은 마킹을 끝내는 방법 중 하나다. 마킹 중이 아니면 점수만 오른다.
      if (markStart !== null) {
        endRally(team);
        return;
      }
      optionsRef.current.record((prev) => applyPoint(prev.player1_score, prev.player2_score, team));
    },
    [markStart, endRally],
  );

  const resetScore = useCallback(() => {
    optionsRef.current.record({ player1_score: 0, player2_score: 0 });
  }, []);

  const deleteRally = useCallback((index: number) => {
    optionsRef.current.record((prev) => ({
      rallies: prev.rallies.filter((_, i) => i !== index),
    }));
  }, []);

  // 되돌리면 markStart가 옛 시점을 가리켜 의미가 없어지므로 마킹을 끝낸다.
  const onUndone = useCallback((moved: DraftTransition) => {
    setMarkStart(null);
    if (moved.from.rallies.length <= moved.to.rallies.length) return;
    // 랠리 추가를 되돌린 경우. 직전 랠리의 끝으로 옮겨 다시 찍기 좋은 자리에 둔다.
    const prevLast = moved.to.rallies[moved.to.rallies.length - 1];
    if (prevLast) optionsRef.current.seekToFrame(prevLast.end);
  }, []);

  const onRedone = useCallback(() => setMarkStart(null), []);

  return {
    marking: markStart !== null,
    toggleRally,
    addScore,
    resetScore,
    deleteRally,
    onUndone,
    onRedone,
  };
}
