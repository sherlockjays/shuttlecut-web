import { useState, useEffect } from "react"
import { useNavigate, useLocation, useSearchParams } from "react-router-dom"
import { youtube as youtubeApi, auth as authApi } from "@/api"

export type AppPage = "projects" | "pricing" | "guide" | "mypage" | "admin"

export default function AppLayout({
  onLogout,
  children,
}: {
  onLogout: () => void
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [ytConnected, setYtConnected] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const activePage = (location.pathname.slice(1) as AppPage) || "projects"

  useEffect(() => {
    youtubeApi.status().then((s: { connected: boolean }) => setYtConnected(s.connected)).catch(() => {})
    authApi.me().then((u: { plan: string }) => setIsAdmin(u.plan === "admin")).catch(() => {})
  }, [])

  useEffect(() => {
    if (searchParams.get("youtube_connected") === "1") {
      setYtConnected(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const nav: { key: AppPage; label: string }[] = [
    { key: "projects", label: "프로젝트" },
    { key: "pricing", label: "요금제/플랜" },
    { key: "guide", label: "사용가이드" },
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <button onClick={() => navigate("/projects")} className="flex items-center gap-1.5">
            <span className="text-lg">🏸</span>
            <span className="text-lg font-bold text-yellow-400">ShuttleCut</span>
          </button>
          <nav className="flex items-center gap-6">
            {nav.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => navigate(`/${key}`)}
                className={`text-sm font-medium transition-colors ${
                  activePage === key ? "text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => navigate("/admin")}
                className={`text-sm font-medium transition-colors ${
                  activePage === "admin" ? "text-yellow-300" : "text-yellow-600 hover:text-yellow-400"
                }`}
              >
                관리자
              </button>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/mypage")}
            className={`text-sm font-bold transition-colors ${
              activePage === "mypage" ? "text-yellow-300" : "text-yellow-500 hover:text-yellow-300"
            }`}
          >
            MY
          </button>
          {ytConnected && (
            <span className="text-red-400 text-xs font-medium">▶ YouTube 연결됨</span>
          )}
          <button onClick={onLogout} className="text-gray-400 hover:text-white text-sm transition-colors">
            로그아웃
          </button>
        </div>
      </header>
      {children}
    </div>
  )
}
