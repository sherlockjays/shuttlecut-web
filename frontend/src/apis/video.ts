import { apiFetch } from "@/api";
import type { PreviewStatus, UploadedVideo } from "@/models/video";

// 스트리밍/프리뷰는 <video src>로 직접 열리므로 헤더를 못 싣는다. 토큰이 쿼리로 가는 건 #36에서 다룬다.
const token = () => localStorage.getItem("token") || "";

// 진행률을 받아야 해서 fetch가 아니라 XHR을 쓴다.
export const uploadVideo = (file: File, onProgress?: (pct: number) => void) => {
  const form = new FormData();
  form.append("file", file);

  return new Promise<UploadedVideo>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos/upload");
    xhr.setRequestHeader("Authorization", `Bearer ${token()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 300) return reject(new Error("업로드 실패"));
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error("업로드 실패"));
      }
    };
    xhr.onerror = () => reject(new Error("업로드 실패"));
    xhr.send(form);
  });
};

export const videoStreamUrl = (videoId: string) => `/api/videos/stream/${videoId}?token=${token()}`;

export const videoPreviewUrl = (videoId: string) =>
  `/api/videos/preview/${videoId}?token=${token()}`;

export const getPreviewStatus = (videoId: string): Promise<{ status: PreviewStatus }> =>
  apiFetch(`/api/videos/preview-status/${videoId}`);
