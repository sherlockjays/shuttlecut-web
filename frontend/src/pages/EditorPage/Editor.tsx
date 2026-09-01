import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { projects, videos, exports as exportsApi } from "@/api";
import { youtubeStatusOptions } from "@/queries/youtube";
import { exportStatusOptions } from "@/queries/exports";
import { type Rally, type ProjectData } from "@/models/project";
import { THEMES, SIZES, type ThemeId } from "@/models/theme";

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
] as const;

const RALLY_WINNER_COLORS: Record<
  Rally["winner"],
  { timelineClass: string; listBgClass: string; listText: string }
> = {
  1: { timelineClass: "bg-blue-500", listBgClass: "bg-blue-950", listText: "text-blue-300" },
  2: { timelineClass: "bg-red-500", listBgClass: "bg-red-900", listText: "text-red-300" },
  0: { timelineClass: "bg-gray-500", listBgClass: "bg-gray-700", listText: "text-gray-300" },
};

const CANVAS_THEMES: Record<ThemeId, Record<string, string>> = {
  dark: {
    header_bg: "#1e1e1e",
    row_bg: "#000000",
    header_text: "#dcdcdc",
    name_text: "#ffdc00",
    score_text: "#ffdc00",
    border: "#ffffff",
    divider: "#b4b4b4",
    row_div: "#c8c8c8",
  },
  light: {
    header_bg: "#f0f0f0",
    row_bg: "#ffffff",
    header_text: "#323232",
    name_text: "#1e50c8",
    score_text: "#1e50c8",
    border: "#323232",
    divider: "#969696",
    row_div: "#969696",
  },
  blue: {
    header_bg: "#002878",
    row_bg: "#001450",
    header_text: "#c8dcff",
    name_text: "#ffdc00",
    score_text: "#ffdc00",
    border: "#64a0ff",
    divider: "#5078c8",
    row_div: "#5082d2",
  },
  red: {
    header_bg: "#781414",
    row_bg: "#500000",
    header_text: "#ffdcdc",
    name_text: "#ffdc00",
    score_text: "#ffdc00",
    border: "#ff6464",
    divider: "#c85050",
    row_div: "#c85050",
  },
  green: {
    header_bg: "#0a3c14",
    row_bg: "#05280a",
    header_text: "#c8ffd2",
    name_text: "#b4ff64",
    score_text: "#b4ff64",
    border: "#50c864",
    divider: "#3ca050",
    row_div: "#3ca050",
  },
};

export default function Editor({ projectId }: { projectId: number }) {
  const [data, setData] = useState<ProjectData>(DEFAULT_PROJECT_DATA);
  const [videoId, setVideoId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [marking, setMarking] = useState(false);
  const [markStart, setMarkStart] = useState(0);
  const [exportPct, setExportPct] = useState<number | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const [exportEta, setExportEta] = useState<number | null>(null);
  const [exportDoneId, setExportDoneId] = useState<number | null>(null);
  const { data: yt } = useQuery(youtubeStatusOptions);
  const ytConnected = yt?.connected ?? false;
  const [ytUploading, setYtUploading] = useState(false);
  const [ytUrl, setYtUrl] = useState<string | null>(null);
  const [ytPostComment, setYtPostComment] = useState(true);
  const [saved, setSaved] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<
    "idle" | "processing" | "ready"
  >("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<ProjectData[]>([]);
  const futureRef = useRef<ProjectData[]>([]);

  useEffect(() => {
    projects.get(projectId).then((p) => {
      setData({
        ...DEFAULT_PROJECT_DATA,
        ...p,
        scoreboard_scale: p.scoreboard_scale ?? 1.0,
        scoreboard_theme: p.scoreboard_theme ?? "dark",
      });
      if (p.video_path) {
        const vid = p.video_path.split(/[/\\]/).pop()?.split(".")[0] || "";
        setVideoId(vid);
      }
    });
  }, [projectId]);

  useEffect(() => {
    if (!videoId) return;
    setPreviewStatus("idle");
    let timer: ReturnType<typeof setInterval>;
    const check = async () => {
      try {
        const res = await videos.previewStatus(videoId);
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

  // 자동 저장 (3초 debounce)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = (d: ProjectData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await projects.update(projectId, d);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 3000);
  };

  const update = (patch: Partial<ProjectData>) => {
    historyRef.current = [...historyRef.current.slice(-49), data];
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
    const next = { ...data, ...patch };
    setData(next);
    save(next);
  };

  // 영상 업로드
  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const res = await videos.upload(file, setUploadPct);
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

  // 현재 프레임 계산
  const currentFrame = () =>
    Math.round((videoRef.current?.currentTime || 0) * data.fps);

  // 랠리 마킹
  const toggleMark = () => {
    if (!marking) {
      setMarkStart(currentFrame());
      setMarking(true);
    } else {
      const end = currentFrame();
      if (end <= markStart) {
        setMarking(false);
        return;
      }
      const rally: Rally = {
        start: markStart,
        end,
        p1Score: data.player1_score,
        p2Score: data.player2_score,
        winner: 0,
      };
      update({ rallies: [...data.rallies, rally] });
      setMarking(false);
    }
  };

  // 득점
  const addScore = (player: 1 | 2) => {
    if (marking) {
      const end = currentFrame();
      const rally: Rally = {
        start: markStart,
        end,
        p1Score: data.player1_score,
        p2Score: data.player2_score,
        winner: player,
      };
      const p1 = data.player1_score + (player === 1 ? 1 : 0);
      const p2 = data.player2_score + (player === 2 ? 1 : 0);
      update({
        rallies: [...data.rallies, rally],
        player1_score: p1,
        player2_score: p2,
      });
      setMarking(false);
    } else {
      update({
        player1_score: data.player1_score + (player === 1 ? 1 : 0),
        player2_score: data.player2_score + (player === 2 ? 1 : 0),
      });
    }
  };

  // 되돌리기 / 다시하기
  const undo = () => {
    if (historyRef.current.length === 0) return;
    futureRef.current = [data, ...futureRef.current];
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
    // 랠리가 추가된 것을 되돌리는 경우 → 이전 랠리의 끝 지점으로 이동
    if (data.rallies.length > prev.rallies.length && videoRef.current) {
      const prevLastRally = prev.rallies[prev.rallies.length - 1];
      if (prevLastRally) {
        videoRef.current.currentTime = prevLastRally.end / data.fps;
      }
    }
    setData(prev);
    save(prev);
  };

  const redo = () => {
    if (futureRef.current.length === 0) return;
    historyRef.current = [...historyRef.current, data];
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
    setData(next);
    save(next);
  };

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
    // 미저장 변경사항 즉시 flush
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await projects.update(projectId, data);

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
      if (e.code === "KeyR") toggleMark();
      if (e.code === "Digit1") addScore(1);
      if (e.code === "Digit2") addScore(2);
      if (e.code === "KeyZ" && e.ctrlKey && !e.shiftKey) undo();
      if (
        (e.code === "KeyZ" && e.ctrlKey && e.shiftKey) ||
        (e.code === "KeyY" && e.ctrlKey)
      )
        redo();
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
  }, [marking, markStart, data]);

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

  const streamUrl = videoId ? videos.streamUrl(videoId) : "";
  const videoSrc = videoId
    ? previewStatus === "ready"
      ? videos.previewUrl(videoId)
      : streamUrl
    : "";

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
        {saved && <span className="text-green-400 text-xs">저장됨 ✓</span>}
      </header>

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
          {data.rallies.length > 0 &&
            (videoDuration > 0 || data.total_frames > 0) &&
            (() => {
              const totalFrames =
                data.total_frames > 0
                  ? data.total_frames
                  : Math.round(videoDuration * data.fps);
              return (
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
                        onClick={() => {
                          if (videoRef.current)
                            videoRef.current.currentTime = r.start / data.fps;
                        }}
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
              );
            })()}

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
                  onClick={() => addScore(1)}
                  className="flex-1 bg-blue-700 hover:bg-blue-600 text-white py-2 text-sm transition-colors"
                >
                  1팀 득점 (1)
                </button>
                <button
                  onClick={() => addScore(2)}
                  className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 text-sm transition-colors"
                >
                  2팀 득점 (2)
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  title="되돌리기 (Ctrl+Z)"
                  className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 py-1.5 rounded-lg text-xs transition-colors"
                >
                  ↩ 되돌리기
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  title="다시하기 (Ctrl+Y)"
                  className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 py-1.5 rounded-lg text-xs transition-colors"
                >
                  ↪ 다시하기
                </button>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => update({ player1_score: 0, player2_score: 0 })}
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
              onClick={toggleMark}
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
              {data.rallies.map((r, i) => (
                <div
                  key={i}
                  onClick={() => {
                    if (videoRef.current)
                      videoRef.current.currentTime = r.start / data.fps;
                  }}
                  className={`flex items-center justify-between rounded px-2 py-1.5 text-xs cursor-pointer hover:brightness-125 transition-all ${RALLY_WINNER_COLORS[r.winner].listBgClass}`}
                >
                  <span className="text-gray-300 w-10 shrink-0">
                    랠리 {i + 1}
                  </span>
                  <span
                    className={`font-mono font-medium ${RALLY_WINNER_COLORS[r.winner].listText}`}
                  >
                    {r.p1Score}-{r.p2Score} → {r.winner === 1 ? r.p1Score + 1 : r.p1Score}-
                    {r.winner === 2 ? r.p2Score + 1 : r.p2Score}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      update({
                        rallies: data.rallies.filter((_, j) => j !== i),
                      });
                    }}
                    className="text-gray-500 hover:text-red-400 ml-1 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
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
