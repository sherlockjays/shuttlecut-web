"""moviepy + PIL 기반 영상 내보내기 - 웹 서버용 (PyQt6 없음)"""

import os
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

try:
    from moviepy.editor import VideoFileClip, concatenate_videoclips
except ImportError:
    import moviepy.editor as mpy
    VideoFileClip = mpy.VideoFileClip
    concatenate_videoclips = mpy.concatenate_videoclips

from .rally_manager import Rally

# Linux 환경 폰트 (NanumGothic 없으면 기본 폰트 사용)
FONT_PATH = "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"
if not Path(FONT_PATH).exists():
    FONT_PATH = None  # PIL 기본 폰트 사용
TAIL_SECONDS = 1.5   # 랠리 끝점 이후 추가 시간


def _get_font(size: int) -> ImageFont.FreeTypeFont:
    if FONT_PATH:
        try:
            return ImageFont.truetype(FONT_PATH, size)
        except OSError:
            pass
    return ImageFont.load_default()


def _fmt(seconds: float) -> str:
    """초 → mm:ss"""
    s = int(seconds)
    return f"{s // 60:02d}:{s % 60:02d}"


def draw_scoreboard(frame_rgb: np.ndarray,
                    date: str, tournament: str, level: str, match_name: str,
                    p1_name: str, p1_score: int,
                    p2_name: str, p2_score: int) -> np.ndarray:
    """좌상단 점수판 오버레이 (RGB ndarray → RGB ndarray)"""
    img = Image.fromarray(frame_rgb)
    draw = ImageDraw.Draw(img)

    font_sm    = _get_font(22)
    font_md    = _get_font(28)
    font_score = _get_font(48)

    x      = 20
    y      = 20
    bw     = 420
    pad    = 10
    row_h  = 66
    line_h = 30

    # ── 헤더: 1행 = 날짜 / 대회명, 2행 = 급수 / 경기명 ──
    header_lines = []
    line1 = "  /  ".join(p for p in [date, tournament] if p)
    line2 = "  /  ".join(p for p in [level, match_name] if p)
    if line1:
        header_lines.append(line1)
    if line2:
        header_lines.append(line2)

    header_h = line_h * len(header_lines) + pad if header_lines else 0

    if header_lines:
        draw.rectangle([(x, y), (x + bw, y + header_h)], fill=(30, 30, 30))
        for i, line in enumerate(header_lines):
            draw.text((x + pad, y + pad // 2 + i * line_h), line, font=font_sm, fill=(220, 220, 220))

    # ── 선수 행 ──
    y0 = y + header_h

    for name, score, color in [
        (p1_name, p1_score, (255, 220, 0)),
        (p2_name, p2_score, (255, 220, 0)),
    ]:
        draw.rectangle([(x, y0), (x + bw, y0 + row_h)], fill=(0, 0, 0))

        # 팀명 수직 중앙 정렬
        name_bbox = draw.textbbox((0, 0), name[:18], font=font_md)
        name_h = name_bbox[3] - name_bbox[1]
        name_y = y0 + (row_h - name_h) // 2 - name_bbox[1]
        draw.text((x + pad, name_y), name[:18], font=font_md, fill=color)

        # 점수 수직 중앙 정렬
        score_txt = str(score)
        score_bbox = draw.textbbox((0, 0), score_txt, font=font_score)
        sw = score_bbox[2] - score_bbox[0]
        sh = score_bbox[3] - score_bbox[1]
        score_y = y0 + (row_h - sh) // 2 - score_bbox[1]
        draw.text((x + bw - sw - pad, score_y), score_txt, font=font_score, fill=color)

        y0 += row_h

    total_h = header_h + row_h * 2

    # ── 테두리 / 구분선 ──
    draw.rectangle([(x, y), (x + bw, y + total_h)], outline=(255, 255, 255), width=2)
    if header_lines:
        draw.line([(x, y + header_h), (x + bw, y + header_h)], fill=(180, 180, 180), width=1)
    draw.line(
        [(x + 1, y + header_h + row_h), (x + bw - 1, y + header_h + row_h)],
        fill=(200, 200, 200), width=3,
    )

    return np.array(img)


def generate_timeline_txt(rallies: list[Rally], fps: float,
                           date: str, tournament: str, level: str, match_name: str,
                           p1_name: str, p2_name: str) -> str:
    """타임라인 텍스트 생성 (누적 시간 기준)"""
    lines = []

    # 헤더
    header_parts = [p for p in [date, tournament, level, match_name] if p]
    if header_parts:
        lines.append(" | ".join(header_parts))
    lines.append(f"{p1_name}  vs  {p2_name}")
    lines.append("=" * 40)
    lines.append("")

    # 누적 시간 계산 (랠리를 순서대로 이어 붙이므로 누적 오프셋 추적)
    offset = 0.0
    for i, r in enumerate(rallies):
        rally_start_sec = r.start_frame / fps
        rally_end_sec = r.end_frame / fps
        clip_duration = (rally_end_sec - rally_start_sec) + TAIL_SECONDS

        # 누적 타임라인에서 이 랠리가 시작하는 시각 = offset
        timeline_start = _fmt(offset)
        score_str = f"{r.p1_score:02d}-{r.p2_score:02d}"
        lines.append(f"{timeline_start} {score_str}")

        offset += clip_duration

    return "\n".join(lines)
