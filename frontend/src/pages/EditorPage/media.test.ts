import { describe, it, expect } from "vitest";
import { resolveTotalFrames } from "./media";

describe("resolveTotalFrames", () => {
  it("프로젝트에 기록된 전체 프레임이 있으면 그 값을 쓴다", () => {
    expect(resolveTotalFrames(54000, 1800, 30)).toBe(54000);
  });

  it("기록이 없으면 재생 길이와 fps로 구한다", () => {
    expect(resolveTotalFrames(0, 1800, 30)).toBe(54000);
  });

  it("재생 길이도 아직 모르면 0이다", () => {
    expect(resolveTotalFrames(0, 0, 30)).toBe(0);
  });

  it("구한 값은 정수로 맞춘다", () => {
    expect(resolveTotalFrames(0, 10.04, 29.97)).toBe(301);
  });
});
