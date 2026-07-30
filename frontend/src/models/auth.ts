import type { Plan } from "@/models/plan";

export type VerifyBanner = "success" | "fail" | "google_error" | null;

export const VERIFY_BANNERS: Record<
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

export type RegisterResponse = {
  token: string;
  email: string;
  plan: Plan;
  is_verified: boolean;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  email: string;
  plan: Plan;
  is_verified: boolean;
};
