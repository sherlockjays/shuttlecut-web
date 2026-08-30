import { Navigate, useParams } from "react-router-dom";
import Editor from "./Editor";

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return <Navigate to="/projects" replace />;
  return <Editor projectId={parseInt(projectId)} />;
}
