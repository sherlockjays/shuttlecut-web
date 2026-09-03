import { describe, it, expect } from "vitest";
import { rallyFromWire, rallyToWire, type Rally, type RallyWire } from "./project";

describe("rallyFromWire", () => {
  it("배열 각 자리를 이름 있는 필드로 매핑한다", () => {
    expect(rallyFromWire([120, 340, 3, 2, 1])).toEqual({
      start: 120,
      end: 340,
      p1Score: 3,
      p2Score: 2,
      winner: 1,
    });
  });

  it("winner가 0이면 득점자 미지정으로 매핑한다", () => {
    expect(rallyFromWire([10, 20, 0, 0, 0]).winner).toBe(0);
  });
});

describe("rallyToWire", () => {
  it("객체를 [start, end, p1, p2, winner] 배열로 되돌린다", () => {
    const rally: Rally = { start: 120, end: 340, p1Score: 3, p2Score: 2, winner: 2 };
    expect(rallyToWire(rally)).toEqual([120, 340, 3, 2, 2]);
  });
});

describe("rallyFromWire / rallyToWire 왕복", () => {
  it("배열 -> 객체 -> 배열이 원본과 같다", () => {
    const wire: RallyWire = [5, 15, 1, 0, 1];
    expect(rallyToWire(rallyFromWire(wire))).toEqual(wire);
  });
});
