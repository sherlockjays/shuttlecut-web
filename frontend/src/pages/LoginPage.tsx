import { useState } from "react"
import { auth } from "../api"

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("")
  const [pw, setPw] = useState("")
  const [mode, setMode] = useState<"login" | "register">("login")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      const res = mode === "login"
        ? await auth.login(email, pw)
        : await auth.register(email, pw)
      const token = res.access_token || res.token
      if (!token) throw new Error(res.detail || "인증 실패")
      localStorage.setItem("token", token)
      onLogin()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm bg-gray-800 rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">🏸 ShuttleCut</h1>
        <p className="text-gray-400 text-sm text-center mb-6">
          배드민턴 경기 영상 편집 서비스
        </p>

        <div className="flex mb-6 bg-gray-700 rounded-lg p-1">
          {(["login", "register"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors
                ${mode === m ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {m === "login" ? "로그인" : "회원가입"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input type="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" required />
          <input type="password" placeholder="비밀번호" value={pw} onChange={e => setPw(e.target.value)}
            className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" required />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-3 font-medium transition-colors">
            {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>
      </div>
    </div>
  )
}
