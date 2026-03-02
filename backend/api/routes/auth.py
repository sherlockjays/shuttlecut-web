from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os

from models.database import get_db, User

router = APIRouter()
pwd_ctx = CryptContext(schemes=["bcrypt"])
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

SECRET_KEY = os.getenv("SECRET_KEY", "changeme")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 7   # 7일


def make_token(user_id: int) -> str:
    return jwt.encode(
        {"sub": str(user_id), "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user = db.query(User).get(int(payload["sub"]))
        if not user:
            raise HTTPException(status_code=401)
        return user
    except JWTError:
        raise HTTPException(status_code=401)


# ── 회원가입 ──

class RegisterBody(BaseModel):
    email: str
    password: str

@router.post("/register")
def register(body: RegisterBody, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다.")
    user = User(email=body.email, hashed_pw=pwd_ctx.hash(body.password))
    db.add(user); db.commit(); db.refresh(user)
    return {"token": make_token(user.id), "email": user.email, "plan": user.plan}


# ── 로그인 ──

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not pwd_ctx.verify(form.password, user.hashed_pw or ""):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 틀렸습니다.")
    return {"access_token": make_token(user.id), "token_type": "bearer",
            "email": user.email, "plan": user.plan}


# ── 내 정보 ──

@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "plan": user.plan,
            "export_count": user.export_count}
