"""영상 업로드 & 스트리밍"""
import os, uuid, aiofiles
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from models.database import get_db, User
from api.routes.auth import current_user

router = APIRouter()
STORAGE = Path(os.getenv("STORAGE_PATH", "/data/videos"))
CHUNK = 1024 * 1024  # 1MB


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in {".mp4", ".avi", ".mov", ".mkv"}:
        raise HTTPException(400, "지원하지 않는 파일 형식입니다.")

    user_dir = STORAGE / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    video_id = uuid.uuid4().hex
    dest = user_dir / f"{video_id}{ext}"

    async with aiofiles.open(dest, "wb") as f:
        while chunk := await file.read(CHUNK * 4):
            await f.write(chunk)

    return {"video_id": video_id, "path": str(dest), "filename": file.filename}


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
    # 파일 탐색
    user_dir = STORAGE / str(user.id)
    matches = list(user_dir.glob(f"{video_id}.*"))
    if not matches:
        raise HTTPException(404, "영상을 찾을 수 없습니다.")
    path = matches[0]
    size = path.stat().st_size

    # Range 헤더 처리 (브라우저 시킹 지원)
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
