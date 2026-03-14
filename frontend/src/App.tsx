import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams, useParams } from "react-router-dom"
import LoginPage from "./pages/LoginPage"
import DashboardPage from "./pages/DashboardPage"
import EditorPage from "./pages/EditorPage"
import ForgotPasswordPage from "./pages/ForgotPasswordPage"
import ResetPasswordPage from "./pages/ResetPasswordPage"
import PricingPage from "./pages/PricingPage"
import GuidePage from "./pages/GuidePage"
import MyPage from "./pages/MyPage"
import AdminPage from "./pages/AdminPage"
import TermsPage from "./pages/TermsPage"
import PrivacyPage from "./pages/PrivacyPage"
import AppLayout from "./components/AppLayout"

// 루트 경로: OAuth 콜백 처리 및 리다이렉트
function RootHandler() {
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
      fetch(`/api/auth/google/exchange?code=${googleCode}`)
        .then(r => r.json())
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

function LoginRoute() {
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

function ForgotPasswordRoute() {
  const navigate = useNavigate()
  return <ForgotPasswordPage onBack={() => navigate("/login")} />
}

function ResetPasswordRoute() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  if (!token) return <Navigate to="/login" replace />
  return <ResetPasswordPage token={token} onDone={() => navigate("/login")} />
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  if (!localStorage.getItem("token")) return <Navigate to="/login" replace />
  const logout = () => { localStorage.removeItem("token"); navigate("/login") }
  return <AppLayout onLogout={logout}>{children}</AppLayout>
}

function ProjectsRoute() {
  const navigate = useNavigate()
  return (
    <ProtectedLayout>
      <DashboardPage onOpenEditor={(id) => navigate(`/editor/${id}`)} />
    </ProtectedLayout>
  )
}

function EditorRoute() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  if (!localStorage.getItem("token")) return <Navigate to="/login" replace />
  if (!projectId) return <Navigate to="/projects" replace />
  return <EditorPage projectId={parseInt(projectId)} onBack={() => navigate("/projects")} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootHandler />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
        <Route path="/reset-password" element={<ResetPasswordRoute />} />
        <Route path="/editor/:projectId" element={<EditorRoute />} />
        <Route path="/projects" element={<ProjectsRoute />} />
        <Route path="/pricing" element={<ProtectedLayout><PricingPage /></ProtectedLayout>} />
        <Route path="/guide" element={<ProtectedLayout><GuidePage /></ProtectedLayout>} />
        <Route path="/mypage" element={<ProtectedLayout><MyPage /></ProtectedLayout>} />
        <Route path="/admin" element={<ProtectedLayout><AdminPage /></ProtectedLayout>} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
