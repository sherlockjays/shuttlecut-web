import { useCallback, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { exports as exportsApi } from "@/api";
import { updateProject } from "@/apis/projects";
import {
  getPreviewStatus,
  uploadVideo,
  videoPreviewUrl,
  videoStreamUrl,
} from "@/apis/video";
import { youtubeStatusOptions } from "@/queries/youtube";
import { exportStatusOptions } from "@/queries/exports";
import { projectOptions, projectsOptions } from "@/queries/projects";
import { RallyWinner, type ProjectData } from "@/models/project";
import { THEMES, SIZES, CANVAS_THEMES } from "@/models/theme";
import { useAutoSave } from "./hooks/useAutoSave";
import { useProjectDraft } from "./hooks/useProjectDraft";
import { useRallyEditor } from "./hooks/useRallyEditor";
import { resolveTotalFrames } from "./media";
import { applyPoint } from "./rally";

const DEFAULT_PROJECT_DATA: ProjectData = {
  title: "",
  video_path: "",
  fps: 30,
  total_frames: 0,
  match_date: "",
  tournament_name: "",
  level: "",
  match_name: "",
  player1_name: "1팀",
  player2_name: "2팀",
  player1_score: 0,
  player2_score: 0,
  rallies: [],
  scoreboard_scale: 1.0,
  scoreboard_theme: "dark",
};

const MATCH_INFO_FIELDS = [
  { key: "match_date", label: "날짜", placeholder: "YYYY-MM-DD" },
  { key: "tournament_name", label: "대회명", placeholder: "대회명" },
  { key: "level", label: "급수", placeholder: "A조, 혼합복식" },
  { key: "match_name", label: "경기명", placeholder: "32강, 결승" },
] satisfies {
  key: keyof ProjectData;
  label: string;
  placeholder: string;
}[];

const RALLY_WINNER_COLORS: Record<
  RallyWinner,
  { timelineClass: string; listBgClass: string; listText: string }
> = {
  [RallyWinner.Team1]: {
    timelineClass: "bg-blue-500",
    listBgClass: "bg-blue-950",
    listText: "text-blue-300",
  },
  [RallyWinner.Team2]: {
    timelineClass: "bg-red-500",
    listBgClass: "bg-red-900",
    listText: "text-red-300",
  },
  [RallyWinner.None]: {
    timelineClass: "bg-gray-500",
    listBgClass: "bg-gray-700",
    listText: "text-gray-300",
  },
};

const INVALID_RANGE_MESSAGE =
  "랠리 종료 지점이 시작 지점보다 앞에 있습니다. 시작 지점 이후로 이동한 뒤 다시 시도해주세요.";

export default function Editor({ projectId }: { projectId: number }) {
  const { data, update, undo, redo, reset, canUndo, canRedo } =
    useProjectDraft(DEFAULT_PROJECT_DATA);
  const [videoId, setVideoId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [exportPct, setExportPct] = useState<number | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const [exportEta, setExportEta] = useState<number | null>(null);
  const [exportDoneId, setExportDoneId] = useState<number | null>(null);
  const { data: yt } = useQuery(youtubeStatusOptions);
  const ytConnected = yt?.connected ?? false;
  const [ytUploading, setYtUploading] = useState(false);
  const [ytUrl, setYtUrl] = useState<string | null>(null);
  const [ytPostComment, setYtPostComment] = useState(true);
  const [videoDuration, setVideoDuration] = useState(0);
  const [previewStatus, setPreviewStatus] = useState<
    "idle" | "processing" | "ready"
  >("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: fetchedProject, isError } = useQuery(projectOptions(projectId));
  const seededRef = useRef<number | null>(null);
  const queryClient = useQueryClient();

  const {
    status: saveStatus,
    flush: flushSave,
    markSaved,
  } = useAutoSave(
    data,
    async (d) => {
      const updated = await updateProject(projectId, d);
      queryClient.setQueryData(projectOptions(projectId).queryKey, updated);
      queryClient.invalidateQueries({ queryKey: projectsOptions.queryKey });
    },
    () => alert("자동저장에 실패했습니다. 연결 상태를 확인해주세요."),
  );

  useEffect(() => {
    if (!fetchedProject || seededRef.current === projectId) return;
    seededRef.current = projectId;
    const seeded = {
      ...DEFAULT_PROJECT_DATA,
      ...fetchedProject,
      scoreboard_scale: fetchedProject.scoreboard_scale ?? 1.0,
      scoreboard_theme: fetchedProject.scoreboard_theme ?? "dark",
    };
    reset(seeded); // 다른 프로젝트를 열면 이전 undo 이력도 함께 비운다
    markSaved(seeded); // 서버에서 막 읽어온 값이라 되쓸 필요가 없다
    setVideoId(fetchedProject.video_id ?? "");
  }, [fetchedProject, projectId, reset, markSaved]);

  useEffect(() => {
    if (!videoId) return;
    setPreviewStatus("idle");
    let timer: ReturnType<typeof setInterval>;
    const check = async () => {
      try {
        const res = await getPreviewStatus(videoId);
        if (res.status === "ready") {
          setPreviewStatus("ready");
          clearInterval(timer);
        } else if (res.status === "processing") setPreviewStatus("processing");
      } catch {}
    };
    check();
    timer = setInterval(check, 4000);
    return () => clearInterval(timer);
  }, [videoId]);

  // 영상 업로드
  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadVideo(file, setUploadPct);
      setVideoId(res.video_id);
      update({
        video_path: res.path,
        fps: res.fps ?? 30,
        total_frames: res.total_frames ?? 0,
      });
    } finally {
      setUploading(false);
    }
  };

  // 프레임과 시간을 오가는 지점은 여기 둘뿐이다. 랠리 쪽은 프레임으로만 말한다.
  const getCurrentFrame = () =>
    Math.round((videoRef.current?.currentTime || 0) * data.fps);
  const seekToFrame = (frame: number) => {
    if (videoRef.current) videoRef.current.currentTime = frame / data.fps;
  };

  const {
    marking,
    toggleRally,
    addScore,
    resetScore,
    deleteRally,
    onUndone,
    onRedone,
  } = useRallyEditor({
    update,
    getCurrentFrame,
    seekToFrame,
    onInvalidRange: () => alert(INVALID_RANGE_MESSAGE),
  });

  // 단축키 effect의 의존성이라 매 렌더 새로 만들면 리스너가 계속 재등록된다.
  const handleUndo = useCallback(() => {
    const moved = undo();
    if (moved) onUndone(moved);
  }, [undo, onUndone]);

  const handleRedo = useCallback(() => {
    if (redo()) onRedone();
  }, [redo, onRedone]);

  // 내보내기
  const fmtEta = (sec: number) => {
    if (sec <= 0) return "거의 완료...";
    const m = Math.floor(sec / 60),
      s = sec % 60;
    return m > 0 ? `약 ${m}분 ${s}초 남음` : `약 ${s}초 남음`;
  };

  const { data: exportStatus } = useQuery({
    ...exportStatusOptions(exportDoneId!),
    refetchInterval: (query) => {
      const url = query.state.data?.youtube_url;
      return url && url !== "uploading" ? false : 3000;
    },
    enabled: ytUploading && exportDoneId != null,
  });

  useEffect(() => {
    if (!ytUploading || !exportStatus) return;
    if (exportStatus.youtube_url && exportStatus.youtube_url !== "uploading") {
      setYtUrl(exportStatus.youtube_url);
      setYtUploading(false);
    } else if (!exportStatus.youtube_url) {
      setYtUploading(false);
    }
  }, [exportStatus, ytUploading]);

  const startYoutubeUpload = async () => {
    if (!exportDoneId) return;
    setYtUploading(true);
    try {
      await exportsApi.uploadToYoutube(exportDoneId, ytPostComment);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "YouTube 업로드 실패");
      setYtUploading(false);
    }
  };

  const startExport = async () => {
    // 백엔드가 DB에서 읽어 영상을 만들므로, 미저장 변경사항을 먼저 반영해야 한다.
    try {
      await flushSave();
    } catch {
      setExportPct(0);
      setExportMsg("저장에 실패해 내보내기를 중단했습니다.");
      setTimeout(() => setExportPct(null), 3000);
      return;
    }

    setExportPct(0);
    setExportMsg("시작 중...");
    setExportEta(null);
    setExportDoneId(null);
    let res;
    try {
      res = await exportsApi.start(projectId);
    } catch (e: any) {
      setExportMsg(e.message || "내보내기 실패");
      setTimeout(() => setExportPct(null), 3000);
      return;
    }
    const ws = new WebSocket(exportsApi.wsUrl(res.export_id));
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      setExportPct(d.pct);
      setExportMsg(d.msg);
      setExportEta(d.eta ?? null);
      if (d.status === "done") {
        ws.close();
        setExportDoneId(res.export_id);
        setTimeout(() => setExportPct(null), 500);
      } else if (d.status === "error") {
        ws.close();
        setExportEta(null);
        setTimeout(() => setExportPct(null), 3000);
      }
    };
  };

  // 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (videoRef.current?.paused) {
          videoRef.current.play();
        } else {
          videoRef.current?.pause();
        }
      }
      if (e.code === "KeyR") toggleRally();
      if (e.code === "Digit1") addScore(RallyWinner.Team1);
      if (e.code === "Digit2") addScore(RallyWinner.Team2);
      if (e.code === "KeyZ" && e.ctrlKey && !e.shiftKey) handleUndo();
      if (
        (e.code === "KeyZ" && e.ctrlKey && e.shiftKey) ||
        (e.code === "KeyY" && e.ctrlKey)
      )
        handleRedo();
      if (e.code === "ArrowLeft") {
        if (videoRef.current)
          videoRef.current.currentTime -= e.shiftKey ? 10 : 5;
      }
      if (e.code === "ArrowRight") {
        if (videoRef.current)
          videoRef.current.currentTime += e.shiftKey ? 10 : 5;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // 의존성을 필요한 최소한으로 줄이는 것은 #33에서 다룬다.
  }, [toggleRally, addScore, handleUndo, handleRedo]);

  // 점수판 canvas 미리보기
  useEffect(() => {
    const canvas = canvasRef.current;
    const videoEl = videoRef.current;
    if (!canvas || !videoEl || !videoEl.videoWidth) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const displayW = videoEl.clientWidth;
    const displayH = videoEl.clientHeight;
    canvas.width = displayW;
    canvas.height = displayH;
    ctx.clearRect(0, 0, displayW, displayH);

    // 실제 영상 콘텐츠 영역 계산 (레터박스 대응)
    const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
    const containerAspect = displayW / displayH;
    let contentW: number, contentH: number, ox: number, oy: number;
    if (videoAspect > containerAspect) {
      contentW = displayW;
      contentH = displayW / videoAspect;
      ox = 0;
      oy = (displayH - contentH) / 2;
    } else {
      contentH = displayH;
      contentW = displayH * videoAspect;
      ox = (displayW - contentW) / 2;
      oy = 0;
    }
    const sf = contentW / videoEl.videoWidth;

    const s = data.scoreboard_scale;
    const t = CANVAS_THEMES[data.scoreboard_theme] || CANVAS_THEMES.dark;

    const x = ox + 11 * s * sf;
    const y = oy + 11 * s * sf;
    const bw = 236 * s * sf;
    const pad = 6 * s * sf;
    const row_h = 38 * s * sf;
    const line_h = 17 * s * sf;
    const header_h = line_h * 2 + pad;
    const total_h = header_h + row_h * 2;

    const fontSm = Math.max(8, Math.round(13 * s * sf));
    const fontMd = Math.max(9, Math.round(16 * s * sf));
    const fontScore = Math.max(11, Math.round(27 * s * sf));

    // 헤더
    ctx.fillStyle = t.header_bg;
    ctx.fillRect(x, y, bw, header_h);
    const line1 = [data.match_date, data.tournament_name]
      .filter(Boolean)
      .join("  /  ");
    const line2 = [data.level, data.match_name].filter(Boolean).join("  /  ");
    const headerLines = !line1 && !line2 ? ["ShuttleCut", ""] : [line1, line2];
    ctx.fillStyle = t.header_text;
    ctx.font = `${fontSm}px sans-serif`;
    headerLines.forEach((line, i) => {
      if (line) ctx.fillText(line, x + pad, y + pad / 2 + (i + 1) * line_h - 2);
    });

    // 선수 행
    let y0 = y + header_h;
    for (const [name, score] of [
      [data.player1_name, data.player1_score],
      [data.player2_name, data.player2_score],
    ] as [string, number][]) {
      ctx.fillStyle = t.row_bg;
      ctx.fillRect(x, y0, bw, row_h);
      ctx.fillStyle = t.name_text;
      ctx.font = `${fontMd}px sans-serif`;
      ctx.fillText(
        (name || "").slice(0, 18),
        x + pad,
        y0 + (row_h + fontMd) / 2 - 2,
      );
      ctx.font = `bold ${fontScore}px sans-serif`;
      const scoreStr = String(score);
      const sw = ctx.measureText(scoreStr).width;
      ctx.fillStyle = t.score_text;
      ctx.fillText(
        scoreStr,
        x + bw - sw - pad,
        y0 + (row_h + fontScore) / 2 - 4,
      );
      y0 += row_h;
    }

    // 테두리 / 구분선
    ctx.strokeStyle = t.border;
    ctx.lineWidth = Math.max(1, 2 * sf);
    ctx.strokeRect(x, y, bw, total_h);
    ctx.strokeStyle = t.divider;
    ctx.lineWidth = Math.max(0.5, sf);
    ctx.beginPath();
    ctx.moveTo(x, y + header_h);
    ctx.lineTo(x + bw, y + header_h);
    ctx.stroke();
    ctx.strokeStyle = t.row_div;
    ctx.lineWidth = Math.max(1, 3 * sf);
    ctx.beginPath();
    ctx.moveTo(x + 1, y + header_h + row_h);
    ctx.lineTo(x + bw - 1, y + header_h + row_h);
    ctx.stroke();
  }, [
    data.scoreboard_scale,
    data.scoreboard_theme,
    data.player1_name,
    data.player2_name,
    data.player1_score,
    data.player2_score,
    data.match_date,
    data.tournament_name,
    data.level,
    data.match_name,
    videoDuration,
  ]);

  const streamUrl = videoId ? videoStreamUrl(videoId) : "";
  const videoSrc = videoId
    ? previewStatus === "ready"
      ? videoPreviewUrl(videoId)
      : streamUrl
    : "";
  const totalFrames = resolveTotalFrames(
    data.total_frames,
    videoDuration,
    data.fps,
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* 헤더 */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-4">
        <Link to="/projects" className="text-gray-400 hover:text-white text-sm">
          ← 대시보드
        </Link>
        <input
          value={data.title}
          onChange={(e) => update({ title: e.target.value })}
          className="bg-transparent text-white font-medium outline-none border-b border-transparent hover:border-gray-600 focus:border-blue-500 px-1"
        />
        {saveStatus === "saved" && (
          <span className="text-green-400 text-xs">저장됨 ✓</span>
        )}
        {saveStatus === "error" && (
          <span className="text-red-400 text-xs">저장 실패 ⚠</span>
        )}
      </header>
      {isError && (
        <p className="text-red-400 text-sm px-4 pt-2">
          프로젝트를 불러오지 못했습니다.
        </p>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 왼쪽: 영상 + 컨트롤 */}
        <div className="flex-1 flex flex-col p-4 gap-3">
          {/* 영상 업로드 or 플레이어 */}
          {!streamUrl ? (
            <label
              className="flex-1 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <p className="text-4xl mb-2">🎬</p>
              <p className="text-gray-400">
                {uploading
                  ? `업로드 중... ${uploadPct}%`
                  : "영상 파일을 클릭하거나 드래그하여 업로드"}
              </p>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && handleFile(e.target.files[0])
                }
              />
            </label>
          ) : (
            <div className="relative w-full">
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                className="w-full rounded-xl bg-black"
                style={{ maxHeight: "60vh" }}
                onLoadedMetadata={() =>
                  setVideoDuration(videoRef.current?.duration || 0)
                }
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{ width: "100%", height: "100%" }}
              />
              {previewStatus === "processing" && (
                <div className="absolute top-2 left-2 bg-black/70 text-yellow-300 text-xs px-2 py-1 rounded">
                  프리뷰 생성 중... (Chrome에서 재생 불가 시 잠시 후 새로고침)
                </div>
              )}
            </div>
          )}

          {/* 재생 컨트롤 */}
          <div className="flex gap-2 text-sm">
            {[
              ["⏮ 5초", -5],
              ["⏮ 10초", -10],
              ["10초 ⏭", 10],
              ["5초 ⏭", 5],
            ].map(([label, sec]) => (
              <button
                key={label as string}
                onClick={() => {
                  if (videoRef.current)
                    videoRef.current.currentTime += sec as number;
                }}
                className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* 랠리 타임라인 */}
          {data.rallies.length > 0 && totalFrames > 0 && (
            <div
              className="relative w-full h-6 bg-gray-700 rounded-lg overflow-hidden"
              title="랠리 타임라인 - 클릭하면 해당 구간으로 이동"
            >
              {data.rallies.map((r, i) => {
                const left = (r.start / totalFrames) * 100;
                const width = Math.max(
                  0.5,
                  ((r.end - r.start) / totalFrames) * 100,
                );
                return (
                  <div
                    key={i}
                    onClick={() => seekToFrame(r.start)}
                    title={`랠리 ${i + 1}: ${r.p1Score}-${r.p2Score}`}
                    className={`absolute top-0 h-full cursor-pointer hover:brightness-125 transition-all ${RALLY_WINNER_COLORS[r.winner].timelineClass}`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* 단축키 안내 */}
          <p className="text-gray-500 text-xs text-center">
            [Space] 재생/정지 | [R] 랠리 마킹 | [1] 1팀 득점 | [2] 2팀 득점 |
            [Ctrl+Z] 되돌리기 | [Ctrl+Y] 다시하기 | [←→] 이동
          </p>
        </div>

        {/* 오른쪽: 정보 + 점수 + 랠리 */}
        <div className="w-72 bg-gray-800 border-l border-gray-700 flex flex-col p-4 gap-4 overflow-y-auto">
          {/* 경기 정보 */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">
              경기 정보
            </h3>
            <div className="space-y-2">
              {MATCH_INFO_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <input
                    value={data[key]}
                    placeholder={placeholder}
                    onChange={(e) => update({ [key]: e.target.value })}
                    className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 mt-0.5"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* 점수판 */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">
              점수판
            </h3>
            {/* 크기 선택 */}
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs text-gray-500 w-8">크기</span>
              {SIZES.map((sz) => (
                <button
                  key={sz.value}
                  onClick={() => update({ scoreboard_scale: sz.value })}
                  className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${data.scoreboard_scale === sz.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                  {sz.label}
                </button>
              ))}
            </div>
            {/* 테마 선택 */}
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs text-gray-500 w-8">테마</span>
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  onClick={() => update({ scoreboard_theme: th.id })}
                  title={th.label}
                  className={`flex-1 h-6 rounded text-xs transition-all ${data.scoreboard_theme === th.id ? "ring-2 ring-white scale-110" : "opacity-70 hover:opacity-100"}`}
                  style={{
                    backgroundColor: th.bg,
                    color: th.accent,
                    border: `1px solid ${th.accent}`,
                  }}
                >
                  {th.label[0]}
                </button>
              ))}
            </div>
            <div className="rounded-xl overflow-hidden text-center">
              <div className="grid grid-cols-2">
                <div className="flex flex-col items-center p-3 bg-blue-900">
                  <input
                    value={data.player1_name}
                    onChange={(e) => update({ player1_name: e.target.value })}
                    className="bg-transparent text-yellow-300 font-medium text-sm w-full text-center outline-none"
                  />
                  <span className="text-2xl font-bold text-white">
                    {data.player1_score}
                  </span>
                </div>
                <div className="flex flex-col items-center p-3 bg-red-900">
                  <input
                    value={data.player2_name}
                    onChange={(e) => update({ player2_name: e.target.value })}
                    className="bg-transparent text-yellow-300 font-medium text-sm w-full text-center outline-none"
                  />
                  <span className="text-2xl font-bold text-white">
                    {data.player2_score}
                  </span>
                </div>
              </div>
              <div className="flex gap-0">
                <button
                  onClick={() => addScore(RallyWinner.Team1)}
                  className="flex-1 bg-blue-700 hover:bg-blue-600 text-white py-2 text-sm transition-colors"
                >
                  1팀 득점 (1)
                </button>
                <button
                  onClick={() => addScore(RallyWinner.Team2)}
                  className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 text-sm transition-colors"
                >
                  2팀 득점 (2)
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  title="되돌리기 (Ctrl+Z)"
                  className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 py-1.5 rounded-lg text-xs transition-colors"
                >
                  ↩ 되돌리기
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  title="다시하기 (Ctrl+Y)"
                  className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 py-1.5 rounded-lg text-xs transition-colors"
                >
                  ↪ 다시하기
                </button>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={resetScore}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 rounded-lg text-xs transition-colors"
                >
                  점수 리셋
                </button>
              </div>
            </div>
          </section>

          {/* 랠리 마킹 */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">
              랠리 마킹
            </h3>
            <button
              onClick={toggleRally}
              className={`w-full py-3 rounded-xl font-medium text-sm transition-colors ${
                marking
                  ? "bg-red-600 hover:bg-red-700 animate-pulse"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {marking ? "● 마킹 중... (R로 종료)" : "랠리 시작 (R)"}
            </button>

            {/* 랠리 목록 */}
            <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
              {data.rallies.map((r, i) => {
                const scoreAfterRally = applyPoint(
                  r.p1Score,
                  r.p2Score,
                  r.winner,
                );
                return (
                  <div
                    key={i}
                    onClick={() => seekToFrame(r.start)}
                    className={`flex items-center justify-between rounded px-2 py-1.5 text-xs cursor-pointer hover:brightness-125 transition-all ${RALLY_WINNER_COLORS[r.winner].listBgClass}`}
                  >
                    <span className="text-gray-300 w-10 shrink-0">
                      랠리 {i + 1}
                    </span>
                    <span
                      className={`font-mono font-medium ${RALLY_WINNER_COLORS[r.winner].listText}`}
                    >
                      {r.p1Score}-{r.p2Score} → {scoreAfterRally.player1_score}-
                      {scoreAfterRally.player2_score}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRally(i);
                      }}
                      className="text-gray-500 hover:text-red-400 ml-1 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 내보내기 */}
          <section className="mt-auto">
            {exportPct !== null ? (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{exportMsg}</span>
                  <span>{exportEta !== null ? fmtEta(exportEta) : ""}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${exportPct}%` }}
                  />
                </div>
              </div>
            ) : exportDoneId !== null ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <a
                    href={exportsApi.downloadUrl(exportDoneId)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium transition-colors text-center"
                  >
                    다운로드
                  </a>
                  <button
                    onClick={() => {
                      setExportDoneId(null);
                      setYtUrl(null);
                    }}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 rounded-xl transition-colors"
                  >
                    다시
                  </button>
                </div>
                {ytUrl ? (
                  <a
                    href={ytUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-sm font-medium transition-colors text-center"
                  >
                    YouTube에서 보기 ↗
                  </a>
                ) : ytUploading ? (
                  <div className="text-center text-xs text-gray-400 py-2">
                    YouTube 업로드 중...
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none px-1">
                      <input
                        type="checkbox"
                        checked={ytPostComment}
                        onChange={(e) => setYtPostComment(e.target.checked)}
                        className="accent-red-500 w-3.5 h-3.5"
                      />
                      타임라인 댓글 자동 게시
                    </label>
                    <button
                      onClick={startYoutubeUpload}
                      disabled={!ytConnected}
                      title={
                        ytConnected
                          ? "YouTube에 업로드"
                          : "대시보드에서 YouTube 계정을 먼저 연결해주세요"
                      }
                      className="w-full bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                      YouTube 업로드
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={startExport}
                disabled={data.rallies.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-3 rounded-xl font-medium transition-colors"
              >
                내보내기
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
