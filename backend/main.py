from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from api.routes import videos, projects, export, auth, admin as admin_route
from api.routes import youtube as youtube_route
from models.database import init_db, engine

app = FastAPI(title="ShuttleCut API", version="1.0.0")

@app.on_event("startup")
def startup():
    init_db()
    # youtube_refresh_token 컬럼 마이그레이션
    from sqlalchemy import text
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE users ADD COLUMN youtube_refresh_token VARCHAR",
            # DEFAULT TRUE → 기존 유저는 자동으로 인증된 상태, 신규 유저는 ORM이 FALSE로 삽입
            "ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT TRUE",
            "ALTER TABLE projects ADD COLUMN scoreboard_scale FLOAT DEFAULT 1.0",
            "ALTER TABLE projects ADD COLUMN scoreboard_theme VARCHAR DEFAULT 'dark'",
            "ALTER TABLE users ADD COLUMN export_month VARCHAR DEFAULT ''",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()  # 이미 존재하면 무시

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,              prefix="/api/auth",     tags=["auth"])
app.include_router(videos.router,            prefix="/api/videos",   tags=["videos"])
app.include_router(projects.router,          prefix="/api/projects", tags=["projects"])
app.include_router(export.router,            prefix="/api/export",   tags=["export"])
app.include_router(youtube_route.router,     prefix="/api/youtube",  tags=["youtube"])
app.include_router(admin_route.router,       prefix="/api/admin",    tags=["admin"])

@app.get("/api/health")
def health():
    return {"status": "ok"}
