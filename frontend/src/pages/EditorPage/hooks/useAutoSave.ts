import { useEffect, useRef, useState } from "react";
import type { ProjectData } from "@/models/project";
import { createDebouncedSaver, type DebouncedSaver } from "../debouncedSaver";

export const AUTO_SAVE_DELAY_MS = 3000;
const SAVED_INDICATOR_MS = 2000;

export type SaveStatus = "idle" | "saved";

/**
 * value가 바뀔 때마다 자동으로 저장한다.
 * value를 구독하는 방식이라 값을 바꾸는 쪽은 저장의 존재를 몰라도 된다.
 */
export function useAutoSave(
  value: ProjectData,
  save: (value: ProjectData) => Promise<unknown>,
) {
  const [status, setStatus] = useState<SaveStatus>("idle");

  // 저장은 타이머와 flush에서만 일어나므로 렌더마다 최신 save로 갱신해두면 된다.
  // 덕분에 호출부가 save를 useCallback으로 감쌀 필요가 없다.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const saverRef = useRef<DebouncedSaver<ProjectData> | null>(null);
  saverRef.current ??= createDebouncedSaver({
    initial: value,
    delay: AUTO_SAVE_DELAY_MS,
    save: (v) => saveRef.current(v),
    onSaved: () => setStatus("saved"),
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
