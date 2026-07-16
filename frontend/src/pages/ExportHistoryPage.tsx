import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { exports as exportsApi } from "@/api"
import { youtubeStatusOptions } from "@/queries/youtube"
import { exportsOptions } from "@/queries/exports"
import ExportRow from "@/pages/ExportRow"

export default function ExportHistoryPage({ onBack }: { onBack: () => void }) {
  const { data: yt } = useQuery(youtubeStatusOptions)
  const ytConnected = yt?.connected ?? false
  const queryClient = useQueryClient()

  const { data: list = [], isLoading: loading } = useQuery({
    ...exportsOptions,
    refetchInterval: (query) => {
      const anyUploading = query.state.data?.some(item => item.youtube_url === "uploading")
      return anyUploading ? 3000 : false
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => exportsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exportsOptions.queryKey }),
  })

  const handleDelete = (id: number) => {
    if (!confirm("이 내보내기 기록과 파일을 삭제하시겠습니까?")) return
    deleteMutation.mutate(id)
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
              <ExportRow
                key={item.id}
                item={item}
                ytConnected={ytConnected}
                postComment={true}
                disabledHint="대시보드에서 YouTube 계정을 먼저 연결하세요"
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
