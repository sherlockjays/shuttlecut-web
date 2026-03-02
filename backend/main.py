from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from api.routes import videos, projects, export, auth
from models.database import init_db

app = FastAPI(title="ShuttleCut API", version="1.0.0")

@app.on_event("startup")
def startup():
    init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(videos.router,   prefix="/api/videos",   tags=["videos"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(export.router,   prefix="/api/export",   tags=["export"])

@app.get("/api/health")
def health():
    return {"status": "ok"}
