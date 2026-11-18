const REQUEST_TIMEOUT_MS = 10_000;

/** 서버가 응답했지만 실패한 요청. 응답이 없어 끊긴 경우는 RequestTimeoutError다. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** REQUEST_TIMEOUT_MS 안에 응답이 없어 끊긴 요청. 브라우저의 TimeoutError 문구가 영어라 한국어로 바꿔 던진다. */
export class RequestTimeoutError extends Error {
  constructor() {
    super("서버 응답이 없습니다. 잠시 후 다시 시도해주세요.");
    this.name = "RequestTimeoutError";
  }
}

/** 재시도해서 성공할 가능성이 있는 실패인가. 서버가 4xx로 답한 경우만 아니다. */
export const isRetriableError = (error: unknown) =>
  !(error instanceof ApiError && error.status < 500);

function headers() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function saveToken(token: string) {
  localStorage.setItem("token", token);
}

export async function apiFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
    signal: opts.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch((e: unknown) => {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new RequestTimeoutError();
    throw e;
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(err.detail || "오류가 발생했습니다.", res.status);
  }
  return res.json() as T;
}
