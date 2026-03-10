"""내보내기 - Celery 비동기 + WebSocket 진행률"""
import json
import os
from pathlib import Path
from fastapi import APIRouter, Depends, WebSocket, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from models.database import get_db, User, Project, Export
from api.routes.auth import current_user
from workers.tasks import run_export, upload_to_youtube

router = APIRouter()

PLAN_LIMITS = {"free": 3, "standard": 30, "club": 99999, "admin": 999999999}

GCP_PROJECT = os.getenv("GCP_PROJECT", "shuttlecut")
GCP_ZONE    = os.getenv("GCP_ZONE", "asia-northeast3-a")
GPU_VM_NAME = os.getenv("GPU_VM_NAME", "")


def _start_gpu_vm_if_needed():
    """Start GPU VM if terminated (runs in background thread)"""
    if not GPU_VM_NAME:
        return
    try:
        from google.cloud import compute_v1
        key_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        client = (
            compute_v1.InstancesClient.from_service_account_json(key_file)
            if key_file else compute_v1.InstancesClient()
        )
        inst = client.get(project=GCP_PROJECT, zone=GCP_ZONE, instance=GPU_VM_NAME)
        if inst.status == "TERMINATED":
            client.start(project=GCP_PROJECT, zone=GCP_ZONE, instance=GPU_VM_NAME)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"GPU VM start failed: {e}")


@router.get("/")
def list_exports(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """내 내보내기 히스토리 목록"""
    result = (
        db.query(Export)
        .join(Project)
        .filter(Project.user_id == user.id)
        .order_by(Export.created_at.desc())
        .all()
    )
    return [
        {
            "id": e.id,
            "project_id": e.project_id,
            "project_title": e.project.title,
            "status": e.status,
            "youtube_url": e.youtube_url,
            "error_msg": e.error_msg,
            "created_at": (e.created_at.isoformat() + "+00:00") if e.created_at else None,
        }
        for e in result
    ]


@router.post("/{project_id}")
def start_export(
    project_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # 요금제 제한 확인
    limit = PLAN_LIMITS.get(user.plan, 3)
    if user.export_count >= limit:
        raise HTTPException(403, f"이번 달 내보내기 한도({limit}회)에 도달했습니다.")

    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == user.id
    ).first()
    if not project:
        raise HTTPException(404)

    export = Export(project_id=project.id, status="pending")
    db.add(export); db.commit(); db.refresh(export)

    # GPU VM 켜기 (꺼져 있으면, non-blocking)
    import threading
    threading.Thread(target=_start_gpu_vm_if_needed, daemon=True).start()

    # Celery 작업 시작
    project_data = {
        "id": project.id,
        "video_path": project.video_path,
        "fps": project.fps,
        "total_frames": project.total_frames,
        "match_date": project.match_date,
        "tournament_name": project.tournament_name,
        "level": project.level,
        "match_name": project.match_name,
        "player1_name": project.player1_name,
        "player2_name": project.player2_name,
        "player1_score": project.player1_score,
        "player2_score": project.player2_score,
        "rallies": project.rallies,
        "scoreboard_scale": project.scoreboard_scale,
        "scoreboard_theme": project.scoreboard_theme,
    }
    run_export.delay(export.id, project_data)

    return {"export_id": export.id}


@router.get("/{export_id}/status")
def export_status(export_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    export = db.query(Export).join(Project).filter(
        Export.id == export_id, Project.user_id == user.id
    ).first()
    if not export:
        raise HTTPException(404)
    return {
        "status": export.status,
        "output_path": export.output_path,
        "youtube_url": export.youtube_url,
        "error_msg": export.error_msg,
    }


def _gcs_signed_url(gcs_uri: str, attachment_name: str) -> str:
    from google.cloud import storage as gcs_storage
    from google.oauth2 import service_account
    key_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    creds = service_account.Credentials.from_service_account_file(key_file)
    without_prefix = gcs_uri[5:]
    bucket_name, blob_name = without_prefix.split("/", 1)
    client = gcs_storage.Client(credentials=creds)
    blob = client.bucket(bucket_name).blob(blob_name)
    return blob.generate_signed_url(
        expiration=3600, method="GET", version="v4",
        response_disposition=f'attachment; filename="{attachment_name}"',
    )


@router.get("/{export_id}/download")
def download_export(export_id: int, token: str | None = None, db: Session = Depends(get_db)):
    from fastapi.responses import RedirectResponse
    from jose import jwt, JWTError
    SECRET_KEY = os.getenv("SECRET_KEY", "changeme")
    try:
        payload = jwt.decode(token or "", SECRET_KEY, algorithms=["HS256"])
        user = db.query(User).get(int(payload["sub"]))
        if not user:
            raise HTTPException(401)
    except (JWTError, Exception):
        raise HTTPException(401)

    export = db.query(Export).join(Project).filter(
        Export.id == export_id, Project.user_id == user.id
    ).first()
    if not export:
        raise HTTPException(404)
    if export.status != "done" or not export.output_path:
        raise HTTPException(400, "아직 완료되지 않은 내보내기입니다.")

    filename = f"export_{export_id}.mp4"
    if export.output_path.startswith("gs://"):
        return RedirectResponse(_gcs_signed_url(export.output_path, filename))
    if not Path(export.output_path).exists():
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return FileResponse(export.output_path, media_type="video/mp4", filename=filename)


@router.post("/{export_id}/youtube")
def start_youtube_upload(
    export_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """완료된 내보내기를 YouTube에 업로드"""
    if not user.youtube_refresh_token:
        raise HTTPException(400, "YouTube 계정이 연결되지 않았습니다.")

    export = db.query(Export).join(Project).filter(
        Export.id == export_id, Project.user_id == user.id
    ).first()
    if not export:
        raise HTTPException(404)
    if export.status != "done" or not export.output_path:
        raise HTTPException(400, "완료된 내보내기가 아닙니다.")
    if not export.output_path.startswith("gs://") and not Path(export.output_path).exists():
        raise HTTPException(404, "내보내기 파일을 찾을 수 없습니다.")

    export.youtube_url = "uploading"
    db.commit()

    upload_to_youtube.delay(export_id)
    return {"message": "YouTube 업로드를 시작했습니다.", "export_id": export_id}


@router.delete("/{export_id}")
def delete_export(export_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """내보내기 기록 삭제 + 출력 파일 삭제"""
    export = db.query(Export).join(Project).filter(
        Export.id == export_id, Project.user_id == user.id
    ).first()
    if not export:
        raise HTTPException(404)

    # 출력 파일 삭제
    if export.output_path:
        if export.output_path.startswith("gs://"):
            try:
                from google.cloud import storage as gcs_storage
                key_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
                client = gcs_storage.Client.from_service_account_json(key_file) if key_file else gcs_storage.Client()
                without_prefix = export.output_path[5:]
                bucket_name, blob_name = without_prefix.split("/", 1)
                client.bucket(bucket_name).blob(blob_name).delete()
            except Exception:
                pass
        else:
            for p in [export.output_path, export.output_path.replace(".mp4", ".txt")]:
                try:
                    Path(p).unlink(missing_ok=True)
                except Exception:
                    pass

    db.delete(export)
    db.commit()
    return {"ok": True}


@router.websocket("/ws/{export_id}")
async def export_ws(websocket: WebSocket, export_id: int):
    """내보내기 진행률 실시간 WebSocket"""
    await websocket.accept()
    import redis.asyncio as aioredis
    import os, asyncio

    r = aioredis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
    channel = f"export_progress:{export_id}"

    async with r.pubsub() as ps:
        await ps.subscribe(channel)
        async for msg in ps.listen():
            if msg["type"] == "message":
                data = json.loads(msg["data"])
                await websocket.send_json(data)
                if data.get("status") in ("done", "error"):
                    break

    await websocket.close()
