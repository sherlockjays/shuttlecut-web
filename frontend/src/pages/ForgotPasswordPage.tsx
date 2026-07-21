import { useState } from "react"
import { Link } from "react-router-dom"
import { auth } from "@/api"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      await auth.forgotPassword(email)
      setSent(true)
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
        <p className="text-gray-400 text-sm text-center mb-6">비밀번호 찾기</p>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <p className="text-white font-medium mb-2">이메일을 확인해주세요</p>
            <p className="text-gray-400 text-sm mb-6">
              <span className="text-blue-400">{email}</span>로<br />
              비밀번호 재설정 링크를 보냈습니다.<br />
              스팸함도 확인해보세요.
            </p>
            <Link to="/login"
              className="block w-full text-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-3 text-sm transition-colors">
              로그인으로 돌아가기
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-gray-400 text-sm">
              가입 시 사용한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.
            </p>
            <input
              type="email" placeholder="이메일" value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-3 font-medium transition-colors">
              {loading ? "전송 중..." : "재설정 링크 보내기"}
            </button>
            <Link to="/login"
              className="block w-full text-center text-gray-400 hover:text-white text-sm py-2 transition-colors">
              로그인으로 돌아가기
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
