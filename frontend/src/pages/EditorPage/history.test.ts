import { describe, it, expect } from "vitest";
import {
  HISTORY_LIMIT,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from "./history";

describe("createHistory", () => {
  it("현재값만 있고 과거/미래는 비어있다", () => {
    expect(createHistory(1)).toEqual({ past: [], present: 1, future: [] });
  });
});

describe("pushHistory", () => {
  it("새 값을 현재로 만들고 이전 현재를 past에 쌓는다", () => {
    const h = pushHistory(createHistory(1), 2);
    expect(h).toEqual({ past: [1], present: 2, future: [] });
  });

  it("future를 비운다", () => {
    const undone = undoHistory(pushHistory(createHistory(1), 2));
    expect(undone.future).toEqual([2]);
    expect(pushHistory(undone, 3).future).toEqual([]);
  });

  it("past가 HISTORY_LIMIT을 넘지 않고 오래된 것부터 버려진다", () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = pushHistory(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(HISTORY_LIMIT + 10 - HISTORY_LIMIT);
    expect(h.past[HISTORY_LIMIT - 1]).toBe(HISTORY_LIMIT + 10 - 1);
  });
});

describe("undoHistory", () => {
  it("past의 마지막을 현재로 되돌리고 이전 현재를 future 앞에 넣는다", () => {
    const h = pushHistory(pushHistory(createHistory(1), 2), 3);
    expect(undoHistory(h)).toEqual({ past: [1], present: 2, future: [3] });
  });

  it("연속으로 undo하면 future에 가까운 순서대로 쌓인다", () => {
    let h = createHistory(1);
    for (const v of [2, 3, 4]) h = pushHistory(h, v);
    h = undoHistory(h);
    expect(h.future).toEqual([4]);
    h = undoHistory(h);
    expect(h.future).toEqual([3, 4]);
    h = undoHistory(h);
    expect(h).toEqual({ past: [], present: 1, future: [2, 3, 4] });
  });

  it("undo 후 새로 편집하면 future가 버려진다", () => {
    let h = createHistory(1);
    for (const v of [2, 3]) h = pushHistory(h, v);
    h = undoHistory(h);
    expect(h.future).toEqual([3]);
    expect(pushHistory(h, 99)).toEqual({
      past: [1, 2],
      present: 99,
      future: [],
    });
  });

  it("past가 비어있으면 원본을 그대로 반환한다", () => {
    const h = createHistory(1);
    expect(undoHistory(h)).toBe(h);
  });

  it("원본 배열을 변경하지 않는다", () => {
    const h = pushHistory(pushHistory(createHistory(1), 2), 3);
    undoHistory(h);
    expect(h).toEqual({ past: [1, 2], present: 3, future: [] });
  });
});

describe("redoHistory", () => {
  it("future의 첫 값을 현재로 만들고 이전 현재를 past에 쌓는다", () => {
    const h = undoHistory(pushHistory(pushHistory(createHistory(1), 2), 3));
    expect(redoHistory(h)).toEqual({ past: [1, 2], present: 3, future: [] });
  });

  it("future가 비어있으면 원본을 그대로 반환한다", () => {
    const h = pushHistory(createHistory(1), 2);
    expect(redoHistory(h)).toBe(h);
  });
});

describe("undo / redo 왕복", () => {
  it("undo 후 redo하면 원본과 같아진다", () => {
    const h = pushHistory(pushHistory(createHistory(1), 2), 3);
    expect(redoHistory(undoHistory(h))).toEqual(h);
  });

  it("여러 번 undo 후 같은 횟수만큼 redo하면 원본과 같아진다", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 5; i++) h = pushHistory(h, i);
    let back = h;
    for (let i = 0; i < 3; i++) back = undoHistory(back);
    expect(back.present).toBe(2);
    for (let i = 0; i < 3; i++) back = redoHistory(back);
    expect(back).toEqual(h);
  });
});
