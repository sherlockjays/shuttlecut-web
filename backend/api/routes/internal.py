"""워커 전용 내부 API - 원본 영상 다운로드, 내보내기 결과 업로드 (공유 시크릿 인증)"""
import os
from pathlib import Path
from fastapi import APIRouter, Header, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

router = APIRouter()
STORAGE = Path(os.getenv("STORAGE_PATH", "/data/videos")).resolve()
WORKER_SECRET = os.getenv("WORKER_SECRET", "")
CHUNK = 1024 * 1024 * 4


def _check_secret(x_worker_secret: str | None):
    if not WORKER_SECRET or x_worker_secret != WORKER_SECRET:
        raise HTTPException(403)


def _resolve_under_storage(path: str) -> Path:
    p = Path(path).resolve()
    if p != STORAGE and STORAGE not in p.parents:
        raise HTTPException(400, "잘못된 경로입니다.")
    return p


@router.get("/video")
def download_video(path: str, x_worker_secret: str | None = Header(None)):
    """원본 영상 파일을 워커에 스트리밍 (path는 NAS 로컬 절대경로)"""
    _check_secret(x_worker_secret)
    p = _resolve_under_storage(path)
    if not p.exists():
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return FileResponse(p)


@router.post("/export/{export_id}")
async def upload_export(
    export_id: int,
    file: UploadFile = File(...),
    x_worker_secret: str | None = Header(None),
):
    """워커가 처리 완료한 내보내기 결과물을 NAS 로컬 저장소에 저장"""
    _check_secret(x_worker_secret)
    out_dir = STORAGE / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"export_{export_id}.mp4"
    with open(dest, "wb") as f:
        while chunk := await file.read(CHUNK):
            f.write(chunk)
    return {"path": str(dest)}
