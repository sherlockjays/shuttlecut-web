import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { updateProject } from "@/apis/projects";
import { videoStreamUrl } from "@/apis/video";
import type { UploadedVideo } from "@/models/video";
import { projectOptions, projectsOptions } from "@/queries/projects";
import type { ProjectData } from "@/models/project";
import { useAutoSave } from "./hooks/useAutoSave";
import { useEditorShortcuts } from "./hooks/useEditorShortcuts";
import { useProjectDraft } from "./hooks/useProjectDraft";
import { useRallyEditor } from "./hooks/useRallyEditor";
import { useVideoPlayer } from "./hooks/useVideoPlayer";
import ExportPanel from "./components/ExportPanel";
import MatchInfoForm from "./components/MatchInfoForm";
import PlaybackControls from "./components/PlaybackControls";
import RallyPanel from "./components/RallyPanel";
import RallyTimeline from "./components/RallyTimeline";
import ScoreboardPanel from "./components/ScoreboardPanel";
import VideoDropzone from "./components/VideoDropzone";
import VideoPlayer from "./components/VideoPlayer";

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

const INVALID_RANGE_MESSAGE =
  "랠리 종료 지점이 시작 지점보다 앞에 있습니다. 시작 지점 이후로 이동한 뒤 다시 시도해주세요.";

export default function Editor({ projectId }: { projectId: number }) {
  const { data, update, record, undo, redo, reset, canUndo, canRedo } =
    useProjectDraft(DEFAULT_PROJECT_DATA);

  const { data: fetchedProject, isError } = useQuery(projectOptions(projectId));
  const seededRef = useRef<number | null>(null);
  const queryClient = useQueryClient();

  const videoId = fetchedProject?.video_id ?? "";
  const hasVideo = videoId !== "";
  const videoSrc = hasVideo ? videoStreamUrl(videoId) : "";

  const {
    videoRef,
    duration,
    videoSize,
    getCurrentFrame,
    seekToFrame,
    seekBy,
    togglePlay,
    handleLoadedMetadata,
  } = useVideoPlayer(data.fps);

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
  }, [fetchedProject, projectId, reset, markSaved]);

  // #52 작업 완료 시 불필요해질 부분
  const handleUploaded = (video: UploadedVideo) => {
    queryClient.setQueryData(projectOptions(projectId).queryKey, (prev) => ({
      ...prev,
      video_id: video.video_id,
      video_path: video.path,
    }));
    update({
      video_path: video.path,
      fps: video.fps,
      total_frames: video.total_frames,
    });
  };

  const { marking, toggleRally, addScore, resetScore, deleteRally, onUndone, onRedone } =
    useRallyEditor({
      record,
      getCurrentFrame,
      seekToFrame,
      onInvalidRange: () => alert(INVALID_RANGE_MESSAGE),
    });

  const handleUndo = () => {
    const moved = undo();
    if (moved) onUndone(moved);
  };

  const handleRedo = () => {
    if (redo()) onRedone();
  };

  useEditorShortcuts({
    togglePlay,
    toggleRally,
    addScore,
    undo: handleUndo,
    redo: handleRedo,
    seekBy,
  });

  // 업로드 때 ffprobe가 프레임 수를 못 읽으면 0으로 저장되므로 재생 길이로 대신한다.
  const totalFrames = data.total_frames > 0 ? data.total_frames : Math.round(duration * data.fps);

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
        {saveStatus === "saved" && <span className="text-green-400 text-xs">저장됨 ✓</span>}
        {saveStatus === "error" && <span className="text-red-400 text-xs">저장 실패 ⚠</span>}
      </header>
      {isError && <p className="text-red-400 text-sm px-4 pt-2">프로젝트를 불러오지 못했습니다.</p>}

      <div className="flex flex-1 overflow-hidden">
        {/* 왼쪽: 영상 + 컨트롤 */}
        <div className="flex-1 flex flex-col p-4 gap-3">
          {!hasVideo ? (
            <VideoDropzone onUploaded={handleUploaded} />
          ) : (
            <VideoPlayer
              videoRef={videoRef}
              src={videoSrc}
              scoreboard={data}
              videoSize={videoSize}
              onLoadedMetadata={handleLoadedMetadata}
            />
          )}
          <PlaybackControls onSeekBy={seekBy} />
          <RallyTimeline rallies={data.rallies} totalFrames={totalFrames} onSeek={seekToFrame} />

          {/* 단축키 안내 */}
          <p className="text-gray-500 text-xs text-center">
            [Space] 재생/정지 | [R] 랠리 마킹 | [1] 1팀 득점 | [2] 2팀 득점 | [Ctrl+Z] 되돌리기 |
            [Ctrl+Y] 다시하기 | [←→] 이동
          </p>
        </div>

        {/* 오른쪽: 정보 + 점수 + 랠리 */}
        <div className="w-72 bg-gray-800 border-l border-gray-700 flex flex-col p-4 gap-4 overflow-y-auto">
          <MatchInfoForm values={data} onChange={update} />
          <ScoreboardPanel
            scoreboard={data}
            onChange={update}
            onAddScore={addScore}
            onResetScore={resetScore}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
          <RallyPanel
            rallies={data.rallies}
            marking={marking}
            onToggleMarking={toggleRally}
            onSeek={seekToFrame}
            onDeleteRally={deleteRally}
          />

          <ExportPanel
            projectId={projectId}
            canExport={data.rallies.length > 0}
            flushSave={flushSave}
          />
        </div>
      </div>
    </div>
  );
}
