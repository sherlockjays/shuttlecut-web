"""moviepy + PIL 기반 영상 내보내기 - QThread로 백그라운드 실행"""

import os
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from PyQt6.QtCore import QThread, pyqtSignal

try:
    from moviepy.editor import VideoFileClip, concatenate_videoclips
except ImportError:
    import moviepy.editor as mpy
    VideoFileClip = mpy.VideoFileClip
    concatenate_videoclips = mpy.concatenate_videoclips

from .rally_manager import Rally

FONT_PATH = "C:/Windows/Fonts/malgunbd.ttf"
TAIL_SECONDS = 1.5   # 랠리 끝점 이후 추가 시간


def _get_font(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
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

    font_sm = _get_font(16)
    font_md = _get_font(20)
    font_score = _get_font(38)

    x, y = 20, 20
    bw = 420

    # ── 헤더: 날짜 / 대회명 / 급수 / 경기명 ──
    header_lines = []
    if date:
        header_lines.append(date)
    parts = [p for p in [tournament, level, match_name] if p]
    if parts:
        header_lines.append("  |  ".join(parts))

    header_h = 28 * len(header_lines) + 10 if header_lines else 0

    if header_lines:
        draw.rectangle([(x, y), (x + bw, y + header_h)], fill=(30, 30, 30))
        for i, line in enumerate(header_lines):
            draw.text((x + 10, y + 5 + i * 28), line, font=font_sm, fill=(220, 220, 220))

    # ── 선수 행 ──
    row_h = 54
    y0 = y + header_h

    for name, score, color in [
        (p1_name, p1_score, (255, 220, 0)),
        (p2_name, p2_score, (255, 220, 0)),
    ]:
        draw.rectangle([(x, y0), (x + bw, y0 + row_h)], fill=(0, 0, 0))

        # 팀명 수직 중앙 정렬 (top offset 보정)
        name_bbox = draw.textbbox((0, 0), name[:18], font=font_md)
        name_h = name_bbox[3] - name_bbox[1]
        name_y = y0 + (row_h - name_h) // 2 - name_bbox[1]
        draw.text((x + 10, name_y), name[:18], font=font_md, fill=color)

        # 점수 수직 중앙 정렬 (top offset 보정)
        score_txt = str(score)
        score_bbox = draw.textbbox((0, 0), score_txt, font=font_score)
        sw = score_bbox[2] - score_bbox[0]
        sh = score_bbox[3] - score_bbox[1]
        score_y = y0 + (row_h - sh) // 2 - score_bbox[1]
        draw.text((x + bw - sw - 12, score_y), score_txt, font=font_score, fill=color)

        y0 += row_h

    total_h = header_h + row_h * 2

    # ── 테두리 / 구분선 ──
    draw.rectangle([(x, y), (x + bw, y + total_h)], outline=(255, 255, 255), width=2)
    if header_lines:
        draw.line([(x, y + header_h), (x + bw, y + header_h)], fill=(180, 180, 180), width=1)
    # 두 팀 사이 구분선 (굵고 밝게)
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


class Exporter(QThread):
    progress = pyqtSignal(int, str)   # percent, message
    finished = pyqtSignal(str, str)   # video_path, txt_path
    error = pyqtSignal(str)

    def __init__(self,
                 video_path: str,
                 fps: float,
                 rallies: list[Rally],
                 date: str,
                 tournament: str,
                 level: str,
                 match_name: str,
                 p1_name: str,
                 p2_name: str,
                 output_path: str,
                 parent=None):
        super().__init__(parent)
        self.video_path = video_path
        self.fps = fps
        self.rallies = rallies
        self.date = date
        self.tournament = tournament
        self.level = level
        self.match_name = match_name
        self.p1_name = p1_name
        self.p2_name = p2_name
        self.output_path = output_path

    def run(self):
        try:
            video = VideoFileClip(self.video_path)
            total_dur = video.duration
            clips = []
            total = len(self.rallies)

            date = self.date
            tournament = self.tournament
            level = self.level
            match_name = self.match_name
            p1_name = self.p1_name
            p2_name = self.p2_name

            for i, rally in enumerate(self.rallies):
                start_t = rally.start_frame / self.fps
                end_marker_t = rally.end_frame / self.fps
                end_t = min(end_marker_t + TAIL_SECONDS, total_dur)

                # 득점 전 점수 (랠리 진행 중)
                p1_pre, p2_pre = rally.p1_score, rally.p2_score
                # 득점 후 점수 (tail 구간)
                if rally.winner == 1:
                    p1_post, p2_post = p1_pre + 1, p2_pre
                elif rally.winner == 2:
                    p1_post, p2_post = p1_pre, p2_pre + 1
                else:
                    p1_post, p2_post = p1_pre, p2_pre

                subclip = video.subclip(start_t, end_t)

                # 마킹 지점 이전: 득점 전 점수 / 이후(tail): 득점 후 점수
                score_change_t = end_marker_t - start_t

                def make_overlay(p1a=p1_pre, p2a=p2_pre, p1b=p1_post, p2b=p2_post, sct=score_change_t):
                    def overlay(get_frame, t):
                        frame = get_frame(t)
                        p1 = p1b if t >= sct else p1a
                        p2 = p2b if t >= sct else p2a
                        return draw_scoreboard(
                            frame,
                            date, tournament, level, match_name,
                            p1_name, p1,
                            p2_name, p2,
                        )
                    return overlay

                subclip = subclip.fl(make_overlay())
                clips.append(subclip)

                pct = int((i + 1) / total * 80)
                self.progress.emit(pct, f"랠리 {i+1}/{total} 처리 중...")

            self.progress.emit(85, "클립 합치는 중...")
            final = concatenate_videoclips(clips)

            self.progress.emit(90, "영상 파일 저장 중...")
            final.write_videofile(
                self.output_path,
                codec="libx264",
                audio_codec="aac",
                preset="ultrafast",
                threads=4,
                logger=None,
            )
            final.close()
            video.close()

            # 타임라인 txt 저장
            self.progress.emit(97, "타임라인 파일 생성 중...")
            txt_path = str(Path(self.output_path).with_suffix(".txt"))
            txt_content = generate_timeline_txt(
                self.rallies, self.fps,
                self.date, self.tournament, self.level, self.match_name,
                self.p1_name, self.p2_name,
            )
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(txt_content)

            self.progress.emit(100, "완료!")
            self.finished.emit(self.output_path, txt_path)

        except Exception as e:
            self.error.emit(str(e))
