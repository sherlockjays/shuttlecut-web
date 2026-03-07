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


def _probe_duration(path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def _run_ffmpeg_export(export_id: int, rallies, pd: dict, out: str, start_time: float):
    """두 단계 처리: 1) 스트림 복사로 클립 추출 (빠름) 2) 오버레이+인코딩 1회"""
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

    duration = _probe_duration(video_path)

    with tempfile.TemporaryDirectory() as tmpdir:

        # ── 1단계: 스트림 복사로 클립 추출 (인코딩 없음, 매우 빠름) ──
        raw_clips = []
        clip_scts = []  # 각 클립 내 점수 변경 시각

        for i, rally in enumerate(rallies):
            start_t  = rally.start_frame / fps
            end_t    = min(rally.end_frame / fps + TAIL, duration)
            clip_dur = end_t - start_t
            sct      = rally.end_frame / fps - start_t

            raw_path = f"{tmpdir}/raw{i:04d}.mp4"
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(start_t), "-t", str(clip_dur),
                "-i", video_path,
                "-map", "0:v:0", "-map", "0:a:0?",
                "-c:v", "copy", "-c:a", "copy",
                "-avoid_negative_ts", "make_zero",
                raw_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"클립 {i} 추출 실패:\n{result.stderr[-1000:]}")

            raw_clips.append(raw_path)
            clip_scts.append(sct)

            pct = 10 + int((i + 1) / total * 40)
            _publish(export_id, pct, f"클립 {i+1}/{total} 추출 중...", eta=_calc_eta(pct, start_time))

        # ── 클립 연결 (스트림 복사) ──
        _publish(export_id, 52, "클립 연결 중...", eta=_calc_eta(52, start_time))
        concat_txt = f"{tmpdir}/concat.txt"
        with open(concat_txt, "w") as f:
            for rp in raw_clips:
                f.write(f"file '{rp}'\n")

        raw_concat = f"{tmpdir}/raw_concat.mp4"
        result = subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", concat_txt, "-c", "copy", raw_concat,
        ], capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"클립 연결 실패:\n{result.stderr[-1000:]}")

        # ── 각 클립의 실제 구간 계산 (concat 후 절대 시각) ──
        abs_timings = []
        t = 0.0
        for i, sct in enumerate(clip_scts):
            clip_dur = _probe_duration(raw_clips[i])
            abs_timings.append((t, t + sct, t + clip_dur))
            t += clip_dur

        # ── 점수판 PNG 생성 ──
        _publish(export_id, 58, "점수판 생성 중...", eta=_calc_eta(58, start_time))
        for i, rally in enumerate(rallies):
            p1a, p2a = rally.p1_score, rally.p2_score
            p1b = p1a + 1 if rally.winner == 1 else p1a
            p2b = p2a + 1 if rally.winner == 2 else p2a
            make_scoreboard_image(date, tournament, level, match_name, p1n, p1a, p2n, p2a, scale, theme).save(f"{tmpdir}/r{i}_before.png")
            make_scoreboard_image(date, tournament, level, match_name, p1n, p1b, p2n, p2b, scale, theme).save(f"{tmpdir}/r{i}_after.png")

        # ── 2단계: 오버레이 + 인코딩 1회 ──
        _publish(export_id, 62, "영상 인코딩 중...", eta=_calc_eta(62, start_time))

        # 입력: raw_concat + 각 랠리별 before/after PNG
        cmd = ["ffmpeg", "-y", "-i", raw_concat]
        for i in range(total):
            cmd += ["-i", f"{tmpdir}/r{i}_before.png", "-i", f"{tmpdir}/r{i}_after.png"]

        # filter_complex: 오버레이를 체인으로 연결 (before: between start~sct, after: between sct~end)
        parts = []
        cur = "0:v"
        for i, (abs_start, abs_sct, abs_end) in enumerate(abs_timings):
            bi = 1 + i * 2
            ai = 2 + i * 2
            ob = f"ob{i}"
            oa = f"oa{i}"
            parts.append(f"[{cur}][{bi}:v]overlay=x={ox}:y={oy}:enable='between(t,{abs_start:.3f},{abs_sct:.3f})'[{ob}]")
            parts.append(f"[{ob}][{ai}:v]overlay=x={ox}:y={oy}:enable='between(t,{abs_sct:.3f},{abs_end:.3f})'[{oa}]")
            cur = oa

        fc = ";".join(parts)

        # 오디오 여부 확인
        probe_audio = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", raw_concat],
            capture_output=True, text=True, check=True,
        )
        has_audio = any(s.get("codec_type") == "audio" for s in json.loads(probe_audio.stdout)["streams"])

        cmd += ["-filter_complex", fc, "-map", f"[{cur}]"]
        if has_audio:
            cmd += ["-map", "0:a:0?", "-c:a", "aac"]
        cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-r", "30", out]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg 인코딩 실패:\n{result.stderr[-3000:]}")

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
