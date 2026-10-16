export const HISTORY_LIMIT = 50;

// [...past, present, ...future]가 항상 시간순이 되도록 유지한다.
// past는 오래된 것부터, future는 가까운 미래부터 담긴다.
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

export const createHistory = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
});

// 새 분기가 생기므로 redo로 갈 수 있던 경로(future)는 버린다.
// 뒤로가기 후 다른 링크를 누르면 앞으로가기가 사라지는 것과 같다.
export const pushHistory = <T>(h: History<T>, present: T): History<T> => ({
  past: [...h.past, h.present].slice(-HISTORY_LIMIT),
  present,
  future: [],
});

export const undoHistory = <T>(h: History<T>): History<T> =>
  h.past.length === 0
    ? h
    : {
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1],
        future: [h.present, ...h.future],
      };

export const redoHistory = <T>(h: History<T>): History<T> =>
  h.future.length === 0
    ? h
    : {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      };
