"""AutoEdit router - AI automatic rally extraction"""
import os, uuid, json, subprocess, aiofiles, logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.database import get_db, User, AutoEditProject, Project, Export  # noqa
from api.routes.auth import current_user

log = logging.getLogger(__name__)
router = APIRouter()

AUTOEDIT_PATH = Path(os.getenv("AUTOEDIT_PATH", "/data/autoedit"))
CHUNK = 1024 * 1024
SUPPORTED_EXT = {".mp4", ".avi", ".mov", ".mkv"}


def _probe_video(path: str) -> dict:
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


def _extract_thumb(video_path: str, thumb_path: str):
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vframes", "1", "-q:v", "2", thumb_path],
        capture_output=True, timeout=30,
    )


# ── Project list / detail ─────────────────────────────────────────────

@router.get("/projects")
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(AutoEditProject)
        .filter_by(user_id=user.id)
        .order_by(AutoEditProject.created_at.desc())
        .all()
    )
    return [_project_summary(p) for p in rows]


def _project_summary(p: AutoEditProject) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "analysis_status": p.analysis_status,
        "fps": p.fps,
        "total_frames": p.total_frames,
        "has_court": p.court_points is not None,
        "rally_count": len(p.analysis_result) if p.analysis_result else 0,
        "linked_project_id": p.linked_project_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/projects/{project_id}")
def get_project(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _get_project(project_id, user.id, db)
    return {
        **_project_summary(p),
        "court_points": p.court_points,
        "analysis_result": p.analysis_result,
        "error_msg": p.error_msg,
        "player1_name": p.player1_name,
        "player2_name": p.player2_name,
    }


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _get_project(project_id, user.id, db)
    for path_str in [p.video_local_path, p.thumb_path]:
        if path_str:
            Path(path_str).unlink(missing_ok=True)
    db.delete(p)
    db.commit()
    return {"ok": True}


# ── Video upload ──────────────────────────────────────────────────────

@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXT:
        raise HTTPException(400, "Unsupported file format.")

    video_id = uuid.uuid4().hex
    videos_dir = AUTOEDIT_PATH / "videos" / str(user.id)
    thumbs_dir = AUTOEDIT_PATH / "thumbs"
    videos_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    video_path = str(videos_dir / f"{video_id}{ext}")
    thumb_path = str(thumbs_dir / f"{video_id}.jpg")

    async with aiofiles.open(video_path, "wb") as f:
        while chunk := await file.read(CHUNK * 4):
            await f.write(chunk)

    probe = _probe_video(video_path)
    _extract_thumb(video_path, thumb_path)

    project = AutoEditProject(
        user_id=user.id,
        title=Path(file.filename).stem,
        video_local_path=video_path,
        thumb_path=thumb_path,
        fps=probe["fps"],
        total_frames=probe["total_frames"],
        analysis_status="uploaded",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    return {
        "project_id": project.id,
        "fps": probe["fps"],
        "total_frames": probe["total_frames"],
    }


# ── Court calibration ─────────────────────────────────────────────────

class CourtBody(BaseModel):
    court_points: list  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] pixel coords on thumb image
    image_width: int
    image_height: int


@router.post("/projects/{project_id}/court")
def set_court(
    project_id: int,
    body: CourtBody,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if len(body.court_points) != 4:
        raise HTTPException(400, "Exactly 4 court corners required.")
    p = _get_project(project_id, user.id, db)
    p.court_points = {
        "points": body.court_points,
        "image_width": body.image_width,
        "image_height": body.image_height,
    }
    p.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ── Start analysis ────────────────────────────────────────────────────

class AnalyzeBody(BaseModel):
    player1_name: Optional[str] = "Team 1"
    player2_name: Optional[str] = "Team 2"
    game_format: Optional[int] = 21  # 21 or 25
    match_type: Optional[str] = "single"  # single or best_of_3


@router.post("/projects/{project_id}/analyze")
def start_analysis(
    project_id: int,
    body: AnalyzeBody,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    p = _get_project(project_id, user.id, db)
    if not p.court_points:
        raise HTTPException(400, "Court calibration required before analysis.")
    if p.analysis_status == "processing":
        raise HTTPException(400, "Analysis already in progress.")

    p.player1_name = body.player1_name
    p.player2_name = body.player2_name
    p.game_format = body.game_format or 21
    p.match_type = body.match_type or "single"
    p.analysis_status = "processing"
    p.error_msg = None
    p.updated_at = datetime.utcnow()
    db.commit()

    from workers.auto_tasks import run_auto_analysis
    run_auto_analysis.delay(project_id)
    return {"ok": True, "status": "processing"}


# ── Analysis status ───────────────────────────────────────────────────

@router.get("/projects/{project_id}/status")
def get_status(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _get_project(project_id, user.id, db)
    return {
        "status": p.analysis_status,
        "error_msg": p.error_msg,
        "rally_count": len(p.analysis_result) if p.analysis_result else 0,
    }


# ── Save reviewed rallies ─────────────────────────────────────────────

class SaveRalliesBody(BaseModel):
    rallies: list


@router.put("/projects/{project_id}/rallies")
def save_rallies(
    project_id: int,
    body: SaveRalliesBody,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    p = _get_project(project_id, user.id, db)
    p.analysis_result = body.rallies
    p.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ── Trigger export via existing pipeline ─────────────────────────────

class ExportBody(BaseModel):
    title: Optional[str] = None
    match_date: Optional[str] = ""
    tournament_name: Optional[str] = ""
    level: Optional[str] = ""
    match_name: Optional[str] = ""
    scoreboard_theme: Optional[str] = "dark"
    scoreboard_scale: Optional[float] = 1.0


@router.post("/projects/{project_id}/export")
def create_export(
    project_id: int,
    body: ExportBody,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    p = _get_project(project_id, user.id, db)
    if not p.analysis_result:
        raise HTTPException(400, "No analysis result to export.")

    rallies_raw = []
    for r in p.analysis_result:
        winner = _calc_winner(r)
        rallies_raw.append([
            r["start_frame"], r["end_frame"],
            r.get("score_p1", 0), r.get("score_p2", 0),
            winner,
        ])

    proj = Project(
        user_id=user.id,
        title=body.title or p.title,
        video_path=p.video_local_path,
        fps=p.fps,
        total_frames=p.total_frames,
        match_date=body.match_date,
        tournament_name=body.tournament_name,
        level=body.level,
        match_name=body.match_name,
        player1_name=p.player1_name,
        player2_name=p.player2_name,
        rallies=rallies_raw,
        scoreboard_theme=body.scoreboard_theme,
        scoreboard_scale=body.scoreboard_scale,
    )
    db.add(proj)
    db.flush()

    p.linked_project_id = proj.id
    p.updated_at = datetime.utcnow()

    export = Export(project_id=proj.id, status="pending")
    db.add(export)
    db.commit()
    db.refresh(export)

    from workers.tasks import run_export
    project_data = {
        "video_path": proj.video_path,
        "fps": proj.fps,
        "rallies": rallies_raw,
        "match_date": proj.match_date,
        "tournament_name": proj.tournament_name,
        "level": proj.level,
        "match_name": proj.match_name,
        "player1_name": proj.player1_name,
        "player2_name": proj.player2_name,
        "scoreboard_scale": proj.scoreboard_scale,
        "scoreboard_theme": proj.scoreboard_theme,
    }
    run_export.delay(export.id, project_data)

    return {"export_id": export.id, "project_id": proj.id}


# ── Thumbnail serving ─────────────────────────────────────────────────

@router.get("/projects/{project_id}/thumb")
def get_thumb(project_id: int, token: str = None, db: Session = Depends(get_db)):
    user = _token_user(token, db)
    p = _get_project(project_id, user.id, db)
    if not p.thumb_path or not Path(p.thumb_path).exists():
        raise HTTPException(404, "Thumbnail not found.")
    return FileResponse(p.thumb_path, media_type="image/jpeg")


# ── Video streaming for court calibration UI ─────────────────────────

@router.get("/projects/{project_id}/stream")
async def stream_video(project_id: int, token: str = None, db: Session = Depends(get_db)):
    user = _token_user(token, db)
    p = _get_project(project_id, user.id, db)
    if not p.video_local_path or not Path(p.video_local_path).exists():
        raise HTTPException(404, "Video not found.")
    path = Path(p.video_local_path)
    size = path.stat().st_size

    async def iter_file():
        async with aiofiles.open(path, "rb") as f:
            while chunk := await f.read(CHUNK):
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type="video/mp4",
        headers={"Content-Length": str(size), "Accept-Ranges": "bytes"},
    )


# ── Cleanup expired originals (admin only) ───────────────────────────

@router.post("/cleanup")
def cleanup_old_videos(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.plan != "admin":
        raise HTTPException(403)
    cutoff = datetime.utcnow() - timedelta(hours=24)
    rows = db.query(AutoEditProject).filter(AutoEditProject.created_at < cutoff).all()
    deleted = 0
    for p in rows:
        if p.video_local_path and Path(p.video_local_path).exists():
            Path(p.video_local_path).unlink(missing_ok=True)
            p.video_local_path = None
            deleted += 1
        if p.thumb_path and Path(p.thumb_path).exists():
            Path(p.thumb_path).unlink(missing_ok=True)
            p.thumb_path = None
    db.commit()
    return {"deleted_files": deleted}


# ── Helpers ───────────────────────────────────────────────────────────

def _token_user(token: Optional[str], db: Session) -> User:
    """Authenticate via query-param token (for img/video src URLs)."""
    from jose import jwt, JWTError
    from api.routes.auth import SECRET_KEY, ALGORITHM
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user = db.query(User).get(int(payload["sub"]))
        if not user:
            raise HTTPException(status_code=401)
        return user
    except JWTError:
        raise HTTPException(status_code=401)


def _get_project(project_id: int, user_id: int, db: Session) -> AutoEditProject:
    p = db.query(AutoEditProject).filter_by(id=project_id, user_id=user_id).first()
    if not p:
        raise HTTPException(404, "Project not found.")
    return p


def _calc_winner(rally: dict) -> int:
    """Determine scoring team from in_out and server."""
    in_out = rally.get("in_out", "in")
    server = rally.get("server", 1)
    # shuttle lands in → server's side: receiver scored (wait, need clarification)
    # in badminton: if shuttle lands IN opponent's court → server scores
    # if shuttle lands OUT or hits net → opponent scores
    if in_out == "in":
        return server
    else:
        return 2 if server == 1 else 1
