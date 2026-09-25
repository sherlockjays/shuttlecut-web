import { useCallback, useState } from "react";
import type { ProjectData } from "@/models/project";
import { createHistory, pushHistory, redoHistory, undoHistory, type History } from "../history";

/** undo/redo가 되돌리는 필드. 득점은 랠리를 끝내는 수단이라 랠리와 함께 움직인다. */
export type RecordedState = Pick<ProjectData, "rallies" | "player1_score" | "player2_score">;
export type UnrecordedState = Omit<ProjectData, keyof RecordedState>;

/**
 * 바꿀 필드만 담은 패치. 이전 값에서 파생되는 변경(랠리 추가 등)은 함수형으로 준다.
 * 그래야 바꾸는 쪽이 현재 draft를 들고 있지 않아도 된다.
 */
type Patch<T> = Partial<T> | ((prev: T) => Partial<T>);
export type RecordedPatch = Patch<RecordedState>;
export type UnrecordedPatch = Patch<UnrecordedState>;

/** undo/redo가 옮겨간 구간. 호출부가 이동 방향에 따라 후속 처리를 할 수 있다. */
export type DraftTransition = { from: RecordedState; to: RecordedState };

// history.present는 항상 data의 이력 대상 조각이다. 한 state에 두어 둘이 어긋날 수 없다.
type DraftState = { data: ProjectData; history: History<RecordedState> };

const pickRecorded = (data: ProjectData): RecordedState => ({
  rallies: data.rallies,
  player1_score: data.player1_score,
  player2_score: data.player2_score,
});

const resolvePatch = <T>(patch: Patch<T>, prev: T): Partial<T> =>
  typeof patch === "function" ? patch(prev) : patch;

/**
 * 편집 중인 프로젝트 데이터를 소유하고 변경 이력을 관리한다.
 * 이력은 랠리와 점수만 남긴다. 전체 스냅샷을 남기면 되돌릴 때 그 사이 고친 텍스트까지 옛 값으로 돌아간다.
 */
export function useProjectDraft(initial: ProjectData) {
  const [state, setState] = useState<DraftState>(() => ({
    data: initial,
    history: createHistory(pickRecorded(initial)),
  }));

  /** 이력을 남기지 않고 값만 바꾼다. */
  const update = useCallback((patch: UnrecordedPatch) => {
    setState((s) => ({ ...s, data: { ...s.data, ...resolvePatch(patch, s.data) } }));
  }, []);

  /** 이력을 남기며 바꾼다. */
  const record = useCallback((patch: RecordedPatch) => {
    setState((s) => {
      const present = { ...s.history.present, ...resolvePatch(patch, s.history.present) };
      return { data: { ...s.data, ...present }, history: pushHistory(s.history, present) };
    });
  }, []);

  // undo/redo는 옮겨간 구간을 호출부에 알려줘야 해서 현재 렌더의 state를 직접 읽는다.
  // 이벤트 핸들러에서만 호출되므로 함수형 갱신과 달리 경합할 일이 없다.
  const undo = useCallback((): DraftTransition | null => {
    if (state.history.past.length === 0) return null;
    const next = undoHistory(state.history);
    setState({ data: { ...state.data, ...next.present }, history: next });
    return { from: state.history.present, to: next.present };
  }, [state]);

  const redo = useCallback((): DraftTransition | null => {
    if (state.history.future.length === 0) return null;
    const next = redoHistory(state.history);
    setState({ data: { ...state.data, ...next.present }, history: next });
    return { from: state.history.present, to: next.present };
  }, [state]);

  /**
   * 다른 프로젝트를 열거나 서버 값을 새로 받았을 때. 이전 이력은 남기지 않는다.
   * data가 next 그대로여야 자동저장이 이 값을 "이미 저장됨"으로 알아본다.
   */
  const reset = useCallback((next: ProjectData) => {
    setState({ data: next, history: createHistory(pickRecorded(next)) });
  }, []);

  return {
    data: state.data,
    update,
    record,
    undo,
    redo,
    reset,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
  };
}
