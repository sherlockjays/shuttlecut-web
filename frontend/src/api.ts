** WARNING: connection is not using a post-quantum key exchange algorithm.
** This session may be vulnerable to "store now, decrypt later" attacks.
** The server may need to be upgraded. See https://openssh.com/pq.html
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
    const form = new FormData()
    form.append("file", file)

    return new Promise<{ video_id: string; path: string; filename: string; fps: number; total_frames: number }>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", `${BASE}/api/videos/upload`)
      xhr.setRequestHeader("Authorization", `Bearer ${token}`)
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 100)) }
      xhr.onload = () => {
        if (xhr.status < 300) resolve(JSON.parse(xhr.responseText))
        else reject(new Error("업로드 실패"))
      }
      xhr.onerror = () => reject(new Error("업로드 실패"))
      xhr.send(form)
    })
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

export const autoedit = {
  listProjects: () => apiFetch("/api/autoedit/projects"),
  getProject: (id: number) => apiFetch(`/api/autoedit/projects/${id}`),
  deleteProject: (id: number) => apiFetch(`/api/autoedit/projects/${id}`, { method: "DELETE" }),
  uploadVideo: (file: File) => {
    const token = localStorage.getItem("token") || ""
    const form = new FormData()
    form.append("file", file)
    return fetch(`${BASE}/api/autoedit/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) }))
  },
  setCourt: (id: number, court_points: unknown, image_width: number, image_height: number) =>
    apiFetch(`/api/autoedit/projects/${id}/court`, {
      method: "POST",
      body: JSON.stringify({ court_points, image_width, image_height }),
    }),
  startAnalysis: (id: number, player1_name: string, player2_name: string, game_format: number, match_type: string) =>
    apiFetch(`/api/autoedit/projects/${id}/analyze`, {
      method: "POST",
      body: JSON.stringify({ player1_name, player2_name, game_format, match_type }),
    }),
  getStatus: (id: number) => apiFetch(`/api/autoedit/projects/${id}/status`),
  saveRallies: (id: number, rallies: unknown) =>
    apiFetch(`/api/autoedit/projects/${id}/rallies`, { method: "PUT", body: JSON.stringify({ rallies }) }),
  createExport: (id: number, opts: object) =>
    apiFetch(`/api/autoedit/projects/${id}/export`, { method: "POST", body: JSON.stringify(opts) }),
  thumbUrl: (id: number) => `${BASE}/api/autoedit/projects/${id}/thumb?token=${localStorage.getItem("token") || ""}`,
  streamUrl: (id: number) => `${BASE}/api/autoedit/projects/${id}/stream?token=${localStorage.getItem("token") || ""}`,
}
