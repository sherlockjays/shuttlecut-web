import { useEffect, useEffectEvent } from "react";
import type { ScoringTeam } from "@/models/project";
import { getShortcutAction } from "../shortcuts";

type Handlers = {
  togglePlay: () => void;
  toggleRally: () => void;
  addScore: (team: ScoringTeam) => void;
  undo: () => void;
  redo: () => void;
  seekBy: (seconds: number) => void;
};

/**
 * 에디터 단축키를 window에 건다.
 * 리스너는 한 번만 등록하고 핸들러는 눌린 시점의 최신 것을 읽으므로, 호출부가 참조를 안정시킬 필요가 없다.
 */
export function useEditorShortcuts(handlers: Handlers) {
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    // 입력창에서는 글자 입력과 브라우저 기본 되돌리기가 우선이다. 체크박스도 여기 걸린다.
    if (e.target instanceof HTMLInputElement) return;
    const action = getShortcutAction(e);
    if (!action) return;

    switch (action.kind) {
      case "togglePlay":
        e.preventDefault(); // 페이지 스크롤 방지
        handlers.togglePlay();
        break;
      case "toggleRally":
        handlers.toggleRally();
        break;
      case "addScore":
        handlers.addScore(action.team);
        break;
      case "undo":
        handlers.undo();
        break;
      case "redo":
        handlers.redo();
        break;
      case "seekBy":
        handlers.seekBy(action.seconds);
        break;
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
