import { useEffect } from "react";
import {
  Navigate,
  useNavigate,
  useSearchParams,
  useParams,
} from "react-router-dom";
import { auth, saveToken } from "@/api";
import type { VerifyBanner } from "@/models/auth";
import LoginPage from "@/pages/LoginPage";
import EditorPage from "@/pages/EditorPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";

// 루트 경로: OAuth 콜백 처리 및 리다이렉트
export function RootHandler() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const resetToken = searchParams.get("reset_token");
    if (resetToken) {
      navigate(`/reset-password?token=${resetToken}`, { replace: true });
      return;
    }
    const googleCode = searchParams.get("google_code");
    if (googleCode) {
      auth
        .exchangeGoogleCode(googleCode)
        .then((data) => {
          if (data.access_token) saveToken(data.access_token);
          navigate("/projects", { replace: true });
        })
        .catch(() => navigate("/login?google_error=1", { replace: true }));
      return;
    }
    if (searchParams.get("youtube_connected") === "1") {
      navigate("/projects?youtube_connected=1", { replace: true });
      return;
    }
    if (searchParams.get("email_verified") === "1") {
      navigate("/login?email_verified=1", { replace: true });
      return;
    }
    if (searchParams.get("email_verify") === "fail") {
      navigate("/login?email_verify=fail", { replace: true });
      return;
    }
    if (searchParams.get("google_error") === "1") {
      navigate("/login?google_error=1", { replace: true });
      return;
    }
    navigate(localStorage.getItem("token") ? "/projects" : "/login", {
      replace: true,
    });
  }, []);

  return null;
}

export function LoginRoute() {
  const [searchParams, setSearchParams] = useSearchParams();

  if (localStorage.getItem("token")) return <Navigate to="/projects" replace />;

  const verifyBanner: VerifyBanner =
    searchParams.get("email_verified") === "1"
      ? "success"
      : searchParams.get("email_verify") === "fail"
        ? "fail"
        : searchParams.get("google_error") === "1"
          ? "google_error"
          : null;

  return (
    <LoginPage
      verifyBanner={verifyBanner}
      onClearBanner={() => setSearchParams({}, { replace: true })}
    />
  );
}

export function ResetPasswordRoute() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  if (!token) return <Navigate to="/login" replace />;
  return <ResetPasswordPage token={token} />;
}

export function EditorRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return <Navigate to="/projects" replace />;
  return <EditorPage projectId={parseInt(projectId)} />;
}
