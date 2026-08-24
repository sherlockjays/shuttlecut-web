"""영상 업로드 & 스트리밍"""
import os, uuid, aiofiles, subprocess, json, threading
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from models.database import get_db, User
from api.routes.auth import current_user

router = APIRouter()
STORAGE = Path(os.getenv("STORAGE_PATH", "/data/videos"))
CHUNK = 1024 * 1024  # 1MB

_preview_generating: set[str] = set()

def _create_preview(src: str, dst: str, video_id: str):
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", src,
            "-vf", "scale=1280:-2",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
            "-c:a", "aac", "-ac", "2",
            "-movflags", "+faststart",
            dst,
        ], capture_output=True)
    finally:
        _preview_generating.discard(video_id)


def _probe_video(path: str) -> dict:
    """ffprobe로 fps, total_frames 감지"""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path],
            capture_output=True, text=True, timeout=30,
        )
        video = next(
            (s for s in json.loads(result.stdout).get("streams", []) if s.get("codec_type") == "video"),
            None,
        )
        if not video:
            return {"fps": 30.0, "total_frames": 0}
        num, den = video.get("r_frame_rate", "30/1").split("/")
        fps = round(float(num) / max(float(den), 1), 3)
        frames = int(video.get("nb_frames") or 0)
        return {"fps": fps, "total_frames": frames}
    except Exception:
        return {"fps": 30.0, "total_frames": 0}


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in {".mp4", ".avi", ".mov", ".mkv"}:
        raise HTTPException(400, "지원하지 않는 파일 형식입니다.")

    video_id = uuid.uuid4().hex
    user_dir = STORAGE / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    dest = user_dir / f"{video_id}{ext}"
    async with aiofiles.open(dest, "wb") as f:
        while chunk := await file.read(CHUNK * 4):
            await f.write(chunk)
    path = str(dest)
    probe = _probe_video(path)

    preview_path = str(user_dir / f"{video_id}_preview.mp4")
    _preview_generating.add(video_id)
    threading.Thread(target=_create_preview, args=(path, preview_path, video_id), daemon=True).start()

    return {"video_id": video_id, "path": path, "filename": file.filename,
            "fps": probe["fps"], "total_frames": probe["total_frames"]}


def stream_user(token: str = None, db: Session = Depends(get_db)) -> User:
    from jose import jwt, JWTError
    from api.routes.auth import SECRET_KEY, ALGORITHM
    if not token:
        raise HTTPException(status_code=401)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user = db.query(User).get(int(payload["sub"]))
        if not user:
            raise HTTPException(status_code=401)
        return user
    except JWTError:
        raise HTTPException(status_code=401)


@router.get("/preview-status/{video_id}")
async def preview_status(video_id: str, user: User = Depends(stream_user)):
    user_dir = STORAGE / str(user.id)
    if (user_dir / f"{video_id}_preview.mp4").exists():
        return {"status": "ready"}
    if video_id in _preview_generating:
        return {"status": "processing"}
    # 기존 영상에 대해 최초 요청 시 생성 시작
    matches = list(user_dir.glob(f"{video_id}.*"))
    src = next((m for m in matches if "_preview" not in m.name), None)
    if src:
        preview_path = str(user_dir / f"{video_id}_preview.mp4")
        _preview_generating.add(video_id)
        threading.Thread(target=_create_preview, args=(str(src), preview_path, video_id), daemon=True).start()
        return {"status": "processing"}
    return {"status": "not_found"}


@router.get("/preview/{video_id}")
async def preview_video(video_id: str, request: Request, user: User = Depends(stream_user)):
    user_dir = STORAGE / str(user.id)
    path = user_dir / f"{video_id}_preview.mp4"
    if not path.exists():
        raise HTTPException(404, "프리뷰 생성 중")
    size = path.stat().st_size
    range_header = request.headers.get("range")
    if range_header:
        start, end = range_header.replace("bytes=", "").split("-")
        start = int(start); end = int(end) if end else size - 1
    else:
        start, end = 0, size - 1
    length = end - start + 1

    async def iter_file():
        async with aiofiles.open(path, "rb") as f:
            await f.seek(start)
            remaining = length
            while remaining:
                data = await f.read(min(CHUNK, remaining))
                if not data: break
                yield data
                remaining -= len(data)

    return StreamingResponse(iter_file(),
        status_code=206 if range_header else 200,
        media_type="video/mp4",
        headers={"Content-Range": f"bytes {start}-{end}/{size}",
                 "Accept-Ranges": "bytes", "Content-Length": str(length)})


@router.get("/stream/{video_id}")
async def stream_video(video_id: str, request: Request, user: User = Depends(stream_user)):
    user_dir = STORAGE / str(user.id)
    matches = list(user_dir.glob(f"{video_id}.*"))
    if not matches:
        raise HTTPException(404, "영상을 찾을 수 없습니다.")
    path = matches[0]
    size = path.stat().st_size

    range_header = request.headers.get("range")
    if range_header:
        start, end = range_header.replace("bytes=", "").split("-")
        start = int(start)
        end = int(end) if end else size - 1
    else:
        start, end = 0, size - 1

    length = end - start + 1

    async def iter_file():
        async with aiofiles.open(path, "rb") as f:
            await f.seek(start)
            remaining = length
            while remaining:
                data = await f.read(min(CHUNK, remaining))
                if not data:
                    break
                yield data
                remaining -= len(data)

    headers = {
        "Content-Range": f"bytes {start}-{end}/{size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
    }
    return StreamingResponse(
        iter_file(),
        status_code=206 if range_header else 200,
        media_type="video/mp4",
        headers=headers,
    )
