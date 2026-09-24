import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { exportDownloadUrl } from "@/apis/exports";
import { youtubeStatusOptions } from "@/queries/youtube";
import { useExport, type ExportPhase } from "../hooks/useExport";
import { useYoutubeUpload } from "../hooks/useYoutubeUpload";
import type { YoutubeUploadState } from "../youtubeUpload";

const SECONDS_PER_MINUTE = 60;

const formatEta = (sec: number) => {
  if (sec <= 0) return "거의 완료...";
  const m = Math.floor(sec / SECONDS_PER_MINUTE);
  const s = sec % SECONDS_PER_MINUTE;
  return m > 0 ? `약 ${m}분 ${s}초 남음` : `약 ${s}초 남음`;
};

type Props = {
  projectId: number;
  canExport: boolean;
  /** 백엔드가 DB에서 읽어 영상을 만들므로 시작 전에 미저장 변경을 반영해야 한다. */
  flushSave: () => Promise<void>;
};

/**
 * 내보내기와 유튜브 업로드의 상태를 소유한다.
 * 진행률이 WS 메시지마다 바뀌므로 그 리렌더가 Editor 전체로 번지지 않게 여기서 멈춘다.
 */
export default function ExportPanel({ projectId, canExport, flushSave }: Props) {
  const { phase, exportId, start, reset: resetExport } = useExport({ projectId, flush: flushSave });
  const youtube = useYoutubeUpload({ onStartFailed: (message) => alert(message) });
  // 업로드 폼이 실패 뒤 다시 열려도 선택이 남도록 폼 바깥에 둔다.
  const [postComment, setPostComment] = useState(true);

  if (phase.kind === "starting" || phase.kind === "running" || phase.kind === "failed") {
    return <ExportProgress phase={phase} />;
  }

  if (phase.kind === "done" && exportId !== null) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <a
            href={exportDownloadUrl(exportId)}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium transition-colors text-center"
          >
            다운로드
          </a>
          <button
            onClick={() => {
              resetExport();
              youtube.reset();
            }}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 rounded-xl transition-colors"
          >
            다시
          </button>
        </div>
        <YoutubeUploadArea
          state={youtube.state}
          postComment={postComment}
          onPostCommentChange={setPostComment}
          onUpload={() => youtube.upload(exportId, postComment)}
        />
      </div>
    );
  }

  return (
    <button
      onClick={start}
      disabled={!canExport}
      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-3 rounded-xl font-medium transition-colors"
    >
      내보내기
    </button>
  );
}

function ExportProgress({
  phase,
}: {
  phase: Exclude<ExportPhase, { kind: "idle" } | { kind: "done" }>;
}) {
  const msg = phase.kind === "starting" ? "시작 중..." : phase.msg;
  const pct = phase.kind === "running" ? phase.pct : 0;
  const eta = phase.kind === "running" ? phase.eta : null;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{msg}</span>
        <span>{eta !== null ? formatEta(eta) : ""}</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function YoutubeUploadArea({
  state,
  postComment,
  onPostCommentChange,
  onUpload,
}: {
  state: YoutubeUploadState;
  postComment: boolean;
  onPostCommentChange: (value: boolean) => void;
  onUpload: () => void;
}) {
  const { data: yt } = useQuery(youtubeStatusOptions);
  const ytConnected = yt?.connected ?? false;

  if (state.kind === "done") {
    return (
      <a
        href={state.url}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-sm font-medium transition-colors text-center"
      >
        YouTube에서 보기 ↗
      </a>
    );
  }

  if (state.kind === "uploading") {
    return <div className="text-center text-xs text-gray-400 py-2">YouTube 업로드 중...</div>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {state.kind === "failed" && (
        <p className="text-center text-xs text-red-400">
          YouTube 업로드에 실패했습니다. 다시 시도해주세요.
        </p>
      )}
      <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none px-1">
        <input
          type="checkbox"
          checked={postComment}
          onChange={(e) => onPostCommentChange(e.target.checked)}
          className="accent-red-500 w-3.5 h-3.5"
        />
        타임라인 댓글 자동 게시
      </label>
      <button
        onClick={onUpload}
        disabled={!ytConnected}
        title={ytConnected ? "YouTube에 업로드" : "대시보드에서 YouTube 계정을 먼저 연결해주세요"}
        className="w-full bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded-xl text-sm font-medium transition-colors"
      >
        YouTube 업로드
      </button>
    </div>
  );
}
