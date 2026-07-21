import type { Plan } from "@/models/plan"

export type VerifyBanner = "success" | "fail" | "google_error" | null

export type RegisterResponse = {
  token: string
  email: string
  plan: Plan
  is_verified: boolean
}

// 로그인 실패(401/403) 시 raw fetch가 res.ok 체크 없이 {detail} 바디를 그대로 반환하므로 모든 필드가 optional
export type LoginResponse = {
  access_token?: string
  token_type?: string
  email?: string
  plan?: Plan
  is_verified?: boolean
  detail?: string
}
