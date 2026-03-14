"""YouTube OAuth 2.0 연동 - 계정 연결 / 콜백 / 상태 확인"""
import os
import uuid

import redis as _redis
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from api.routes.auth import current_user, SECRET_KEY, ALGORITHM
from core.crypto import encrypt_token
from models.database import User, get_db

router = APIRouter()

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]
_r = _redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))


def _make_flow():
    base_url = os.getenv("APP_BASE_URL", "https://wjdwoghk.synology.me")
    return Flow.from_client_config(
        {
            "web": {
                "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [f"{base_url}/api/youtube/callback"],
            }
        },
        scopes=SCOPES,
        redirect_uri=f"{base_url}/api/youtube/callback",
    )


@router.get("/status")
def youtube_status(user: User = Depends(current_user)):
    """YouTube 계정 연결 여부 확인"""
    return {"connected": bool(user.youtube_refresh_token)}


@router.get("/auth")
def youtube_auth(token: str = Query(...), db: Session = Depends(get_db)):
    """Google OAuth 동의 화면으로 리다이렉트 (브라우저 링크용 - 토큰을 쿼리파라미터로 받음)"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user = db.query(User).get(int(payload["sub"]))
        if not user:
            raise HTTPException(401)
    except JWTError:
        raise HTTPException(401, "인증이 필요합니다.")
    if not os.getenv("GOOGLE_CLIENT_ID"):
        raise HTTPException(503, "YouTube 연동이 설정되지 않았습니다. GOOGLE_CLIENT_ID를 확인하세요.")
    flow = _make_flow()
    state = str(uuid.uuid4())
    _r.setex(f"yt_state:{state}", 600, str(user.id))  # 10분 TTL
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=state,
    )
    # google_auth_oauthlib 신버전은 PKCE code_verifier를 자동 생성 → callback에서 재사용
    code_verifier = getattr(flow, "code_verifier", None)
    if code_verifier:
        _r.setex(f"yt_verifier:{state}", 600, code_verifier)
    return RedirectResponse(auth_url)


@router.get("/callback")
def youtube_callback(
    code: str = None,
    state: str = None,
    error: str = None,
    db: Session = Depends(get_db),
):
    """Google 인증 후 콜백 - refresh_token을 DB에 저장"""
    base_url = os.getenv("APP_BASE_URL", "https://wjdwoghk.synology.me")
    if error:
        return RedirectResponse(f"{base_url}/?youtube_error=1")
    if not code or not state:
        raise HTTPException(400, "잘못된 요청입니다.")

    user_id_bytes = _r.get(f"yt_state:{state}")
    if not user_id_bytes:
        raise HTTPException(400, "세션이 만료됐습니다. 다시 시도해주세요.")
    _r.delete(f"yt_state:{state}")

    code_verifier_bytes = _r.get(f"yt_verifier:{state}")
    _r.delete(f"yt_verifier:{state}")

    flow = _make_flow()
    fetch_kwargs: dict = {"code": code}
    if code_verifier_bytes:
        fetch_kwargs["code_verifier"] = code_verifier_bytes.decode()
    flow.fetch_token(**fetch_kwargs)

    user = db.query(User).get(int(user_id_bytes))
    if not user:
        raise HTTPException(404)
    raw_token = flow.credentials.refresh_token
    user.youtube_refresh_token = encrypt_token(raw_token) if raw_token else None
    db.commit()

    return RedirectResponse(f"{base_url}/?youtube_connected=1")


@router.delete("/disconnect")
def youtube_disconnect(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """YouTube 계정 연결 해제"""
    user.youtube_refresh_token = None
    db.commit()
    return {"ok": True}
