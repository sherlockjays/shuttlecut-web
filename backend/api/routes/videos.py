"""영상 업로드 & 스트리밍"""
import os, uuid, aiofiles, subprocess, json, tempfile
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.database import get_db, User
from api.routes.auth import current_user

router = APIRouter()
STORAGE = Path(os.getenv("STORAGE_PATH", "/data/videos"))
GCS_BUCKET = os.getenv("GCS_BUCKET", "")
CHUNK = 1024 * 1024  # 1MB

CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
}


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


def _gcs_client():
    from google.cloud import storage as gcs_storage
    key_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if key_file:
        return gcs_storage.Client.from_service_account_json(key_file)
    return gcs_storage.Client()


def _gcs_signed_url(blob_name: str) -> str:
    from google.oauth2 import service_account
    from google.cloud import storage as gcs_storage
    key_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    creds = service_account.Credentials.from_service_account_file(key_file)
    client = gcs_storage.Client(credentials=creds)
    blob = client.bucket(GCS_BUCKET).blob(blob_name)
    return blob.generate_signed_url(expiration=3600, method="GET", version="v4")


@router.get("/upload-url")
def get_upload_url(filename: str, user: User = Depends(current_user)):
    """GCS 직접 업로드용 Signed URL 발급 + GPU VM 사전 시작"""
    if not GCS_BUCKET:
        raise HTTPException(501, "GCS 미설정")
    ext = Path(filename).suffix.lower()
    if ext not in {".mp4", ".avi", ".mov", ".mkv"}:
        raise HTTPException(400, "지원하지 않는 파일 형식입니다.")

    video_id = uuid.uuid4().hex
    blob_name = f"{user.id}/{video_id}{ext}"
    content_type = CONTENT_TYPES.get(ext, "video/mp4")

    from google.oauth2 import service_account
    from google.cloud import storage as gcs_storage
    key_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    creds = service_account.Credentials.from_service_account_file(key_file)
    client = gcs_storage.Client(credentials=creds)
    blob = client.bucket(GCS_BUCKET).blob(blob_name)
    upload_url = blob.generate_signed_url(
        expiration=3600, method="PUT", content_type=content_type, version="v4",
    )

    # GPU VM 사전 시작 (업로드하는 동안 켜두기)
    import threading
    from api.routes.export import _start_gpu_vm_if_needed
    threading.Thread(target=_start_gpu_vm_if_needed, daemon=True).start()

    return {"upload_url": upload_url, "blob_name": blob_name, "video_id": video_id, "content_type": content_type}


class ConfirmBody(BaseModel):
    blob_name: str
    video_id: str
    filename: str


@router.post("/confirm")
def confirm_upload(body: ConfirmBody, user: User = Depends(current_user)):
    """GCS 직접 업로드 완료 확인 + ffprobe 메타데이터 반환"""
    if not GCS_BUCKET:
        raise HTTPException(501, "GCS 미설정")
    signed_url = _gcs_signed_url(body.blob_name)
    probe = _probe_video(signed_url)
    return {
        "video_id": body.video_id,
        "path": f"gs://{GCS_BUCKET}/{body.blob_name}",
        "filename": body.filename,
        "fps": probe["fps"],
        "total_frames": probe["total_frames"],
    }


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in {".mp4", ".avi", ".mov", ".mkv"}:
        raise HTTPException(400, "지원하지 않는 파일 형식입니다.")

    video_id = uuid.uuid4().hex

    if GCS_BUCKET:
        blob_name = f"{user.id}/{video_id}{ext}"
        content = await file.read()
        # GCS 업로드 전 임시 파일로 ffprobe 실행
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        probe = _probe_video(tmp_path)
        Path(tmp_path).unlink(missing_ok=True)
        client = _gcs_client()
        blob = client.bucket(GCS_BUCKET).blob(blob_name)
        blob.upload_from_string(content, content_type=file.content_type or "video/mp4")
        path = f"gs://{GCS_BUCKET}/{blob_name}"
    else:
        user_dir = STORAGE / str(user.id)
        user_dir.mkdir(parents=True, exist_ok=True)
        dest = user_dir / f"{video_id}{ext}"
        async with aiofiles.open(dest, "wb") as f:
            while chunk := await file.read(CHUNK * 4):
                await f.write(chunk)
        path = str(dest)
        probe = _probe_video(path)

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


@router.get("/stream/{video_id}")
async def stream_video(video_id: str, request: Request, user: User = Depends(stream_user)):
    # GCS 우선 탐색
    if GCS_BUCKET:
        client = _gcs_client()
        blobs = list(client.bucket(GCS_BUCKET).list_blobs(prefix=f"{user.id}/{video_id}"))
        if blobs:
            signed_url = _gcs_signed_url(blobs[0].name)
            return RedirectResponse(signed_url)

    # 로컬 파일 탐색 (기존 영상 호환)
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
