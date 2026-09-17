import { useCallback, useState } from "react";
import type { ProjectData } from "@/models/project";
import { createHistory, pushHistory, redoHistory, undoHistory, type History } from "../history";

/** undo/redo가 옮겨간 구간. 호출부가 이동 방향에 따라 후속 처리를 할 수 있다. */
export type DraftTransition = { from: ProjectData; to: ProjectData };

/**
 * 바꿀 필드만 담은 패치. 이전 값에서 파생되는 변경(랠리 추가 등)은 함수형으로 준다.
 * 그래야 바꾸는 쪽이 현재 draft를 들고 있지 않아도 된다.
 */
export type DraftPatch = Partial<ProjectData> | ((prev: ProjectData) => Partial<ProjectData>);

/**
 * 편집 중인 프로젝트 데이터를 소유하고 변경 이력을 관리한다.
 * 현재값과 undo/redo 스택이 한 state에 있어 서로 어긋날 수 없다.
 */
export function useProjectDraft(initial: ProjectData) {
  const [history, setHistory] = useState<History<ProjectData>>(() => createHistory(initial));

  const update = useCallback((patch: DraftPatch) => {
    setHistory((h) =>
      pushHistory(h, {
        ...h.present,
        ...(typeof patch === "function" ? patch(h.present) : patch),
      }),
    );
  }, []);

  // undo/redo는 옮겨간 구간을 호출부에 알려줘야 해서 현재 렌더의 history를 직접 읽는다.
  // 이벤트 핸들러에서만 호출되므로 update의 함수형 갱신과 달리 경합할 일이 없다.
  const undo = useCallback((): DraftTransition | null => {
    if (history.past.length === 0) return null;
    const next = undoHistory(history);
    setHistory(next);
    return { from: history.present, to: next.present };
  }, [history]);

  const redo = useCallback((): DraftTransition | null => {
    if (history.future.length === 0) return null;
    const next = redoHistory(history);
    setHistory(next);
    return { from: history.present, to: next.present };
  }, [history]);

  /** 다른 프로젝트를 열거나 서버 값을 새로 받았을 때. 이전 이력은 남기지 않는다. */
  const reset = useCallback((next: ProjectData) => {
    setHistory(createHistory(next));
  }, []);

  return {
    data: history.present,
    update,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
