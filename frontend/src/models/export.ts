export const STATUSES = ["pending", "processing", "done", "error"] as const
export type ExportStatus = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<ExportStatus, string> = {
  pending: "대기 중",
  processing: "처리 중",
  done: "완료",
  error: "오류",
}

export const STATUS_CLASS: Record<ExportStatus, string> = {
  pending: "bg-gray-600 text-gray-200",
  processing: "bg-blue-600 text-white",
  done: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
}

export type ExportItem = {
  id: number
  project_id: number
  project_title: string
  status: ExportStatus
  youtube_url: string | null
  error_msg: string | null
  created_at: string | null
}

export type AdminExport = {
  id: number
  status: ExportStatus
  youtube_url: string | null
  error_msg: string | null
  created_at: string | null
  project_title: string
  user_email: string
}
