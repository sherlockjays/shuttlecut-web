const REQUEST_TIMEOUT_MS = 10_000;

/** 서버가 응답했지만 실패한 요청. 타임아웃은 여기 담기지 않고 fetch의 TimeoutError가 그대로 나간다. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(err.detail || "오류가 발생했습니다.", res.status);
  }
  return res.json() as T;
}
