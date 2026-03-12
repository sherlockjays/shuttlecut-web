import { useState, useEffect } from "react";
import { auth, exports as exportsApi, youtube as youtubeApi } from "../api";

type Tab = "exports" | "usage" | "settings";

type ExportItem = {
  id: number;
  project_title: string;
  status: "pending" | "processing" | "done" | "error";
  youtube_url: string | null;
  error_msg: string | null;
  created_at: string | null;
};

type UserInfo = {
  email: string;
  plan: string;
  export_count: number;
};

const STATUS_LABEL: Record<ExportItem["status"], string> = {
  pending: "대기 중",
  processing: "처리 중",
  done: "완료",
  error: "오류",
};

const STATUS_CLASS: Record<ExportItem["status"], string> = {
  pending: "bg-gray-600 text-gray-200",
  processing: "bg-blue-600 text-white",
  done: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
};

const PLAN_LIMITS: Record<string, string> = {
  free: "월 3회",
  standard: "월 30회",
  club: "무제한",
  admin: "무제한",
};

function ExportsTab() {
  const [list, setList] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ytConnected, setYtConnected] = useState(false);
  const [uploadingIds, setUploadingIds] = useState<Set<number>>(new Set());
  const [ytPostComment, setYtPostComment] = useState(true);

  useEffect(() => {
    exportsApi
      .list()
      .then(setList)
      .finally(() => setLoading(false));
    youtubeApi
      .status()
      .then((s: { connected: boolean }) => setYtConnected(s.connected))
      .catch(() => {});
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("이 내보내기 기록과 파일을 삭제하시겠습니까?")) return;
    await exportsApi.delete(id);
    setList((prev) => prev.filter((item) => item.id !== id));
  };

  const handleYoutubeUpload = async (id: number) => {
    setUploadingIds((prev) => new Set(prev).add(id));
    try {
      await exportsApi.uploadToYoutube(id, ytPostComment);
      const poll = setInterval(async () => {
        const s = await exportsApi.status(id);
        if (s.youtube_url && s.youtube_url !== "uploading") {
          setList((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, youtube_url: s.youtube_url } : item,
            ),
          );
          setUploadingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          clearInterval(poll);
        } else if (!s.youtube_url) {
          setUploadingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          clearInterval(poll);
        }
      }, 3000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "YouTube 업로드 실패");
      setUploadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (loading) return <p className="text-gray-400 py-8">불러오는 중...</p>;
  if (list.length === 0)
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-4">📂</p>
        <p>내보내기 기록이 없습니다.</p>
      </div>
    );

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={ytPostComment}
            onChange={(e) => setYtPostComment(e.target.checked)}
            className="accent-red-500 w-3.5 h-3.5"
          />
          타임라인 댓글 자동 게시
        </label>
      </div>
      {list.map((item) => (
        <div
          key={item.id}
          className="bg-gray-800 rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[item.status]}`}
              >
                {STATUS_LABEL[item.status]}
              </span>
              <span className="font-medium truncate">{item.project_title}</span>
            </div>
            <p className="text-gray-400 text-xs">
              {item.created_at
                ? new Date(item.created_at).toLocaleString("ko-KR")
                : "-"}
            </p>
            {item.status === "error" && item.error_msg && (
              <p className="text-red-400 text-xs mt-1 truncate">
                {item.error_msg}
              </p>
            )}
          </div>
          <div className="flex gap-2 ml-4 shrink-0">
            {item.status === "done" && (
              <a
                href={exportsApi.downloadUrl(item.id)}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                다운로드
              </a>
            )}
            {item.status === "done" &&
              (item.youtube_url && item.youtube_url !== "uploading" ? (
                <a
                  href={item.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                >
                  YouTube ↗
                </a>
              ) : item.youtube_url === "uploading" ||
                uploadingIds.has(item.id) ? (
                <span className="text-gray-400 text-xs px-2 py-1.5">
                  업로드 중...
                </span>
              ) : (
                <button
                  onClick={() => handleYoutubeUpload(item.id)}
                  disabled={!ytConnected}
                  title={
                    ytConnected
                      ? "YouTube에 업로드"
                      : "설정에서 YouTube 계정을 먼저 연결하세요"
                  }
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                >
                  YouTube
                </button>
              ))}
            <button
              onClick={() => handleDelete(item.id)}
              className="bg-gray-700 hover:bg-red-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsageTab() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth
      .me()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-400 py-8">불러오는 중...</p>;
  if (!user) return null;

  const limit = PLAN_LIMITS[user.plan] || "-";

  return (
    <div className="max-w-md space-y-4">
      <div className="bg-gray-800 rounded-xl p-5">
        <p className="text-gray-400 text-sm mb-1">현재 플랜</p>
        <p className="text-xl font-bold capitalize">{user.plan}</p>
        <p className="text-gray-400 text-sm mt-1">내보내기 한도: {limit}</p>
      </div>
      <div className="bg-gray-800 rounded-xl p-5">
        <p className="text-gray-400 text-sm mb-1">누적 내보내기 횟수</p>
        <p className="text-3xl font-bold">
          {user.export_count}
          <span className="text-gray-400 text-lg font-normal">회</span>
        </p>
      </div>
      <p className="text-gray-500 text-xs">
        플랜 변경은 준비 중입니다. 문의: wjdwoghk16@gmail.com
      </p>
    </div>
  );
}

function SettingsTab() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [ytConnected, setYtConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      auth.me().then(setUser),
      youtubeApi
        .status()
        .then((s: { connected: boolean }) => setYtConnected(s.connected))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleYtDisconnect = async () => {
    if (!confirm("YouTube 계정 연결을 해제하시겠습니까?")) return;
    await youtubeApi.disconnect();
    setYtConnected(false);
  };

  if (loading) return <p className="text-gray-400 py-8">불러오는 중...</p>;

  return (
    <div className="max-w-md space-y-4">
      <div className="bg-gray-800 rounded-xl p-5">
        <p className="text-gray-400 text-sm mb-1">이메일</p>
        <p className="font-medium">{user?.email}</p>
      </div>
      <div className="bg-gray-800 rounded-xl p-5">
        <p className="text-gray-400 text-sm mb-3">YouTube 연결</p>
        {ytConnected ? (
          <div className="flex items-center justify-between">
            <span className="text-red-400 text-sm font-medium">
              ▶ YouTube 연결됨
            </span>
            <button
              onClick={handleYtDisconnect}
              className="bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              연결 해제
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">연결된 계정 없음</span>
            <a
              href={youtubeApi.authUrl()}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              YouTube 연결
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MyPage() {
  const [tab, setTab] = useState<Tab>("exports");

  const tabs: { key: Tab; label: string }[] = [
    { key: "exports", label: "내보내기 현황" },
    { key: "usage", label: "사용량" },
    { key: "settings", label: "설정" },
  ];

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold mb-6">마이페이지</h2>

      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "exports" && <ExportsTab />}
      {tab === "usage" && <UsageTab />}
      {tab === "settings" && <SettingsTab />}
    </main>
  );
}
