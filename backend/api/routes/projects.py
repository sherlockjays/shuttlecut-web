"""프로젝트 CRUD"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

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


@router.get("/")
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    projects = db.query(Project).filter(Project.user_id == user.id)\
                 .order_by(Project.updated_at.desc()).all()
    return [{"id": p.id, "title": p.title, "updated_at": p.updated_at} for p in projects]


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
    return p.__dict__


@router.put("/{pid}")
def update_project(pid: int, body: ProjectBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == pid, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    p.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.delete("/{pid}")
def delete_project(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == pid, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(404)
    db.delete(p); db.commit()
    return {"ok": True}
