import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { exports as exportsApi, youtube as youtubeApi } from "@/api"
import { meOptions } from "@/queries/auth"
import { youtubeStatusOptions } from "@/queries/youtube"
import { exportsOptions, pollWhileUploading } from "@/queries/exports"
import { PLAN_LIMITS } from "@/models/plan"
import ExportRow from "@/pages/ExportRow"

type Tab = "exports" | "usage" | "settings";

function ExportsTab() {
  const [ytPostComment, setYtPostComment] = useState(true);
  const { data: yt } = useQuery(youtubeStatusOptions);
  const ytConnected = yt?.connected ?? false;
  const queryClient = useQueryClient();

  const { data: list = [], isLoading: loading } = useQuery({
    ...exportsOptions,
    refetchInterval: pollWhileUploading,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => exportsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exportsOptions.queryKey }),
  });

  const handleDelete = (id: number) => {
    if (!confirm("이 내보내기 기록과 파일을 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
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
        <ExportRow
          key={item.id}
          item={item}
          ytConnected={ytConnected}
          postComment={ytPostComment}
          disabledHint="설정에서 YouTube 계정을 먼저 연결하세요"
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}

function UsageTab() {
  const { data: user, isLoading: loading } = useQuery(meOptions);

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
  const { data: user, isLoading: loading } = useQuery(meOptions);
  const queryClient = useQueryClient();
  const { data: yt } = useQuery(youtubeStatusOptions);
  const ytConnected = yt?.connected ?? false;

  const handleYtDisconnect = async () => {
    if (!confirm("YouTube 계정 연결을 해제하시겠습니까?")) return;
    await youtubeApi.disconnect();
    queryClient.invalidateQueries({ queryKey: youtubeStatusOptions.queryKey });
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
