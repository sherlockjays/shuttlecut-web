import { describe, it, expect } from "vitest";
import { applyPoint, isValidRallyRange } from "./rally";

describe("isValidRallyRange", () => {
  it("종료가 시작보다 뒤면 유효하다", () => {
    expect(isValidRallyRange(3300, 3600)).toBe(true);
  });

  it("종료가 시작과 같으면 유효하지 않다", () => {
    expect(isValidRallyRange(3600, 3600)).toBe(false);
  });

  it("종료가 시작보다 앞이면 유효하지 않다", () => {
    expect(isValidRallyRange(3600, 3300)).toBe(false);
  });
});

describe("applyPoint", () => {
  it("1팀이 득점하면 1팀 점수만 오른다", () => {
    expect(applyPoint(3, 2, 1)).toEqual({ player1_score: 4, player2_score: 2 });
  });

  it("2팀이 득점하면 2팀 점수만 오른다", () => {
    expect(applyPoint(3, 2, 2)).toEqual({ player1_score: 3, player2_score: 3 });
  });

  it("득점자 미지정이면 두 점수가 그대로다", () => {
    expect(applyPoint(3, 2, 0)).toEqual({ player1_score: 3, player2_score: 2 });
  });
});
