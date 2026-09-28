import { describe, it, expect } from "vitest";
import {
  projectFromWire,
  rallyFromWire,
  rallyToWire,
  type ProjectDetailWire,
  type Rally,
  type RallyWire,
} from "./project";

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

describe("projectFromWire", () => {
  it("null과 누락 필드를 DB 컬럼 기본값으로 채운다", () => {
    expect(projectFromWire({ id: 1, scoreboard_scale: null, scoreboard_theme: null })).toEqual({
      id: 1,
      title: "새 프로젝트",
      video_path: "",
      fps: 30,
      total_frames: 0,
      match_date: "",
      tournament_name: "",
      level: "",
      match_name: "",
      player1_name: "1팀",
      player2_name: "2팀",
      player1_score: 0,
      player2_score: 0,
      rallies: [],
      scoreboard_scale: 1.0,
      scoreboard_theme: "dark",
      video_id: null,
    });
  });

  it("rallies가 null이면 빈 배열, 있으면 객체로 변환한다", () => {
    expect(projectFromWire({ id: 1, rallies: null }).rallies).toEqual([]);
    expect(projectFromWire({ id: 1, rallies: [[10, 20, 0, 0, 1]] }).rallies).toEqual([
      { start: 10, end: 20, p1Score: 0, p2Score: 0, winner: 1 },
    ]);
  });

  it("서버가 준 값은 그대로 두고 응답의 여분 필드는 버린다", () => {
    const converted = projectFromWire({
      id: 7,
      title: "결승",
      fps: 59.94,
      video_id: "abc",
      created_at: "2026-01-01",
    } as ProjectDetailWire);

    expect(converted.id).toBe(7);
    expect(converted.title).toBe("결승");
    expect(converted.fps).toBe(59.94);
    expect(converted.video_id).toBe("abc");
    expect(converted).not.toHaveProperty("created_at");
  });
});
