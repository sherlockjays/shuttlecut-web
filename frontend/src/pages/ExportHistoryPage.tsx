import { useState, useEffect } from "react"
import { exports as exportsApi } from "../api"

type ExportItem = {
  id: number
  project_id: number
  project_title: string
  status: "pending" | "processing" | "done" | "error"
  youtube_url: string | null
  error_msg: string | null
  created_at: string | null
}

const STATUS_LABEL: Record<ExportItem["status"], string> = {
  pending: "대기 중",
  processing: "처리 중",
  done: "완료",
  error: "오류",
}

const STATUS_CLASS: Record<ExportItem["status"], string> = {
  pending: "bg-gray-600 text-gray-200",
  processing: "bg-blue-600 text-white",
  done: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
}

export default function ExportHistoryPage({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<ExportItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    exportsApi.list().then(setList).finally(() => setLoading(false))
  }, [])

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
                  {item.youtube_url && (
                    <a
                      href={item.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      YouTube
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
