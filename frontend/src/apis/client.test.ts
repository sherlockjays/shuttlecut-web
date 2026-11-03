import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError, isRetriableError } from "./client";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const stubFetch = (impl: (path: string, init: RequestInit) => Promise<Response>) => {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("성공하면 JSON 본문을 돌려준다", async () => {
    stubFetch(async () => jsonResponse(200, { id: 1 }));

    await expect(apiFetch("/api/x")).resolves.toEqual({ id: 1 });
  });

  it("실패하면 상태 코드와 detail을 담은 ApiError로 거부된다", async () => {
    stubFetch(async () => jsonResponse(404, { detail: "없는 프로젝트" }));

    const error = await apiFetch("/api/x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: "없는 프로젝트", name: "ApiError" });
  });

  it("실패 본문이 JSON이 아니면 statusText를 메시지로 쓴다", async () => {
    stubFetch(async () => new Response("<html>", { status: 502, statusText: "Bad Gateway" }));

    const error = await apiFetch("/api/x").catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 502, message: "Bad Gateway" });
  });

  it("호출부가 signal을 주지 않으면 타임아웃 signal을 붙인다", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));

    await apiFetch("/api/x");

    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it("호출부가 준 signal이 있으면 그것을 쓴다", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));
    const controller = new AbortController();

    await apiFetch("/api/x", { signal: controller.signal });

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  // AbortSignal.timeout은 Node 내부 타이머를 써서 가짜 타이머로 만료시킬 수 없다.
  // 만료 자체는 브라우저 검증에서 보고, 여기서는 그 결과가 변형 없이 나가는지만 본다.
  it("fetch가 TimeoutError로 거부하면 ApiError로 감싸지 않고 그대로 전파한다", async () => {
    const timeout = new DOMException("시간 초과", "TimeoutError");
    stubFetch(() => Promise.reject(timeout));

    const error = await apiFetch("/api/x").catch((e: unknown) => e);

    expect(error).toBe(timeout);
  });
});

describe("isRetriableError", () => {
  it("서버가 4xx로 답한 실패는 재시도하지 않는다", () => {
    expect(isRetriableError(new ApiError("없음", 404))).toBe(false);
    expect(isRetriableError(new ApiError("권한 없음", 403))).toBe(false);
  });

  it("5xx는 재시도한다", () => {
    expect(isRetriableError(new ApiError("서버 오류", 500))).toBe(true);
    expect(isRetriableError(new ApiError("게이트웨이", 502))).toBe(true);
  });

  it("ApiError가 아닌 실패(네트워크 단절, 타임아웃)는 재시도한다", () => {
    expect(isRetriableError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetriableError(new DOMException("시간 초과", "TimeoutError"))).toBe(true);
  });
});
