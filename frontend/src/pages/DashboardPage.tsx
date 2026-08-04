import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { projects } from "@/api";
import { projectsOptions } from "@/queries/projects";

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: list = [], isLoading: loading } = useQuery(projectsOptions);

  const createMutation = useMutation({
    mutationFn: () => projects.create({ title: "새 프로젝트" }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: projectsOptions.queryKey });
      navigate(`/editor/${res.id}`);
    },
    onError: (e: unknown) =>
      alert(e instanceof Error ? e.message : "프로젝트 생성 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => projects.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectsOptions.queryKey }),
    onError: (e: unknown) =>
      alert(e instanceof Error ? e.message : "프로젝트 삭제 실패"),
  });

  const handleDelete = (id: number) => {
    if (!confirm("프로젝트를 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">내 프로젝트</h2>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + 새 프로젝트
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : list.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-4">🎬</p>
          <p>아직 프로젝트가 없습니다.</p>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg text-sm transition-colors"
          >
            첫 프로젝트 만들기
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {list.map((p) => (
            <div
              key={p.id}
              className="bg-gray-800 rounded-xl p-5 flex items-center justify-between hover:bg-gray-750 transition-colors"
            >
              <div>
                <h3 className="font-medium">{p.title}</h3>
                <p className="text-gray-400 text-sm mt-1">
                  {new Date(p.updated_at).toLocaleString("ko-KR")}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/editor/${p.id}`}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  편집
                </Link>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={
                    deleteMutation.isPending &&
                    deleteMutation.variables === p.id
                  }
                  className="bg-gray-700 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
