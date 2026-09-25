import { describe, it, expect } from "vitest";
import {
  SCOREBOARD_GEOMETRY,
  getVideoContentRect,
  getScoreboardLayout,
  getScoreboardHeaderLines,
} from "./scoreboard";

describe("getVideoContentRect", () => {
  it("영상이 박스보다 가로로 넓으면 위아래에 여백이 생긴다", () => {
    const rect = getVideoContentRect({ width: 800, height: 600 }, { width: 1920, height: 1080 });
    expect(rect).toEqual({ width: 800, height: 450, offsetX: 0, offsetY: 75 });
  });

  it("영상이 박스보다 세로로 길면 좌우에 여백이 생긴다", () => {
    const rect = getVideoContentRect({ width: 800, height: 450 }, { width: 1080, height: 1920 });
    expect(rect.height).toBe(450);
    expect(rect.width).toBeCloseTo(253.125);
    expect(rect.offsetY).toBe(0);
    expect(rect.offsetX).toBeCloseTo((800 - 253.125) / 2);
  });

  it("비율이 같으면 여백이 없다", () => {
    const rect = getVideoContentRect({ width: 960, height: 540 }, { width: 1920, height: 1080 });
    expect(rect).toEqual({ width: 960, height: 540, offsetX: 0, offsetY: 0 });
  });
});

describe("getScoreboardLayout", () => {
  const video = { width: 1920, height: 1080 };

  it("표시 배율이 1이고 크기가 1이면 규격 값이 그대로 나온다", () => {
    const layout = getScoreboardLayout({ display: video, video, scale: 1 });
    const g = SCOREBOARD_GEOMETRY;
    expect(layout.displayScale).toBe(1);
    expect(layout.x).toBe(g.margin);
    expect(layout.y).toBe(g.margin);
    expect(layout.boxWidth).toBe(g.boxWidth);
    expect(layout.headerHeight).toBe(g.lineHeight * 2 + g.pad);
    expect(layout.totalHeight).toBe(layout.headerHeight + g.rowHeight * 2);
    expect(layout.fontSmall).toBe(g.fontSmall);
    expect(layout.fontMedium).toBe(g.fontMedium);
    expect(layout.fontScore).toBe(g.fontScore);
  });

  it("영상이 절반 크기로 표시되면 좌표와 크기도 절반이 된다", () => {
    const layout = getScoreboardLayout({ display: { width: 960, height: 540 }, video, scale: 1 });
    expect(layout.displayScale).toBe(0.5);
    expect(layout.boxWidth).toBe(SCOREBOARD_GEOMETRY.boxWidth / 2);
    expect(layout.rowHeight).toBe(SCOREBOARD_GEOMETRY.rowHeight / 2);
  });

  it("점수판 크기 설정은 표시 배율과 곱해진다", () => {
    const layout = getScoreboardLayout({ display: { width: 960, height: 540 }, video, scale: 2 });
    expect(layout.boxWidth).toBe(SCOREBOARD_GEOMETRY.boxWidth);
    expect(layout.x).toBe(SCOREBOARD_GEOMETRY.margin);
  });

  it("레터박스가 있으면 여백만큼 안쪽에서 시작한다", () => {
    const layout = getScoreboardLayout({ display: { width: 800, height: 600 }, video, scale: 1 });
    const displayScale = 800 / 1920;
    expect(layout.x).toBeCloseTo(SCOREBOARD_GEOMETRY.margin * displayScale);
    expect(layout.y).toBeCloseTo(75 + SCOREBOARD_GEOMETRY.margin * displayScale);
  });

  it("표시가 아주 작아도 글자 크기는 하한 아래로 내려가지 않는다", () => {
    const layout = getScoreboardLayout({ display: { width: 192, height: 108 }, video, scale: 1 });
    expect(layout.fontSmall).toBe(8);
    expect(layout.fontMedium).toBe(9);
    expect(layout.fontScore).toBe(11);
  });
});

describe("getScoreboardHeaderLines", () => {
  it("경기 정보가 하나도 없으면 브랜드 문구 한 줄이다", () => {
    expect(
      getScoreboardHeaderLines({ match_date: "", tournament_name: "", level: "", match_name: "" }),
    ).toEqual(["ShuttleCut", ""]);
  });

  it("한 줄에 값이 하나만 있으면 구분자 없이 그 값만 쓴다", () => {
    expect(
      getScoreboardHeaderLines({
        match_date: "",
        tournament_name: "봄 대회",
        level: "A조",
        match_name: "",
      }),
    ).toEqual(["봄 대회", "A조"]);
  });

  it("한 줄에 값이 둘이면 구분자로 잇는다", () => {
    expect(
      getScoreboardHeaderLines({
        match_date: "2026-09-24",
        tournament_name: "봄 대회",
        level: "A조",
        match_name: "결승",
      }),
    ).toEqual(["2026-09-24  /  봄 대회", "A조  /  결승"]);
  });

  it("한 줄만 비어 있으면 그 줄은 빈 문자열로 남는다", () => {
    expect(
      getScoreboardHeaderLines({
        match_date: "2026-09-24",
        tournament_name: "",
        level: "",
        match_name: "",
      }),
    ).toEqual(["2026-09-24", ""]);
  });
});
