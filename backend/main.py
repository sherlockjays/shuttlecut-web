from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from api.routes import videos, projects, export, auth, admin as admin_route, internal
from api.routes import youtube as youtube_route
# TODO: autoedit.py는 models.database.AutoEditProject 모델이 없어서 아직 로드 불가.
# 나스에만 있던 원본을 백업 목적으로만 커밋함 (모델 추가 후 재연결 필요)
# from api.routes import autoedit as autoedit_route
from models.database import init_db, engine

app = FastAPI(title="ShuttleCut API", version="1.0.0")

@app.on_event("startup")
def startup():
    init_db()
    from sqlalchemy import text
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE users ADD COLUMN youtube_refresh_token VARCHAR",
            "ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT TRUE",
            "ALTER TABLE projects ADD COLUMN scoreboard_scale FLOAT DEFAULT 1.0",
            "ALTER TABLE projects ADD COLUMN scoreboard_theme VARCHAR DEFAULT 'dark'",
            "ALTER TABLE users ADD COLUMN export_month VARCHAR DEFAULT ''",
            "ALTER TABLE autoedit_projects ADD COLUMN game_format INTEGER DEFAULT 21",
            "ALTER TABLE autoedit_projects ADD COLUMN match_type VARCHAR DEFAULT 'single'",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,              prefix="/api/auth",      tags=["auth"])
app.include_router(videos.router,            prefix="/api/videos",    tags=["videos"])
app.include_router(projects.router,          prefix="/api/projects",  tags=["projects"])
app.include_router(export.router,            prefix="/api/export",    tags=["export"])
app.include_router(youtube_route.router,     prefix="/api/youtube",   tags=["youtube"])
app.include_router(admin_route.router,       prefix="/api/admin",     tags=["admin"])
# app.include_router(autoedit_route.router,    prefix="/api/autoedit",  tags=["autoedit"])
app.include_router(internal.router,          prefix="/api/internal",  tags=["internal"])

@app.get("/api/health")
def health():
    return {"status": "ok"}
