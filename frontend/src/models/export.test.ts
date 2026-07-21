import { describe, it, expect } from "vitest";
import { STATUS_LABEL, STATUS_CLASS } from "./export";

describe("STATUS_LABEL", () => {
  it("모든 ExportStatus 키를 포함한다", () => {
    expect(Object.keys(STATUS_LABEL)).toEqual([
      "pending",
      "processing",
      "done",
      "error",
    ]);
  });
  it("pending은 '대기 중'", () => expect(STATUS_LABEL.pending).toBe("대기 중"));
  it("processing은 '처리 중'", () =>
    expect(STATUS_LABEL.processing).toBe("처리 중"));
  it("done은 '완료'", () => expect(STATUS_LABEL.done).toBe("완료"));
  it("error는 '오류'", () => expect(STATUS_LABEL.error).toBe("오류"));
});

describe("STATUS_CLASS", () => {
  it("STATUS_LABEL과 동일한 키를 가진다", () => {
    expect(Object.keys(STATUS_CLASS)).toEqual(Object.keys(STATUS_LABEL));
  });
  it("done은 초록색 클래스", () =>
    expect(STATUS_CLASS.done).toBe("bg-green-600 text-white"));
  it("error는 빨간색 클래스", () =>
    expect(STATUS_CLASS.error).toBe("bg-red-600 text-white"));
});
