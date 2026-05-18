const BASE = import.meta.env.VITE_API_URL || ""

function headers() {
  const token = localStorage.getItem("token")
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || "오류가 발생했습니다.")
  }
  return res.json()
}

export const auth = {
  register: (email: string, password: string) =>
    apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password })
    return fetch(`${BASE}/api/auth/login`, { method: "POST", body: form })
      .then(r => r.json())
  },
  me: () => apiFetch("/api/auth/me"),
  forgotPassword: (email: string) =>
    apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) }),
}

export const projects = {
  list: () => apiFetch("/api/projects/"),
  get: (id: number) => apiFetch(`/api/projects/${id}`),
  create: (data: object) => apiFetch("/api/projects/", { method: "POST", body: JSON.stringify(data) }),
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
  list: () => apiFetch("/api/export/"),
  start: (projectId: number) => apiFetch(`/api/export/${projectId}`, { method: "POST" }),
  status: (exportId: number) => apiFetch(`/api/export/${exportId}/status`),
  wsUrl: (exportId: number) => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${proto}//${window.location.host}/api/export/ws/${exportId}`
  },
  downloadUrl: (exportId: number) => `${BASE}/api/export/${exportId}/download?token=${localStorage.getItem("token") || ""}`,
  uploadToYoutube: (exportId: number, postComment = true) =>
    apiFetch(`/api/export/${exportId}/youtube`, { method: "POST", body: JSON.stringify({ post_comment: postComment }) }),
  delete: (exportId: number) => apiFetch(`/api/export/${exportId}`, { method: "DELETE" }),
}

export const admin = {
  users: () => apiFetch("/api/admin/users"),
  stats: () => apiFetch("/api/admin/stats"),
  exports: (limit = 50) => apiFetch(`/api/admin/exports?limit=${limit}`),
  updateUser: (uid: number, data: { plan?: string; export_count?: number }) =>
    apiFetch(`/api/admin/users/${uid}`, { method: "PATCH", body: JSON.stringify(data) }),
}

export const youtube = {
  status: () => apiFetch("/api/youtube/status"),
  authUrl: () => `${BASE}/api/youtube/auth?token=${localStorage.getItem("token") || ""}`,
  disconnect: () => apiFetch("/api/youtube/disconnect", { method: "DELETE" }),
}
