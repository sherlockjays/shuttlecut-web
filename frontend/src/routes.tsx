import { useEffect } from "react"
import { Navigate, useNavigate, useSearchParams, useParams } from "react-router-dom"
import { auth } from "@/api"
import LoginPage from "@/pages/LoginPage"
import DashboardPage from "@/pages/DashboardPage"
import EditorPage from "@/pages/EditorPage"
import ForgotPasswordPage from "@/pages/ForgotPasswordPage"
import ResetPasswordPage from "@/pages/ResetPasswordPage"

// 루트 경로: OAuth 콜백 처리 및 리다이렉트
export function RootHandler() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const resetToken = searchParams.get("reset_token")
    if (resetToken) {
      navigate(`/reset-password?token=${resetToken}`, { replace: true })
      return
    }
    const googleCode = searchParams.get("google_code")
    if (googleCode) {
      auth.exchangeGoogleCode(googleCode)
        .then(data => {
          if (data.access_token) localStorage.setItem("token", data.access_token)
          navigate("/projects", { replace: true })
        })
        .catch(() => navigate("/login?google_error=1", { replace: true }))
      return
    }
    if (searchParams.get("youtube_connected") === "1") {
      navigate("/projects?youtube_connected=1", { replace: true })
      return
    }
    if (searchParams.get("email_verified") === "1") {
      navigate("/login?email_verified=1", { replace: true })
      return
    }
    if (searchParams.get("email_verify") === "fail") {
      navigate("/login?email_verify=fail", { replace: true })
      return
    }
    if (searchParams.get("google_error") === "1") {
      navigate("/login?google_error=1", { replace: true })
      return
    }
    navigate(localStorage.getItem("token") ? "/projects" : "/login", { replace: true })
  }, [])

  return null
}

export function LoginRoute() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  if (localStorage.getItem("token")) return <Navigate to="/projects" replace />

  const verifyBanner = searchParams.get("email_verified") === "1" ? "success"
    : searchParams.get("email_verify") === "fail" ? "fail"
    : searchParams.get("google_error") === "1" ? "google_error"
    : null

  return (
    <LoginPage
      onLogin={() => navigate("/projects")}
      onForgotPassword={() => navigate("/forgot-password")}
      verifyBanner={verifyBanner as "success" | "fail" | "google_error" | null}
      onClearBanner={() => setSearchParams({}, { replace: true })}
    />
  )
}

export function ForgotPasswordRoute() {
  const navigate = useNavigate()
  return <ForgotPasswordPage onBack={() => navigate("/login")} />
}

export function ResetPasswordRoute() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  if (!token) return <Navigate to="/login" replace />
  return <ResetPasswordPage token={token} onDone={() => navigate("/login")} />
}

export function ProjectsRoute() {
  const navigate = useNavigate()
  return <DashboardPage onOpenEditor={(id) => navigate(`/editor/${id}`)} />
}

export function EditorRoute() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  if (!projectId) return <Navigate to="/projects" replace />
  return <EditorPage projectId={parseInt(projectId)} onBack={() => navigate("/projects")} />
}
