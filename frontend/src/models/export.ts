export const STATUSES = ["pending", "processing", "done", "error"] as const;
export type ExportStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<ExportStatus, string> = {
  pending: "대기 중",
  processing: "처리 중",
  done: "완료",
  error: "오류",
};

export const STATUS_CLASS: Record<ExportStatus, string> = {
  pending: "bg-gray-600 text-gray-200",
  processing: "bg-blue-600 text-white",
  done: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
};

// 백엔드가 URL 컬럼에 업로드 중 상태를 이 문자열로 남긴다. 업로드가 실패하면 null로 되돌린다.
export const YOUTUBE_UPLOADING = "uploading";
// (string & {})가 없으면 리터럴이 string에 흡수돼 타입에서 사라진다.
export type YoutubeUrl = typeof YOUTUBE_UPLOADING | (string & {}) | null;

export type ExportItem = {
  id: number;
  project_id: number;
  project_title: string;
  status: ExportStatus;
  youtube_url: YoutubeUrl;
  error_msg: string | null;
  created_at: string | null;
};

export type ExportStatusResponse = {
  status: ExportStatus;
  output_path: string | null;
  youtube_url: YoutubeUrl;
  error_msg: string | null;
};

export type AdminExport = {
  id: number;
  status: ExportStatus;
  youtube_url: YoutubeUrl;
  error_msg: string | null;
  created_at: string | null;
  project_title: string;
  user_email: string;
};
