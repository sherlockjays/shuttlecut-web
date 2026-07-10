export type UserInfo = {
  email: string
  plan: string
  export_count: number
}

export type AdminUser = {
  id: number
  email: string
  plan: string
  export_count: number
  is_verified: boolean
  youtube_connected: boolean
  google_login: boolean
  project_count: number
  created_at: string | null
}

export type Stats = {
  total_users: number
  users_by_plan: Record<string, number>
  total_exports: number
  exports_by_status: Record<string, number>
  total_projects: number
}
