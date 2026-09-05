export type DebouncedSaver<T> = {
  /** 값을 저장 대상으로 예약한다. delay 안에 다시 부르면 앞선 예약은 취소된다. */
  schedule(value: T): void;
  /**
   * 예약된 저장을 기다리지 않고 즉시 실행한다. 저장할 변경이 없으면 아무것도 하지 않는다.
   * 이행되면 서버에 반영된 것이고, 저장에 실패하면 거부된다.
   */
  flush(): Promise<void>;
  /**
   * 서버에서 막 읽어온 값처럼, 저장할 필요가 없는 값을 기준선으로 지정한다.
   * 마운트 후에 뒤늦게 도착하는 서버 값을 위한 것으로, 처음부터 서버 값으로 마운트하게 되면(#39) 필요 없어진다.
   */
  markSaved(value: T): void;
};

/**
 * 값이 바뀔 때마다 delay만큼 미뤘다가 저장하는 자동저장기.
 * 마지막으로 저장된 값을 기준선으로 들고 있어 같은 값을 두 번 저장하지 않는다.
 */
export function createDebouncedSaver<T>({
  initial,
  delay,
  save,
  onSaved,
  onError,
}: {
  /** 생성 시점에 이미 저장되어 있는 값. 이 값으로는 저장이 일어나지 않는다. */
  initial: T;
  delay: number;
  save: (value: T) => Promise<unknown>;
  onSaved?: () => void;
  onError?: (error: unknown) => void;
}): DebouncedSaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest = initial;
  let saved = initial;

  const clearTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  // 저장을 한 번에 하나씩만 보낸다. 앞선 요청이 끝나기 전에 flush가 끼어들면 두 요청이
  // 겹쳐, 늦게 도착한 옛 값이 서버를 되돌리거나 기준선을 오염시킬 수 있다.
  let queue: Promise<void> = Promise.resolve();

  const saveNow = () => {
    const attempt = queue.then(async () => {
      // 큐에서 실행될 때 최신값을 다시 읽으므로, 기다리는 동안 들어온 변경까지 함께 저장된다.
      const value = latest;
      if (value === saved) return;
      try {
        await save(value);
        saved = value;
        onSaved?.();
      } catch (error) {
        // saved를 갱신하지 않으므로 다음 schedule에서 다시 저장을 시도한다.
        onError?.(error);
        throw error;
      }
    });
    // 실패는 attempt로만 전달한다. 체인이 rejected로 굳으면 이후 저장이 전부 건너뛰어진다.
    queue = attempt.catch(() => {});
    return attempt;
  };

  return {
    schedule: (value) => {
      latest = value;
      clearTimer();
      // undo 등으로 이미 저장된 값으로 되돌아온 경우 예약해 둔 저장까지 취소한다.
      if (value === saved) return;
      timer = setTimeout(() => {
        timer = null;
        void saveNow();
      }, delay);
    },

    flush: () => {
      clearTimer();
      return saveNow();
    },

    markSaved: (value) => {
      clearTimer();
      latest = value;
      saved = value;
    },
  };
}
