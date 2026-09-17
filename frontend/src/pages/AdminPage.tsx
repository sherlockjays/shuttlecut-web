import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { admin as adminApi } from "@/api";
import { adminUsersOptions, adminStatsOptions, adminExportsOptions } from "@/queries/admin";
import { STATUS_LABEL, STATUS_CLASS, STATUSES } from "@/models/export";
import { PLANS, type Plan } from "@/models/plan";

const PLAN_BADGE: Record<Plan, string> = {
  free: "bg-gray-600 text-gray-200",
  basic: "bg-gray-500 text-gray-100",
  standard: "bg-blue-700 text-blue-100",
  premium: "bg-purple-700 text-purple-100",
  unlimited: "bg-yellow-700 text-yellow-100",
  club: "bg-purple-700 text-purple-100",
  admin: "bg-yellow-600 text-yellow-100",
};

export default function AdminPage() {
  const [tab, setTab] = useState<"users" | "stats" | "tasks">("users");
  const [saving, setSaving] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: users = [], isLoading: loading, error: usersError } = useQuery(adminUsersOptions);
  const { data: stats } = useQuery(adminStatsOptions);
  const { data: taskExports = [] } = useQuery({
    ...adminExportsOptions,
    enabled: tab === "tasks",
  });

  const error = usersError instanceof Error ? usersError.message : "";

  async function handlePlanChange(uid: number, plan: Plan) {
    setSaving(uid);
    try {
      await adminApi.updateUser(uid, { plan });
      queryClient.invalidateQueries({ queryKey: adminUsersOptions.queryKey });
    } catch (e: any) {
      alert("변경 실패: " + e.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleResetExports(uid: number) {
    if (!confirm("내보내기 횟수를 0으로 초기화할까요?")) return;
    setSaving(uid);
    try {
      await adminApi.updateUser(uid, { export_count: 0 });
      queryClient.invalidateQueries({ queryKey: adminUsersOptions.queryKey });
    } catch (e: any) {
      alert("초기화 실패: " + e.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">관리자</h1>

      {/* 탭 */}
      <div className="flex gap-4 border-b border-gray-700 mb-6">
        {(["users", "stats", "tasks"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-yellow-400 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {t === "users" ? "사용자 관리" : t === "stats" ? "통계" : "작업현황"}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* 사용자 관리 탭 */}
      {tab === "users" &&
        (loading ? (
          <p className="text-gray-400 text-sm">불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-700">
                  <th className="pb-3 pr-4">이메일</th>
                  <th className="pb-3 pr-4">플랜</th>
                  <th className="pb-3 pr-4 text-center">내보내기</th>
                  <th className="pb-3 pr-4 text-center">프로젝트</th>
                  <th className="pb-3 pr-4 text-center">인증</th>
                  <th className="pb-3 pr-4 text-center">로그인</th>
                  <th className="pb-3 pr-4">가입일</th>
                  <th className="pb-3">액션</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                    <td className="py-3 pr-4 text-white font-medium">{u.email}</td>
                    <td className="py-3 pr-4">
                      <select
                        value={u.plan}
                        disabled={saving === u.id}
                        onChange={(e) => handlePlanChange(u.id, e.target.value as Plan)}
                        className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer border-0 outline-none ${PLAN_BADGE[u.plan] ?? "bg-gray-600 text-gray-200"}`}
                      >
                        {PLANS.map((p) => (
                          <option key={p} value={p} className="bg-gray-800 text-white">
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4 text-center text-gray-300">{u.export_count}</td>
                    <td className="py-3 pr-4 text-center text-gray-300">{u.project_count}</td>
                    <td className="py-3 pr-4 text-center">
                      {u.is_verified ? (
                        <span className="text-green-400 text-xs">✓</span>
                      ) : (
                        <span className="text-gray-600 text-xs">✗</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-center text-gray-400 text-xs">
                      {u.google_login ? "Google" : "이메일"}
                      {u.youtube_connected && " / YT"}
                    </td>
                    <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("ko-KR") : "-"}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleResetExports(u.id)}
                        disabled={saving === u.id || u.export_count === 0}
                        className="text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        횟수초기화
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* 통계 탭 */}
      {tab === "stats" && stats && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-xl p-5">
            <h2 className="text-gray-400 text-xs font-medium mb-3 uppercase tracking-wide">
              사용자
            </h2>
            <p className="text-3xl font-bold text-white mb-3">{stats.total_users}</p>
            <div className="space-y-1">
              {PLANS.map((plan) => (
                <div key={plan} className="flex justify-between text-sm">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${PLAN_BADGE[plan]}`}>
                    {plan}
                  </span>
                  <span className="text-gray-300">{stats.users_by_plan[plan] ?? 0}명</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <h2 className="text-gray-400 text-xs font-medium mb-3 uppercase tracking-wide">
              내보내기
            </h2>
            <p className="text-3xl font-bold text-white mb-3">{stats.total_exports}</p>
            <div className="space-y-1">
              {STATUSES.map((status) => (
                <div key={status} className="flex justify-between text-sm">
                  <span className="text-gray-400">{status}</span>
                  <span className="text-gray-300">{stats.exports_by_status[status] ?? 0}건</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <h2 className="text-gray-400 text-xs font-medium mb-3 uppercase tracking-wide">
              프로젝트
            </h2>
            <p className="text-3xl font-bold text-white">{stats.total_projects}</p>
          </div>
        </div>
      )}
      {/* 작업현황 탭 */}
      {tab === "tasks" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-700">
                <th className="pb-3 pr-3">ID</th>
                <th className="pb-3 pr-3">상태</th>
                <th className="pb-3 pr-3">유저</th>
                <th className="pb-3 pr-3">프로젝트</th>
                <th className="pb-3 pr-3">YouTube</th>
                <th className="pb-3">일시</th>
              </tr>
            </thead>
            <tbody>
              {taskExports.map((e) => (
                <tr key={e.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-2 pr-3 text-gray-500 text-xs">{e.id}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[e.status]}`}
                    >
                      {STATUS_LABEL[e.status]}
                    </span>
                    {e.status === "error" && e.error_msg && (
                      <p className="text-red-400 text-xs mt-0.5 max-w-xs truncate">{e.error_msg}</p>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-300 text-xs">{e.user_email}</td>
                  <td className="py-2 pr-3 text-gray-300 text-xs max-w-xs truncate">
                    {e.project_title}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {e.youtube_url && e.youtube_url !== "uploading" ? (
                      <a
                        href={e.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-400 hover:text-red-300"
                      >
                        ↗ YT
                      </a>
                    ) : e.youtube_url === "uploading" ? (
                      <span className="text-blue-400">업로드중</span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                  <td className="py-2 text-gray-500 text-xs whitespace-nowrap">
                    {e.created_at ? new Date(e.created_at).toLocaleString("ko-KR") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {taskExports.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">작업 기록이 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
