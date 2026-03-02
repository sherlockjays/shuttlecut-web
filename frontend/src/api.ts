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
}

export const projects = {
  list: () => apiFetch("/api/projects/"),
  get: (id: number) => apiFetch(`/api/projects/${id}`),
  create: (data: object) => apiFetch("/api/projects/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: object) => apiFetch(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) => apiFetch(`/api/projects/${id}`, { method: "DELETE" }),
}

export const videos = {
  upload: (file: File, onProgress?: (pct: number) => void) => {
    return new Promise<{ video_id: string; path: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", `${BASE}/api/videos/upload`)
      xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token")}`)
      xhr.upload.onprogress = e => onProgress?.(Math.round(e.loaded / e.total * 100))
      xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.response)) : reject(new Error(JSON.parse(xhr.response).detail))
      xhr.onerror = () => reject(new Error("업로드 실패"))
      const fd = new FormData(); fd.append("file", file)
      xhr.send(fd)
    })
  },
  streamUrl: (videoId: string) => `${BASE}/api/videos/stream/${videoId}?token=${localStorage.getItem("token") || ""}`,
}

export const exports = {
  start: (projectId: number) => apiFetch(`/api/export/${projectId}`, { method: "POST" }),
  status: (exportId: number) => apiFetch(`/api/export/${exportId}/status`),
  wsUrl: (exportId: number) => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${proto}//${window.location.host}/api/export/ws/${exportId}`
  },
  downloadUrl: (exportId: number) => `${BASE}/api/export/${exportId}/download?token=${localStorage.getItem("token") || ""}`,
}
