"""Celery 작업 - 영상 내보내기"""
import os, json, redis
from pathlib import Path
from celery import Celery
from sqlalchemy.orm import Session

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
celery = Celery("shuttlecut", broker=REDIS_URL, backend=REDIS_URL)
r = redis.from_url(REDIS_URL)


def _publish(export_id: int, pct: int, msg: str, status: str = "processing"):
    r.publish(f"export_progress:{export_id}", json.dumps({
        "pct": pct, "msg": msg, "status": status
    }))


@celery.task
def run_export(export_id: int, project_data: dict):
    from models.database import SessionLocal, Export, User, Project
    from core.exporter import Exporter as _Exporter
    from core.rally_manager import Rally

    db: Session = SessionLocal()
    export = db.query(Export).get(export_id)

    try:
        export.status = "processing"
        db.commit()
        _publish(export_id, 5, "내보내기 시작...")

        rallies = [
            Rally(r[0], r[1], r[2], r[3], r[4] if len(r) > 4 else 0)
            for r in (project_data.get("rallies") or [])
        ]

        output_dir = Path(os.getenv("STORAGE_PATH", "/data/videos")) / "exports"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(output_dir / f"export_{export_id}.mp4")

        # 진행률 콜백을 위한 래퍼
        class ProgressExporter:
            def __init__(self):
                from core.exporter import Exporter
                # moviepy 기반 동기 내보내기 직접 실행
                self._run(rallies, project_data, output_path)

            def _run(self, rallies, pd, out):
                import cv2
                from core.exporter import generate_timeline_txt
                try:
                    from moviepy.editor import VideoFileClip, concatenate_videoclips
                except ImportError:
                    import moviepy.editor as mpy
                    VideoFileClip = mpy.VideoFileClip
                    concatenate_videoclips = mpy.concatenate_videoclips
                from core.exporter import draw_scoreboard
                import numpy as np

                video = VideoFileClip(pd["video_path"])
                total = len(rallies)
                clips = []
                TAIL = 1.5

                for i, rally in enumerate(rallies):
                    start_t = rally.start_frame / pd["fps"]
                    end_t = min(rally.end_frame / pd["fps"] + TAIL, video.duration)
                    p1a, p2a = rally.p1_score, rally.p2_score
                    p1b = p1a + 1 if rally.winner == 1 else p1a
                    p2b = p2a + 1 if rally.winner == 2 else p2a
                    sct = rally.end_frame / pd["fps"] - start_t
                    sub = video.subclip(start_t, end_t)

                    def make_overlay(a=p1a, b=p2a, c=p1b, d=p2b, s=sct):
                        def fn(get_frame, t):
                            p1 = c if t >= s else a
                            p2 = d if t >= s else b
                            return draw_scoreboard(
                                get_frame(t),
                                pd.get("match_date",""), pd.get("tournament_name",""),
                                pd.get("level",""), pd.get("match_name",""),
                                pd.get("player1_name","1팀"), p1,
                                pd.get("player2_name","2팀"), p2,
                            )
                        return fn

                    clips.append(sub.fl(make_overlay()))
                    pct = 10 + int((i + 1) / total * 70)
                    _publish(export_id, pct, f"랠리 {i+1}/{total} 처리 중...")

                _publish(export_id, 82, "클립 합치는 중...")
                final = concatenate_videoclips(clips)
                _publish(export_id, 88, "영상 저장 중...")
                final.write_videofile(out, codec="libx264", audio_codec="aac",
                                      preset="ultrafast", threads=4, logger=None)
                final.close(); video.close()

                # 타임라인 txt
                txt_path = out.replace(".mp4", ".txt")
                txt = generate_timeline_txt(
                    rallies, pd["fps"],
                    pd.get("match_date",""), pd.get("tournament_name",""),
                    pd.get("level",""), pd.get("match_name",""),
                    pd.get("player1_name","1팀"), pd.get("player2_name","2팀"),
                )
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(txt)

        _publish(export_id, 10, "영상 처리 시작...")
        ProgressExporter()

        export.status = "done"
        export.output_path = output_path
        db.commit()

        # 내보내기 횟수 증가
        project = db.query(Project).get(export.project_id)
        if project:
            user = db.query(User).get(project.user_id)
            if user:
                user.export_count += 1
                db.commit()

        _publish(export_id, 100, "완료!", status="done")

    except Exception as e:
        export.status = "error"
        export.error_msg = str(e)
        db.commit()
        _publish(export_id, 0, str(e), status="error")
    finally:
        db.close()
