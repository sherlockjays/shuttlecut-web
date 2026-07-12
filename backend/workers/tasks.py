"""Celery 작업 - 영상 내보내기"""
import os, json, redis, sys, time, subprocess, tempfile, logging
from concurrent.futures import ThreadPoolExecutor, as_completed

log = logging.getLogger(__name__)
sys.path.insert(0, "/app")
from pathlib import Path
from celery import Celery
from sqlalchemy.orm import Session

REDIS_URL      = os.getenv("REDIS_URL", "redis://redis:6379/0")
USE_GPU        = os.getenv("ENABLE_GPU", "0") == "1"
ENABLE_OPENCL  = os.getenv("ENABLE_OPENCL", "1") == "1"
ENABLE_NVDEC   = os.getenv("ENABLE_NVDEC", "1") == "1"
NAS_BACKEND_URL = os.getenv("NAS_BACKEND_URL", "")
WORKER_SECRET  = os.getenv("WORKER_SECRET", "")

celery = Celery("shuttlecut", broker=REDIS_URL, backend=REDIS_URL)
r = redis.from_url(REDIS_URL)


def _download_remote_video(video_path: str, tmpdir: str) -> str:
    """NAS 백엔드에서 영상 파일 HTTP 다운로드"""
    import httpx
    ext = Path(video_path).suffix or ".mp4"
    local_path = f"{tmpdir}/source{ext}"
    with httpx.stream(
        "GET", f"{NAS_BACKEND_URL}/api/internal/video",
        params={"path": video_path},
        headers={"X-Worker-Secret": WORKER_SECRET},
        timeout=300,
    ) as resp:
        resp.raise_for_status()
        with open(local_path, "wb") as f:
            for chunk in resp.iter_bytes(1024 * 1024 * 4):
                f.write(chunk)
    return local_path


def _upload_export_remote(local_path: str, export_id: int) -> str:
    """결과 mp4를 NAS 백엔드로 HTTP 업로드"""
    import httpx
    with open(local_path, "rb") as f:
        resp = httpx.post(
            f"{NAS_BACKEND_URL}/api/internal/export/{export_id}",
            headers={"X-Worker-Secret": WORKER_SECRET},
            files={"file": (f"export_{export_id}.mp4", f, "video/mp4")},
            timeout=600,
        )
    resp.raise_for_status()
    return resp.json()["path"]


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


# HLG→SDR tonemap 필터 체인 (CPU fallback)
_HLG_TONEMAP_VF = (
    "zscale=tin=arib-std-b67:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100,"
    "format=gbrpf32le,"
    "zscale=p=bt709,"
    "tonemap=hable:desat=0,"
    "zscale=t=bt709:m=bt709:r=tv,"
    "format=yuv420p"
)
_SDR_COLOR_FLAGS = ["-color_range", "tv", "-colorspace", "bt709",
                    "-color_primaries", "bt709", "-color_trc", "bt709"]


def _build_step1_cmd(i, rally, fps, duration, video_path, is_hlg, is_hdr, use_gpu, tmpdir, tail):
    """Step 1: 랠리 클립 추출 ffmpeg 명령 빌드"""
    start_t  = rally.start_frame / fps
    end_t    = min(rally.end_frame / fps + tail, duration)
    clip_dur = end_t - start_t
    raw_path = f"{tmpdir}/raw{i:04d}.mp4"

    if is_hlg:
        if use_gpu and ENABLE_OPENCL:
            # OpenCL tonemap: GPU에서 HLG→SDR 변환
            cmd = ["ffmpeg", "-y",
                   "-init_hw_device", "opencl=gpu:0.0",
                   "-filter_hw_device", "gpu",
                   "-ss", str(start_t), "-t", str(clip_dur), "-i", video_path,
                   "-map", "0:v:0", "-map", "0:a:0?",
                   "-vf", ("format=p010le,hwupload"
                           ",tonemap_opencl=tonemap=hable:format=nv12:desat=0"
                           ",hwdownload,format=nv12"),
                   "-c:v", "h264_nvenc", "-preset", "p1", "-qp", "18"]
            cmd += _SDR_COLOR_FLAGS + ["-c:a", "aac", "-avoid_negative_ts", "make_zero", raw_path]
        else:
            # CPU tonemap (WSL2 등 OpenCL 미지원 환경)
            enc = (["-c:v", "h264_nvenc", "-preset", "p1", "-qp", "18"] if use_gpu
                   else ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "18"])
            cmd = (["ffmpeg", "-y", "-threads", "1",
                    "-ss", str(start_t), "-t", str(clip_dur), "-i", video_path,
                    "-map", "0:v:0", "-map", "0:a:0?",
                    "-vf", _HLG_TONEMAP_VF]
                   + enc
                   + _SDR_COLOR_FLAGS
                   + ["-c:a", "aac", "-avoid_negative_ts", "make_zero", raw_path])
    elif is_hdr:
        enc = (["-c:v", "h264_nvenc", "-preset", "p1", "-qp", "18"] if use_gpu
               else ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "18"])
        cmd = (["ffmpeg", "-y",
                "-ss", str(start_t), "-t", str(clip_dur), "-i", video_path,
                "-map", "0:v:0", "-map", "0:a:0?",
                "-vf", "colorspace=bt709:iall=bt2020:fast=1,format=yuv420p"]
               + enc
               + ["-c:a", "aac", "-avoid_negative_ts", "make_zero", raw_path])
    else:  # SDR
        hwaccel = ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"] if (use_gpu and ENABLE_NVDEC) else []
        if use_gpu:
            cmd = ["ffmpeg", "-y"] + hwaccel + [
                   "-ss", str(start_t), "-t", str(clip_dur), "-i", video_path,
                   "-map", "0:v:0", "-map", "0:a:0?",
                   "-c:v", "h264_nvenc", "-preset", "p1", "-qp", "18",
                   "-c:a", "aac", "-avoid_negative_ts", "make_zero", raw_path]
        else:
            cmd = ["ffmpeg", "-y",
                   "-ss", str(start_t), "-t", str(clip_dur), "-i", video_path,
                   "-map", "0:v:0", "-map", "0:a:0?",
                   "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
                   "-c:a", "aac", "-avoid_negative_ts", "make_zero", raw_path]

    return cmd, raw_path


def _run_ffmpeg_export(export_id: int, rallies, pd: dict, out: str, start_time: float):
    """두 단계 처리: NAS 1회 다운로드 → 병렬 클립 추출 → 오버레이+인코딩 1회"""
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
        # NAS HTTP 다운로드 (워커 로컬에 캐시)
        if NAS_BACKEND_URL:
            _publish(export_id, 12, "영상 다운로드 중...", eta=None)
            t0 = time.time()
            video_path = _download_remote_video(video_path, tmpdir)
            log.warning(f"[TIMING] NAS 다운로드: {time.time()-t0:.1f}s")

        t0 = time.time()
        duration = _probe_duration(video_path)
        log.warning(f"[TIMING] ffprobe duration: {time.time()-t0:.1f}s")

        # 소스 색공간 확인
        probe_cs = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", video_path],
            capture_output=True, text=True,
        )
        cs_streams = json.loads(probe_cs.stdout).get("streams", [])
        cs_video = next((s for s in cs_streams if s.get("codec_type") == "video"), {})
        color_trc = cs_video.get("color_transfer", "")
        color_primaries = cs_video.get("color_primaries", "")
        is_hlg = color_trc == "arib-std-b67"
        is_hdr = color_primaries in ("bt2020", "bt2020nc") or is_hlg

        if is_hlg:
            hlg_chain = ""  # Step1에서 SDR 변환 완료
        elif is_hdr:
            hlg_chain = "colorspace=bt709:iall=bt2020:fast=1,format=yuv420p,"
        else:
            hlg_chain = ""

        max_workers = 8

        jobs = []
        for i, rally in enumerate(rallies):
            cmd, raw_path = _build_step1_cmd(
                i, rally, fps, duration, video_path, is_hlg, is_hdr, USE_GPU, tmpdir, TAIL
            )
            sct = rally.end_frame / fps - rally.start_frame / fps
            jobs.append((i, cmd, raw_path, sct))

        raw_clips = [None] * total
        clip_scts = [None] * total
        done_count = 0

        def _run_clip(job):
            idx, cmd, raw_path, sct = job
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"클립 {idx} 추출 실패:\n{res.stderr[-1000:]}")
            return idx, raw_path, sct

        t0 = time.time()
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_run_clip, job): job[0] for job in jobs}
            for fut in as_completed(futures):
                idx, raw_path, sct = fut.result()
                raw_clips[idx] = raw_path
                clip_scts[idx] = sct
                done_count += 1
                pct = 20 + int(done_count / total * 40)
                _publish(export_id, pct, f"클립 {done_count}/{total} 추출 중...", eta=_calc_eta(pct, start_time))
        log.warning(f"[TIMING] Step1 클립추출 ({total}개, workers={max_workers}): {time.time()-t0:.1f}s")

        if is_hlg:
            hlg_chain = ""

        # ── 클립 연결 (스트림 복사) ──
        _publish(export_id, 62, "클립 연결 중...", eta=_calc_eta(62, start_time))
        concat_txt = f"{tmpdir}/concat.txt"
        with open(concat_txt, "w") as f:
            for rp in raw_clips:
                f.write(f"file '{rp}'\n")

        t0 = time.time()
        raw_concat = f"{tmpdir}/raw_concat.mp4"
        result = subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", concat_txt, "-c", "copy", raw_concat,
        ], capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"클립 연결 실패:\n{result.stderr[-1000:]}")
        log.warning(f"[TIMING] Concat: {time.time()-t0:.1f}s")

        t0 = time.time()
        abs_timings = []
        t = 0.0
        for i, sct in enumerate(clip_scts):
            clip_dur = _probe_duration(raw_clips[i])
            abs_timings.append((t, t + sct, t + clip_dur))
            t += clip_dur
        log.warning(f"[TIMING] 클립 ffprobe ({total}개): {time.time()-t0:.1f}s")

        # ── 점수판 PNG 생성 ──
        _publish(export_id, 68, "점수판 생성 중...", eta=_calc_eta(68, start_time))
        t0 = time.time()
        for i, rally in enumerate(rallies):
            p1a, p2a = rally.p1_score, rally.p2_score
            p1b = p1a + 1 if rally.winner == 1 else p1a
            p2b = p2a + 1 if rally.winner == 2 else p2a
            make_scoreboard_image(date, tournament, level, match_name, p1n, p1a, p2n, p2a, scale, theme).save(f"{tmpdir}/r{i}_before.png")
            make_scoreboard_image(date, tournament, level, match_name, p1n, p1b, p2n, p2b, scale, theme).save(f"{tmpdir}/r{i}_after.png")
        log.warning(f"[TIMING] 점수판 PNG 생성 ({total}개): {time.time()-t0:.1f}s")

        # ── 2단계: 오버레이 + 인코딩 1회 ──
        _publish(export_id, 72, "영상 인코딩 중...", eta=_calc_eta(72, start_time))

        step2_hw = ["-hwaccel", "cuda"] if (USE_GPU and ENABLE_NVDEC) else []
        cmd = ["ffmpeg", "-y"] + step2_hw + ["-i", raw_concat]
        for i in range(total):
            cmd += ["-i", f"{tmpdir}/r{i}_before.png", "-i", f"{tmpdir}/r{i}_after.png"]

        parts = [f"[0:v]{hlg_chain}scale=w=-2:h=min(ih\\,1080)[sv]"]
        cur = "sv"
        for i, (abs_start, abs_sct, abs_end) in enumerate(abs_timings):
            bi = 1 + i * 2
            ai = 2 + i * 2
            ob = f"ob{i}"
            oa = f"oa{i}"
            parts.append(f"[{cur}][{bi}:v]overlay=x={ox}:y={oy}:enable='between(t,{abs_start:.3f},{abs_sct:.3f})'[{ob}]")
            parts.append(f"[{ob}][{ai}:v]overlay=x={ox}:y={oy}:enable='between(t,{abs_sct:.3f},{abs_end:.3f})'[{oa}]")
            cur = oa

        fc = ";".join(parts)

        probe_audio = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", raw_concat],
            capture_output=True, text=True, check=True,
        )
        has_audio = any(s.get("codec_type") == "audio" for s in json.loads(probe_audio.stdout)["streams"])

        cmd += ["-filter_complex", fc, "-map", f"[{cur}]"]
        if has_audio:
            cmd += ["-map", "0:a:0?", "-c:a", "aac"]
        color_flags = ["-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]
        if USE_GPU:
            cmd += ["-c:v", "h264_nvenc", "-preset", "p1", "-cq", "22", "-r", "60", "-pix_fmt", "yuv420p"] + color_flags + [out]
        else:
            cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-r", "60", "-pix_fmt", "yuv420p"] + color_flags + [out]

        t0 = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg 인코딩 실패:\n{result.stderr[-3000:]}")
        log.warning(f"[TIMING] Step2 인코딩: {time.time()-t0:.1f}s")

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

        if NAS_BACKEND_URL:
            _publish(export_id, 98, "NAS 업로드 중...", eta=None)
            output_path = _upload_export_remote(output_path, export_id)

        export.status = "done"
        export.output_path = output_path
        db.commit()

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
