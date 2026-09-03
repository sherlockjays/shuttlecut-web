export const THEMES = [
  { id: "dark", label: "다크", bg: "#1e1e1e", accent: "#ffdc00" },
  { id: "light", label: "라이트", bg: "#f0f0f0", accent: "#1e50c8" },
  { id: "blue", label: "블루", bg: "#002878", accent: "#ffdc00" },
  { id: "red", label: "레드", bg: "#780000", accent: "#ffdc00" },
  { id: "green", label: "그린", bg: "#0a3c14", accent: "#b4ff64" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const SIZES = [
  { label: "소", value: 1.0 },
  { label: "중", value: 1.33 },
  { label: "대", value: 1.67 },
] as const;

export type CanvasThemeColors = {
  header_bg: string;
  row_bg: string;
  header_text: string;
  name_text: string;
  score_text: string;
  border: string;
  divider: string;
  row_div: string;
};

// 점수판 캔버스 미리보기 렌더링에 쓰이는 테마별 색상
export const CANVAS_THEMES = {
  dark: {
    header_bg: "#1e1e1e",
    row_bg: "#000000",
    header_text: "#dcdcdc",
    name_text: "#ffdc00",
    score_text: "#ffdc00",
    border: "#ffffff",
    divider: "#b4b4b4",
    row_div: "#c8c8c8",
  },
  light: {
    header_bg: "#f0f0f0",
    row_bg: "#ffffff",
    header_text: "#323232",
    name_text: "#1e50c8",
    score_text: "#1e50c8",
    border: "#323232",
    divider: "#969696",
    row_div: "#969696",
  },
  blue: {
    header_bg: "#002878",
    row_bg: "#001450",
    header_text: "#c8dcff",
    name_text: "#ffdc00",
    score_text: "#ffdc00",
    border: "#64a0ff",
    divider: "#5078c8",
    row_div: "#5082d2",
  },
  red: {
    header_bg: "#781414",
    row_bg: "#500000",
    header_text: "#ffdcdc",
    name_text: "#ffdc00",
    score_text: "#ffdc00",
    border: "#ff6464",
    divider: "#c85050",
    row_div: "#c85050",
  },
  green: {
    header_bg: "#0a3c14",
    row_bg: "#05280a",
    header_text: "#c8ffd2",
    name_text: "#b4ff64",
    score_text: "#b4ff64",
    border: "#50c864",
    divider: "#3ca050",
    row_div: "#3ca050",
  },
} satisfies Record<ThemeId, CanvasThemeColors>;
