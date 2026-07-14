export const THEMES = [
  { id: "dark",  label: "다크",  bg: "#1e1e1e", accent: "#ffdc00" },
  { id: "light", label: "라이트", bg: "#f0f0f0", accent: "#1e50c8" },
  { id: "blue",  label: "블루",  bg: "#002878", accent: "#ffdc00" },
  { id: "red",   label: "레드",  bg: "#780000", accent: "#ffdc00" },
  { id: "green", label: "그린",  bg: "#0a3c14", accent: "#b4ff64" },
] as const

export type ThemeId = (typeof THEMES)[number]["id"]

export const SIZES = [
  { label: "소", value: 1.0 },
  { label: "중", value: 1.33 },
  { label: "대", value: 1.67 },
] as const
