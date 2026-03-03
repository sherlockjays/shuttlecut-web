from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://shuttlecut:password@localhost:5432/shuttlecut")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id                      = Column(Integer, primary_key=True)
    email                   = Column(String, unique=True, nullable=False)
    hashed_pw               = Column(String, nullable=True)   # Google OAuth면 None
    google_id               = Column(String, nullable=True)
    plan                    = Column(String, default="free")  # free / standard / club
    export_count            = Column(Integer, default=0)      # 이번 달 내보내기 횟수
    youtube_refresh_token   = Column(String, nullable=True)   # YouTube OAuth 토큰
    created_at              = Column(DateTime, default=datetime.utcnow)
    projects                = relationship("Project", back_populates="user")


class Project(Base):
    __tablename__ = "projects"
    id              = Column(Integer, primary_key=True)
    user_id         = Column(Integer, ForeignKey("users.id"))
    title           = Column(String, default="새 프로젝트")
    video_path      = Column(String)
    fps             = Column(Float, default=30.0)
    total_frames    = Column(Integer, default=0)
    match_date      = Column(String, default="")
    tournament_name = Column(String, default="")
    level           = Column(String, default="")
    match_name      = Column(String, default="")
    player1_name    = Column(String, default="1팀")
    player2_name    = Column(String, default="2팀")
    player1_score   = Column(Integer, default=0)
    player2_score   = Column(Integer, default=0)
    rallies         = Column(JSON, default=list)    # [[start, end, p1, p2, winner], ...]
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user            = relationship("User", back_populates="projects")
    exports         = relationship("Export", back_populates="project")


class Export(Base):
    __tablename__ = "exports"
    id          = Column(Integer, primary_key=True)
    project_id  = Column(Integer, ForeignKey("projects.id"))
    status      = Column(String, default="pending")  # pending / processing / done / error
    output_path = Column(String, nullable=True)
    youtube_url = Column(String, nullable=True)
    error_msg   = Column(String, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    project     = relationship("Project", back_populates="exports")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
