import { useEffect, useRef, useState } from "react";
import type { ProjectData } from "@/models/project";
import { createDebouncedSaver, type DebouncedSaver } from "../debouncedSaver";

export const AUTO_SAVE_DELAY_MS = 3000;
const SAVED_INDICATOR_MS = 2000;

export type SaveStatus = "idle" | "saved" | "error";

/**
 * value가 바뀔 때마다 자동으로 저장한다.
 * value를 구독하는 방식이라 값을 바꾸는 쪽은 저장의 존재를 몰라도 된다.
 */
export function useAutoSave(
  value: ProjectData,
  save: (value: ProjectData) => Promise<unknown>,
  /** 저장이 실패했을 때. 연속 실패 구간에서는 첫 번째에만 호출된다. */
  onFailure?: () => void,
) {
  const [status, setStatus] = useState<SaveStatus>("idle");

  // 콜백은 타이머와 flush에서만 불리므로 렌더마다 최신 것으로 갱신해두면 된다.
  // 덕분에 호출부가 useCallback으로 감쌀 필요가 없다.
  const callbacksRef = useRef({ save, onFailure });
  useEffect(() => {
    callbacksRef.current = { save, onFailure };
  });

  const failedRef = useRef(false);

  const saverRef = useRef<DebouncedSaver<ProjectData> | null>(null);
  saverRef.current ??= createDebouncedSaver({
    initial: value,
    delay: AUTO_SAVE_DELAY_MS,
    save: (v) => callbacksRef.current.save(v),
    onSaved: () => {
      failedRef.current = false;
      setStatus("saved");
    },
    onError: () => {
      // 오프라인 상태로 편집이 이어지면 3초마다 실패하므로 첫 번째에만 알린다.
      if (!failedRef.current) {
        failedRef.current = true;
        callbacksRef.current.onFailure?.();
      }
      setStatus("error");
    },
  });
  const saver = saverRef.current;

  useEffect(() => {
    saver.schedule(value);
  }, [saver, value]);

  // 언마운트 시 대기 중인 저장을 버리지 않고 내보낸다.
  useEffect(
    () => () => {
      void saver.flush();
    },
    [saver],
  );

  useEffect(() => {
    if (status !== "saved") return;
    const timer = setTimeout(() => setStatus("idle"), SAVED_INDICATOR_MS);
    return () => clearTimeout(timer);
  }, [status]);

  return { status, flush: saver.flush, markSaved: saver.markSaved };
}
