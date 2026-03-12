"""관리자 API - plan='admin' 유저만 접근 가능"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from models.database import get_db, User, Project, Export
from api.routes.auth import current_user

router = APIRouter()

VALID_PLANS = {"free", "basic", "standard", "premium", "unlimited", "club", "admin"}


def admin_required(user: User = Depends(current_user)) -> User:
    if user.plan != "admin":
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다.")
    return user


@router.get("/users")
def list_users(user: User = Depends(admin_required), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "plan": u.plan,
            "export_count": u.export_count,
            "is_verified": u.is_verified,
            "youtube_connected": u.youtube_refresh_token is not None,
            "google_login": u.google_id is not None,
            "project_count": len(u.projects),
            "created_at": (u.created_at.isoformat() + "+00:00") if u.created_at else None,
        }
        for u in users
    ]


class UserUpdateBody(BaseModel):
    plan: Optional[str] = None
    export_count: Optional[int] = None


@router.patch("/users/{uid}")
def update_user(
    uid: int,
    body: UserUpdateBody,
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == uid).first()
    if not target:
        raise HTTPException(404)
    if body.plan is not None:
        if body.plan not in VALID_PLANS:
            raise HTTPException(400, f"유효하지 않은 플랜입니다: {body.plan}")
        target.plan = body.plan
    if body.export_count is not None:
        target.export_count = body.export_count
    db.commit()
    return {"ok": True}


@router.get("/exports")
def list_exports(
    limit: int = 50,
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    """최근 내보내기 작업 현황"""
    exports = (
        db.query(Export)
        .order_by(Export.created_at.desc())
        .limit(limit)
        .all()
    )
    result = []
    for e in exports:
        project = db.query(Project).filter(Project.id == e.project_id).first()
        owner = db.query(User).filter(User.id == project.user_id).first() if project else None
        result.append({
            "id": e.id,
            "status": e.status,
            "youtube_url": e.youtube_url,
            "error_msg": e.error_msg,
            "created_at": (e.created_at.isoformat() + "+00:00") if e.created_at else None,
            "project_title": project.title if project else "-",
            "user_email": owner.email if owner else "-",
        })
    return result


@router.get("/stats")
def get_stats(user: User = Depends(admin_required), db: Session = Depends(get_db)):
    from sqlalchemy import func

    users_by_plan = db.query(User.plan, func.count(User.id)).group_by(User.plan).all()
    exports_by_status = db.query(Export.status, func.count(Export.id)).group_by(Export.status).all()
    return {
        "total_users": db.query(func.count(User.id)).scalar(),
        "users_by_plan": {plan: count for plan, count in users_by_plan},
        "total_exports": db.query(func.count(Export.id)).scalar(),
        "exports_by_status": {s: c for s, c in exports_by_status},
        "total_projects": db.query(func.count(Project.id)).scalar(),
    }
