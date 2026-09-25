import type { ProjectData } from "@/models/project";

/**
 * 점수판 규격. 단위는 결과물 프레임 픽셀이다(워커가 세로 1080으로 줄인 뒤 얹는다. tasks.py 참고).
 * nameMaxChars만 글자 수다. 결과물을 그리는 exporter.py·tasks.py의 값과 같아야 미리보기가 결과물과 맞는다.
 */
export const SCOREBOARD_GEOMETRY = {
  margin: 11,
  boxWidth: 236,
  pad: 6,
  rowHeight: 38,
  lineHeight: 17,
  fontSmall: 13,
  fontMedium: 16,
  fontScore: 27,
  nameMaxChars: 18,
} as const;

// 표시 크기가 작아져도 글자가 뭉개지지 않게 하는 하한. 미리보기에만 있다.
const MIN_FONT_PX = { small: 8, medium: 9, score: 11 } as const;

export type Size = { width: number; height: number };

export type ScoreboardFields = Pick<
  ProjectData,
  | "scoreboard_scale"
  | "scoreboard_theme"
  | "player1_name"
  | "player2_name"
  | "player1_score"
  | "player2_score"
  | "match_date"
  | "tournament_name"
  | "level"
  | "match_name"
>;

export type VideoContentRect = Size & { offsetX: number; offsetY: number };

/** 표시 박스 안에서 영상이 실제로 그려지는 영역. 비율이 다르면 남는 쪽은 여백이다. */
export function getVideoContentRect(display: Size, video: Size): VideoContentRect {
  const videoAspect = video.width / video.height;
  const displayAspect = display.width / display.height;
  if (videoAspect > displayAspect) {
    const height = display.width / videoAspect;
    return { width: display.width, height, offsetX: 0, offsetY: (display.height - height) / 2 };
  }
  const width = display.height * videoAspect;
  return { width, height: display.height, offsetX: (display.width - width) / 2, offsetY: 0 };
}

export type ScoreboardLayout = {
  x: number;
  y: number;
  boxWidth: number;
  pad: number;
  rowHeight: number;
  lineHeight: number;
  headerHeight: number;
  totalHeight: number;
  fontSmall: number;
  fontMedium: number;
  fontScore: number;
  /** 원본 픽셀 하나가 표시 픽셀 몇 개인지. 선 두께처럼 규격에 없는 값을 맞출 때 쓴다. */
  displayScale: number;
};

/** 표시 박스와 영상 원본 크기로 점수판을 표시 픽셀 좌표에 놓는다. */
export function getScoreboardLayout({
  display,
  video,
  scale,
}: {
  display: Size;
  video: Size;
  scale: number;
}): ScoreboardLayout {
  const content = getVideoContentRect(display, video);
  const displayScale = content.width / video.width;
  const unit = scale * displayScale;
  const g = SCOREBOARD_GEOMETRY;

  const pad = g.pad * unit;
  const rowHeight = g.rowHeight * unit;
  const lineHeight = g.lineHeight * unit;
  const headerHeight = lineHeight * 2 + pad;

  return {
    x: content.offsetX + g.margin * unit,
    y: content.offsetY + g.margin * unit,
    boxWidth: g.boxWidth * unit,
    pad,
    rowHeight,
    lineHeight,
    headerHeight,
    totalHeight: headerHeight + rowHeight * 2,
    fontSmall: Math.max(MIN_FONT_PX.small, Math.round(g.fontSmall * unit)),
    fontMedium: Math.max(MIN_FONT_PX.medium, Math.round(g.fontMedium * unit)),
    fontScore: Math.max(MIN_FONT_PX.score, Math.round(g.fontScore * unit)),
    displayScale,
  };
}

const HEADER_SEPARATOR = "  /  ";

/** 헤더 두 줄. 경기 정보가 하나도 없으면 브랜드 문구 한 줄로 대신한다. */
export function getScoreboardHeaderLines(
  fields: Pick<ScoreboardFields, "match_date" | "tournament_name" | "level" | "match_name">,
): [string, string] {
  const line1 = [fields.match_date, fields.tournament_name].filter(Boolean).join(HEADER_SEPARATOR);
  const line2 = [fields.level, fields.match_name].filter(Boolean).join(HEADER_SEPARATOR);
  if (!line1 && !line2) return ["ShuttleCut", ""];
  return [line1, line2];
}
