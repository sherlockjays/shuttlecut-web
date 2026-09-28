import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { projectOptions } from "@/queries/projects";
import Editor from "./Editor";

const PROJECT_ID_PATTERN = /^[1-9]\d*$/;

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!PROJECT_ID_PATTERN.test(projectId ?? "")) return <Navigate to="/projects" replace />;
  return <EditorGate projectId={Number(projectId)} />;
}

/** 서버 값이 준비된 뒤에만 Editor를 마운트한다. Editor는 그 값을 useState 초기값으로 쓴다. */
function EditorGate({ projectId }: { projectId: number }) {
  const { data: project, isPending, isError } = useQuery(projectOptions(projectId));

  if (isPending) {
    return (
      <p className="text-gray-400 p-4" role="status">
        불러오는 중...
      </p>
    );
  }
  if (isError) {
    return (
      <div className="p-4 flex flex-col items-start gap-2">
        <p className="text-red-400 text-sm">프로젝트를 불러오지 못했습니다.</p>
        <Link to="/projects" className="text-gray-400 hover:text-white text-sm">
          ← 대시보드
        </Link>
      </div>
    );
  }
  return <Editor initProject={project} />;
}
