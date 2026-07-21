import type { ExportItem, AdminExport } from "@/models/export"
import type { UserInfo, AdminUser, Stats } from "@/models/user"
import type { Project, ProjectData } from "@/models/project"
import type { LoginResponse, RegisterResponse } from "@/models/auth"

const BASE = import.meta.env.VITE_API_URL || ""

function headers() {
  const token = localStorage.getItem("token")
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function saveToken(token: string) {
  localStorage.setItem("token", token)
}

export async function apiFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || "오류가 발생했습니다.")
  }
  return res.json() as T
}

export const auth = {
  register: (email: string, password: string) =>
    apiFetch<RegisterResponse>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password })
    return apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
  },
  me: (): Promise<UserInfo> =>
    apiFetch<UserInfo>("/api/auth/me"),
  exchangeGoogleCode: (code: string): Promise<{ access_token?: string }> =>
    apiFetch<{ access_token?: string }>(`/api/auth/google/exchange?code=${code}`),
  forgotPassword: (email: string) =>
    apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) }),
}

export const projects = {
  list: (): Promise<Project[]> =>
    apiFetch<Project[]>("/api/projects/"),
  get: (id: number): Promise<Partial<ProjectData>> =>
    apiFetch<Partial<ProjectData>>(`/api/projects/${id}`),
  create: (data: object): Promise<{ id: number }> =>
    apiFetch<{ id: number }>("/api/projects/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: object) => apiFetch(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) => apiFetch(`/api/projects/${id}`, { method: "DELETE" }),
}

export const videos = {
  upload: async (file: File, onProgress?: (pct: number) => void) => {
    const token = localStorage.getItem("token") || ""

    // 1. Signed URL 발급 + VM 사전 시작
    const urlRes = await fetch(`${BASE}/api/videos/upload-url?filename=${encodeURIComponent(file.name)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!urlRes.ok) throw new Error("업로드 준비 실패")
    const { upload_url, blob_name, video_id, content_type } = await urlRes.json()

    // 2. GCS 직접 업로드 (NAS 거치지 않음)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("PUT", upload_url)
      xhr.setRequestHeader("Content-Type", content_type)
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 100)) }
      xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error("업로드 실패"))
      xhr.onerror = () => reject(new Error("업로드 실패"))
      xhr.send(file)
    })

    // 3. 확인 + 메타데이터 수신
    const confirmRes = await fetch(`${BASE}/api/videos/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ blob_name, video_id, filename: file.name }),
    })
    if (!confirmRes.ok) throw new Error("업로드 확인 실패")
    return confirmRes.json()
  },
  streamUrl: (videoId: string) => `${BASE}/api/videos/stream/${videoId}?token=${localStorage.getItem("token") || ""}`,
}

export const exports = {
  list: (): Promise<ExportItem[]> =>
    apiFetch<ExportItem[]>("/api/export/"),
  start: (projectId: number): Promise<{ export_id: number }> =>
    apiFetch<{ export_id: number }>(`/api/export/${projectId}`, { method: "POST" }),
  status: (exportId: number): Promise<ExportItem> =>
    apiFetch<ExportItem>(`/api/export/${exportId}/status`),
  wsUrl: (exportId: number) => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${proto}//${window.location.host}/api/export/ws/${exportId}`
  },
  downloadUrl: (exportId: number) => `${BASE}/api/export/${exportId}/download?token=${localStorage.getItem("token") || ""}`,
  uploadToYoutube: (exportId: number, postComment = true) =>
    apiFetch(`/api/export/${exportId}/youtube`, { method: "POST", body: JSON.stringify({ post_comment: postComment }) }),
  delete: (exportId: number) =>
    apiFetch(`/api/export/${exportId}`, { method: "DELETE" }),
}

export const admin = {
  users: (): Promise<AdminUser[]> =>
    apiFetch<AdminUser[]>("/api/admin/users"),
  stats: (): Promise<Stats> =>
    apiFetch<Stats>("/api/admin/stats"),
  exports: (limit = 50): Promise<AdminExport[]> =>
    apiFetch<AdminExport[]>(`/api/admin/exports?limit=${limit}`),
  updateUser: (uid: number, data: { plan?: string; export_count?: number }) =>
    apiFetch(`/api/admin/users/${uid}`, { method: "PATCH", body: JSON.stringify(data) }),
}

export const youtube = {
  status: (): Promise<{ connected: boolean }> =>
    apiFetch<{ connected: boolean }>("/api/youtube/status"),
  authUrl: () => `${BASE}/api/youtube/auth?token=${localStorage.getItem("token") || ""}`,
  disconnect: () => apiFetch("/api/youtube/disconnect", { method: "DELETE" }),
}
