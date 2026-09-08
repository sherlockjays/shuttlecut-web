"""프로젝트 CRUD"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from pathlib import Path

from models.database import get_db, User, Project
from api.routes.auth import current_user

router = APIRouter()


class ProjectBody(BaseModel):
    title:           Optional[str] = "새 프로젝트"
    video_path:      Optional[str] = None
    fps:             Optional[float] = 30.0
    total_frames:    Optional[int] = 0
    match_date:      Optional[str] = ""
    tournament_name: Optional[str] = ""
    level:           Optional[str] = ""
    match_name:      Optional[str] = ""
    player1_name:    Optional[str] = "1팀"
    player2_name:    Optional[str] = "2팀"
    player1_score:   Optional[int] = 0
    player2_score:   Optional[int] = 0
    rallies:          Optional[List] = []
    scoreboard_scale: Optional[float] = 1.0
    scoreboard_theme: Optional[str] = "dark"


# video_id는 video_path에서 계산하는 파생 필드라 DB 컬럼도 요청 바디도 아니다.
class ProjectDetail(ProjectBody):
    video_id: Optional[str] = None


@router.get("/")
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    projects = db.query(Project).filter(Project.user_id == user.id)\
                 .order_by(Project.updated_at.desc()).all()
    return [{"id": p.id, "title": p.title, "updated_at": (p.updated_at.isoformat() + "+00:00") if p.updated_at else None} for p in projects]


@router.post("/")
def create_project(body: ProjectBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = Project(user_id=user.id, **body.model_dump())
    db.add(p); db.commit(); db.refresh(p)
    return {"id": p.id}


@router.get("/{pid}")
def get_project(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == pid, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(404)
    video_id = Path(p.video_path).stem if p.video_path else None
    return {**p.__dict__, "video_id": video_id}


@router.put("/{pid}", response_model=ProjectDetail)
def update_project(pid: int, body: ProjectBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == pid, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    p.updated_at = datetime.utcnow()
    db.commit()
    # expire_on_commit이 기본값이라 commit 직후 p.__dict__는 비어 있다.
    # 속성 접근은 자동으로 다시 읽어오지만 __dict__를 직접 읽는 것은 그렇지 않다.
    db.refresh(p)
    video_id = Path(p.video_path).stem if p.video_path else None
    return {**p.__dict__, "video_id": video_id}


@router.delete("/{pid}")
def delete_project(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    import os
    p = db.query(Project).filter(Project.id == pid, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(404)
    # GCS 원본 영상 삭제
    if p.video_path and p.video_path.startswith("gs://"):
        try:
            from google.cloud import storage as gcs_storage
            key_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            client = gcs_storage.Client.from_service_account_json(key_file) if key_file else gcs_storage.Client()
            without_prefix = p.video_path[5:]
            bucket_name, blob_name = without_prefix.split("/", 1)
            client.bucket(bucket_name).blob(blob_name).delete()
        except Exception:
            pass
    db.delete(p); db.commit()
    return {"ok": True}
