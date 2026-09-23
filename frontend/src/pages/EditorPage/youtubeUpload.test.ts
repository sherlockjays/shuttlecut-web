import { describe, it, expect } from "vitest";
import type { ExportStatusResponse } from "@/models/export";
import { deriveYoutubeUploadState } from "./youtubeUpload";

const status = (youtube_url: ExportStatusResponse["youtube_url"]): ExportStatusResponse => ({
  status: "done",
  output_path: "/exports/1.mp4",
  youtube_url,
  error_msg: null,
});

describe("deriveYoutubeUploadState", () => {
  it("시작 전이면 idle", () => {
    expect(
      deriveYoutubeUploadState({ isStarting: false, trackedId: null, exportStatus: undefined }),
    ).toEqual({ kind: "idle" });
  });

  it("시작 요청이 진행 중이면 uploading", () => {
    expect(
      deriveYoutubeUploadState({ isStarting: true, trackedId: null, exportStatus: undefined }),
    ).toEqual({ kind: "uploading" });
  });

  it("폴링 결과가 아직 없으면 실패가 아니라 uploading", () => {
    expect(
      deriveYoutubeUploadState({ isStarting: false, trackedId: 7, exportStatus: undefined }),
    ).toEqual({ kind: "uploading" });
  });

  it("서버가 uploading을 주면 uploading", () => {
    expect(
      deriveYoutubeUploadState({
        isStarting: false,
        trackedId: 7,
        exportStatus: status("uploading"),
      }),
    ).toEqual({ kind: "uploading" });
  });

  it("폴링 중 URL이 null로 돌아오면 failed", () => {
    expect(
      deriveYoutubeUploadState({ isStarting: false, trackedId: 7, exportStatus: status(null) }),
    ).toEqual({ kind: "failed" });
  });

  it("URL이 오면 done", () => {
    expect(
      deriveYoutubeUploadState({
        isStarting: false,
        trackedId: 7,
        exportStatus: status("https://youtu.be/abc"),
      }),
    ).toEqual({ kind: "done", url: "https://youtu.be/abc" });
  });
});
