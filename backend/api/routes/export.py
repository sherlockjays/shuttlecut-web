"""내보내기 - Celery 비동기 + WebSocket 진행률"""
import json
import os
from pathlib import Path
from fastapi import APIRouter, Depends, WebSocket, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from models.database import get_db, User, Project, Export
from api.routes.auth import current_user
from workers.tasks import run_export

router = APIRouter()

PLAN_LIMITS = {"free": 3, "standard": 30, "club": 99999}


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


@router.get("/{export_id}/download")
def download_export(export_id: int, token: str | None = None, db: Session = Depends(get_db)):
    from api.routes.auth import current_user as _current_user
    from fastapi.security import OAuth2PasswordBearer
    from jose import jwt, JWTError
    import os as _os
    SECRET_KEY = _os.getenv("SECRET_KEY", "changeme")
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
    if not Path(export.output_path).exists():
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    filename = f"export_{export_id}.mp4"
    return FileResponse(export.output_path, media_type="video/mp4", filename=filename)


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
