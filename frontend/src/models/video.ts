export type PreviewStatus = "ready" | "processing" | "not_found";

export type UploadedVideo = {
  video_id: string;
  path: string;
  filename: string;
  fps: number;
  total_frames: number;
};
