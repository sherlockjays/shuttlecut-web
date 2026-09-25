import { RallyWinner, type ScoringTeam } from "@/models/project";

export const SEEK_STEP_SECONDS = 5;
export const SEEK_STEP_LARGE_SECONDS = 10;

/** KeyboardEvent 중 매핑에 필요한 것만. DOM 타입에 기대지 않아 node 테스트에서 객체 리터럴로 줄 수 있다. */
export type ShortcutKey = {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
};

export type ShortcutAction =
  | { kind: "togglePlay" }
  | { kind: "toggleRally" }
  | { kind: "addScore"; team: ScoringTeam }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "seekBy"; seconds: number };

/** 키 하나가 일으키는 동작. 단축키가 아니면 null이다. */
export function getShortcutAction({ code, ctrlKey, shiftKey }: ShortcutKey): ShortcutAction | null {
  if (code === "Space") return { kind: "togglePlay" };
  if (code === "KeyR") return { kind: "toggleRally" };
  if (code === "Digit1") return { kind: "addScore", team: RallyWinner.Team1 };
  if (code === "Digit2") return { kind: "addScore", team: RallyWinner.Team2 };
  if (code === "KeyZ" && ctrlKey) return { kind: shiftKey ? "redo" : "undo" };
  if (code === "KeyY" && ctrlKey) return { kind: "redo" };

  const step = shiftKey ? SEEK_STEP_LARGE_SECONDS : SEEK_STEP_SECONDS;
  if (code === "ArrowLeft") return { kind: "seekBy", seconds: -step };
  if (code === "ArrowRight") return { kind: "seekBy", seconds: step };
  return null;
}
