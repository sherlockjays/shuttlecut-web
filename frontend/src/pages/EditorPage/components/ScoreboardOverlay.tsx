import { useEffect, useRef, useState, type RefObject } from "react";
import { CANVAS_THEMES, type CanvasThemeColors } from "@/models/theme";
import {
  SCOREBOARD_GEOMETRY,
  getScoreboardHeaderLines,
  getScoreboardLayout,
  type ScoreboardFields,
  type ScoreboardLayout,
  type Size,
} from "../scoreboard";

type Props = {
  scoreboard: ScoreboardFields;
  /** 영상 원본 해상도. 메타데이터를 읽기 전에는 null이고 그동안은 그리지 않는다. */
  videoSize: Size | null;
};

/**
 * 영상 위에 점수판 미리보기를 그린다.
 * 캔버스가 영상 박스를 그대로 덮는다는 전제(absolute inset-0, 래퍼의 흐름 자식은 video 하나)로
 * 자기 박스를 재서 레터박스를 보정하므로 video 엘리먼트를 알 필요가 없다.
 */
export default function ScoreboardOverlay({ scoreboard, videoSize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displaySize = useElementSize(canvasRef);
  const {
    scoreboard_scale,
    scoreboard_theme,
    player1_name,
    player2_name,
    player1_score,
    player2_score,
    match_date,
    tournament_name,
    level,
    match_name,
  } = scoreboard;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoSize || !displaySize || displaySize.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 크기를 대입하면 비트맵이 비워지므로 따로 지우지 않는다.
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;

    const layout = getScoreboardLayout({
      display: displaySize,
      video: videoSize,
      scale: scoreboard_scale,
    });
    const theme = CANVAS_THEMES[scoreboard_theme] || CANVAS_THEMES.dark;
    drawScoreboard(ctx, layout, theme, {
      headerLines: getScoreboardHeaderLines({ match_date, tournament_name, level, match_name }),
      rows: [
        [player1_name, player1_score],
        [player2_name, player2_score],
      ],
    });
  }, [
    videoSize,
    displaySize,
    scoreboard_scale,
    scoreboard_theme,
    player1_name,
    player2_name,
    player1_score,
    player2_score,
    match_date,
    tournament_name,
    level,
    match_name,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none rounded-xl"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

/** 엘리먼트의 표시 크기. 창 크기가 바뀌면 따라 바뀐다. 마운트 전에는 null이다. */
function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev?.width === width && prev?.height === height ? prev : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

type ScoreboardText = {
  headerLines: [string, string];
  rows: [name: string, score: number][];
};

function drawScoreboard(
  ctx: CanvasRenderingContext2D,
  layout: ScoreboardLayout,
  theme: CanvasThemeColors,
  text: ScoreboardText,
) {
  const { x, y, boxWidth, pad, rowHeight, lineHeight, headerHeight, totalHeight } = layout;
  const { fontSmall, fontMedium, fontScore, displayScale } = layout;

  // 헤더
  ctx.fillStyle = theme.header_bg;
  ctx.fillRect(x, y, boxWidth, headerHeight);
  ctx.fillStyle = theme.header_text;
  ctx.font = `${fontSmall}px sans-serif`;
  text.headerLines.forEach((line, i) => {
    if (line) ctx.fillText(line, x + pad, y + pad / 2 + (i + 1) * lineHeight - 2);
  });

  // 선수 행
  let rowY = y + headerHeight;
  for (const [name, score] of text.rows) {
    ctx.fillStyle = theme.row_bg;
    ctx.fillRect(x, rowY, boxWidth, rowHeight);
    ctx.fillStyle = theme.name_text;
    ctx.font = `${fontMedium}px sans-serif`;
    ctx.fillText(
      (name || "").slice(0, SCOREBOARD_GEOMETRY.nameMaxChars),
      x + pad,
      rowY + (rowHeight + fontMedium) / 2 - 2,
    );
    ctx.font = `bold ${fontScore}px sans-serif`;
    const scoreText = String(score);
    const scoreWidth = ctx.measureText(scoreText).width;
    ctx.fillStyle = theme.score_text;
    ctx.fillText(
      scoreText,
      x + boxWidth - scoreWidth - pad,
      rowY + (rowHeight + fontScore) / 2 - 4,
    );
    rowY += rowHeight;
  }

  // 테두리 / 구분선
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = Math.max(1, 2 * displayScale);
  ctx.strokeRect(x, y, boxWidth, totalHeight);
  ctx.strokeStyle = theme.divider;
  ctx.lineWidth = Math.max(0.5, displayScale);
  ctx.beginPath();
  ctx.moveTo(x, y + headerHeight);
  ctx.lineTo(x + boxWidth, y + headerHeight);
  ctx.stroke();
  ctx.strokeStyle = theme.row_div;
  ctx.lineWidth = Math.max(1, 3 * displayScale);
  ctx.beginPath();
  ctx.moveTo(x + 1, y + headerHeight + rowHeight);
  ctx.lineTo(x + boxWidth - 1, y + headerHeight + rowHeight);
  ctx.stroke();
}
