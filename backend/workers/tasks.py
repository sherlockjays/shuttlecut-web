"""Celery 작업 - 영상 내보내기 (Single-pass: GCS 1회 다운로드 → trim/concat/overlay/인코딩 1회)"""
import os, json, redis, sys, time, subprocess, tempfile, logging
from concurrent.futures import ThreadPoolExecutor, as_completed

log = logging.getLogger(__name__)
sys.path.insert(0, "/app")
from pathlib import Path
from celery import Celery
from sqlalchemy.orm import Session

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
USE_GPU   = os.getenv("ENABLE_GPU", "0") == "1"
celery = Celery("shuttlecut", broker=REDIS_URL, backend=REDIS_URL)
r = redis.from_url(REDIS_URL)


def _stop_vm_if_idle():
    """큐가 비면 GCP 메타데이터 API로 VM self-stop (GPU VM에서만 동작)"""
    if not USE_GPU:
        return
    try:
        import requests as _req
        # Redis 큐 직접 확인 (inspect.active는 현재 태스크 자신을 포함해 부정확)
        if r.llen("celery") > 0:
            return  # 대기 중인 태스크 있음
        meta    = "http://metadata.google.internal/computeMetadata/v1"
        headers = {"Metadata-Flavor": "Google"}
        token   = _req.get(f"{meta}/instance/service-accounts/default/token", headers=headers, timeout=5).json()["access_token"]
        project = _req.get(f"{meta}/project/project-id",  headers=headers, timeout=5).text
        zone    = _req.get(f"{meta}/instance/zone",        headers=headers, timeout=5).text.split("/")[-1]
        name    = _req.get(f"{meta}/instance/name",        headers=headers, timeout=5).text
        _req.post(
            f"https://compute.googleapis.com/compute/v1/projects/{project}/zones/{zone}/instances/{name}/stop",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        log.info("VM self-stop 요청 완료")
    except Exception as e:
        log.warning(f"VM self-stop 실패: {e}")


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


def _gcs_client_from_env():
    from google.cloud import storage as gcs_storage
    key_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if key_file:
        return gcs_storage.Client.from_service_account_json(key_file)
    return gcs_storage.Client()


def _upload_export_to_gcs(local_path: str, export_id: int) -> str:
    """로컬 mp4를 GCS에 업로드하고 gs:// URI 반환"""
    bucket_name = os.getenv("GCS_BUCKET", "")
    if not bucket_name:
        return local_path
    blob_name = f"exports/export_{export_id}.mp4"
    client = _gcs_client_from_env()
    client.bucket(bucket_name).blob(blob_name).upload_from_filename(local_path)
    return f"gs://{bucket_name}/{blob_name}"


def _download_gcs_video(gcs_uri: str, tmpdir: str) -> str:
    """gs://bucket/blob_name 을 tmpdir에 다운로드하고 로컬 경로 반환"""
    from google.cloud import storage as gcs_storage
    key_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if key_file:
        client = gcs_storage.Client.from_service_account_json(key_file)
    else:
        client = gcs_storage.Client()
    without_prefix = gcs_uri[5:]  # strip "gs://"
    bucket_name, blob_name = without_prefix.split("/", 1)
    ext = Path(blob_name).suffix
    local_path = f"{tmpdir}/source{ext}"
    client.bucket(bucket_name).blob(blob_name).download_to_filename(local_path)
    return local_path


# HLG→SDR tonemap 필터 체인
_HLG_TONEMAP_VF = (
    "zscale=tin=arib-std-b67:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100,"
    "format=gbrpf32le,"
    "zscale=p=bt709,"
    "tonemap=hable:desat=0,"
    "zscale=t=bt709:m=bt709:r=tv,"
    "format=yuv420p"
)


def _run_ffmpeg_export(export_id: int, rallies, pd: dict, out: str, start_time: float):
    """Single-pass: GCS 1회 다운로드 → trim/concat/overlay/인코딩 1회.
    Step1(클립 개별 추출+인코딩) 완전 제거 → 처리 시간 5-7x 단축."""
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

    with tempfile.TemporaryDirectory() as tmpdir:
        # ── 영상 준비: GCS이면 로컬 다운로드 1회 ──
        if video_path.startswith("gs://"):
            _publish(export_id, 12, "영상 다운로드 중...", eta=None)
            t0 = time.time()
            video_path = _download_gcs_video(video_path, tmpdir)
            log.warning(f"[TIMING] GCS 다운로드: {time.time()-t0:.1f}s")

        t0 = time.time()
        duration = _probe_duration(video_path)
        log.warning(f"[TIMING] ffprobe duration: {time.time()-t0:.1f}s")

        # ── 색공간 + 오디오 감지 ──
        probe_cs = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", video_path],
            capture_output=True, text=True,
        )
        streams   = json.loads(probe_cs.stdout).get("streams", [])
        vid_st    = next((s for s in streams if s.get("codec_type") == "video"), {})
        color_trc = vid_st.get("color_transfer", "")
        color_primaries = vid_st.get("color_primaries", "")
        is_hlg    = color_trc == "arib-std-b67"
        is_hdr    = color_primaries in ("bt2020", "bt2020nc") or is_hlg
        has_audio = any(s.get("codec_type") == "audio" for s in streams)

        # ── 구간 타이밍 계산 (frame 기반, 클립별 ffprobe 불필요) ──
        # timings: (src_start, src_end, rally_dur, abs_start, abs_sct, abs_end)
        timings = []
        cum = 0.0
        for rally in rallies:
            s   = rally.start_frame / fps
            e   = min(rally.end_frame / fps + TAIL, duration)
            sct = (rally.end_frame - rally.start_frame) / fps
            seg = e - s
            timings.append((s, e, sct, cum, cum + sct, cum + seg))
            cum += seg

        # ── 점수판 PNG 생성 ──
        _publish(export_id, 20, "점수판 생성 중...", eta=None)
        t0 = time.time()
        for i, rally in enumerate(rallies):
            p1a, p2a = rally.p1_score, rally.p2_score
            p1b = p1a + 1 if rally.winner == 1 else p1a
            p2b = p2a + 1 if rally.winner == 2 else p2a
            make_scoreboard_image(date, tournament, level, match_name, p1n, p1a, p2n, p2a, scale, theme).save(f"{tmpdir}/r{i}_before.png")
            make_scoreboard_image(date, tournament, level, match_name, p1n, p1b, p2n, p2b, scale, theme).save(f"{tmpdir}/r{i}_after.png")
        log.warning(f"[TIMING] 점수판 PNG 생성 ({total}개): {time.time()-t0:.1f}s")

        # ── filter_complex 구성 ──
        parts = []

        # 구간 트림 (랠리 순서대로 forward seek)
        for i, (s, e, *_) in enumerate(timings):
            parts.append(f"[0:v]trim=start={s:.3f}:end={e:.3f},setpts=PTS-STARTPTS[v{i}]")
            if has_audio:
                parts.append(f"[0:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS[a{i}]")

        # concat
        if has_audio:
            ins = "".join(f"[v{i}][a{i}]" for i in range(total))
            parts.append(f"{ins}concat=n={total}:v=1:a=1[outv][outa]")
        else:
            ins = "".join(f"[v{i}]" for i in range(total))
            parts.append(f"{ins}concat=n={total}:v=1:a=0[outv]")

        # 색변환 + 1080p 스케일
        if is_hlg:
            color_chain = _HLG_TONEMAP_VF + ","
        elif is_hdr:
            color_chain = "colorspace=bt709:iall=bt2020:fast=1,format=yuv420p,"
        else:
            color_chain = ""
        parts.append(f"[outv]{color_chain}scale=w=-2:h=min(ih\\,1080)[sv]")

        # 오버레이 체인 (before PNG → after PNG)
        cur = "sv"
        for i, (_, _, _, abs_s, abs_sct, abs_e) in enumerate(timings):
            bi, ai = 1 + i * 2, 2 + i * 2
            ob, oa = f"ob{i}", f"oa{i}"
            parts.append(f"[{cur}][{bi}:v]overlay=x={ox}:y={oy}:enable='between(t,{abs_s:.3f},{abs_sct:.3f})'[{ob}]")
            parts.append(f"[{ob}][{ai}:v]overlay=x={ox}:y={oy}:enable='between(t,{abs_sct:.3f},{abs_e:.3f})'[{oa}]")
            cur = oa

        fc = ";".join(parts)

        # ── ffmpeg 명령 ──
        cmd = ["ffmpeg", "-y", "-i", video_path]
        for i in range(total):
            cmd += ["-i", f"{tmpdir}/r{i}_before.png", "-i", f"{tmpdir}/r{i}_after.png"]

        cmd += ["-filter_complex", fc, "-map", f"[{cur}]"]
        if has_audio:
            cmd += ["-map", "[outa]", "-c:a", "aac"]

        color_flags = ["-color_range", "tv", "-colorspace", "bt709",
                       "-color_primaries", "bt709", "-color_trc", "bt709"]
        if USE_GPU:
            cmd += ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "22",
                    "-r", "60", "-pix_fmt", "yuv420p"] + color_flags + [out]
        else:
            cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
                    "-r", "60", "-pix_fmt", "yuv420p"] + color_flags + [out]

        _publish(export_id, 40, "영상 인코딩 중...", eta=_calc_eta(40, start_time))
        t0 = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg 인코딩 실패:\n{result.stderr[-3000:]}")
        log.warning(f"[TIMING] Single-pass 인코딩: {time.time()-t0:.1f}s")

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

        # GCS_BUCKET 설정 시 결과물 GCS 업로드
        if os.getenv("GCS_BUCKET"):
            _publish(export_id, 98, "GCS 업로드 중...", eta=None)
            output_path = _upload_export_to_gcs(output_path, export_id)

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
        _stop_vm_if_idle()

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
            project.match_date, project.tournament_name, project.level, project.match_name
        ] if p]
        title = " ".join(title_parts) or project.title or "ShuttleCut 내보내기"

        description = f"{project.player1_name} vs {project.player2_name}\n"
        if project.level:
            description += f"급수: {project.level}\n"
        description += "\n#배드민턴 #ShuttleCut #badminton"

        video_path = export.output_path
        tmp_download = None
        if video_path.startswith("gs://"):
            import tempfile
            tmp_download = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            tmp_download.close()
            without_prefix = video_path[5:]
            bucket_name, blob_name = without_prefix.split("/", 1)
            _gcs_client_from_env().bucket(bucket_name).blob(blob_name).download_to_filename(tmp_download.name)
            video_path = tmp_download.name

        youtube_url = upload_video(youtube, video_path, title, description)

        if tmp_download:
            Path(tmp_download.name).unlink(missing_ok=True)

        export.youtube_url = youtube_url
        db.commit()

    except Exception as e:
        export.youtube_url = None  # 재시도 가능하도록 초기화
        db.commit()
        raise e
    finally:
        db.close()
