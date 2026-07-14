import type { ExportStatus } from "@/types/export"

export const STATUSES = ["pending", "processing", "done", "error"] as const satisfies readonly ExportStatus[]

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
