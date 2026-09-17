import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { auth } from "@/api";

export default function ResetPasswordPage({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [done, setDone] = useState(false);
  const [mismatchError, setMismatchError] = useState("");

  const {
    mutate: submitReset,
    isPending,
    error,
  } = useMutation({
    mutationFn: () => auth.resetPassword(token, pw),
    onSuccess: () => setDone(true),
  });

  const handlePwChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setPw(next);
    setMismatchError(pw2 && next !== pw2 ? "비밀번호가 일치하지 않습니다." : "");
  };

  const handlePw2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setPw2(next);
    setMismatchError(next && pw !== next ? "비밀번호가 일치하지 않습니다." : "");
  };

  const submit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pw !== pw2) {
      setMismatchError("비밀번호가 일치하지 않습니다.");
      return;
    }
    submitReset();
  };

  const errorMessage = mismatchError || error?.message;

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
            <Link
              to="/login"
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-medium transition-colors"
            >
              로그인하러 가기
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="password"
              placeholder="새 비밀번호 (6자 이상)"
              value={pw}
              onChange={handlePwChange}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              minLength={6}
              required
            />
            <input
              type="password"
              placeholder="비밀번호 확인"
              value={pw2}
              onChange={handlePw2Change}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {errorMessage && <p className="text-red-400 text-sm">{errorMessage}</p>}
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-3 font-medium transition-colors"
            >
              {isPending ? "변경 중..." : "비밀번호 변경"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
