import type { Rally } from "@/models/project";

// 종료가 시작보다 뒤여야 클립을 자를 수 있다. 뒤집히면 내보내기의 클립 길이가 음수가 된다.
export const isValidRallyRange = (start: number, end: number) => end > start;

// 승자 팀 점수를 1 올린다. winner 0(득점자 미지정)이면 두 점수를 그대로 둔다.
// ProjectData에 그대로 펼쳐 넣을 수 있도록 필드 이름을 맞춘다.
export const applyPoint = (
  p1Score: number,
  p2Score: number,
  winner: Rally["winner"],
) => ({
  player1_score: p1Score + (winner === 1 ? 1 : 0),
  player2_score: p2Score + (winner === 2 ? 1 : 0),
});
