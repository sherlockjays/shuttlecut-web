import { describe, it, expect } from "vitest";
import type { ExportStatusResponse } from "@/models/export";
import { deriveYoutubeUploadState } from "./youtubeUpload";

const status = (youtube_url: ExportStatusResponse["youtube_url"]): ExportStatusResponse => ({
  status: "done",
  output_path: "/exports/1.mp4",
  youtube_url,
  error_msg: null,
});

const base = { exportId: 7, isStarting: false, trackedId: 7, exportStatus: undefined };

describe("deriveYoutubeUploadState", () => {
  it("시작 전이면 idle", () => {
    expect(deriveYoutubeUploadState({ ...base, trackedId: null })).toEqual({ kind: "idle" });
  });

  it("시작 요청이 진행 중이면 uploading", () => {
    expect(deriveYoutubeUploadState({ ...base, isStarting: true, trackedId: null })).toEqual({
      kind: "uploading",
    });
  });

  it("폴링 대상이 현재 내보내기가 아니면 idle", () => {
    // 늦게 도착한 시작 응답이 옛 id를 남겨도 다음 내보내기 화면에 새어 나오면 안 된다.
    expect(
      deriveYoutubeUploadState({
        ...base,
        exportId: 8,
        exportStatus: status("https://youtu.be/a"),
      }),
    ).toEqual({ kind: "idle" });
    expect(deriveYoutubeUploadState({ ...base, exportId: null })).toEqual({ kind: "idle" });
  });

  it("폴링 결과가 아직 없으면 실패가 아니라 uploading", () => {
    expect(deriveYoutubeUploadState(base)).toEqual({ kind: "uploading" });
  });

  it("서버가 uploading을 주면 uploading", () => {
    expect(deriveYoutubeUploadState({ ...base, exportStatus: status("uploading") })).toEqual({
      kind: "uploading",
    });
  });

  it("폴링 중 URL이 null로 돌아오면 failed", () => {
    expect(deriveYoutubeUploadState({ ...base, exportStatus: status(null) })).toEqual({
      kind: "failed",
    });
  });

  it("URL이 오면 done", () => {
    expect(
      deriveYoutubeUploadState({ ...base, exportStatus: status("https://youtu.be/abc") }),
    ).toEqual({ kind: "done", url: "https://youtu.be/abc" });
  });
});
