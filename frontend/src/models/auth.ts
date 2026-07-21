import type { Plan } from "@/models/plan";

export type VerifyBanner = "success" | "fail" | "google_error" | null;

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
