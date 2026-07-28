import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { auth, saveToken } from "@/api";
import type { VerifyBanner } from "@/models/auth";

interface Props {
  verifyBanner: VerifyBanner;
  onClearBanner: () => void;
}

const VERIFY_BANNERS: Record<
  NonNullable<VerifyBanner>,
  { text: string; className: string; buttonClassName: string }
> = {
  success: {
    text: "이메일 인증이 완료됐습니다!",
    className: "bg-green-900/50 border-green-600 text-green-300",
    buttonClassName: "text-green-400",
  },
  fail: {
    text: "인증 링크가 만료됐습니다. 다시 가입해주세요.",
    className: "bg-red-900/50 border-red-600 text-red-300",
    buttonClassName: "text-red-400",
  },
  google_error: {
    text: "Google 로그인에 실패했습니다. 다시 시도해주세요.",
    className: "bg-red-900/50 border-red-600 text-red-300",
    buttonClassName: "text-red-400",
  },
};

export default function LoginPage({ verifyBanner, onClearBanner }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [view, setView] = useState<"login" | "register" | "registered">(
    "login",
  );
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const needsConsent = view === "register" && (!agreedTerms || !agreedPrivacy);

  const loginMutation = useMutation({
    mutationFn: () => auth.login(email, pw),
    onSuccess: (res) => {
      saveToken(res.access_token);
      navigate("/projects");
    },
  });

  const registerMutation = useMutation({
    mutationFn: () => auth.register(email, pw),
    onSuccess: () => {
      // pw만 초기화: email은 "registered" 화면에서 발송 대상 표시 및
      // 로그인 탭 복귀 시 재입력 방지를 위해 그대로 유지
      setPw("");
      setView("registered");
    },
  });

  const activeMutation = view === "register" ? registerMutation : loginMutation;

  const submit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (view === "registered") return;
    activeMutation.mutate();
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm bg-gray-800 rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">
          🏸 ShuttleCut
        </h1>
        <p className="text-gray-400 text-sm text-center mb-6">
          배드민턴 경기 영상 편집 서비스
        </p>

        {/* 이메일 인증 배너 */}
        {verifyBanner && (
          <div
            className={`mb-4 border rounded-lg px-4 py-3 text-sm flex justify-between items-center ${VERIFY_BANNERS[verifyBanner].className}`}
          >
            <span>{VERIFY_BANNERS[verifyBanner].text}</span>
            <button
              onClick={onClearBanner}
              aria-label="배너 닫기"
              className={`hover:text-white ml-2 ${VERIFY_BANNERS[verifyBanner].buttonClassName}`}
            >
              ✕
            </button>
          </div>
        )}

        {/* 회원가입 완료 안내 */}
        {view === "registered" ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <p className="text-white font-medium mb-2">가입을 완료해주세요</p>
            <p className="text-gray-400 text-sm mb-6">
              <span className="text-blue-400">{email}</span>로<br />
              인증 메일을 보냈습니다.
              <br />
              메일의 링크를 클릭하면 인증이 완료됩니다.
            </p>
            <button
              onClick={() => setView("login")}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-medium transition-colors"
            >
              로그인하러 가기
            </button>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="로그인/회원가입 전환"
              className="flex mb-6 bg-gray-700 rounded-lg p-1"
            >
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  id={`tab-${m}`}
                  role="tab"
                  aria-selected={view === m}
                  aria-controls="auth-panel"
                  onClick={() => {
                    setView(m);
                    loginMutation.reset();
                    registerMutation.reset();
                  }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors
                    ${view === m ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                  {m === "login" ? "로그인" : "회원가입"}
                </button>
              ))}
            </div>

            <div
              id="auth-panel"
              role="tabpanel"
              aria-labelledby={`tab-${view}`}
            >
              <form onSubmit={submit} className="space-y-4">
                <label htmlFor="email" className="sr-only">
                  이메일
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="이메일"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <label htmlFor="password" className="sr-only">
                  비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="비밀번호 (8자 이상)"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />

                {view === "register" && (
                  <fieldset className="border-0 p-0 m-0 space-y-2 pt-1">
                    <legend className="sr-only">필수 동의 항목</legend>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreedTerms}
                        onChange={(e) => setAgreedTerms(e.target.checked)}
                        className="mt-0.5 accent-blue-500"
                      />
                      <span className="text-xs text-gray-400">
                        (필수){" "}
                        <a
                          href="/terms"
                          target="_blank"
                          className="text-blue-400 hover:underline"
                        >
                          이용약관
                        </a>
                        에 동의합니다.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreedPrivacy}
                        onChange={(e) => setAgreedPrivacy(e.target.checked)}
                        className="mt-0.5 accent-blue-500"
                      />
                      <span className="text-xs text-gray-400">
                        (필수){" "}
                        <a
                          href="/privacy"
                          target="_blank"
                          className="text-blue-400 hover:underline"
                        >
                          개인정보처리방침
                        </a>
                        에 동의합니다.
                      </span>
                    </label>
                  </fieldset>
                )}

                {activeMutation.error && (
                  <p className="text-red-400 text-sm">
                    {activeMutation.error.message}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={activeMutation.isPending || needsConsent}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-3 font-medium transition-colors"
                >
                  {activeMutation.isPending
                    ? "처리 중..."
                    : view === "login"
                      ? "로그인"
                      : "회원가입"}
                </button>
              </form>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600" />
                </div>
                <div className="relative flex justify-center text-xs text-gray-500">
                  <span className="bg-gray-800 px-2">또는</span>
                </div>
              </div>

              {needsConsent ? (
                <div className="text-xs text-gray-500 text-center py-3 border border-gray-700 rounded-lg">
                  약관에 동의하면 Google 로그인을 이용할 수 있습니다.
                </div>
              ) : (
                <a
                  href={auth.googleLoginUrl()}
                  className="flex items-center justify-center gap-3 w-full bg-white hover:bg-gray-100 text-gray-800 rounded-lg py-3 font-medium transition-colors text-sm"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Google로 로그인
                </a>
              )}

              {view === "login" && (
                <Link
                  to="/forgot-password"
                  className="block w-full text-center text-gray-400 hover:text-white text-sm mt-1 py-1 transition-colors"
                >
                  비밀번호를 잊으셨나요?
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
