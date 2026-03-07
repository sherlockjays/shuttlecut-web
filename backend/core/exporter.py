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

THEMES = {
    "dark":  {"header_bg": (30,30,30),    "row_bg": (0,0,0),       "header_text": (220,220,220), "name_text": (255,220,0),  "score_text": (255,220,0),  "border": (255,255,255), "divider": (180,180,180), "row_div": (200,200,200)},
    "light": {"header_bg": (240,240,240), "row_bg": (255,255,255), "header_text": (50,50,50),    "name_text": (30,80,200),  "score_text": (30,80,200),  "border": (50,50,50),    "divider": (150,150,150), "row_div": (150,150,150)},
    "blue":  {"header_bg": (0,40,120),    "row_bg": (0,20,80),     "header_text": (200,220,255), "name_text": (255,220,0),  "score_text": (255,220,0),  "border": (100,160,255), "divider": (80,120,200),  "row_div": (80,130,210)},
    "red":   {"header_bg": (120,20,20),   "row_bg": (80,0,0),      "header_text": (255,220,220), "name_text": (255,220,0),  "score_text": (255,220,0),  "border": (255,100,100), "divider": (200,80,80),   "row_div": (200,80,80)},
    "green": {"header_bg": (10,60,20),    "row_bg": (5,40,10),     "header_text": (200,255,210), "name_text": (180,255,100),"score_text": (180,255,100),"border": (80,200,100),  "divider": (60,160,80),   "row_div": (60,160,80)},
}


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
                    p2_name: str, p2_score: int,
                    scale: float = 1.0, theme: str = "dark") -> np.ndarray:
    """좌상단 점수판 오버레이 (RGB ndarray → RGB ndarray)"""
    img = Image.fromarray(frame_rgb)
    draw = ImageDraw.Draw(img)

    t = THEMES.get(theme, THEMES["dark"])

    s = max(0.5, min(2.0, scale))
    font_sm    = _get_font(int(13 * s))
    font_md    = _get_font(int(16 * s))
    font_score = _get_font(int(27 * s))

    x      = int(11 * s)
    y      = int(11 * s)
    bw     = int(236 * s)
    pad    = int(6 * s)
    row_h  = int(38 * s)
    line_h = int(17 * s)

    # ── 헤더: 항상 2줄 고정 높이 (비율 일정 유지) ──
    line1 = "  /  ".join(p for p in [date, tournament] if p)
    line2 = "  /  ".join(p for p in [level, match_name] if p)
    # 둘 다 비어 있으면 ShuttleCut 브랜드 문구 1줄
    if not line1 and not line2:
        header_lines = ["ShuttleCut", ""]
    else:
        header_lines = [line1, line2]
    header_h = line_h * 2 + pad

    draw.rectangle([(x, y), (x + bw, y + header_h)], fill=t["header_bg"])
    for i, line in enumerate(header_lines):
        if line:
            draw.text((x + pad, y + pad // 2 + i * line_h), line, font=font_sm, fill=t["header_text"])

    # ── 선수 행 ──
    y0 = y + header_h

    for name, score in [(p1_name, p1_score), (p2_name, p2_score)]:
        draw.rectangle([(x, y0), (x + bw, y0 + row_h)], fill=t["row_bg"])

        # 팀명 수직 중앙 정렬
        name_bbox = draw.textbbox((0, 0), name[:18], font=font_md)
        name_h = name_bbox[3] - name_bbox[1]
        name_y = y0 + (row_h - name_h) // 2 - name_bbox[1]
        draw.text((x + pad, name_y), name[:18], font=font_md, fill=t["name_text"])

        # 점수 수직 중앙 정렬
        score_txt = str(score)
        score_bbox = draw.textbbox((0, 0), score_txt, font=font_score)
        sw = score_bbox[2] - score_bbox[0]
        sh = score_bbox[3] - score_bbox[1]
        score_y = y0 + (row_h - sh) // 2 - score_bbox[1]
        draw.text((x + bw - sw - pad, score_y), score_txt, font=font_score, fill=t["score_text"])

        y0 += row_h

    total_h = header_h + row_h * 2

    # ── 테두리 / 구분선 ──
    draw.rectangle([(x, y), (x + bw, y + total_h)], outline=t["border"], width=2)
    draw.line([(x, y + header_h), (x + bw, y + header_h)], fill=t["divider"], width=1)
    draw.line(
        [(x + 1, y + header_h + row_h), (x + bw - 1, y + header_h + row_h)],
        fill=t["row_div"], width=3,
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
