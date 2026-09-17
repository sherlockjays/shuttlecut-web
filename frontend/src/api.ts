import type { ExportItem, AdminExport } from "@/models/export";
import type { UserInfo, AdminUser, Stats } from "@/models/user";
import type { LoginResponse, RegisterResponse } from "@/models/auth";

export const BASE = import.meta.env.VITE_API_URL || "";

function headers() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function saveToken(token: string) {
  localStorage.setItem("token", token);
}

export async function apiFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "오류가 발생했습니다.");
  }
  return res.json() as T;
}

export const auth = {
  register: (email: string, password: string) =>
    apiFetch<RegisterResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password });
    return apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },
  me: (): Promise<UserInfo> => apiFetch<UserInfo>("/api/auth/me"),
  googleLoginUrl: () => `${BASE}/api/auth/google`,
  exchangeGoogleCode: (code: string): Promise<{ access_token?: string }> =>
    apiFetch<{ access_token?: string }>(`/api/auth/google/exchange?code=${code}`),
  forgotPassword: (email: string) =>
    apiFetch("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, new_password: string) =>
    apiFetch("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
};

export const exports = {
  list: (): Promise<ExportItem[]> => apiFetch<ExportItem[]>("/api/export/"),
  start: (projectId: number): Promise<{ export_id: number }> =>
    apiFetch<{ export_id: number }>(`/api/export/${projectId}`, {
      method: "POST",
    }),
  status: (exportId: number): Promise<ExportItem> =>
    apiFetch<ExportItem>(`/api/export/${exportId}/status`),
  wsUrl: (exportId: number) => {
    if (BASE) return `${BASE.replace(/^http/, "ws")}/api/export/ws/${exportId}`;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/export/ws/${exportId}`;
  },
  downloadUrl: (exportId: number) =>
    `${BASE}/api/export/${exportId}/download?token=${localStorage.getItem("token") || ""}`,
  uploadToYoutube: (exportId: number, postComment = true) =>
    apiFetch(`/api/export/${exportId}/youtube`, {
      method: "POST",
      body: JSON.stringify({ post_comment: postComment }),
    }),
  delete: (exportId: number) => apiFetch(`/api/export/${exportId}`, { method: "DELETE" }),
};

export const admin = {
  users: (): Promise<AdminUser[]> => apiFetch<AdminUser[]>("/api/admin/users"),
  stats: (): Promise<Stats> => apiFetch<Stats>("/api/admin/stats"),
  exports: (limit = 50): Promise<AdminExport[]> =>
    apiFetch<AdminExport[]>(`/api/admin/exports?limit=${limit}`),
  updateUser: (uid: number, data: { plan?: string; export_count?: number }) =>
    apiFetch(`/api/admin/users/${uid}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const youtube = {
  status: (): Promise<{ connected: boolean }> =>
    apiFetch<{ connected: boolean }>("/api/youtube/status"),
  authUrl: () => `${BASE}/api/youtube/auth?token=${localStorage.getItem("token") || ""}`,
  disconnect: () => apiFetch("/api/youtube/disconnect", { method: "DELETE" }),
};

export const autoedit = {
  listProjects: () => apiFetch("/api/autoedit/projects"),
  getProject: (id: number) => apiFetch(`/api/autoedit/projects/${id}`),
  deleteProject: (id: number) => apiFetch(`/api/autoedit/projects/${id}`, { method: "DELETE" }),
  uploadVideo: (file: File) => {
    const token = localStorage.getItem("token") || "";
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/api/autoedit/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then((r) =>
      r.ok
        ? r.json()
        : r.json().then((e) => {
            throw new Error(e.detail);
          }),
    );
  },
  setCourt: (id: number, court_points: unknown, image_width: number, image_height: number) =>
    apiFetch(`/api/autoedit/projects/${id}/court`, {
      method: "POST",
      body: JSON.stringify({ court_points, image_width, image_height }),
    }),
  startAnalysis: (
    id: number,
    player1_name: string,
    player2_name: string,
    game_format: number,
    match_type: string,
  ) =>
    apiFetch(`/api/autoedit/projects/${id}/analyze`, {
      method: "POST",
      body: JSON.stringify({
        player1_name,
        player2_name,
        game_format,
        match_type,
      }),
    }),
  getStatus: (id: number) => apiFetch(`/api/autoedit/projects/${id}/status`),
  saveRallies: (id: number, rallies: unknown) =>
    apiFetch(`/api/autoedit/projects/${id}/rallies`, {
      method: "PUT",
      body: JSON.stringify({ rallies }),
    }),
  createExport: (id: number, opts: object) =>
    apiFetch(`/api/autoedit/projects/${id}/export`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  thumbUrl: (id: number) =>
    `${BASE}/api/autoedit/projects/${id}/thumb?token=${localStorage.getItem("token") || ""}`,
  streamUrl: (id: number) =>
    `${BASE}/api/autoedit/projects/${id}/stream?token=${localStorage.getItem("token") || ""}`,
};
