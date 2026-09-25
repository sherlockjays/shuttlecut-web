import { describe, it, expect } from "vitest";
import { getShortcutAction, type KeyPress } from "./shortcuts";

const key = (code: string, mods: Partial<Omit<KeyPress, "code">> = {}): KeyPress => ({
  code,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
});

describe("getShortcutAction", () => {
  it("Space는 modifier와 무관하게 재생/정지다", () => {
    expect(getShortcutAction(key("Space"))).toEqual({ kind: "togglePlay" });
    expect(getShortcutAction(key("Space", { ctrlKey: true, shiftKey: true }))).toEqual({
      kind: "togglePlay",
    });
  });

  it("R은 랠리 마킹 토글이다", () => {
    expect(getShortcutAction(key("KeyR"))).toEqual({ kind: "toggleRally" });
  });

  it("1과 2는 각 팀 득점이다", () => {
    expect(getShortcutAction(key("Digit1"))).toEqual({ kind: "addScore", team: 1 });
    expect(getShortcutAction(key("Digit2"))).toEqual({ kind: "addScore", team: 2 });
  });

  it("Ctrl+Z는 되돌리기, Ctrl+Shift+Z와 Ctrl+Y는 다시하기다", () => {
    expect(getShortcutAction(key("KeyZ", { ctrlKey: true }))).toEqual({ kind: "undo" });
    expect(getShortcutAction(key("KeyZ", { ctrlKey: true, shiftKey: true }))).toEqual({
      kind: "redo",
    });
    expect(getShortcutAction(key("KeyY", { ctrlKey: true }))).toEqual({ kind: "redo" });
  });

  it("Ctrl 없는 Z와 Y는 단축키가 아니다", () => {
    expect(getShortcutAction(key("KeyZ"))).toBeNull();
    expect(getShortcutAction(key("KeyZ", { shiftKey: true }))).toBeNull();
    expect(getShortcutAction(key("KeyY"))).toBeNull();
  });

  it("화살표는 5초, Shift+화살표는 10초 이동이다", () => {
    expect(getShortcutAction(key("ArrowLeft"))).toEqual({ kind: "seekBy", seconds: -5 });
    expect(getShortcutAction(key("ArrowRight"))).toEqual({ kind: "seekBy", seconds: 5 });
    expect(getShortcutAction(key("ArrowLeft", { shiftKey: true }))).toEqual({
      kind: "seekBy",
      seconds: -10,
    });
    expect(getShortcutAction(key("ArrowRight", { shiftKey: true }))).toEqual({
      kind: "seekBy",
      seconds: 10,
    });
  });

  it("매핑에 없는 키는 null이다", () => {
    expect(getShortcutAction(key("KeyQ"))).toBeNull();
    expect(getShortcutAction(key("Enter", { ctrlKey: true }))).toBeNull();
  });
});
