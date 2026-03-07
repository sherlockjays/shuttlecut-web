import { useState } from "react"
import { auth } from "../api"

export default function ResetPasswordPage({ token, onDone }: { token: string; onDone: () => void }) {
  const [pw, setPw] = useState("")
  const [pw2, setPw2] = useState("")
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) { setError("비밀번호가 일치하지 않습니다."); return }
    setError(""); setLoading(true)
    try {
      await auth.resetPassword(token, pw)
      setDone(true)
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
        <p className="text-gray-400 text-sm text-center mb-6">새 비밀번호 설정</p>

        {done ? (
          <div className="text-center">
            <div className="text-4xl mb-4">✅</div>
            <p className="text-white font-medium mb-2">비밀번호가 변경됐습니다</p>
            <p className="text-gray-400 text-sm mb-6">새 비밀번호로 로그인해주세요.</p>
            <button onClick={onDone}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-medium transition-colors">
              로그인하러 가기
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="password" placeholder="새 비밀번호 (6자 이상)" value={pw}
              onChange={e => setPw(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              minLength={6} required
            />
            <input
              type="password" placeholder="비밀번호 확인" value={pw2}
              onChange={e => setPw2(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-3 font-medium transition-colors">
              {loading ? "변경 중..." : "비밀번호 변경"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
