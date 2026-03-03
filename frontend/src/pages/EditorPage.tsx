import { useState, useEffect, useRef } from "react"
import { projects, videos, exports as exportsApi } from "../api"

type Rally = [number, number, number, number, number] // [start, end, p1, p2, winner]

interface ProjectData {
  title: string; video_path: string; fps: number; total_frames: number
  match_date: string; tournament_name: string; level: string; match_name: string
  player1_name: string; player2_name: string; player1_score: number; player2_score: number
  rallies: Rally[]
}

const EMPTY: ProjectData = {
  title: "", video_path: "", fps: 30, total_frames: 0,
  match_date: "", tournament_name: "", level: "", match_name: "",
  player1_name: "1팀", player2_name: "2팀", player1_score: 0, player2_score: 0,
  rallies: [],
}

export default function EditorPage({ projectId, onBack }: { projectId: number; onBack: () => void }) {
  const [data, setData] = useState<ProjectData>(EMPTY)
  const [videoId, setVideoId] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [marking, setMarking] = useState(false)
  const [markStart, setMarkStart] = useState(0)
  const [exportPct, setExportPct] = useState<number | null>(null)
  const [exportMsg, setExportMsg] = useState("")
  const [exportEta, setExportEta] = useState<number | null>(null)
  const [exportDoneId, setExportDoneId] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    projects.get(projectId).then((p: any) => {
      setData({ ...EMPTY, ...p })
      if (p.video_path) {
        const vid = p.video_path.split("/").pop()?.split(".")[0] || ""
        setVideoId(vid)
      }
    })
  }, [projectId])

  // 자동 저장 (3초 debounce)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = (d: ProjectData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await projects.update(projectId, d)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 3000)
  }

  const update = (patch: Partial<ProjectData>) => {
    const next = { ...data, ...patch }
    setData(next); save(next)
  }

  // 영상 업로드
  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const res = await videos.upload(file, setUploadPct)
      setVideoId(res.video_id)
      update({ video_path: res.path })
    } finally {
      setUploading(false)
    }
  }

  // 현재 프레임 계산
  const currentFrame = () => Math.round((videoRef.current?.currentTime || 0) * data.fps)

  // 랠리 마킹
  const toggleMark = () => {
    if (!marking) {
      setMarkStart(currentFrame()); setMarking(true)
    } else {
      const end = currentFrame()
      if (end <= markStart) { setMarking(false); return }
      const rally: Rally = [markStart, end, data.player1_score, data.player2_score, 0]
      update({ rallies: [...data.rallies, rally] })
      setMarking(false)
    }
  }

  // 득점
  const addScore = (player: 1 | 2) => {
    if (marking) {
      const end = currentFrame()
      const rally: Rally = [markStart, end, data.player1_score, data.player2_score, player]
      const p1 = data.player1_score + (player === 1 ? 1 : 0)
      const p2 = data.player2_score + (player === 2 ? 1 : 0)
      update({ rallies: [...data.rallies, rally], player1_score: p1, player2_score: p2 })
      setMarking(false)
    } else {
      update({ player1_score: data.player1_score + (player === 1 ? 1 : 0),
               player2_score: data.player2_score + (player === 2 ? 1 : 0) })
    }
  }

  // 되돌리기
  const undo = () => {
    if (data.rallies.length === 0) return
    const last = data.rallies[data.rallies.length - 1]
    update({
      rallies: data.rallies.slice(0, -1),
      player1_score: last[2],
      player2_score: last[3],
    })
  }

  // 내보내기
  const fmtEta = (sec: number) => {
    if (sec <= 0) return "거의 완료..."
    const m = Math.floor(sec / 60), s = sec % 60
    return m > 0 ? `약 ${m}분 ${s}초 남음` : `약 ${s}초 남음`
  }

  const startExport = async () => {
    setExportPct(0); setExportMsg("시작 중..."); setExportEta(null); setExportDoneId(null)
    let res
    try {
      res = await exportsApi.start(projectId)
    } catch (e: any) {
      setExportMsg(e.message || "내보내기 실패")
      setTimeout(() => setExportPct(null), 3000)
      return
    }
    const ws = new WebSocket(exportsApi.wsUrl(res.export_id))
    ws.onmessage = e => {
      const d = JSON.parse(e.data)
      setExportPct(d.pct); setExportMsg(d.msg)
      setExportEta(d.eta ?? null)
      if (d.status === "done") {
        ws.close()
        setExportDoneId(res.export_id)
        setTimeout(() => setExportPct(null), 500)
      } else if (d.status === "error") {
        ws.close()
        setExportEta(null)
        setTimeout(() => setExportPct(null), 3000)
      }
    }
  }

  // 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === "Space") { e.preventDefault(); videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause() }
      if (e.code === "KeyR") toggleMark()
      if (e.code === "Digit1") addScore(1)
      if (e.code === "Digit2") addScore(2)
      if (e.code === "KeyZ" && e.ctrlKey) undo()
      if (e.code === "ArrowLeft") { if (videoRef.current) videoRef.current.currentTime -= (e.shiftKey ? 10 : 5) }
      if (e.code === "ArrowRight") { if (videoRef.current) videoRef.current.currentTime += (e.shiftKey ? 10 : 5) }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [marking, markStart, data])

  const streamUrl = videoId ? videos.streamUrl(videoId) : ""

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* 헤더 */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← 대시보드</button>
        <input value={data.title} onChange={e => update({ title: e.target.value })}
          className="bg-transparent text-white font-medium outline-none border-b border-transparent hover:border-gray-600 focus:border-blue-500 px-1" />
        {saved && <span className="text-green-400 text-xs">저장됨 ✓</span>}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 왼쪽: 영상 + 컨트롤 */}
        <div className="flex-1 flex flex-col p-4 gap-3">
          {/* 영상 업로드 or 플레이어 */}
          {!streamUrl ? (
            <label className="flex-1 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 transition-colors">
              <p className="text-4xl mb-2">🎬</p>
              <p className="text-gray-400">{uploading ? `업로드 중... ${uploadPct}%` : "영상 파일을 클릭하거나 드래그하여 업로드"}</p>
              <input type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          ) : (
            <video ref={videoRef} src={streamUrl} controls className="w-full rounded-xl bg-black" style={{ maxHeight: "60vh" }} />
          )}

          {/* 재생 컨트롤 */}
          <div className="flex gap-2 text-sm">
            {[["⏮ 5초", -5], ["⏮ 10초", -10], ["10초 ⏭", 10], ["5초 ⏭", 5]].map(([label, sec]) => (
              <button key={label as string} onClick={() => { if (videoRef.current) videoRef.current.currentTime += sec as number }}
                className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors">{label}</button>
            ))}
          </div>

          {/* 단축키 안내 */}
          <p className="text-gray-500 text-xs text-center">
            [Space] 재생/정지 | [R] 랠리 마킹 | [1] 1팀 득점 | [2] 2팀 득점 | [Ctrl+Z] 되돌리기 | [←→] 이동
          </p>
        </div>

        {/* 오른쪽: 정보 + 점수 + 랠리 */}
        <div className="w-72 bg-gray-800 border-l border-gray-700 flex flex-col p-4 gap-4 overflow-y-auto">
          {/* 경기 정보 */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">경기 정보</h3>
            <div className="space-y-2">
              {[
                ["날짜", "match_date", "YYYY-MM-DD"],
                ["대회명", "tournament_name", "대회명"],
                ["급수", "level", "A조, 혼합복식"],
                ["경기명", "match_name", "32강, 결승"],
              ].map(([label, key, ph]) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <input value={(data as any)[key]} placeholder={ph}
                    onChange={e => update({ [key]: e.target.value } as any)}
                    className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 mt-0.5" />
                </div>
              ))}
            </div>
          </section>

          {/* 점수판 */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">점수판</h3>
            <div className="bg-gray-900 rounded-xl p-3 text-center">
              <div className="flex items-center justify-between mb-2">
                <input value={data.player1_name} onChange={e => update({ player1_name: e.target.value })}
                  className="bg-transparent text-yellow-300 font-medium text-sm w-24 outline-none" />
                <span className="text-2xl font-bold text-white">
                  {data.player1_score} - {data.player2_score}
                </span>
                <input value={data.player2_name} onChange={e => update({ player2_name: e.target.value })}
                  className="bg-transparent text-yellow-300 font-medium text-sm w-24 text-right outline-none" />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => addScore(1)}
                  className="flex-1 bg-blue-700 hover:bg-blue-600 text-white py-2 rounded-lg text-sm transition-colors">
                  1팀 득점 (1)
                </button>
                <button onClick={() => addScore(2)}
                  className="flex-1 bg-blue-700 hover:bg-blue-600 text-white py-2 rounded-lg text-sm transition-colors">
                  2팀 득점 (2)
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={undo}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 rounded-lg text-xs transition-colors">
                  ↩ 되돌리기
                </button>
                <button onClick={() => update({ player1_score: 0, player2_score: 0 })}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 rounded-lg text-xs transition-colors">
                  리셋
                </button>
              </div>
            </div>
          </section>

          {/* 랠리 마킹 */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">랠리 마킹</h3>
            <button onClick={toggleMark}
              className={`w-full py-3 rounded-xl font-medium text-sm transition-colors ${
                marking ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-green-600 hover:bg-green-700"}`}>
              {marking ? "● 마킹 중... (R로 종료)" : "랠리 시작 (R)"}
            </button>

            {/* 랠리 목록 */}
            <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
              {data.rallies.map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-700 rounded px-2 py-1.5 text-xs">
                  <span className="text-gray-300">랠리 {i + 1}</span>
                  <span className="text-white font-mono">
                    {r[2]}-{r[3]} → {r[4] === 1 ? r[2]+1 : r[2]}-{r[4] === 2 ? r[3]+1 : r[3]}
                  </span>
                  <button onClick={() => update({ rallies: data.rallies.filter((_, j) => j !== i) })}
                    className="text-red-400 hover:text-red-300 ml-1">✕</button>
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
                  <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${exportPct}%` }} />
                </div>
              </div>
            ) : exportDoneId !== null ? (
              <div className="flex gap-2">
                <a href={exportsApi.downloadUrl(exportDoneId)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium transition-colors text-center">
                  다운로드
                </a>
                <button onClick={() => setExportDoneId(null)}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 rounded-xl transition-colors">
                  다시
                </button>
              </div>
            ) : (
              <button onClick={startExport} disabled={data.rallies.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-3 rounded-xl font-medium transition-colors">
                내보내기
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
