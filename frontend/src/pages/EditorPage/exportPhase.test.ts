import { describe, it, expect } from "vitest";
import type { ExportStatusResponse } from "@/models/export";
import { deriveExportPhase } from "./exportPhase";

const status = (
  patch: Partial<ExportStatusResponse> & Pick<ExportStatusResponse, "status">,
): ExportStatusResponse => ({
  output_path: null,
  youtube_url: null,
  error_msg: null,
  progress: null,
  ...patch,
});

const base = { exportId: 7, isStarting: false, startError: null, exportStatus: undefined };

describe("deriveExportPhase", () => {
  it("다루는 내보내기가 없으면 idle", () => {
    expect(deriveExportPhase({ ...base, exportId: null })).toEqual({ kind: "idle" });
  });

  it("시작 요청이 진행 중이면 starting", () => {
    expect(deriveExportPhase({ ...base, exportId: null, isStarting: true })).toEqual({
      kind: "starting",
    });
  });

  it("시작 요청이 거부되면 그 이유로 failed", () => {
    expect(deriveExportPhase({ ...base, exportId: null, startError: "저장 실패" })).toEqual({
      kind: "failed",
      message: "저장 실패",
    });
  });

  it("첫 폴링 결과가 오기 전이면 starting", () => {
    expect(deriveExportPhase(base)).toEqual({ kind: "starting" });
  });

  it("워커가 아직 집어가지 않았으면 starting", () => {
    expect(deriveExportPhase({ ...base, exportStatus: status({ status: "pending" }) })).toEqual({
      kind: "starting",
    });
  });

  it("처리 중인데 스냅샷이 아직 없으면 starting", () => {
    expect(deriveExportPhase({ ...base, exportStatus: status({ status: "processing" }) })).toEqual({
      kind: "starting",
    });
  });

  it("스냅샷이 있으면 running", () => {
    const exportStatus = status({
      status: "processing",
      progress: { percent: 42, message: "클립 3/7 추출 중...", remaining_seconds: 95 },
    });
    expect(deriveExportPhase({ ...base, exportStatus })).toEqual({
      kind: "running",
      percent: 42,
      message: "클립 3/7 추출 중...",
      remainingSeconds: 95,
    });
  });

  it("남은 시간이 없으면 remainingSeconds도 null", () => {
    const exportStatus = status({
      status: "processing",
      progress: { percent: 12, message: "영상 다운로드 중...", remaining_seconds: null },
    });
    expect(deriveExportPhase({ ...base, exportStatus })).toMatchObject({
      kind: "running",
      remainingSeconds: null,
    });
  });

  it("done이면 done", () => {
    expect(
      deriveExportPhase({
        ...base,
        exportStatus: status({ status: "done", output_path: "/exports/7.mp4" }),
      }),
    ).toEqual({ kind: "done" });
  });

  it("error면 error_msg로 failed, 비어 있으면 기본 문구", () => {
    expect(
      deriveExportPhase({
        ...base,
        exportStatus: status({ status: "error", error_msg: "ffmpeg 실패" }),
      }),
    ).toEqual({ kind: "failed", message: "ffmpeg 실패" });
    expect(deriveExportPhase({ ...base, exportStatus: status({ status: "error" }) })).toEqual({
      kind: "failed",
      message: "오류",
    });
  });

  it("시작 요청 중이면 낡은 폴링 결과보다 우선한다", () => {
    // 옛 내보내기의 done이 캐시에 남아 있어도 새 시작을 덮으면 안 된다.
    expect(
      deriveExportPhase({ ...base, isStarting: true, exportStatus: status({ status: "done" }) }),
    ).toEqual({ kind: "starting" });
  });
});
