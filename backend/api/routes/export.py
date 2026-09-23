"""내보내기 - Celery 비동기 + WebSocket 진행률"""
import json
import os
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, WebSocket, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.database import get_db, User, Project, Export
from api.routes.auth import current_user, SECRET_KEY, ALGORITHM
from core.config import require_env
from core.crypto import decrypt_token
from workers.tasks import run_export

router = APIRouter()

PLAN_LIMITS = {"free": 2, "basic": 5, "standard": 10, "premium": 30, "unlimited": 999999, "club": 999999, "admin": 999999999}
UNKNOWN_PLAN_LIMIT = PLAN_LIMITS["free"]

def _build_timeline_comment(rallies: list, fps: float, player1_name: str, player2_name: str) -> str:
    """랠리 데이터로 YouTube 타임라인 댓글 생성 (내보낸 영상 기준 누적 시간, TAIL=1.5초 포함)"""
    TAIL = 1.5
    lines = [f"📋 랠리 타임라인  {player1_name} vs {player2_name}"]
    cumulative_sec = 0.0
    for rally in rallies:
        start_f = rally[0]
        end_f = rally[1]
        p1_score = rally[2] if len(rally) > 2 else 0
        p2_score = rally[3] if len(rally) > 3 else 0
        total_sec = int(cumulative_sec)
        m, s = divmod(total_sec, 60)
        h, m = divmod(m, 60)
        ts = f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"
        lines.append(f"{ts} {p1_score}-{p2_score}")
        cumulative_sec += (end_f - start_f) / fps + TAIL if fps else 0
    return "\n".join(lines)


def _run_youtube_upload(export_id: int, post_comment: bool = True):
    """NAS 백엔드에서 직접 YouTube 업로드 실행 (백그라운드 스레드)"""
    import logging
    from models.database import SessionLocal, Export, Project, User
    from core.youtube_uploader import get_youtube_service, upload_video, post_timeline_comment

    log = logging.getLogger(__name__)
    db = SessionLocal()
    try:
        export = db.query(Export).get(export_id)
        project = db.query(Project).get(export.project_id)
        user = db.query(User).get(project.user_id)

        title_parts = [p for p in [
            project.match_date, project.tournament_name, project.level, project.match_name
        ] if p]
        title = " ".join(title_parts) or project.title or "ShuttleCut 내보내기"

        description = f"{project.player1_name} vs {project.player2_name}\n"
        if project.level:
            description += f"급수: {project.level}\n"
        description += "\n#배드민턴 #ShuttleCut #badminton\n\n🏸 ShuttleCut으로 제작된 영상입니다.\nhttps://shuttlecut.kr"

        youtube = get_youtube_service(decrypt_token(user.youtube_refresh_token))

        video_path = export.output_path
        youtube_url = upload_video(youtube, video_path, title, description)
        export.youtube_url = youtube_url
        db.commit()

        # 타임라인 댓글 게시
        if post_comment and project.rallies:
            try:
                video_id = youtube_url.split("/")[-1]
                comment = _build_timeline_comment(
                    project.rallies, project.fps or 30.0,
                    project.player1_name or "1팀", project.player2_name or "2팀",
                )
                post_timeline_comment(youtube, video_id, comment)
            except Exception as ce:
                log.warning(f"타임라인 댓글 게시 실패 (무시): {ce}")

    except Exception as e:
        log.error(f"YouTube 업로드 실패 (export {export_id}): {e}")
        try:
            export = db.query(Export).get(export_id)
            if export:
                export.youtube_url = None
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


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
    # 월별 리셋
    current_month = datetime.now().strftime("%Y-%m")
    if user.export_month != current_month:
        user.export_count = 0
        user.export_month = current_month
        db.commit()

    # 요금제 제한 확인
    limit = PLAN_LIMITS.get(user.plan, UNKNOWN_PLAN_LIMIT)
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


@router.get("/{export_id}/download")
def download_export(export_id: int, token: str | None = None, db: Session = Depends(get_db)):
    from jose import jwt, JWTError
    try:
        payload = jwt.decode(token or "", SECRET_KEY, algorithms=[ALGORITHM])
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
    if not Path(export.output_path).exists():
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return FileResponse(export.output_path, media_type="video/mp4", filename=filename)


class YoutubeUploadBody(BaseModel):
    post_comment: bool = True


@router.post("/{export_id}/youtube")
def start_youtube_upload(
    export_id: int,
    body: YoutubeUploadBody = YoutubeUploadBody(),
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
    if not Path(export.output_path).exists():
        raise HTTPException(404, "내보내기 파일을 찾을 수 없습니다.")

    export.youtube_url = "uploading"
    db.commit()

    import threading
    threading.Thread(target=_run_youtube_upload, args=(export_id, body.post_comment), daemon=True).start()

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
        for p in [export.output_path, export.output_path.replace(".mp4", ".txt")]:
            try:
                Path(p).unlink(missing_ok=True)
            except Exception:
                pass

    db.delete(export)
    db.commit()
    return {"ok": True}


@router.websocket("/ws/{export_id}")
async def export_ws(websocket: WebSocket, export_id: int, db: Session = Depends(get_db)):
    """내보내기 진행률 실시간 WebSocket"""
    await websocket.accept()
    import redis.asyncio as aioredis

    # WS 연결 시점에 이미 완료된 경우 즉시 응답 (pub/sub 메시지 놓침 방지)
    export = db.query(Export).filter(Export.id == export_id).first()
    if export and export.status == "done":
        await websocket.send_json({"status": "done", "pct": 100, "msg": "완료"})
        await websocket.close()
        return
    if export and export.status == "error":
        await websocket.send_json({"status": "error", "pct": 0, "msg": export.error_msg or "오류"})
        await websocket.close()
        return

    r = aioredis.from_url(require_env("REDIS_URL"))
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
