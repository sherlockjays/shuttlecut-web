"""Celery 작업 - 영상 내보내기"""
import os, json, redis, sys, time, subprocess, tempfile
sys.path.insert(0, "/app")
from pathlib import Path
from celery import Celery
from sqlalchemy.orm import Session

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
celery = Celery("shuttlecut", broker=REDIS_URL, backend=REDIS_URL)
r = redis.from_url(REDIS_URL)


def _publish(export_id: int, pct: int, msg: str, status: str = "processing", eta: int | None = None):
    payload = {"pct": pct, "msg": msg, "status": status}
    if eta is not None:
        payload["eta"] = eta
    r.publish(f"export_progress:{export_id}", json.dumps(payload))


def _calc_eta(pct: int, start_time: float) -> int | None:
    if pct <= 5:
        return None
    elapsed = time.time() - start_time
    remaining = elapsed / (pct / 100) - elapsed
    return max(0, int(remaining))


def _run_ffmpeg_export(export_id: int, rallies, pd: dict, out: str, start_time: float):
    """ffmpeg native overlay로 영상 처리 (매 프레임 Python 처리 없음)"""
    from core.exporter import make_scoreboard_image, generate_timeline_txt

    video_path = pd["video_path"]
    fps        = pd["fps"]
    scale      = pd.get("scoreboard_scale", 1.0)
    theme      = pd.get("scoreboard_theme", "dark")
    ox         = int(11 * max(0.5, min(2.0, scale)))
    oy         = int(11 * max(0.5, min(2.0, scale)))
    TAIL       = 1.5
    total      = len(rallies)
    date       = pd.get("match_date", "")
    tournament = pd.get("tournament_name", "")
    level      = pd.get("level", "")
    match_name = pd.get("match_name", "")
    p1n        = pd.get("player1_name", "1팀")
    p2n        = pd.get("player2_name", "2팀")

    # 영상 길이 조회
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path],
        capture_output=True, text=True, check=True,
    )
    duration = float(json.loads(probe.stdout)["format"]["duration"])

    with tempfile.TemporaryDirectory() as tmpdir:
        clip_files = []

        for i, rally in enumerate(rallies):
            start_t  = rally.start_frame / fps
            end_t    = min(rally.end_frame / fps + TAIL, duration)
            clip_dur = end_t - start_t
            sct      = rally.end_frame / fps - start_t  # 클립 내 점수 변경 시각

            p1a, p2a = rally.p1_score, rally.p2_score
            p1b = p1a + 1 if rally.winner == 1 else p1a
            p2b = p2a + 1 if rally.winner == 2 else p2a

            before_path = f"{tmpdir}/r{i}_before.png"
            after_path  = f"{tmpdir}/r{i}_after.png"
            make_scoreboard_image(date, tournament, level, match_name, p1n, p1a, p2n, p2a, scale, theme).save(before_path)
            make_scoreboard_image(date, tournament, level, match_name, p1n, p1b, p2n, p2b, scale, theme).save(after_path)

            clip_path = f"{tmpdir}/clip{i:04d}.mp4"
            fc = (
                f"[0:v][1:v]overlay=x={ox}:y={oy}:enable='lt(t,{sct:.3f})'[v1];"
                f"[v1][2:v]overlay=x={ox}:y={oy}:enable='gte(t,{sct:.3f})'[vout]"
            )
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(start_t), "-t", str(clip_dur), "-i", video_path,
                "-i", before_path, "-i", after_path,
                "-filter_complex", fc,
                "-map", "[vout]", "-map", "0:a:0?",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
                "-c:a", "aac", "-threads", "0",
                clip_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg 클립 {i} 실패:\n{result.stderr[-2000:]}")
            clip_files.append(clip_path)

            pct = 10 + int((i + 1) / total * 75)
            _publish(export_id, pct, f"랠리 {i+1}/{total} 처리 중...", eta=_calc_eta(pct, start_time))

        _publish(export_id, 87, "클립 합치는 중...", eta=_calc_eta(87, start_time))
        concat_list = f"{tmpdir}/concat.txt"
        with open(concat_list, "w") as f:
            for cp in clip_files:
                f.write(f"file '{cp}'\n")

        result = subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", concat_list, "-c", "copy", out,
        ], capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg concat 실패:\n{result.stderr[-2000:]}")

    txt_path = out.replace(".mp4", ".txt")
    txt = generate_timeline_txt(rallies, fps, date, tournament, level, match_name, p1n, p2n)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(txt)


@celery.task
def run_export(export_id: int, project_data: dict):
    from models.database import SessionLocal, Export, User, Project
    from core.rally_manager import Rally

    db: Session = SessionLocal()
    export = db.query(Export).get(export_id)

    try:
        export.status = "processing"
        db.commit()
        _start = time.time()
        _publish(export_id, 5, "내보내기 시작...")

        rallies = [
            Rally(r[0], r[1], r[2], r[3], r[4] if len(r) > 4 else 0)
            for r in (project_data.get("rallies") or [])
        ]

        output_dir = Path(os.getenv("STORAGE_PATH", "/data/videos")) / "exports"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(output_dir / f"export_{export_id}.mp4")

        _publish(export_id, 10, "영상 처리 시작...", eta=None)
        _run_ffmpeg_export(export_id, rallies, project_data, output_path, _start)

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


@celery.task
def upload_to_youtube(export_id: int):
    """완료된 내보내기를 YouTube에 업로드"""
    from models.database import SessionLocal, Export, Project, User
    from core.youtube_uploader import get_youtube_service, upload_video

    db: Session = SessionLocal()
    export = db.query(Export).get(export_id)

    try:
        project = db.query(Project).get(export.project_id)
        user = db.query(User).get(project.user_id)

        if not user.youtube_refresh_token:
            raise Exception("YouTube 계정이 연결되지 않았습니다.")

        youtube = get_youtube_service(user.youtube_refresh_token)

        title_parts = [p for p in [
            project.match_date, project.tournament_name, project.match_name
        ] if p]
        title = " ".join(title_parts) or project.title or "ShuttleCut 내보내기"

        description = f"{project.player1_name} vs {project.player2_name}\n"
        if project.level:
            description += f"급수: {project.level}\n"
        description += "\n#배드민턴 #ShuttleCut #badminton"

        youtube_url = upload_video(youtube, export.output_path, title, description)

        export.youtube_url = youtube_url
        db.commit()

    except Exception as e:
        export.youtube_url = None  # 재시도 가능하도록 초기화
        db.commit()
        raise e
    finally:
        db.close()
