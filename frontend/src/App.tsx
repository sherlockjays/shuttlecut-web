import { useState, useEffect } from "react"
import LoginPage from "./pages/LoginPage"
import DashboardPage from "./pages/DashboardPage"
import EditorPage from "./pages/EditorPage"

export type Page = "login" | "dashboard" | "editor"

export default function App() {
  const [page, setPage] = useState<Page>("login")
  const [projectId, setProjectId] = useState<number | null>(null)

  useEffect(() => {
    if (localStorage.getItem("token")) setPage("dashboard")
  }, [])

  const openEditor = (id: number) => { setProjectId(id); setPage("editor") }
  const logout = () => { localStorage.removeItem("token"); setPage("login") }

  if (page === "login")
    return <LoginPage onLogin={() => setPage("dashboard")} />
  if (page === "dashboard")
    return <DashboardPage onOpenEditor={openEditor} onLogout={logout} />
  if (page === "editor" && projectId)
    return <EditorPage projectId={projectId} onBack={() => setPage("dashboard")} />
  return null
}
