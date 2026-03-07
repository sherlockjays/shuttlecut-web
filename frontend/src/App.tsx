import { useState, useEffect } from "react"
import LoginPage from "./pages/LoginPage"
import DashboardPage from "./pages/DashboardPage"
import EditorPage from "./pages/EditorPage"
import ExportHistoryPage from "./pages/ExportHistoryPage"
import ForgotPasswordPage from "./pages/ForgotPasswordPage"
import ResetPasswordPage from "./pages/ResetPasswordPage"

export type Page = "login" | "dashboard" | "editor" | "history" | "forgot-password" | "reset-password"

export default function App() {
  const [page, setPage] = useState<Page>("login")
  const [projectId, setProjectId] = useState<number | null>(null)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [verifyBanner, setVerifyBanner] = useState<"success" | "fail" | "google_error" | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // 비밀번호 재설정 링크
    const rt = params.get("reset_token")
    if (rt) {
      setResetToken(rt)
      setPage("reset-password")
      window.history.replaceState({}, "", "/")
      return
    }

    // Google 로그인 결과
    const gt = params.get("google_token")
    if (gt) {
      localStorage.setItem("token", gt)
      window.history.replaceState({}, "", "/")
      setPage("dashboard")
      return
    }
    if (params.get("google_error") === "1") {
      setVerifyBanner("google_error")
      window.history.replaceState({}, "", "/")
    }

    // 이메일 인증 결과
    if (params.get("email_verified") === "1") {
      setVerifyBanner("success")
      window.history.replaceState({}, "", "/")
    } else if (params.get("email_verify") === "fail") {
      setVerifyBanner("fail")
      window.history.replaceState({}, "", "/")
    }

    if (localStorage.getItem("token")) setPage("dashboard")
  }, [])

  const openEditor = (id: number) => { setProjectId(id); setPage("editor") }
  const logout = () => { localStorage.removeItem("token"); setPage("login") }

  if (page === "reset-password" && resetToken)
    return <ResetPasswordPage token={resetToken} onDone={() => { setResetToken(null); setPage("login") }} />
  if (page === "forgot-password")
    return <ForgotPasswordPage onBack={() => setPage("login")} />
  if (page === "login")
    return <LoginPage onLogin={() => setPage("dashboard")} onForgotPassword={() => setPage("forgot-password")} verifyBanner={verifyBanner} onClearBanner={() => setVerifyBanner(null)} />
  if (page === "dashboard")
    return <DashboardPage onOpenEditor={openEditor} onLogout={logout} onOpenHistory={() => setPage("history")} />
  if (page === "editor" && projectId)
    return <EditorPage projectId={projectId} onBack={() => setPage("dashboard")} />
  if (page === "history")
    return <ExportHistoryPage onBack={() => setPage("dashboard")} />
  return null
}
