import { useState, useEffect } from "react"
import { projects, youtube as youtubeApi } from "../api"

type Project = { id: number; title: string; updated_at: string }

export default function DashboardPage({
  onOpenEditor, onLogout, onOpenHistory,
}: { onOpenEditor: (id: number) => void; onLogout: () => void; onOpenHistory: () => void }) {
  const [list, setList] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [ytConnected, setYtConnected] = useState(false)

  useEffect(() => {
    projects.list().then(setList).finally(() => setLoading(false))
    youtubeApi.status().then((s: any) => setYtConnected(s.connected)).catch(() => {})
    // OAuth 콜백 후 돌아왔을 때 처리
    const params = new URLSearchParams(window.location.search)
    if (params.get("youtube_connected") === "1") {
      setYtConnected(true)
      window.history.replaceState({}, "", "/")
    }
  }, [])

  const handleYtDisconnect = async () => {
    if (!confirm("YouTube 계정 연결을 해제하시겠습니까?")) return
    await youtubeApi.disconnect()
    setYtConnected(false)
  }

  const createNew = async () => {
    const res = await projects.create({ title: "새 프로젝트" })
    onOpenEditor(res.id)
  }

  const deleteProject = async (id: number) => {
    if (!confirm("프로젝트를 삭제하시겠습니까?")) return
    await projects.delete(id)
    setList(l => l.filter(p => p.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* 헤더 */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">🏸 ShuttleCut</h1>
        <div className="flex items-center gap-3">
          <button onClick={onOpenHistory} className="text-gray-400 hover:text-white text-sm transition-colors">
            내보내기 기록
          </button>
          {ytConnected ? (
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-xs font-medium">▶ YouTube 연결됨</span>
              <button onClick={handleYtDisconnect}
                className="text-gray-500 hover:text-gray-300 text-xs transition-colors">
                해제
              </button>
            </div>
          ) : (
            <a href={youtubeApi.authUrl()}
              className="text-gray-400 hover:text-white text-sm transition-colors">
              YouTube 연결
            </a>
          )}
          <button onClick={onLogout} className="text-gray-400 hover:text-white text-sm transition-colors">
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">내 프로젝트</h2>
          <button onClick={createNew}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + 새 프로젝트
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400">불러오는 중...</p>
        ) : list.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-4xl mb-4">🎬</p>
            <p>아직 프로젝트가 없습니다.</p>
            <button onClick={createNew}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm transition-colors">
              첫 프로젝트 만들기
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {list.map(p => (
              <div key={p.id}
                className="bg-gray-800 rounded-xl p-5 flex items-center justify-between hover:bg-gray-750 transition-colors">
                <div>
                  <h3 className="font-medium">{p.title}</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    {new Date(p.updated_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => onOpenEditor(p.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                    편집
                  </button>
                  <button onClick={() => deleteProject(p.id)}
                    className="bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors">
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
