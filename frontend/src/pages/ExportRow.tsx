import { useMutation, useQueryClient } from "@tanstack/react-query"
import { exports as exportsApi } from "@/api"
import { exportsOptions } from "@/queries/exports"
import { STATUS_LABEL, STATUS_CLASS, type ExportItem } from "@/models/export"

export default function ExportRow({
  item,
  ytConnected,
  postComment,
  disabledHint,
  onDelete,
}: {
  item: ExportItem
  ytConnected: boolean
  postComment: boolean
  disabledHint: string
  onDelete: (id: number) => void
}) {
  const queryClient = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: () => exportsApi.uploadToYoutube(item.id, postComment),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exportsOptions.queryKey }),
    onError: (e: unknown) => alert(e instanceof Error ? e.message : "YouTube 업로드 실패"),
  })

  const isUploading = item.youtube_url === "uploading" || uploadMutation.isPending

  return (
    <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
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
        {item.status === "done" &&
          (item.youtube_url && item.youtube_url !== "uploading" ? (
            <a
              href={item.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              YouTube ↗
            </a>
          ) : isUploading ? (
            <span className="text-gray-400 text-xs px-2 py-1.5">업로드 중...</span>
          ) : (
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!ytConnected}
              title={ytConnected ? "YouTube에 업로드" : disabledHint}
              className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              YouTube
            </button>
          ))}
        <button
          onClick={() => onDelete(item.id)}
          className="bg-gray-700 hover:bg-red-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
        >
          삭제
        </button>
      </div>
    </div>
  )
}
