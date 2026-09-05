import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncedSaver } from "./debouncedSaver";

const DELAY = 3000;

const setup = (save: (value: string) => Promise<unknown>) => {
  const onSaved = vi.fn();
  const onError = vi.fn();
  const saver = createDebouncedSaver({
    initial: "서버값",
    delay: DELAY,
    save,
    onSaved,
    onError,
  });
  return { saver, onSaved, onError };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("schedule", () => {
  it("delay가 지나기 전에는 저장하지 않는다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY - 1);

    expect(save).not.toHaveBeenCalled();
  });

  it("delay가 지나면 저장하고 onSaved를 호출한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver, onSaved } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(save).toHaveBeenCalledExactlyOnceWith("a");
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("연속으로 예약하면 마지막 값으로 한 번만 저장한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    saver.schedule("b");
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    saver.schedule("c");
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(save).toHaveBeenCalledExactlyOnceWith("c");
  });

  it("이미 저장된 값이면 저장하지 않는다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.schedule("서버값");
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(save).not.toHaveBeenCalled();
  });

  it("저장된 값으로 되돌아오면 예약해 둔 저장을 취소한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    saver.schedule("서버값"); // undo로 원래 값으로 복귀
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(save).not.toHaveBeenCalled();
  });
});

describe("flush", () => {
  it("대기 중인 타이머를 취소하고 즉시 저장한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.schedule("a");
    await saver.flush();

    expect(save).toHaveBeenCalledExactlyOnceWith("a");

    // 취소된 타이머가 뒤늦게 살아나 중복 저장하지 않아야 한다.
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(save).toHaveBeenCalledOnce();
  });

  it("대기 중인 변경이 없으면 저장하지 않는다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(save);

    await saver.flush();

    expect(save).not.toHaveBeenCalled();
  });

  it("이미 저장을 마친 뒤에 부르면 다시 저장하지 않는다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    await saver.flush();

    expect(save).toHaveBeenCalledOnce();
  });
});

describe("markSaved", () => {
  it("지정한 값은 저장 대상에서 제외된다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.markSaved("시드값");
    saver.schedule("시드값");
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(save).not.toHaveBeenCalled();
  });

  it("대기 중이던 저장을 취소한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.schedule("a");
    saver.markSaved("시드값");
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(save).not.toHaveBeenCalled();
  });
});

// 저장 요청을 원하는 시점에 끝낼 수 있게 만드는 헬퍼
const deferred = () => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = () => res();
  });
  return { promise, resolve };
};

describe("동시 저장", () => {
  it("앞선 저장이 끝나기 전에는 다음 저장을 보내지 않는다", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(save).toHaveBeenCalledExactlyOnceWith("a");

    saver.schedule("b");
    const flushed = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledOnce(); // a가 끝나지 않아 b는 아직 나가지 않는다

    first.resolve();
    await flushed;

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("b");
  });

  it("기다리는 동안 값이 또 바뀌면 최신값으로 저장한다", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const { saver } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY);

    saver.schedule("b");
    const flushed = saver.flush();
    saver.schedule("c"); // 큐가 실행되기 전에 다시 변경

    first.resolve();
    await flushed;

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("c");
  });
});

describe("저장 실패", () => {
  it("onError를 호출하고 onSaved는 호출하지 않는다", async () => {
    const error = new Error("네트워크 오류");
    const save = vi.fn().mockRejectedValue(error);
    const { saver, onSaved, onError } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("flush는 저장에 실패하면 거부된다", async () => {
    const error = new Error("네트워크 오류");
    const save = vi.fn().mockRejectedValue(error);
    const { saver } = setup(save);

    saver.schedule("a");

    await expect(saver.flush()).rejects.toThrow("네트워크 오류");
  });

  it("앞선 저장이 실패해도 다음 저장은 정상 실행된다", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockResolvedValue(undefined);
    const { saver, onSaved } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY);

    saver.schedule("b");
    await saver.flush();

    expect(save).toHaveBeenLastCalledWith("b");
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("실패한 값은 기준선이 되지 않아 다음 예약에서 다시 저장된다", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockResolvedValue(undefined);
    const { saver, onSaved } = setup(save);

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(save).toHaveBeenCalledOnce();

    saver.schedule("b");
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(save).toHaveBeenLastCalledWith("b");
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
