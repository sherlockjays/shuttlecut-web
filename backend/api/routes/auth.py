import re
import uuid
import secrets
import hashlib
import base64

import httpx
import redis as _redis
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from google_auth_oauthlib.flow import Flow
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext
from datetime import datetime, timedelta

from core.config import optional_env, require_env, GOOGLE_AUTH_URI, GOOGLE_TOKEN_URI
from models.database import get_db, User

router = APIRouter()
pwd_ctx = CryptContext(schemes=["bcrypt"])

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
_r = _redis.from_url(require_env("REDIS_URL"))

SECRET_KEY = require_env("SECRET_KEY")
APP_BASE_URL = require_env("APP_BASE_URL")

# Google 로그인은 선택값이다. 둘 중 하나라도 비면 503으로 거절한다
GOOGLE_CLIENT_ID = optional_env("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = optional_env("GOOGLE_CLIENT_SECRET")

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 7

GOOGLE_LOGIN_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


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


def _make_google_login_flow():
    return Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": GOOGLE_AUTH_URI,
                "token_uri": GOOGLE_TOKEN_URI,
                "redirect_uris": [f"{APP_BASE_URL}/api/auth/google/callback"],
            }
        },
        scopes=GOOGLE_LOGIN_SCOPES,
        redirect_uri=f"{APP_BASE_URL}/api/auth/google/callback",
    )


# ── 회원가입 ──

class RegisterBody(BaseModel):
    email: str
    password: str

@router.post("/register")
def register(body: RegisterBody, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="유효하지 않은 이메일 형식입니다.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="비밀번호는 8자 이상이어야 합니다.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다.")
    body.email = email
    user = User(email=body.email, hashed_pw=pwd_ctx.hash(body.password), is_verified=False)
    db.add(user); db.commit(); db.refresh(user)

    token = str(uuid.uuid4())
    _r.setex(f"email_verify:{token}", 86400, str(user.id))

    def _send():
        from core.email import send_verification_email
        try:
            send_verification_email(user.email, token)
        except Exception as e:
            print(f"[EMAIL] 인증 메일 발송 실패: {e}")

    background_tasks.add_task(_send)
    return {"token": make_token(user.id), "email": user.email, "plan": user.plan, "is_verified": False}


# ── 로그인 ──

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not pwd_ctx.verify(form.password, user.hashed_pw or ""):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 틀렸습니다.")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="이메일 인증 후 로그인해주세요. 받은편지함을 확인해주세요.")
    return {"access_token": make_token(user.id), "token_type": "bearer",
            "email": user.email, "plan": user.plan, "is_verified": user.is_verified}


# ── 내 정보 ──

@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "plan": user.plan,
            "export_count": user.export_count, "is_verified": user.is_verified}


# ── Google OAuth 로그인 ──

@router.get("/google")
def google_login():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(503, "Google 로그인이 설정되지 않았습니다. GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 확인하세요.")
    flow = _make_google_login_flow()
    state = str(uuid.uuid4())
    verifier = secrets.token_urlsafe(96)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    _r.setex(f"google_login_state:{state}", 600, "1")
    _r.setex(f"google_login_verifier:{state}", 600, verifier)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="select_account",
        state=state,
        code_challenge=challenge,
        code_challenge_method="S256",
    )
    return RedirectResponse(auth_url)


@router.get("/google/callback")
def google_callback(
    code: str = None,
    state: str = None,
    error: str = None,
    db: Session = Depends(get_db),
):
    if error or not code or not state:
        return RedirectResponse(f"{APP_BASE_URL}/?google_error=1")
    if not _r.get(f"google_login_state:{state}"):
        return RedirectResponse(f"{APP_BASE_URL}/?google_error=1")
    _r.delete(f"google_login_state:{state}")

    code_verifier_bytes = _r.get(f"google_login_verifier:{state}")
    _r.delete(f"google_login_verifier:{state}")
    if not code_verifier_bytes:
        return RedirectResponse(f"{APP_BASE_URL}/?google_error=1")
    flow = _make_google_login_flow()
    flow.fetch_token(code=code, code_verifier=code_verifier_bytes.decode())
    credentials = flow.credentials

    # Google에서 사용자 정보 가져오기
    with httpx.Client() as client:
        resp = client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {credentials.token}"},
        )
    userinfo = resp.json()
    google_id = userinfo.get("id")
    email = userinfo.get("email")

    if not google_id or not email:
        return RedirectResponse(f"{APP_BASE_URL}/?google_error=1")

    # google_id로 기존 유저 찾기
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        # 이메일로 기존 계정 찾기 → google_id 연결
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.google_id = google_id
            user.is_verified = True
        else:
            # 신규 가입
            user = User(email=email, google_id=google_id, is_verified=True)
            db.add(user)
        db.commit()
    db.refresh(user)

    # JWT를 URL에 직접 노출하지 않고 30초짜리 one-time code 경유
    code = secrets.token_urlsafe(32)
    _r.setex(f"google_auth_code:{code}", 30, make_token(user.id))
    return RedirectResponse(f"{APP_BASE_URL}/?google_code={code}")


# ── 이메일 인증 ──

@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    user_id = _r.get(f"email_verify:{token}")
    if not user_id:
        return RedirectResponse(f"{APP_BASE_URL}/?email_verify=fail")
    user = db.query(User).get(int(user_id))
    if user:
        user.is_verified = True
        db.commit()
    _r.delete(f"email_verify:{token}")
    return RedirectResponse(f"{APP_BASE_URL}/?email_verified=1")


# ── Google OAuth one-time code 교환 ──

@router.get("/google/exchange")
def google_exchange(code: str, db: Session = Depends(get_db)):
    token = _r.get(f"google_auth_code:{code}")
    if not token:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 코드입니다.")
    _r.delete(f"google_auth_code:{code}")
    return {"access_token": token.decode(), "token_type": "bearer"}


# ── 비밀번호 찾기 ──

class ForgotPasswordBody(BaseModel):
    email: str

@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordBody, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if user and user.hashed_pw:
        token = str(uuid.uuid4())
        _r.setex(f"pw_reset:{token}", 3600, str(user.id))

        def _send():
            from core.email import send_reset_email
            try:
                send_reset_email(user.email, token)
            except Exception as e:
                print(f"[EMAIL] 비밀번호 재설정 메일 발송 실패: {e}")

        background_tasks.add_task(_send)
    return {"ok": True}


# ── 비밀번호 재설정 ──

class ResetPasswordBody(BaseModel):
    token: str
    new_password: str

@router.post("/reset-password")
def reset_password(body: ResetPasswordBody, db: Session = Depends(get_db)):
    user_id = _r.get(f"pw_reset:{body.token}")
    if not user_id:
        raise HTTPException(status_code=400, detail="링크가 만료됐거나 유효하지 않습니다.")
    user = db.query(User).get(int(user_id))
    if not user:
        raise HTTPException(status_code=404)
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="비밀번호는 8자 이상이어야 합니다.")
    user.hashed_pw = pwd_ctx.hash(body.new_password)
    db.commit()
    _r.delete(f"pw_reset:{body.token}")
    return {"ok": True}
