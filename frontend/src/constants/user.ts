export const PLAN_LIMITS: Record<string, string> = {
  free: "월 2회",
  basic: "월 5회",
  standard: "월 10회",
  premium: "월 30회",
  unlimited: "무제한",
  club: "무제한",
  admin: "무제한",
}

export const PLANS = ["free", "basic", "standard", "premium", "unlimited", "club", "admin"] as const
export type Plan = typeof PLANS[number]
