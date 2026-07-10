export type ExportStatus = "pending" | "processing" | "done" | "error"

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
