import { useState, useEffect } from "react"
import { exports as exportsApi, youtube as youtubeApi } from "@/api"
import { STATUS_LABEL, STATUS_CLASS, type ExportItem } from "@/models/export"

export default function ExportHistoryPage({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<ExportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ytConnected, setYtConnected] = useState(false)
  const [uploadingIds, setUploadingIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    exportsApi.list().then(setList).finally(() => setLoading(false))
    youtubeApi.status().then((s: { connected: boolean }) => setYtConnected(s.connected)).catch(() => {})
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm("이 내보내기 기록과 파일을 삭제하시겠습니까?")) return
    await exportsApi.delete(id)
    setList(prev => prev.filter(item => item.id !== id))
  }

  const handleYoutubeUpload = async (id: number) => {
    setUploadingIds(prev => new Set(prev).add(id))
    try {
      await exportsApi.uploadToYoutube(id)
      const poll = setInterval(async () => {
        const s = await exportsApi.status(id)
        if (s.youtube_url && s.youtube_url !== "uploading") {
          setList(prev => prev.map(item => item.id === id ? { ...item, youtube_url: s.youtube_url } : item))
          setUploadingIds(prev => { const next = new Set(prev); next.delete(id); return next })
          clearInterval(poll)
        } else if (!s.youtube_url) {
          setUploadingIds(prev => { const next = new Set(prev); next.delete(id); return next })
          clearInterval(poll)
        }
      }, 3000)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "YouTube 업로드 실패")
      setUploadingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition-colors">
          ← 대시보드
        </button>
        <h1 className="text-lg font-bold">내보내기 히스토리</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-gray-400">불러오는 중...</p>
        ) : list.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-4xl mb-4">📂</p>
            <p>내보내기 기록이 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {list.map(item => (
              <div key={item.id} className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[item.status]}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                    <span className="font-medium truncate">{item.project_title}</span>
                  </div>
                  <p className="text-gray-400 text-xs">
                    {item.created_at ? new Date(item.created_at).toLocaleString("ko-KR") : "-"}
                  </p>
                  {item.status === "error" && item.error_msg && (
                    <p className="text-red-400 text-xs mt-1 truncate">{item.error_msg}</p>
                  )}
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  {item.status === "done" && (
                    <a
                      href={exportsApi.downloadUrl(item.id)}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      다운로드
                    </a>
                  )}
                  {item.status === "done" && (
                    item.youtube_url && item.youtube_url !== "uploading" ? (
                      <a href={item.youtube_url} target="_blank" rel="noopener noreferrer"
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
                        YouTube ↗
                      </a>
                    ) : item.youtube_url === "uploading" || uploadingIds.has(item.id) ? (
                      <span className="text-gray-400 text-xs px-2 py-1.5">업로드 중...</span>
                    ) : (
                      <button onClick={() => handleYoutubeUpload(item.id)} disabled={!ytConnected}
                        title={ytConnected ? "YouTube에 업로드" : "대시보드에서 YouTube 계정을 먼저 연결하세요"}
                        className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
                        YouTube
                      </button>
                    )
                  )}
                  <button onClick={() => handleDelete(item.id)}
                    className="bg-gray-700 hover:bg-red-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
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
